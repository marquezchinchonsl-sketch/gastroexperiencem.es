/**
 * Vercel Serverless Function — /api/deploy
 * POST: Crea repo GitHub, sube template, despliega en Vercel via CLI, registra en BD
 */
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  const TEMPLATE_REPO = 'marquezchinchonsl-sketch/gastroexperience-template';
  const SUPABASE_URL = 'https://xornvhqqjovcucpuqgoo.supabase.co';
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const slug = domain.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const repoName = `gastroexperiencem-${slug}`;
  const newRepoFullName = `marquezchinchonsl-sketch/${repoName}`;

  const logLines = [];
  const log = (...a) => { const msg = `[${new Date().toISOString()}] ` + a.map(x=>String(x)).join(' '); logLines.push(msg); console.log(msg); };

  const exec = (cmd, opts = {}) => {
    try {
      return execSync(cmd, {
        shell: '/bin/bash',
        timeout: opts.timeout || 120000,
        encoding: 'utf8',
        stdio: 'pipe',
        ...opts,
      })?.toString().trim() || '';
    } catch (e) {
      if (opts.ignoreError) return null;
      return e.stdout?.toString() || e.message;
    }
  };

  // ── HTTP helpers ────────────────────────────────────────
  const httpsRequest = (method, urlStr, postData, headers = {}) => {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const opts = {
        hostname: u.hostname, path: u.pathname + u.search, method,
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'GastroExperience/1.0', ...headers },
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

  const gh = (method, pathStr, postData) => {
    const h = { 'Accept': 'application/vnd.github+json', 'Authorization': `Bearer ${GH_TOKEN}` };
    return httpsRequest(method, `https://api.github.com${pathStr}`, postData, h);
  };

  log(`=== Deploy: ${name} (${domain}) ===`);

  if (!GH_TOKEN) {
    res.status(500).setHeader('Content-Type','application/json').end(JSON.stringify({ ok: false, error: 'GH_TOKEN no configurado. Añádelo en Vercel Dashboard → Settings → Environment Variables' }));
    return;
  }
  if (!VERCEL_TOKEN) {
    res.status(500).setHeader('Content-Type','application/json').end(JSON.stringify({ ok: false, error: 'VERCEL_TOKEN no configurado. Añádelo en Vercel Dashboard → Settings → Environment Variables' }));
    return;
  }

  const workDir = `/tmp/gastro-vercel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // ── 1. Create GitHub repo ─────────────────────────────
    log('1. Creating GitHub repo...');
    const createResult = await gh('POST', '/user/repos', {
      name: repoName, private: true,
      description: `GastroExperience - ${name} - ${domain}`,
    });

    if (createResult.status === 201) {
      log('Repo created');
    } else if (String(createResult.data).includes('already_exists') || createResult.status === 422) {
      log('Repo already exists');
    } else {
      throw new Error(`GitHub repo create: ${createResult.status} ${JSON.stringify(createResult.data).slice(0, 100)}`);
    }

    // ── 2. Clone template repo ────────────────────────────
    log('2. Cloning template repo...');
    const cloneResult = exec(`git clone --depth=1 "https://${GH_TOKEN}@github.com/${TEMPLATE_REPO}.git" "${workDir}"`, { timeout: 60000 });
    if (cloneResult && cloneResult.includes('fatal')) { log('Clone failed:', cloneResult.slice(0, 200)); }
    else { log('Clone done'); }

    // ── 3. Update config.js ────────────────────────────────
    const configPath = path.join(workDir, 'config.js');
    if (fs.existsSync(configPath)) {
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
        content = content.replace(new RegExp(`(${key})\\s*:\\s*[^,\\n}]+`, 'g'), `$1: ${escaped}`);
      }
      fs.writeFileSync(configPath, content);
      log('config.js updated');
    }

    // ── 4. Push to new GitHub repo ────────────────────────
    log('4. Setting up git and pushing...');
    const commitResult = exec(`cd "${workDir}" && git config user.email "deploy@masreservas.es" && git config user.name "MasReservas" && rm -rf .git && git init && git add -A && git commit -m "Setup: ${name} [${restaurant_id}]" 2>&1`, { timeout: 30000 });
    if (commitResult && (commitResult.includes('fatal') || commitResult.includes('error'))) { log('Commit warning:', commitResult.slice(0, 100)); }
    const pushResult = exec(`cd "${workDir}" && git remote add origin "https://${GH_TOKEN}@github.com/${newRepoFullName}.git" && git branch -M main && git push -u origin main --force 2>&1`, { timeout: 60000 });
    if (pushResult && (pushResult.includes('fatal') || pushResult.includes('error'))) { log('Push failed:', pushResult.slice(0, 200)); }
    else { log('Git push done:', pushResult.slice(0, 100)); }

    // ── 5. Deploy directly using Vercel file upload API ──
    let vercelUrl = '';
    log('5. Deploying to Vercel (file upload)...');
    try {
      // Get or create project
      const projList = await httpsRequest('GET', `https://api.vercel.com/v13/projects?search=${repoName}&limit=1`,
        null, { 'Authorization': `Bearer ${VERCEL_TOKEN}` });
      let projectId = null;

      if (projList.status === 200 && projList.data.projects?.length > 0) {
        projectId = projList.data.projects[0].id;
        vercelUrl = projList.data.projects[0].name;
        log('Using existing project:', projectId);
      } else {
        const vCreate = await httpsRequest('POST', `https://api.vercel.com/v13/projects`,
          { name: repoName },
          { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
        );
        if (vCreate.status === 200 || vCreate.status === 201) {
          projectId = vCreate.data.id;
          vercelUrl = repoName;
          log('Project created:', projectId);
        } else {
          log('Project create failed:', vCreate.status);
        }
      }

      if (projectId) {
        // Read all files from workDir and create deployment with file upload
        const path = require('path');
        const fs = require('fs');

        const walkDir = (dir) => {
          const files = [];
          if (!fs.existsSync(dir)) {
            log('ERROR: workDir does not exist:', dir);
            return files;
          }
          const items = fs.readdirSync(dir);
          for (const item of items) {
            if (item === '.git') continue;
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              files.push(...walkDir(fullPath));
            } else {
              const relPath = path.relative(workDir, fullPath);
              files.push({ path: relPath, file: fullPath });
            }
          }
          return files;
        };

        const allFiles = walkDir(workDir);
        log('Files to upload:', allFiles.length);

        // Create a zip or upload files individually
        // Vercel deployment with files: POST /v13/deployments with files array
        const fileDataList = [];
        for (const f of allFiles) {
          const content = fs.readFileSync(f.file);
          const base64 = content.toString('base64');
          fileDataList.push({ file: f.path, data: base64, encoding: 'base64' });
        }

        log('Uploading files to Vercel...');
        const deployPayload = {
          name: repoName,
          projectId,
          files: fileDataList,
          projectSettings: {
            buildCommand: null,
            outputDirectory: '.',
            installCommand: null,
            framework: null,
          },
        };

        const vDeploy = await httpsRequest('POST', `https://api.vercel.com/v13/deployments`,
          deployPayload,
          { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
        );

        log('Deploy status:', vDeploy.status, JSON.stringify(vDeploy.data).slice(0, 80));
        if (vDeploy.status === 200 || vDeploy.status === 201) {
          vercelUrl = vDeploy.data.url || `${repoName}.vercel.app`;
          log('Deployed! URL:', vercelUrl);
        } else {
          log('Deploy failed:', JSON.stringify(vDeploy.data).slice(0, 100));
        }
      }
    } catch (e) {
      log('Vercel deploy error:', e.message.slice(0, 200));
    }

    // ── 6. Register in Supabase ───────────────────────────
    log('6. Registering in Supabase...');
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

    // ── 7. Cleanup (only after all steps complete) ────
    log('Cleanup...');
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}

    log(`=== DONE: ${name} ===`);
    const response = {
      ok: true, domain, restaurant_id, repoName,
      url: vercelUrl ? `https://${vercelUrl}.vercel.app` : `https://${domain}`,
      adminUrl: vercelUrl ? `https://${vercelUrl}.vercel.app/admin` : `https://${domain}/admin`,
      githubUrl: `https://github.com/${newRepoFullName}`,
      message: vercelUrl
        ? `Cliente "${name}" creado y desplegado en Vercel!`
        : `Cliente "${name}" creado en GitHub. Despliegue en Vercel pendiente.`,
      logs: logLines.slice(-20), // last 20 log lines for debugging
    };
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(response));

  } catch(e) {
    log('ERROR:', e.message);
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    try { exec(`rm -rf "${workDir}"`, { ignoreError: true }); } catch {}
    res.status(500).setHeader('Content-Type','application/json').end(JSON.stringify({ ok: false, error: e.message, logs: logLines.slice(-10) }));
  }
};
