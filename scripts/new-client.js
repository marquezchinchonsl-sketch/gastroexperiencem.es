#!/usr/bin/env node
/**
 * GastroExperience — Fully Automatic New Client Script
 * 
 * Usage:
 *   node scripts/new-client.js "Nombre" "Ciudad" "dominio.com" "email@cliente.com"
 *
 * Prerequisites:
 *   - gh auth login
 *   - vercel login
 *   - SUPABASE_ACCESS_TOKEN env var (en CREDENCIALES.txt)
 *   - SUPABASE_ORG_ID env var (get via: supabase organizations list)
 *
 * Lo que hace AUTOMÁTICAMENTE:
 *   1. Crea proyecto Supabase nuevo (via CLI)
 *   2. Espera a que esté listo (polling)
 *   3. Obtiene URL + anon key
 *   4. Crea repo GitHub
 *   5. Actualiza config.js
 *   6. Aplica RLS + Auth en Supabase
 *   7. Deploya en Vercel
 *   8. Configura dominio + SSL
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const [, , ...args] = process.argv;
const templateDir = path.resolve(__dirname, '..');
const SUPABASE_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ||
  (() => { throw new Error('SUPABASE_ACCESS_TOKEN no está configurado. Ejecuta: export SUPABASE_ACCESS_TOKEN=sbp_...'); })();
const ORG_ID = process.env.SUPABASE_ORG_ID || 'inswykbedvknsyckoztp';

// ── Helpers ───────────────────────────────────────────────
function log(msg, icon = '🔵') { console.log(`${icon} ${msg}`); }

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      cwd: opts.cwd || templateDir,
      stdio: opts.silent ? 'pipe' : 'inherit',
      env: { ...process.env, ...(opts.env || {}) },
      timeout: opts.timeout || 120000,
    })?.toString().trim() || '';
  } catch (e) {
    if (opts.ignoreError) return null;
    log(`Error: ${e.message}`, '🔴');
    throw e;
  }
}

function runAsync(cmd, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [], {
      cwd: opts.cwd || templateDir,
      shell: true,
      stdio: opts.silent ? 'pipe' : 'inherit',
      env: { ...process.env, ...(opts.env || {}) },
    });
    let stdout = '', stderr = '';
    child.stdout?.on('data', d => stdout += d);
    child.stderr?.on('data', d => stderr += d);
    child.on('close', code => {
      if (code !== 0 && !opts.ignoreError) {
        reject(new Error(stderr || stdout));
      } else {
        resolve(stdout.trim());
      }
    });
    child.on('error', reject);
    if (opts.timeout) setTimeout(() => { child.kill(); reject(new Error('Timeout')); }, opts.timeout);
  });
}

function supabaseApi(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.supabase.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${SUPABASE_TOKEN}`,
        'Content-Type': 'application/json',
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data || {}); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function updateConfig(updates) {
  const configPath = path.join(templateDir, 'config.js');
  let content = fs.readFileSync(configPath, 'utf8');
  for (const [key, value] of Object.entries(updates)) {
    const escaped = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : JSON.stringify(value);
    content = content.replace(
      new RegExp(`(${key})\\s*:\\s*[^,\\n}]+`, 'g'),
      `$1: ${escaped}`
    );
  }
  fs.writeFileSync(configPath, content);
}

function generatePassword(len = 20) {
  return crypto.randomBytes(Math.ceil(len * 3 / 4))
    .toString('base64')
    .slice(0, len)
    .replace(/[\+\/=]/g, c => 'aA'[c.charCodeAt(0) % 2]);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// RLS SQL to apply
const RLS_SQL = `
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_users (restaurant_id, email, password_hash)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'restaurant_id', 'public'), NEW.email, 'supabase-auth-managed')
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP FUNCTION IF EXISTS public.get_restaurant_id();
CREATE OR REPLACE FUNCTION public.get_restaurant_id() RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', 'public');
$$;

DROP FUNCTION IF EXISTS public.set_current_restaurant(TEXT);
CREATE OR REPLACE FUNCTION public.set_current_restaurant(p_restaurant_id TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM set_config('app.current_restaurant_id', p_restaurant_id, true); END;
$$;

DROP POLICY IF EXISTS "Reservations RLS" ON reservations;
DROP POLICY IF EXISTS "Settings RLS" ON settings;
DROP POLICY IF EXISTS "Menu items RLS" ON menu_items;
DROP POLICY IF EXISTS "Special days RLS" ON special_days;
DROP POLICY IF EXISTS "Products RLS" ON products;
DROP POLICY IF EXISTS "Time slots RLS" ON time_slots;

CREATE POLICY "Reservations RLS" ON reservations FOR ALL USING (
  restaurant_id = COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', nullif(current_setting('app.current_restaurant_id', true), ''), 'public')
);
CREATE POLICY "Settings RLS" ON settings FOR ALL USING (
  restaurant_id = COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', nullif(current_setting('app.current_restaurant_id', true), ''), 'public')
);
CREATE POLICY "Menu items RLS" ON menu_items FOR ALL USING (
  restaurant_id = COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', nullif(current_setting('app.current_restaurant_id', true), ''), 'public')
);
CREATE POLICY "Special days RLS" ON special_days FOR ALL USING (
  restaurant_id = COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', nullif(current_setting('app.current_restaurant_id', true), ''), 'public')
);
CREATE POLICY "Products RLS" ON products FOR ALL USING (
  restaurant_id = COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', nullif(current_setting('app.current_restaurant_id', true), ''), 'public')
);
CREATE POLICY "Time slots RLS" ON time_slots FOR ALL USING (
  restaurant_id = COALESCE(nullif(current_setting('request.jwt.claims', true), '')::json->>'restaurant_id', nullif(current_setting('app.current_restaurant_id', true), ''), 'public')
);
`;

// ── Main ─────────────────────────────────────────────────
async function main() {
  if (args.length < 4) {
    console.log('\n🍽️  GastroExperience — Nuevo Cliente FULL AUTO\n');
    console.log('Usage: node scripts/new-client.js "Nombre" "Ciudad" "dominio.com" "email"\n');
    console.log('Example:');
    console.log('  node scripts/new-client.js "Bar Pepe" "Madrid" "barpepe.com" "admin@barpepe.com"\n');
    console.log('Environment vars needed (en CREDENCIALES.txt):');
    console.log('  SUPABASE_ACCESS_TOKEN=sbp_...');
    console.log('  SUPABASE_ORG_ID=inswykbedvknsyckoztp\n');
    process.exit(1);
  }

  const [name, city, domain, email] = args;
  const slug = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const restaurantId = `rest-${slug}-${Date.now().toString(36)}`;
  const repoName = `gastroexperiencem-es-${slug}`;
  const dbPassword = generatePassword(20);

  console.log('\n🍽️  GastroExperience — Nuevo Cliente\n');
  log(`  Restaurante: ${name}`, '🔵');
  log(`  Ciudad:     ${city}`, '🔵');
  log(`  Dominio:    ${domain}`, '🔵');
  log(`  Repo:       ${repoName}`, '🔵');
  log(`  ID:         ${restaurantId}`, '🔵');
  console.log('');

  // ── Step 1: Create Supabase project ───────────────────
  log('─── 1. Creando proyecto Supabase ───', '📋');
  log('  Esperando... (~2-3 min)', '🔵');

  let projectRef;
  try {
    const createOut = run(
      `supabase projects create "${name.replace(/"/g, '')}" --org-id ${ORG_ID} --db-password "${dbPassword}" --region eu-central-1 --json`,
      { timeout: 300000 }
    );

    // Parse JSON output from CLI
    const projectData = JSON.parse(createOut || '{}');
    projectRef = projectData.id || projectData.ref;
    
    if (!projectRef) {
      // Try to get from plain output
      const match = createOut.match(/"id"\s*:\s*"([^"]+)"/);
      if (match) projectRef = match[1];
    }

    if (!projectRef) throw new Error('No project ref found in output');
    log(`  Proyecto creado: ${projectRef}`, '🟢');
  } catch (e) {
    log(`  Supabase project create: ${e.message.slice(0, 100)}`, '🔴');
    log(' 就无法继续。检查 SUPABASE_ACCESS_TOKEN 和 ORG_ID', '🔴');
    process.exit(1);
  }

  // ── Step 2: Wait for project to be ready ──────────────
  log('─── 2. Esperando que Supabase esté listo ───', '📋');
  log('  (polling cada 15s, max 5 min)', '🔵');
  
  let supabaseUrl = `https://${projectRef}.supabase.co`;
  let supabaseKey = '';
  let ready = false;
  const maxWait = 300000; // 5 min
  const startTime = Date.now();

  for (let i = 0; i < 40; i++) {
    await sleep(15000);
    
    try {
      // Check project status via management API
      const proj = await supabaseApi('GET', `/v1/projects/${projectRef}`);
      
      if (proj.status === 'ACTIVE' || proj.status === 'online') {
        ready = true;
        // Get API keys from project details
        if (proj.api_keys) {
          const anonEntry = proj.api_keys.find(k => k.name === 'anon');
          if (anonEntry && anonEntry.key) supabaseKey = anonEntry.key;
        }
        
        log(`  Supabase listo! (${Math.round((Date.now() - startTime) / 1000)}s)`, '🟢');
        break;
      }
    } catch { /* still waiting */ }
    
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`\r  Esperando... ${elapsed}s `);
  }

  if (!ready) {
    log('  ⚠️  Supabase tardó demasiado. Continuando con URL manual.', '🟡');
  }

  // Try to get anon key via management API
  try {
    const allKeys = await supabaseApi('GET', `/v1/projects/${projectRef}/api-keys`);
    if (Array.isArray(allKeys)) {
      const anon = allKeys.find(k => k.name === 'anon key' || k.name === 'anon');
      if (anon && anon.key) supabaseKey = anon.key;
    }
  } catch { /* ignore */ }

  // If we still don't have the key, try to fetch directly from project
  if (!supabaseKey) {
    try {
      const proj = await supabaseApi('GET', `/v1/projects/${projectRef}`);
      if (proj.settings?.api_key) supabaseKey = proj.settings.api_key;
    } catch { /* ignore */ }
  }

  if (!supabaseKey) {
    log('  ⚠️  No pude obtener anon key automáticamente.', '🟡');
    log(`  URL: ${supabaseUrl}`, '🔵');
    log('  Consigue la anon key manualmente de: supabase.com/dashboard', '🔵');
    supabaseKey = 'ANON_KEY_MANUAL';
  }

  // ── Step 3: GitHub repo ────────────────────────────────
  log('\n─── 3. Creando repo GitHub ───', '📋');
  try {
    run(`gh repo create ${repoName} --private --source . --push`, { timeout: 90000 });
    log(`  Repo creado: marquezchinchonsl-sketch/${repoName}`, '🟢');
  } catch (e) {
    if (e.message.includes('already exists')) {
      log('  Repo ya existe, usando existente', '🟡');
    } else { throw e; }
  }

  // ── Step 4: Update config.js ───────────────────────────
  log('\n─── 4. Actualizando config.js ───', '📋');
  updateConfig({
    barName: name,
    barCity: city,
    barTagline: 'Cocina de Mercado',
    siteUrl: `https://${domain}`,
    restaurantId,
    supabaseUrl,
    supabaseKey,
  });
  log('  config.js actualizado', '🟢');
  log(`  supabaseUrl: ${supabaseUrl}`, '🔵');
  log(`  supabaseKey: ${supabaseKey.slice(0, 20)}...`, '🔵');

  // ── Step 5: Commit & Push ─────────────────────────────
  log('\n─── 5. Subiendo a GitHub ───', '📋');
  run('git add -A');
  run(`git commit -m "Setup: ${name} [${restaurantId}]"`);
  run('git push -u origin main', { timeout: 60000 });
  log('  Push completado', '🟢');

  // ── Step 6: Apply RLS ────────────────────────────────
  log('\n─── 6. Aplicando RLS + Auth ───', '📋');
  if (supabaseKey !== 'ANON_KEY_MANUAL') {
    const rlsResult = await supabaseApi('POST', `/v1/projects/${projectRef}/database/query`, { query: RLS_SQL });
    if (rlsResult?.error) {
      log(`  RLS: ${JSON.stringify(rlsResult.error).slice(0, 80)}`, '🟡');
    } else {
      log('  RLS + Auth aplicados', '🟢');
    }
  } else {
    log('  Saltado (necesitas aplicar RLS manualmente)', '🟡');
  }

  // ── Step 7: Vercel Deploy ─────────────────────────────
  log('\n─── 7. Desplegando en Vercel ───', '📋');
  try {
    run(`vercel --yes --prod --name ${repoName}`, { timeout: 120000 });
    log('  Deploy completado', '🟢');
  } catch (e) {
    log('  Vercel: haz `vercel --prod --name ${repoName}` manualmente', '🟡');
  }

  // ── Step 8: Configure domain ──────────────────────────
  log('\n─── 8. Dominio ───', '📋');
  try {
    run(`vercel certs add ${domain}`, { ignoreError: true, timeout: 30000 });
  } catch { /* ignore */ }
  log(`  🌐 https://${domain}`, '🟢');

  // ── Summary ───────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🟢  CLIENTE CREADO — FULLY AUTOMATIC');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`  🍽️  Restaurante: ${name}`);
  console.log(`  📍 Ciudad:      ${city}`);
  console.log(`  🌐 Dominio:      https://${domain}`);
  console.log(`  🔧 Admin:        https://${domain}/admin`);
  console.log(`  ⚙️  Setup:        https://${domain}/setup`);
  console.log(`  📦 GitHub:       github.com/marquezchinchonsl-sketch/${repoName}`);
  console.log(`  🗄️  Supabase:     ${supabaseUrl}`);
  console.log(`  🆔 RestaurantID: ${restaurantId}\n`);
  
  if (supabaseKey === 'ANON_KEY_MANUAL') {
    console.log('  ⚠️  PASOS MANUALES QUE FALTAN:');
    console.log('  1. Copia la anon key de supabase.com/dashboard');
    console.log('  2. Ejecuta: node scripts/new-client.js ... (con la anon key)');
    console.log('     o actualiza config.js manualmente con la key\n');
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  log(`Error fatal: ${err.message}`, '🔴');
  process.exit(1);
});