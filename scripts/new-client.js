#!/usr/bin/env node
/**
 * GastroExperience — New Client Setup (Non-Interactive)
 * 
 * Usage:
 *   node scripts/new-client.js "Nombre" "Ciudad" "dominio.com" "email@cliente.com" "https://supabase-url.co" "anon-key"
 *
 * Example:
 *   node scripts/new-client.js "Bar Pepe" "Madrid" "barpepe.com" "admin@barpepe.com" "https://xyz.supabase.co" "eyJhbGc..."
 *
 * Prerequisites:
 *   - gh auth login (GitHub CLI)
 *   - vercel login (Vercel CLI - ya hecho ✅)
 *   - SUPABASE_ACCESS_TOKEN en CREDENCIALES.txt ✅
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const [, , ...args] = process.argv;
const templateDir = path.resolve(__dirname, '..');
const SUPABASE_TOKEN = 'sbp_8d…e4a0';

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
    process.exit(1);
  }
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

function getConfigValue(key) {
  const configPath = path.join(templateDir, 'config.js');
  const content = fs.readFileSync(configPath, 'utf8');
  const match = content.match(new RegExp(`${key}\\s*:\\s*[^,\\n}]+`));
  return match ? match[0].split(':')[1].trim().replace(/"/g, '') : null;
}

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
  if (args.length < 6) {
    console.log('\n🍽️  GastroExperience — Nuevo Cliente\n');
    console.log('Usage: node scripts/new-client.js "Nombre" "Ciudad" "dominio.com" "email" "supabase-url" "anon-key"\n');
    console.log('Example:');
    console.log('  node scripts/new-client.js "Bar Pepe" "Madrid" "barpepe.com" "admin@barpepe.com" "https://xyz.supabase.co" "eyJhbGc..."\n');
    process.exit(1);
  }

  const [name, city, domain, email, supabaseUrl, supabaseKey] = args;
  const slug = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const restaurantId = `rest-${slug}-${Date.now().toString(36)}`;
  const repoName = `gastroexperiencem-es-${slug}`;
  const projectRef = supabaseUrl.replace('https://', '').split('.')[0];

  console.log('\n🍽️  GastroExperience — Nuevo Cliente\n');
  log(`  Restaurante: ${name}`, '🔵');
  log(`  Ciudad:     ${city}`, '🔵');
  log(`  Dominio:    ${domain}`, '🔵');
  log(`  Repo:       ${repoName}`, '🔵');
  log(`  Supabase:   ${supabaseUrl}`, '🔵');
  log(`  ID:         ${restaurantId}`, '🔵');
  console.log('');

  // ── 1. GitHub repo ──────────────────────────────────────
  log('─── GitHub ───', '📋');
  try {
    run(`gh repo create ${repoName} --private --source . --push`, { timeout: 90000 });
    log(`Repo creado: marquezchinchonsl-sketch/${repoName}`, '🟢');
  } catch (e) {
    if (e.message.includes('already exists')) {
      log('Repo ya existe, usando existente', '🟡');
    } else { throw e; }
  }

  // ── 2. Update config.js ─────────────────────────────────
  log('─── config.js ───', '📋');
  updateConfig({
    barName: name,
    barCity: city,
    barTagline: 'Cocina de Mercado',
    siteUrl: `https://${domain}`,
    restaurantId,
    supabaseUrl,
    supabaseKey,
  });
  log('config.js actualizado', '🟢');

  // ── 3. Commit & Push ─────────────────────────────────────
  log('─── Git Push ───', '📋');
  run('git add -A');
  run('git commit -m "Setup: ' + name + ' [' + restaurantId + ']"');
  run('git push -u origin main', { timeout: 60000 });
  log('Push completado', '🟢');

  // ── 4. Apply RLS in Supabase ─────────────────────────────
  log('─── Supabase RLS ───', '📋');
  const rlsResult = await supabaseApi('POST', `/v1/projects/${projectRef}/database/query`, { query: RLS_SQL });
  if (rlsResult?.error) {
    log(`⚠️  RLS apply: ${JSON.stringify(rlsResult.error).slice(0, 100)}`, '🟡');
  } else {
    log('RLS + Auth aplicados', '🟢');
  }

  // ── 5. Vercel Deploy ─────────────────────────────────────
  log('─── Vercel Deploy ───', '📋');
  try {
    run(`vercel --yes --prod --name ${repoName}`, { timeout: 120000 });
    log('Deploy iniciado', '🟢');
  } catch (e) {
    log('Vercel deploy (hacer manualmente): vercel --prod --name ' + repoName, '🟡');
  }

  // ── 6. Configure domain in Vercel ───────────────────────
  log('─── Dominio ───', '📋');
  try {
    run(`vercel certs add ${domain} 2>/dev/null || echo "SSL manual"`, { ignoreError: true });
    log(`Dominio: https://${domain}`, '🟢');
  } catch {
    log('Configurar dominio manualmente en Vercel dashboard', '🟡');
  }

  // ── Summary ──────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('🟢  CLIENTE CREADO');
  console.log('═══════════════════════════════════════════\n');
  console.log(`  🍽️  Restaurante: ${name}`);
  console.log(`  📍 Ciudad:      ${city}`);
  console.log(`  🌐 Dominio:     https://${domain}`);
  console.log(`  🔧 Admin:       https://${domain}/admin`);
  console.log(`  ⚙️  Setup:       https://${domain}/setup`);
  console.log(`  📦 GitHub:      github.com/marquezchinchonsl-sketch/${repoName}`);
  console.log(`  🗄️  Supabase:    ${supabaseUrl}`);
  console.log(`  🆔 Repo ID:     ${restaurantId}\n`);
  console.log('═══════════════════════════════════════════\n');
}

main().catch(err => {
  log(`Error: ${err.message}`, '🔴');
  process.exit(1);
});