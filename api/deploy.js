/**
 * Vercel Serverless Function — /api/deploy
 * POST: Crea repo GitHub, copia template via API REST, despliega en Vercel, registra en BD
 */
const https = require('https');
const http = require('http');

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

  const log = (...a) => console.log(`[${new Date().toISOString()}]`, ...a);

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

  const ghRaw = (method, urlStr, headers = {}) => {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const opts = { hostname: u.hostname, path: u.pathname + u.search, method, headers };
      const req = https.request(opts, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve({ status: 302, redirect: res.headers.location });
          return;
        }
        let d = []; res.on('data', c => d.push(c)); res.on('end', () => {
          const buf = Buffer.concat(d);
          resolve({ status: res.statusCode, data: buf, isBuffer: true });
        });
      });
      req.on('error', reject);
      req.end();
    });
  };

  log(`=== Deploy: ${name} (${domain}) ===`);

  if (!GH_TOKEN) {
    res.status(500).json({ ok: false, error: 'GH_TOKEN no configurado. Añádelo en Vercel Dashboard → Settings → Environment Variables' });
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
      log('Repo already exists, continuing');
    } else {
      throw new Error(`GitHub repo create: ${createResult.status} ${JSON.stringify(createResult.data).slice(0, 100)}`);
    }

    // ── 2. Get template repo file tree ────────────────────
    log('2. Getting template file list...');
    const treeResult = await gh('GET', `/repos/${TEMPLATE_REPO}/git/trees/main?recursive=1`);
    if (treeResult.status !== 200) {
      throw new Error(`Template tree: ${treeResult.status}`);
    }

    const tree = treeResult.data.tree || [];
    const files = tree.filter(t => t.type === 'blob' && !t.path.includes('.git/'));
    log(`Template has ${files.length} files`);

    // ── 3. Copy each file to new repo via API ─────────────
    log('3. Copying files to new repo...');
    const fileCount = { ok: 0, skip: 0, err: 0 };

    for (const file of files) {
      const filePath = decodeURIComponent(file.path);
      const newPath = encodeURIComponent(filePath);

      // Get file content from template
      const rawUrl = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/main/${filePath}`;
      const raw = await ghRaw('GET', rawUrl, { 'Authorization': `Bearer ${GH_TOKEN}` });

      if (raw.status !== 200) {
        log(`Skip ${filePath}: raw ${raw.status}`);
        fileCount.skip++;
        continue;
      }

      const content = raw.isBuffer ? raw.data.toString('base64') : Buffer.from(raw.data).toString('base64');

      // Check if file exists in new repo to get SHA
      let sha = null;
      const checkResult = await gh('GET', `/repos/${newRepoFullName}/contents/${newPath}?ref=main`);
      if (checkResult.status === 200 && checkResult.data.sha) {
        sha = checkResult.data.sha;
      }

      // Upload to new repo
      const updateData = {
        message: filePath === 'config.js'
          ? `Setup: ${name} [${restaurant_id}]`
          : `Add ${filePath}`,
        content,
        sha: sha || undefined,
        branch: 'main',
      };

      const uploadResult = await gh('PUT', `/repos/${newRepoFullName}/contents/${newPath}`, updateData);

      if (uploadResult.status === 200 || uploadResult.status === 201) {
        fileCount.ok++;
      } else {
        fileCount.err++;
        log(`Upload error ${filePath}: ${uploadResult.status} ${JSON.stringify(uploadResult.data).slice(0, 50)}`);
      }
    }
    log(`Files: ${fileCount.ok} ok, ${fileCount.skip} skipped, ${fileCount.err} errors`);

    // ── 4. Update config.js specifically ───────────────────
    log('4. Updating config.js with client data...');
    const configRawUrl = `https://raw.githubusercontent.com/${TEMPLATE_REPO}/main/config.js`;
    const configRaw = await ghRaw('GET', configRawUrl, { 'Authorization': `Bearer ${GH_TOKEN}` });

    if (configRaw.status === 200) {
      let configContent = configRaw.data.toString('utf8');
      const replacements = {
        barName: name,
        barCity: city,
        barTagline: 'Cocina de Mercado',
        siteUrl: `https://${domain}`,
        restaurantId: restaurant_id,
      };
      for (const [key, value] of Object.entries(replacements)) {
        const escaped = typeof value === 'string' ? `"${value.replace(/"/g, '\\"')}"` : JSON.stringify(value);
        configContent = configContent.replace(new RegExp(`(${key})\\s*:\\s*[^,\\n}]+`, 'g'), `$1: ${escaped}`);
      }

      const newConfigContent = Buffer.from(configContent).toString('base64');
      const checkCfg = await gh('GET', `/repos/${newRepoFullName}/contents/config.js?ref=main`);
      const cfgSha = checkCfg.status === 200 ? checkCfg.data.sha : null;

      const cfgUpload = await gh('PUT', `/repos/${newRepoFullName}/contents/config.js`, {
        message: `Setup config: ${name}`,
        content: newConfigContent,
        sha: cfgSha || undefined,
        branch: 'main',
      });
      log('config.js updated:', cfgUpload.status);
    }

    // ── 5. Get GitHub repo ID ─────────────────────────────
    let githubRepoId = null;
    try {
      const repoInfo = await gh('GET', `/repos/${newRepoFullName}`);
      if (repoInfo.status === 200 && repoInfo.data.id) {
        githubRepoId = repoInfo.data.id;
        log('GitHub repo ID:', githubRepoId);
      }
    } catch(e) { log('Could not get GitHub repo ID'); }

    // ── 5. Deploy to Vercel ───────────────────────────────
    let vercelUrl = '';
    if (VERCEL_TOKEN) {
      log('5. Creating Vercel project...');
      try {
        // Check if project already exists
        const projList = await httpsRequest('GET', `https://api.vercel.com/v13/projects?search=${repoName}&limit=1`,
          null, { 'Authorization': `Bearer ${VERCEL_TOKEN}` });
        let projectId = null;

        if (projList.status === 200 && projList.data.projects?.length > 0) {
          projectId = projList.data.projects[0].id;
          log('Using existing Vercel project:', projectId);
        } else {
          log('Creating new Vercel project...');
          const vCreate = await httpsRequest('POST', `https://api.vercel.com/v13/projects`,
            { name: repoName, gitRepository: { repo: newRepoFullName, type: 'github' } },
            { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
          );
          if (vCreate.status === 200 || vCreate.status === 201) {
            projectId = vCreate.data.id;
            log('Vercel project created:', projectId);
          } else {
            log('Vercel project create failed:', vCreate.status, JSON.stringify(vCreate.data).slice(0, 100));
          }
        }

        if (projectId) {
          log('Triggering Vercel deployment...');
          // Use project-scoped deployment
          const vDeploy = await httpsRequest('POST', `https://api.vercel.com/v13/deployments?projectId=${projectId}`,
            {
              name: repoName,
              gitSource: { repoId: String(githubRepoId), ref: 'main', type: 'github' },
            },
            { 'Authorization': `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' }
          );

          if (vDeploy.status === 200 || vDeploy.status === 201) {
            vercelUrl = vDeploy.data.url || `${repoName}.vercel.app`;
            log('Vercel deployed:', vercelUrl);
          } else {
            log('Vercel deploy failed:', vDeploy.status, JSON.stringify(vDeploy.data).slice(0, 100));
          }
        } else if (githubRepoId) {
          // Fallback: create deployment without projectId
          const vDeploy = await httpsRequest('POST', `https://api.vercel.com/v13/deployments`,
            {
              name: repoName,
              gitSource: { repoId: String(githubRepoId), ref: 'main', type: 'github' },
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
      log('VERCEL_TOKEN not set — skipping Vercel deploy (will be manual)');
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

    log(`=== DONE: ${name} ===`);
    res.json({
      ok: true, domain, restaurant_id, repoName,
      url: vercelUrl ? `https://${vercelUrl}` : `https://${repoName}.vercel.app`,
      adminUrl: vercelUrl ? `https://${vercelUrl}/admin` : `https://${repoName}.vercel.app/admin`,
      githubUrl: `https://github.com/${newRepoFullName}`,
      message: `Cliente "${name}" creado. ${vercelUrl ? 'Desplegado en Vercel.' : 'Repo GitHub creado. Despliegue manual pendiente.'}`,
    });

  } catch(e) {
    log('ERROR:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
