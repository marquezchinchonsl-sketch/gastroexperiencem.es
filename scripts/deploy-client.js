#!/usr/bin/env node
/**
 * deploy-client.js — GastroExperience
 * Uso: node scripts/deploy-client.js "Name" "City" "domain.com" "email@domain.com" "restaurant_id"
 *
 * Flujo: GitHub repo → copia proyecto → actualiza config → deploy Vercel → registra en BD
 */
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const args = process.argv.slice(2);
if (args.length < 5) {
  console.error('Usage: node deploy-client.js "Name" "City" "domain.com" "email@domain.com" "restaurant_id"');
  process.exit(1);
}

const [name, city, domain, email, restaurant_id] = args;
const slug = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
const repoName = `gastroexperiencem-${slug}`;
const PROJECT_DIR = '/Users/adrianmarquez/Desktop/gastroexperience copia';
const WORK_DIR = `/tmp/gastro-new-client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const VERCEL_TOKEN = process.env.VERCEL_TOKEN || '';

// ── Helpers ──────────────────────────────────────────────
const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);

const run = (cmd, opts = {}) => {
  const cwd = opts.cwd || WORK_DIR;
  try {
    return execSync(cmd, {
      cwd,
      shell: '/bin/bash',
      stdio: opts.silent ? 'pipe' : 'inherit',
      env: { ...process.env, ...(opts.env || {}) },
      timeout: opts.timeout || 60000,
    })?.toString().trim() || '';
  } catch (e) {
    if (opts.ignoreError) return null;
    log(`ERROR running: ${cmd.slice(0, 80)}`);
    log(`ERROR: ${e.message.slice(0, 200)}`);
    throw e;
  }
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const httpsRequest = (method, fullUrl, body, headers = {}) => {
  return new Promise((resolve, reject) => {
    const u = new URL(fullUrl);
    const options = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'GastroExperience-Deploy/1.0', ...headers },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
};

const ghApi = async (method, pathStr, body) => {
  const token = process.env.GH_TOKEN || run(`gh auth token`, { silent: true, timeout: 10000 }) || '';
  const headers = { 'Accept': 'application/vnd.github+json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const result = await httpsRequest(method, `https://api.github.com${pathStr}`, body, headers);
  if (result.status >= 400 && result.status !== 404) {
    throw new Error(`GitHub API ${method} ${pathStr} → ${result.status}: ${JSON.stringify(result.data).slice(0, 200)}`);
  }
  return result;
};

// ── Create GitHub repo via API ──────────────────────────
async function createGithubRepo() {
  log(`Creando repo GitHub: ${repoName}`);
  const result = await ghApi('POST', '/user/repos', {
    name: repoName,
    private: true,
    description: `GastroExperience - ${name} - ${domain}`,
    auto_init: false,
  });
  if (result.status === 201) {
    log(`Repo creado: github.com/${result.data.full_name}`);
    return result.data.clone_url;
  } else if (result.status === 422 || (result.data && String(result.data).includes('already_exists'))) {
    log('Repo ya existe, continuando...');
    const existing = await ghApi('GET', `/repos/marquezchinchonsl-sketch/${repoName}`);
    return existing.data.clone_url;
  }
  throw new Error(`GitHub repo create failed: ${result.status}`);
}

// ── Copy project to temp dir ───────────────────────────
async function copyProject() {
  // Create WORK_DIR first
  fs.mkdirSync(WORK_DIR, { recursive: true });
  log(`Directorio trabajo: ${WORK_DIR}`);

  // Copy project (rsync is more reliable than cp -r for this)
  try {
    run(`rsync -a --exclude='.git' --exclude='node_modules' --exclude='.vercel' "${PROJECT_DIR}/" "${WORK_DIR}/"`, { timeout: 60000 });
  } catch {
    // Fallback to cp
    run(`cp -a "${PROJECT_DIR}/." "${WORK_DIR}/"`, { timeout: 90000 });
  }
  log('Proyecto copiado');
}

// ── Update config.js in temp dir ───────────────────────
function updateConfig() {
  const configPath = path.join(WORK_DIR, 'config.js');
  if (!fs.existsSync(configPath)) {
    // Try carta.html if config.js doesn't exist
    log('config.js no encontrado, buscando alternativa...');
    return;
  }
  let content = fs.readFileSync(configPath, 'utf8');

  const replacements = {
    barName: name,
    barCity: city,
    barTagline: 'Cocina de Mercado',
    siteUrl: `https://${domain}`,
    restaurantId: restaurant_id,
  };

  for (const [key, value] of Object.entries(replacements)) {
    const escaped = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : JSON.stringify(value);
    content = content.replace(
      new RegExp(`(${key})\\s*:\\s*[^,\\n}]+`, 'g'),
      `$1: ${escaped}`
    );
  }

  fs.writeFileSync(configPath, content);
  log('config.js actualizado');
}

// ── Init git and push to new repo ──────────────────────
async function pushToGithub() {
  const cloneUrl = await createGithubRepo();
  log('Iniciando git...');

  // Clean any existing .git
  run(`rm -rf "${WORK_DIR}/.git"`, { ignoreError: true });

  run(`git init`, { cwd: WORK_DIR, timeout: 10000 });
  run(`git add -A`, { cwd: WORK_DIR, timeout: 20000 });
  run(`git commit -m "Setup: ${name} [${restaurant_id}]"`, { cwd: WORK_DIR, timeout: 30000 });
  run(`git branch -M main`, { cwd: WORK_DIR, timeout: 5000 });
  run(`git remote add origin "${cloneUrl}"`, { cwd: WORK_DIR, timeout: 10000 });

  // Push with token if available
  const token = process.env.GH_TOKEN || run(`gh auth token`, { silent: true, timeout: 10000 }) || '';
  let pushUrl = cloneUrl;
  if (token) {
    pushUrl = cloneUrl.replace('https://', `https://${token}@`);
    run(`git remote set-url origin "${pushUrl}"`, { cwd: WORK_DIR, timeout: 5000 });
  }

  try {
    run(`git push -u origin main --force`, { cwd: WORK_DIR, timeout: 90000 });
    log('Push completado');
  } catch(e) {
    log(`Push failed: ${e.message.slice(0, 100)}`);
    throw e;
  }
}

// ── Deploy to Vercel ───────────────────────────────────
async function deployVercel() {
  log('Desplegando en Vercel...');
  try {
    // Link project (non-interactive)
    try {
      run(`vercel link --yes --cwd="${WORK_DIR}"`, { timeout: 30000, ignoreError: true });
    } catch {}

    // Deploy
    const out = run(`vercel --prod --yes --cwd="${WORK_DIR}" --name=${repoName}`, { timeout: 180000 });
    log('Vercel deploy OK');
    log(out || 'Deploy completado');
    return out;
  } catch(e) {
    log(`Vercel deploy warning: ${e.message.slice(0, 100)}`);
    return null;
  }
}

// ── Register in main Supabase BD ────────────────────────
async function registerInSupabase() {
  log('Registrando en BD principal...');
  const supabaseUrl = 'https://xornvhqqjovcucpuqgoo.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1N30.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA';

  const rows = [
    { restaurant_id, key: 'bar_name', value: name },
    { restaurant_id, key: 'bar_city', value: city },
    { restaurant_id, key: 'bar_tagline', value: 'Cocina de Mercado' },
    { restaurant_id, key: 'email', value: email },
    { restaurant_id, key: 'domain', value: domain },
    { restaurant_id, key: 'subdomain', value: slug },
    { restaurant_id, key: 'restaurant_id', value: restaurant_id },
    { restaurant_id, key: 'supabase_url', value: supabaseUrl },
    { restaurant_id, key: 'supabase_key', value: supabaseKey },
    { restaurant_id, key: 'admin_password', value: 'admin1234' },
    { restaurant_id, key: 'status', value: 'active' },
    { restaurant_id, key: 'created_at', value: new Date().toISOString() },
  ];

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/settings`, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(rows)
    });
    if (res.ok) log('Registrado en BD principal');
    else log(`BD registration: HTTP ${res.status}`);
  } catch(e) {
    log(`BD registration error: ${e.message}`);
  }
}

// ── Cleanup ─────────────────────────────────────────────
function cleanup() {
  try {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    log('Cleanup done');
  } catch {}
}

// ── Main ────────────────────────────────────────────────
async function main() {
  log(`=== Nuevo Cliente: ${name} ===`);
  log(`Domain: ${domain} | City: ${city} | ID: ${restaurant_id}`);
  log(`Repo: ${repoName}`);

  try {
    await copyProject();
    updateConfig();
    await pushToGithub();
    await deployVercel();
    await registerInSupabase();

    const result = {
      ok: true,
      domain,
      restaurant_id,
      repoName,
      url: `https://${domain}`,
      adminUrl: `https://${domain}/admin`,
      message: `Cliente "${name}" creado y desplegado con éxito!`
    };
    log('=== DONE ===');
    console.log(JSON.stringify(result));
  } catch(e) {
    log(`ERROR: ${e.message}`);
    cleanup();
    console.error(JSON.stringify({ ok: false, error: e.message }));
    process.exit(1);
  } finally {
    cleanup();
  }
}

main();
