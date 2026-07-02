#!/usr/bin/env node
/**
 * deploy-server.js — GastroExperience
 * Servidor HTTP ligero en puerto 3002 que recibe las peticiones de deploy
 * del dashboard y ejecuta scripts/deploy-client.js
 *
 * Uso: node scripts/deploy-server.js
 */
const http = require('http');
const { spawn } = require('child_process');
const url = require('url');

const PORT = 3002;
const PROJECT_DIR = '/Users/adrianmarquez/Desktop/gastroexperience copia';
const SCRIPT = `${PROJECT_DIR}/scripts/deploy-client.js`;

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS headers para peticiones del dashboard
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'POST' && pathname === '/deploy') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const { name, city, domain, email, restaurant_id } = JSON.parse(body);
        if (!name || !city || !domain || !email || !restaurant_id) {
          res.writeHead(400);
          res.end(JSON.stringify({ ok: false, error: 'Missing fields' }));
          return;
        }

        console.log(`[deploy-server] Starting deploy: ${name} (${domain})`);

        // Run the deploy script
        const output = await runScript(name, city, domain, email, restaurant_id);
        console.log(`[deploy-server] Done: ${name} -> ${output.ok ? 'OK' : output.error}`);

        res.writeHead(200);
        res.end(JSON.stringify(output));
      } catch(e) {
        console.error('[deploy-server] Error:', e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Health check
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

function runScript(name, city, domain, email, restaurant_id) {
  return new Promise((resolve) => {
    const child = spawn('node', [SCRIPT, name, city, domain, email, restaurant_id], {
      cwd: PROJECT_DIR,
      env: { ...process.env, PROJECT_DIR },
    });

    let stdout = '';
    let stderr = '';
    let done = false;

    const finish = (ok, out) => {
      if (done) return;
      done = true;
      child.kill();
      resolve({ ok, output: out, stdout, stderr });
    };

    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });

    child.on('close', code => {
      if (code === 0) {
        // Try to parse JSON from stdout
        const lines = stdout.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        try {
          const result = JSON.parse(lastLine);
          resolve(result);
        } catch {
          resolve({ ok: true, output: stdout });
        }
      } else {
        resolve({ ok: false, error: stderr || `Exit code ${code}`, output: stdout });
      }
    });

    child.on('error', e => resolve({ ok: false, error: e.message }));

    // Timeout: 5 minutes
    setTimeout(() => finish(false, 'Timeout: script tardó más de 5 minutos'), 300000);
  });
}

server.listen(PORT, () => {
  console.log(`[deploy-server] listening on http://localhost:${PORT}`);
  console.log(`[deploy-server] Project dir: ${PROJECT_DIR}`);
  console.log(`[deploy-server] Script: ${SCRIPT}`);
});
