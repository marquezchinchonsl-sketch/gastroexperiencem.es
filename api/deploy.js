/**
 * Vercel Serverless Function — /api/deploy
 * POST: Crea repo GitHub desde template, despliega en Vercel, registra en BD
 */
const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { res.status(400).json({ ok: false, error: 'Invalid JSON' }); return; }

  const { name, city, domain, email, restaurant_id } = body;
  if (!name || !city || !domain || !email || !restaurant_id) {
    res.status(400).json({ ok: false, error: 'Missing fields' }); return;
  }

  const GH_TOKEN = process.env.GH_TOKEN;
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || 'marquezchinchonsl-5863s';
  const TEMPLATE_REPO = 'marquezchinchonsl-sketch/gastroexperience-template';
  const TEMPLATE_URL = `https://${GH_TOKEN}@github.com/${TEMPLATE_REPO}.git`;

  const SUPABASE_URL = 'https://xornvhqqjovcucpuqgoo.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAwOTUyMjIsImV4cCI6MjA2NTY3MTIyMn0.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA';

  const slug = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const repoName = `gastroexperiencem-${slug}`;
  const NEW_REPO_URL = `https://github.com/marquezchinchonsl-sketch/${repoName}.git`;

  const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

  // ── HTTP helper ─────────────────────────────────────────
  const httpReq = (method, urlStr, postData, extraHeaders = {}) => {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const opts = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'GastroExperience/1.0', ...extraHeaders },
      };
      const req = https.request(opts, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
          catch { resolve({ status: res.statusCode, data: d }); }
        });
      });
      req.on('error', reject);
      if (postData) req.write(JSON.stringify(postData));
      req.end();
    });
  };

  const ghReq = (method, pathStr, postData) => {
    const headers = { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${GH_TOKEN}` };
    return httpReq(method, `https://api.github.com${pathStr}`, postData, headers);
  };

  const exec = (cmd) => {
    const { execSync } = require('child_process');
    try {
      return execSync(cmd, { shell: '/bin/bash', timeout: 120000, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) { return e.stdout || e.message; }
  };

  log(`=== Deploy: ${name} (${domain}) ===`);
  log(`Template: ${TEMPLATE_REPO} -> ${repoName}`);

  if (!GH_TOKEN) {
    res.status(500).json({ ok: false, error: 'GH_TOKEN not configured in Vercel environment variables' });
    return;
  }

  try {
    // ── 1. Create new GitHub repo ─────────────────────────
    log('Creating GitHub repo...');
    const ghResult = await ghReq('POST', '/user/repos', {
      name: repoName,
      private: true,
      description: `GastroExperience - ${name} - ${domain}`,
    });

    if (ghResult.status === 201) {
      log('GitHub repo created');
    } else if (String(ghResult.data).includes('already_exists') || ghResult.status === 422) {
      log('GitHub repo already exists');
    } else {
      throw new Error(`GitHub repo create: ${ghResult.status} ${JSON.stringify(ghResult.data).slice(0, 100)}`);
    }

    // ── 2. Clone template repo to temp dir ──────────────
    const workDir = `/tmp/gastro-clone-${Date.now()}`;
    exec(`git clone --bare ${TEMPLATE_URL} "${workDir}-bare"`);
    exec(`git init --bare "${workDir}-bare" 2>/dev/null || true`);

    // Clone and push to new repo
    const cloneResult = exec(`git clone "https://${GH_TOKEN}@github.com/${TEMPLATE_REPO}.git" "${workDir}" 2>&1`);
    log('Clone: ' + cloneResult.slice(0, 100));

    // Update config.js in the cloned repo
    const configPath = `${workDir}/config.js`;
    const { readFileSync, writeFileSync, existsSync } = require('fs');
    if (existsSync(configPath)) {
      let content = readFileSync(configPath, 'utf8');
      const replacements = {
        barName: name,
        barCity: city,
        barTagline: 'Cocina de Mercado',
        siteUrl: `https://${domain}`,
        restaurantId: restaurant_id,
      };
      for (const [key, value] of Object.entries(replacements)) {
        const escaped = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : JSON.stringify(value);
        content = content.replace(new RegExp(`(${key})\\s*:\\s*[^,\\n}]+`, 'g'), `$1: ${escaped}`);
      }
      writeFileSync(configPath, content);
      log('config.js updated');
    }

    // Set up git for the new repo
    exec(`cd "${workDir}" && git config user.email "deploy@masreservas.es" && git config user.name "MasReservas Deploy"`);
    exec(`cd "${workDir}" && git add -A && git commit -m "Setup: ${name} [${restaurant_id}]" || true`);
    exec(`cd "${workDir}" && git remote set-url origin "https://${GH_TOKEN}@github.com/marquezchinchonsl-sketch/${repoName}.git"`);
    const pushResult = exec(`cd "${workDir}" && git push -u origin main --force 2>&1`);
    log('Push: ' + pushResult.slice(0, 100));

    // ── 3. Deploy to Vercel ───────────────────────────────
    let vercelUrl = '';
    if (VERCEL_TOKEN) {
      log('Creating Vercel project...');
      try {
        const vCreate = await httpReq('POST', `https://api.vercel.com/v13/projects`,
          { name: repoName, gitRepository: { repo: `marquezchinchonsl-sketch/${repoName}`, type: 'github' } },
          { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
        );
        log('Vercel create:', vCreate.status, JSON.stringify(vCreate.data).slice(0, 100));

        if (vCreate.status === 200 || vCreate.status === 201) {
          const projectId = vCreate.data.id;
          log(`Vercel project ${projectId} created, deploying...`);

          const vDeploy = await httpReq('POST', `https://api.vercel.com/v13/deployments`,
            {
              name: repoName,
              gitSource: { repo: `marquezchinchonsl-sketch/${repoName}`, ref: 'main', type: 'github' },
              projectId,
            },
            { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
          );

          if (vDeploy.status === 200 || vDeploy.status === 201) {
            vercelUrl = vDeploy.data.url || `${repoName}.vercel.app`;
            log('Vercel deployed:', vercelUrl);
          } else {
            log('Vercel deploy failed:', vDeploy.status, JSON.stringify(vDeploy.data).slice(0, 100));
          }
        }
      } catch (e) {
        log('Vercel error:', e.message);
      }
    } else {
      log('VERCEL_TOKEN not set, skipping Vercel deploy');
    }

    // ── 4. Register in Supabase ───────────────────────────
    const rows = [
      { restaurant_id, key: 'bar_name', value: name },
      { restaurant_id, key: 'bar_city', value: city },
      { restaurant_id, key: 'bar_tagline', value: 'Cocina de Mercado' },
      { restaurant_id, key: 'email', value: email },
      { restaurant_id, key: 'domain', value: domain },
      { restaurant_id, key: 'subdomain', value: slug },
      { restaurant_id, key: 'restaurant_id', value: restaurant_id },
      { restaurant_id, key: 'supabase_url', value: SUPABASE_URL },
      { restaurant_id, key: 'supabase_key', value: SUPABASE_KEY },
      { restaurant_id, key: 'admin_password', value: 'admin1234' },
      { restaurant_id, key: 'status', value: 'active' },
      { restaurant_id, key: 'created_at', value: new Date().toISOString() },
    ];

    try {
      const bdRes = await fetch(`${SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows)
      });
      log('Supabase registration:', bdRes.status);
    } catch(e) { log('Supabase error:', e.message); }

    // Cleanup
    exec(`rm -rf "${workDir}" "${workDir}-bare" 2>/dev/null || true`);

    log(`=== DONE: ${name} ===`);
    res.json({
      ok: true, domain, restaurant_id, repoName,
      url: vercelUrl ? `https://${vercelUrl}` : `https://${domain}`,
      adminUrl: vercelUrl ? `https://${vercelUrl}/admin` : `https://${domain}/admin`,
      githubUrl: `https://github.com/marquezchinchonsl-sketch/${repoName}`,
      message: `Cliente "${name}" creado y desplegado`,
    });

  } catch(e) {
    log('ERROR:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
