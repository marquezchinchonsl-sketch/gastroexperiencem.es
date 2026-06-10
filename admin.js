// admin.js — GastroExperience MINIMAL (login + basic dashboard only)
// Stripped to debug the freeze issue

const RID = APP_CONFIG.restaurantId;

// ── Mini Supabase-like client ──────────────────────────────
const SB = {
  createClient: (url, key) => {
    const hdrs = { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
    const fetch_ = (path, opts = {}) => fetch(`${url}${path}`, { ...opts, headers: { ...hdrs, ...(opts.headers||{}) } }).then(r => r.status === 204 ? {} : r.json());
    const Q = (base, headers) => ({
      select: (c='*') => Q(`${base}&select=${encodeURIComponent(c)}`, headers),
      eq: (k, v) => Q(`${base}&${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`, headers),
      neq: (k, v) => Q(`${base}&${encodeURIComponent(k)}=neq.${encodeURIComponent(v)}`, headers),
      gte: (k, v) => Q(`${base}&${encodeURIComponent(k)}=gte.${encodeURIComponent(v)}`, headers),
      order: (c, a=true) => Q(`${base}&order=${encodeURIComponent(c)}.${a?'asc':'desc'}`, headers),
      limit: (n) => Q(`${base}&limit=${n}`, headers),
      single: () => fetch_(base.replace(url,''), { headers }).then(r => ({ data: Array.isArray(r) ? r[0] : r, error: null })),
      maybeSingle: () => fetch_(base.replace(url,''), { headers }).then(r => ({ data: !r || (Array.isArray(r) && r.length === 0) ? null : (Array.isArray(r) ? r[0] : r), error: null })),
      then: (fn, rej) => new Promise(res => res(Q(base, headers))).then(fn).catch(rej||(e=>fn({ data: null, error: e })))
    });
    return {
      from: t => Q(`${url}/rest/v1/${t}?`, hdrs),
      rpc: (fn, args={}) => fetch_(`/rest/v1/rpc/${fn}`, { method:'POST', body: JSON.stringify(args) })
    };
  }
};
const db = SB.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);

// ── Config UI ────────────────────────────────────────────
document.getElementById('login-bar-name').textContent = APP_CONFIG.barName;
document.getElementById('admin-bar-label').textContent = APP_CONFIG.barName;
document.title = `Admin | ${APP_CONFIG.barName}`;

// ── Toast ─────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':type==='error'?'exclamation-circle':'info-circle'}"></i> ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ── Login ─────────────────────────────────────────────────
const loginOverlay = document.getElementById('login-overlay');
const pwInput = document.getElementById('admin-password');
const DEFAULT_PASS = 'admin1234';

function genToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2,'0')).join('');
}

async function finishLogin(token) {
  try { await db.rpc('set_current_restaurant', { p_restaurant_id: RID }); } catch(e) {}
  sessionStorage.setItem('admin_auth', 'true');
  sessionStorage.setItem('admin_token', token);
  loginOverlay.classList.add('login-hide');
  toast('Bienvenido al panel', 'success');
}

document.getElementById('login-btn').onclick = async () => {
  const inputVal = pwInput.value.trim();
  if (!inputVal) { toast('Introduce la contraseña', 'error'); return; }
  if (inputVal !== DEFAULT_PASS) { toast('Contraseña incorrecta', 'error'); return; }
  const token = genToken();
  await finishLogin(token);
};

pwInput.onkeydown = e => { if(e.key === 'Enter') document.getElementById('login-btn').click(); };

// ── DOMContentLoaded: auto-restore session ────────────────
window.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem('admin_auth') !== 'true') return;
  loginOverlay.classList.add('login-hide');
  toast('Sesión restaurada', 'info');
});
