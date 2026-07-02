/**
 * Vercel Serverless Function — /api/deploy
 * POST: Crea repo GitHub, sube código, despliega en Vercel, registra en BD
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
  const VERCEL_TEAM = process.env.VERCEL_TEAM || 'marquezchinchonsl-5863s';
  const slug = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const repoName = `gastroexperiencem-${slug}`;
  const supabaseUrl = 'https://xornvhqqjovcucpuqgoo.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbG…uwFA';
  const PROJECT_DIR = '/Users/adrianmarquez/Desktop/gastroexperience copia';

  const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

  // ── HTTP helper ─────────────────────────────────────────
  const httpReq = (method, urlStr, postData, extraHeaders = {}) => {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const opts = {
        hostname: u.hostname, path: u.pathname + u.search, method,
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

  log(`Deploying: ${name} (${domain})`);

  try {
    // ── 1. Read and modify project files ──────────────────
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');

    // Create temp dir
    const workDir = `/tmp/gastro-vercel-${Date.now()}`;
    fs.mkdirSync(workDir, { recursive: true });

    // Copy project (exclude .git, node_modules, .vercel)
    execSync(`rsync -a --exclude='.git' --exclude='node_modules' --exclude='.vercel' --exclude='.next' "${PROJECT_DIR}/" "${workDir}/"`, { timeout: 60000 });
    log('Project copied');

    // Update config.js
    const configPath = path.join(workDir, 'config.js');
    if (fs.existsSync(configPath)) {
      let content = fs.readFileSync(configPath, 'utf8');
      const replacements = { barName: name, barCity: city, barTagline: 'Cocina de Mercado', siteUrl: `https://${domain}`, restaurantId: restaurant_id };
      for (const [key, value] of Object.entries(replacements)) {
        const escaped = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : JSON.stringify(value);
        content = content.replace(new RegExp(`(${key})\\s*:\\s*[^,\\n}]+`, 'g'), `$1: ${escaped}`);
      }
      fs.writeFileSync(configPath, content);
      log('config.js updated');
    }

    // Create tarball of the project
    const tarPath = `/tmp/repo-${Date.now()}.tar.gz`;
    execSync(`tar -czf "${tarPath}" -C "${workDir}" .`, { timeout: 30000 });
    const tarBuffer = fs.readFileSync(tarPath);
    fs.unlinkSync(tarPath);
    fs.rmSync(workDir, { recursive: true, force: true });
    log('Tarball created');

    // ── 2. Create GitHub repo ─────────────────────────────
    const ghResult = await ghReq('POST', '/user/repos', {
      name: repoName, private: true,
      description: `GastroExperience - ${name} - ${domain}`,
      auto_init: false,
    });

    if (ghResult.status === 201) {
      log('GitHub repo created');
    } else if (ghResult.status === 422 || String(ghResult.data).includes('already_exists')) {
      log('GitHub repo already exists, continuing');
    } else {
      throw new Error(`GitHub repo create failed: ${ghResult.status} ${JSON.stringify(ghResult.data).slice(0, 100)}`);
    }

    // ── 3. Upload files to GitHub using git archive + upload ─
    // Simpler approach: use the GitHub API contents endpoint
    const fileContents = [
      { path: 'config.js', src: path.join(PROJECT_DIR, 'config.js') },
      { path: 'routing.js', src: path.join(PROJECT_DIR, 'routing.js') },
      { path: 'admin.html', src: path.join(PROJECT_DIR, 'admin.html') },
      { path: 'admin.js', src: path.join(PROJECT_DIR, 'admin.js') },
      { path: 'admin.css', src: path.join(PROJECT_DIR, 'admin.css') },
      { path: 'index.html', src: path.join(PROJECT_DIR, 'index.html') },
      { path: 'index.css', src: path.join(PROJECT_DIR, 'index.css') },
      { path: 'carta.html', src: path.join(PROJECT_DIR, 'carta.html') },
      { path: 'reservas.html', src: path.join(PROJECT_DIR, 'reservas.html') },
      { path: 'reservas.css', src: path.join(PROJECT_DIR, 'reservas.css') },
      { path: 'setup.html', src: path.join(PROJECT_DIR, 'setup.html') },
      { path: 'master-admin.html', src: path.join(PROJECT_DIR, 'master-admin.html') },
      { path: 'master-admin.js', src: path.join(PROJECT_DIR, 'master-admin.js') },
      { path: 'master-admin.css', src: path.join(PROJECT_DIR, 'master-admin.css') },
      { path: 'dashboard.html', src: path.join(PROJECT_DIR, 'dashboard.html') },
      { path: 'sw.js', src: path.join(PROJECT_DIR, 'sw.js') },
      { path: 'manifest.json', src: path.join(PROJECT_DIR, 'manifest.json') },
      { path: 'vercel.json', src: path.join(PROJECT_DIR, 'vercel.json') },
      { path: 'package.json', src: path.join(PROJECT_DIR, 'package.json') },
      { path: '.gitignore', src: path.join(PROJECT_DIR, '.gitignore') },
      { path: '404.html', src: path.join(PROJECT_DIR, '404.html') },
    ];

    // Also copy image files
    const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'];
    const allFiles = execSync(`find "${PROJECT_DIR}" -type f -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.vercel/*" -not -path "*/.next/*"`, { encoding: 'utf8' })
      .split('\n').filter(Boolean);

    for (const file of allFiles) {
      const filename = path.basename(file);
      const ext = filename.split('.').pop().toLowerCase();
      if (!fileContents.find(f => f.src === file) && (imageExts.includes(ext) || filename.endsWith('.css'))) {
        fileContents.push({ path: filename, src: file });
      }
    }

    log(`Uploading ${fileContents.length} files to GitHub...`);

    for (const { path: filePath, src } of fileContents) {
      if (!fs.existsSync(src)) continue;
      const content = fs.readFileSync(src).toString('base64');
      const encodedPath = encodeURIComponent(filePath);
      const uploadResult = await ghReq('PUT', `/repos/marquezchinchonsl-sketch/${repoName}/contents/${encodedPath}`, {
        message: `Add ${filePath}`,
        content,
        branch: 'main',
      });
      if (uploadResult.status !== 201 && uploadResult.status !== 200) {
        log(`Upload warning: ${filePath} -> ${uploadResult.status}`);
      }
    }
    log('Files uploaded to GitHub');

    // ── 4. Deploy to Vercel ────────────────────────────────
    let vercelUrl = '';
    if (VERCEL_TOKEN) {
      log('Creating Vercel project...');
      const vCreate = await httpReq('POST', `https://api.vercel.com/v13/projects`,
        { name: repoName, gitRepository: { repo: `marquezchinchonsl-sketch/${repoName}`, type: 'github' } },
        { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
      );
      log('Vercel project:', vCreate.status, JSON.stringify(vCreate.data).slice(0, 100));

      if (vCreate.status === 200 || vCreate.status === 201) {
        const projectId = vCreate.data.id;
        log('Deploying to Vercel...');
        const vDeploy = await httpReq('POST', `https://api.vercel.com/v13/deployments`,
          { name: repoName, gitSource: { repo: `marquezchinchonsl-sketch/${repoName}`, ref: 'main', type: 'github' } },
          { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
        );
        if (vDeploy.status === 200 || vDeploy.status === 201) {
          vercelUrl = vDeploy.data.url || `${repoName}.vercel.app`;
          log('Vercel deployment:', vDeploy.status, vercelUrl);
        }
      }
    } else {
      log('VERCEL_TOKEN not set, skipping Vercel deploy');
    }

    // ── 5. Register in Supabase ───────────────────────────
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
      const bdRes = await fetch(`${supabaseUrl}/rest/v1/settings`, {
        method: 'POST',
        headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify(rows)
      });
      log('Supabase registration:', bdRes.status);
    } catch(e) { log('Supabase error:', e.message); }

    log(`=== DONE: ${name} ===`);
    res.json({
      ok: true, domain, restaurant_id, repoName,
      url: vercelUrl ? `https://${vercelUrl}` : `https://${domain}`,
      adminUrl: vercelUrl ? `https://${vercelUrl}/admin` : `https://${domain}/admin`,
      githubUrl: `https://github.com/marquezchinchonsl-sketch/${repoName}`,
      message: `Cliente "${name}" creado`,
    });

  } catch(e) {
    log('ERROR:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
