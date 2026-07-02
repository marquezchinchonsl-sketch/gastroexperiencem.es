/**
 * Vercel Serverless Function — /api/deploy
 * POST: Crea repo GitHub, sube template, despliega en Vercel via CLI, registra en BD
 */
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createHash } = require('node:crypto');

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

    // ── 2. Get template file tree via GitHub API ─────────
    log('2. Getting template file list...');
    const treeResult = await gh('GET', `/repos/${TEMPLATE_REPO}/git/trees/main?recursive=1`);
    if (treeResult.status !== 200) { throw new Error(`Template tree failed: ${treeResult.status}`); }
    const tree = treeResult.data.tree || [];
    const files = tree.filter(t => t.type === 'blob' && !t.path.includes('.git/'));
    log(`Template has ${files.length} files`);

    // ── 3. Download files and update config.js ────────────
    log('3. Downloading and processing files...');
    const fileDataList = [];
    const https = require('https');

    const downloadFile = (url) => {
      return new Promise((resolve, reject) => {
        const u = new URL(url);
        const opts = { hostname: u.hostname, path: u.pathname, method: 'GET', headers: { 'Authorization': `Bearer ${GH_TOKEN}`, 'Accept': 'application/vnd.github+json' } };
        const req = https.request(opts, res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.end();
      });
    };

    let configContent = null;
    for (const file of files) {
      const filePath = decodeURIComponent(file.path);
      const rawUrl = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/main/${filePath}`;
      try {
        let content = await downloadFile(rawUrl);
        content = content.toString('utf8');

        // Modify config.js
        if (filePath === 'config.js') {
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
          configContent = content;
        }

        fileDataList.push({ file: filePath, data: Buffer.from(content).toString('base64'), encoding: 'base64' });
      } catch(e) {
        log(`Skip ${filePath}: ${e.message.slice(0, 50)}`);
      }
    }
    log(`Downloaded ${fileDataList.length} files`);
    if (configContent) { log('config.js updated in memory'); }

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
        // First upload all files to Vercel storage
        log('Uploading files to Vercel storage...');
        const fileSha1Map = {};
        
        for (const f of fileDataList) {
          const content = Buffer.from(f.data, 'base64');
          const sha1 = createHash('sha1').update(content).digest('hex');
          fileSha1Map['/' + f.file] = sha1;
          
          // Upload to Vercel storage
          const uploadResult = await new Promise((resolve, reject) => {
            const opts = {
              hostname: 'api.vercel.com', path: '/v1/files', method: 'POST',
              headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/octet-stream',
                'Content-Length': content.length,
                'x-now-digest': sha1,
                'x-now-size': String(content.length),
              }
            };
            const req = https.request(opts, res => {
              let d = ''; res.on('data', c => d += c);
              res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
                catch { resolve({ status: res.statusCode, data: d }); }
              });
            });
            req.on('error', reject);
            req.write(content);
            req.end();
          });
          log(`Upload ${f.file}: ${uploadResult.status}`);
        }
        log('All files uploaded. Creating deployment with fileSha1Map...');
        
        const deployPayload = {
          name: repoName,
          fileSha1Map,
        };
        
        log('Sending deployment request with SHA1 map...');
        const vDeploy = await httpsRequest('POST', `https://api.vercel.com/v13/deployments`,
          deployPayload,
          { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
        );

        log('Deploy status:', vDeploy.status, JSON.stringify(vDeploy.data).slice(0, 200));
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
