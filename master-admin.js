// master-admin.js — GastroExperience Master Admin
'use strict';

// ── CONFIG ─────────────────────────────────────────────────────────────
const MASTER_PASSWORD = 'master2026';
const SUPABASE_TOKEN = 'sbp_8d62d40f9302891954d7dfdcb8b72f1e4a0';
const MAIN_SUPABASE_URL = 'https://xornvhqqjovcucpuqgoo.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1Nzd9.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA';
const MAIN_DB_ID = 'xornvhqqjovcucpuqgoo';
const GITHUB_REPO = 'marquezchinchonsl-sketch/gastroexperiencem';
const VERCEL_PROJECT = 'gastroexperience';

// ── STATE ───────────────────────────────────────────────────────────────
let allRestaurants = [];
let metricsCharts = {};
let currentModalRestaurant = null;   // restaurant object currently open in modal
let currentModalSettings = {};       // settings for current modal restaurant
let dbCurrentTable = 'settings';
let dbCurrentPage = 1;
let dbPageSize = 50;
let dbTotalRows = 0;
let dbPendingDelete = null;          // { table, id }
let dbAllRows = [];                  // full dataset for current table

// ── HELPERS ────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':type==='error'?'exclamation-circle':type==='warning'?'exclamation-triangle':'info-circle'}"></i> ${esc(msg)}`;
  const colors = { success: '#059669', error: '#DC2626', info: '#2563EB', warning: '#D97706' };
  t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:0.9rem;font-weight:500;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.3s;background:${colors[type]||'#2563EB'};color:#fff;display:flex;align-items:center;gap:10px;`;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function apiHeaders(key) {
  return { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
}

function fmtDate(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; }
}

function fmtDatetime(d) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
}

// ── LOGIN ──────────────────────────────────────────────────────────────
$('login-btn').onclick = () => {
  const pw = $('master-password').value;
  if (pw === MASTER_PASSWORD) {
    $('login-overlay').style.opacity = '0';
    $('login-overlay').style.transition = 'opacity 0.4s';
    setTimeout(() => {
      $('login-overlay').style.display = 'none';
      $('app').style.display = 'grid';
      loadOverview();
    }, 400);
  } else {
    $('login-error').textContent = 'Contraseña incorrecta.';
    $('master-password').classList.add('shake');
    setTimeout(() => $('master-password').classList.remove('shake'), 500);
  }
};
$('master-password').onkeydown = e => { if (e.key === 'Enter') $('login-btn').click(); };

// ── NAV ────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-tab'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.add('active-tab');
    const loaders = {
      overview: loadOverview,
      restaurants: loadRestaurants,
      create: () => {},
      database: () => { loadDbTable(); },
      analytics: loadAnalytics,
      system: loadSystem
    };
    if (loaders[tab.dataset.tab]) loaders[tab.dataset.tab]();
  };
});

window.openTab = tabId => {
  document.querySelector(`.nav-tab[data-tab="${tabId}"]`)?.click();
};

// ── SUPABASE REST FETCH ────────────────────────────────────────────────
async function supabaseFetch(url, options = {}, key = MAIN_SUPABASE_KEY) {
  const res = await fetch(url, { ...options, headers: { ...apiHeaders(key), ...(options.headers || {}) } });
  return res;
}

async function supabaseFetchJson(url, options = {}, key = MAIN_SUPABASE_KEY) {
  const res = await supabaseFetch(url, options, key);
  let data;
  try { data = await res.json(); } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

// ── RESTAURANTS DATA ───────────────────────────────────────────────────
async function getAllRestaurants() {
  const { data, ok } = await supabaseFetchJson(
    `${MAIN_SUPABASE_URL}/rest/v1/settings?select=restaurant_id,key,value`,
    { headers: { 'Prefer': 'count=exact' } }
  );
  if (!ok || !data) return [];

  const rids = [...new Set(data.map(r => r.restaurant_id))];
  const restaurants = [];

  for (const rid of rids) {
    const rows = data.filter(s => s.restaurant_id === rid);
    const cfg = {};
    for (const row of rows) {
      try { cfg[row.key] = JSON.parse(row.value); } catch { cfg[row.key] = row.value; }
    }

    let subdomain = cfg.subdomain || '';
    if (!subdomain && cfg.bar_name) {
      subdomain = cfg.bar_name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    restaurants.push({
      restaurant_id: rid,
      name: cfg.bar_name || cfg.biz_name || rid,
      city: cfg.bar_city || '',
      address: cfg.bar_address || '',
      phone: cfg.bar_phone || '',
      email: cfg.email || '',
      subdomain,
      supabase_url: cfg.supabase_url || MAIN_SUPABASE_URL,
      supabase_key: cfg.supabase_key || MAIN_SUPABASE_KEY,
      status: cfg.status || 'active',
      admin_password: cfg.admin_password || '',
      weekly_schedule: cfg.weekly_schedule || null,
      zones: cfg.zones || cfg.zones_config || [],
      created_at: cfg.created_at || new Date().toISOString(),
      _settings: cfg,
    });
  }
  return restaurants;
}

async function getRestaurantMetrics(rid, url, key, days = 7) {
  const d = new Date(); d.setDate(d.getDate() - days);
  const dateStr = d.toISOString().split('T')[0];
  try {
    const res = await fetch(
      `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(rid)}&date=gte.${dateStr}&select=date,time,people,status`,
      { headers: apiHeaders(key) }
    );
    if (!res.ok) return { reservations: 0, covers: 0, confirmed: 0 };
    const data = await res.json();
    const valid = data.filter(r => r.status !== 'cancelled');
    return {
      reservations: valid.length,
      covers: valid.reduce((s, r) => s + parseInt(r.people || 0), 0),
      confirmed: valid.filter(r => r.status === 'confirmed').length,
    };
  } catch(e) { return { reservations: 0, covers: 0, confirmed: 0 }; }
}

// ── HEALTH CHECK ───────────────────────────────────────────────────────
async function checkRestaurantHealth(r) {
  const checks = [];
  const url = r.supabase_url || MAIN_SUPABASE_URL;
  const key = r.supabase_key || MAIN_SUPABASE_KEY;
  const rid = r.restaurant_id;

  // 1. Supabase connection + menu items
  try {
    const mRes = await fetch(
      `${url}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(rid)}&select=id&limit=1`,
      { headers: apiHeaders(key) }
    );
    if (!mRes.ok) {
      checks.push({ type: 'error', icon: 'fa-database', text: 'Supabase no responde', repairTab: null });
    } else {
      const mData = await mRes.json();
      if (!mData || mData.length === 0) {
        checks.push({ type: 'warning', icon: 'fa-utensils', text: 'Sin platos en la carta', repairTab: 'carta' });
      }
    }
  } catch(e) {
    checks.push({ type: 'error', icon: 'fa-wifi', text: 'Supabase inaccesible', repairTab: null });
  }

  // 2. Menu items count (extra check)
  try {
    const cntRes = await fetch(
      `${url}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(rid)}&select=id`,
      { headers: apiHeaders(key) }
    );
    if (cntRes.ok) {
      const cntData = await cntRes.json();
      if (!cntData || cntData.length === 0) {
        checks.push({ type: 'warning', icon: 'fa-utensils', text: 'Sin platos (carta vacía)', repairTab: 'carta' });
      }
    }
  } catch(e) {}

  // 3. Config checks
  const cfg = r._settings || {};
  if (!cfg.bar_name) checks.push({ type: 'warning', icon: 'fa-signature', text: 'Sin nombre del local', repairTab: 'info' });
  if (!cfg.bar_city) checks.push({ type: 'warning', icon: 'fa-map-marker-alt', text: 'Sin ciudad configurada', repairTab: 'info' });
  if (!cfg.zones || cfg.zones.length === 0) checks.push({ type: 'warning', icon: 'fa-chair', text: 'Sin zonas configuradas', repairTab: 'zonas' });
  if (!cfg.schedule && !cfg.weekly_schedule) checks.push({ type: 'warning', icon: 'fa-clock', text: 'Sin horarios', repairTab: 'horarios' });

  // 4. Recent reservations (30 days)
  try {
    const d = new Date(); d.setDate(d.getDate() - 30);
    const dateStr = d.toISOString().split('T')[0];
    const rRes = await fetch(
      `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(rid)}&date=gte.${dateStr}&select=id`,
      { headers: apiHeaders(key) }
    );
    if (rRes.ok) {
      const rData = await rRes.json();
      if (!rData || rData.length === 0) {
        checks.push({ type: 'info', icon: 'fa-calendar', text: 'Sin reservas en 30 días', repairTab: null });
      }
    }
  } catch(e) {}

  // 5. Public website
  const pubUrl = `https://${r.subdomain || rid}.gastroexperiencem.es`;
  try {
    const wRes = await fetch(pubUrl, { method: 'HEAD' });
    if (!wRes.ok) {
      checks.push({ type: 'error', icon: 'fa-globe', text: 'Web pública no carga', repairTab: null });
    }
  } catch(e) {
    checks.push({ type: 'error', icon: 'fa-globe', text: 'Web pública inaccesible', repairTab: null });
  }

  return checks;
}

function healthIcon(type) {
  if (type === 'error') return '<i class="fas fa-times-circle" style="color:#DC2626"></i>';
  if (type === 'warning') return '<i class="fas fa-exclamation-circle" style="color:#D97706"></i>';
  return '<i class="fas fa-check-circle" style="color:#059669"></i>';
}

function healthClass(type) {
  if (type === 'error') return 'health-error';
  if (type === 'warning') return 'health-warning';
  return 'health-info';
}

// ── OVERVIEW TAB ───────────────────────────────────────────────────────
async function loadOverview() {
  allRestaurants = await getAllRestaurants();
  const today = new Date().toISOString().split('T')[0];

  let totalRes = 0, totalPax = 0, confirmedTotal = 0;
  const restaurantMetrics = [];

  for (const r of allRestaurants) {
    const m = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key);
    restaurantMetrics.push({ ...r, metrics: m });
    totalRes += m.reservations;
    totalPax += m.covers;
    confirmedTotal += m.confirmed;
  }
  allRestaurants = restaurantMetrics;

  // Health checks
  let alertCount = 0;
  for (const r of allRestaurants) {
    r._health = await checkRestaurantHealth(r);
    alertCount += r._health.filter(c => c.type === 'error').length;
  }

  $('total-restaurants').innerHTML = allRestaurants.length + (alertCount > 0 ? ` <span class="alert-badge">${alertCount}</span>` : '');
  $('reservations-today').textContent = totalRes;
  $('covers-today').textContent = totalPax;
  const rate = totalRes > 0 ? Math.round((confirmedTotal / totalRes) * 100) : 0;
  $('confirmation-rate').textContent = `${rate}%`;

  await loadRecentActivity();
}

async function loadRecentActivity() {
  const container = $('recent-activity');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';
  const activities = [];
  const today = new Date().toISOString().split('T')[0];

  for (const r of allRestaurants.slice(0, 15)) {
    try {
      const res = await fetch(
        `${r.supabase_url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(r.restaurant_id)}&date=eq.${today}&select=id,name,time,status&order=created_at.desc&limit=5`,
        { headers: apiHeaders(r.supabase_key) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const resv of data) {
        activities.push({
          name: resv.name,
          time: resv.time,
          status: resv.status,
          restaurant: r.name,
        });
      }
    } catch(e) {}
  }

  if (activities.length === 0) {
    container.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-dim);">
      <i class="fas fa-calendar-day" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
      Sin actividad hoy
    </div>`;
    return;
  }

  activities.sort((a, b) => {
    const ta = a.time || '';
    const tb = b.time || '';
    return ta.localeCompare(tb);
  });

  container.innerHTML = activities.slice(0, 20).map(a => `
    <div class="activity-item">
      <div class="activity-icon reservation"><i class="fas fa-calendar-check"></i></div>
      <div class="activity-text"><strong>${esc(a.name)}</strong> — ${esc(a.time)} <span style="color:var(--text-muted)">(${esc(a.restaurant)})</span></div>
      <div class="activity-time">${a.status === 'confirmed' ? '✅ Confirmada' : a.status === 'cancelled' ? '❌ Cancelada' : '⏳ Pendiente'}</div>
    </div>
  `).join('');
}

// ── RESTAURANTS TAB ────────────────────────────────────────────────────
async function loadRestaurants() {
  allRestaurants = await getAllRestaurants();
  const restaurantMetrics = [];
  for (const r of allRestaurants) {
    const m = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key);
    restaurantMetrics.push({ ...r, metrics: m });
  }
  allRestaurants = restaurantMetrics;

  // Health checks
  for (const r of allRestaurants) {
    r._health = await checkRestaurantHealth(r);
  }

  renderRestaurantsTable(allRestaurants);
}

function renderRestaurantsTable(restaurants) {
  const tbody = $('restaurants-body');

  if (restaurants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-dim);">
      <i class="fas fa-store" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
      No hay restaurantes. <a href="#" onclick="openTab('create');return false;" style="color:var(--primary);">Crea el primero →</a>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = restaurants.map(r => {
    const errors = (r._health || []).filter(c => c.type === 'error');
    const warnings = (r._health || []).filter(c => c.type === 'warning');
    const infos = (r._health || []).filter(c => c.type === 'info');

    let healthBadge = '';
    if (errors.length > 0) {
      healthBadge = `<span class="health-badge health-error-badge" title="${errors.map(e=>e.text).join(', ')}"><i class="fas fa-times-circle"></i> Error</span>`;
    } else if (warnings.length > 0) {
      healthBadge = `<span class="health-badge health-warning-badge" title="${warnings.map(w=>w.text).join(', ')}"><i class="fas fa-exclamation-circle"></i> Warning</span>`;
    } else {
      healthBadge = `<span class="health-badge health-ok-badge"><i class="fas fa-check-circle"></i> OK</span>`;
    }

    return `
    <tr class="restaurant-row" onclick="openRestaurantModal('${esc(r.restaurant_id)}')" style="cursor:pointer;">
      <td>
        <div class="restaurant-name">${esc(r.name)}</div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">${esc(r.restaurant_id)}</div>
      </td>
      <td style="color:var(--text-dim);font-size:0.85rem;">${esc(r.city || '-')}</td>
      <td><code class="subdomain-code">${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es</code></td>
      <td>${healthBadge}</td>
      <td><strong>${r.metrics?.reservations ?? '-'}</strong></td>
      <td><strong>${r.metrics?.covers ?? '-'}</strong></td>
      <td>
        <span class="status-badge ${r.status === 'active' ? 'active' : 'inactive'}">${r.status === 'active' ? 'Activo' : 'Inactivo'}</span>
      </td>
      <td onclick="event.stopPropagation();">
        <div style="display:flex;gap:6px;">
          <a href="https://${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es/admin" target="_blank" class="action-btn" title="Admin">
            <i class="fas fa-cog"></i>
          </a>
          <a href="https://${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es" target="_blank" class="action-btn" title="Web">
            <i class="fas fa-globe"></i>
          </a>
        </div>
      </td>
    </tr>
    `;
  }).join('');
}

$('search-restaurants').addEventListener('input', e => {
  const term = e.target.value.toLowerCase();
  const filtered = allRestaurants.filter(r =>
    (r.name || '').toLowerCase().includes(term) ||
    (r.city || '').toLowerCase().includes(term) ||
    (r.subdomain || '').toLowerCase().includes(term) ||
    (r.restaurant_id || '').toLowerCase().includes(term)
  );
  renderRestaurantsTable(filtered);
});

// ── RESTAURANT DETAIL MODAL ────────────────────────────────────────────
async function openRestaurantModal(rid) {
  const r = allRestaurants.find(r => r.restaurant_id === rid);
  if (!r) { toast('Restaurante no encontrado', 'error'); return; }
  currentModalRestaurant = r;
  currentModalSettings = { ...r._settings };

  // Header
  $('modal-restaurant-name').textContent = r.name;
  $('modal-restaurant-meta').textContent = `${esc(r.city || '')} · ${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es`;

  // Status toggle
  const toggle = $('modal-status-toggle');
  toggle.checked = r.status === 'active';
  $('modal-status-label').textContent = r.status === 'active' ? 'Activo' : 'Inactivo';

  // Info form
  $('info-bar-name').value = r._settings.bar_name || '';
  $('info-bar-city').value = r._settings.bar_city || '';
  $('info-bar-address').value = r._settings.bar_address || '';
  $('info-bar-phone').value = r._settings.bar_phone || '';
  $('info-email').value = r._settings.email || '';
  $('info-subdomain').value = r.subdomain || '';

  // Password form
  $('new-restaurant-password').value = '';
  $('confirm-restaurant-password').value = '';

  // Load health checklist
  const hl = $('health-checklist');
  hl.innerHTML = '<div class="health-loading"><i class="fas fa-spinner fa-spin"></i> Comprobando estado...</div>';

  // Load carta
  loadCartaItems();

  // Load reservations (today by default)
  const today = new Date();
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(today.getDate() - 30);
  $('reservas-date-from').value = thirtyDaysAgo.toISOString().split('T')[0];
  $('reservas-date-to').value = today.toISOString().split('T')[0];
  loadRestaurantReservations();

  // Load zonas
  loadZonas();

  // Load schedule
  loadSchedule();

  // Switch to info subtab
  switchSubTab('info');

  // Run health check
  r._health = await checkRestaurantHealth(r);
  renderHealthChecklist(r._health);

  // Show modal
  $('restaurant-modal').style.display = 'flex';
}

function renderHealthChecklist(checks) {
  const hl = $('health-checklist');
  if (!checks || checks.length === 0) {
    hl.innerHTML = '<div class="health-item health-ok"><i class="fas fa-check-circle" style="color:#059669"></i> Todos los sistemas operativos</div>';
    return;
  }
  hl.innerHTML = checks.map(c => {
    const repairBtn = c.repairTab
      ? `<button class="btn-repair" onclick="switchToSubTabAndCloseHealth('${c.repairTab}')"><i class="fas fa-wrench"></i> Reparar</button>`
      : '';
    return `<div class="health-item ${healthClass(c.type)}">
      ${healthIcon(c.type)}
      <span class="health-text">${esc(c.text)}</span>
      ${repairBtn}
    </div>`;
  }).join('');
}

function switchToSubTabAndCloseHealth(tab) {
  $('health-checklist').innerHTML = '';
  switchSubTab(tab);
}

function closeRestaurantModal() {
  $('restaurant-modal').style.display = 'none';
  currentModalRestaurant = null;
  currentModalSettings = {};
}

// Sub-tab switching for modal
document.querySelectorAll('.sub-tab').forEach(btn => {
  btn.addEventListener('click', () => switchSubTab(btn.dataset.subtab));
});

function switchSubTab(tab) {
  document.querySelectorAll('.sub-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.modal-subcontent').forEach(c => c.classList.remove('active-subtab'));
  document.querySelector(`.sub-tab[data-subtab="${tab}"]`)?.classList.add('active');
  document.getElementById(`subtab-${tab}`)?.classList.add('active-subtab');
}

// Status toggle
window.toggleRestaurantStatus = async function() {
  if (!currentModalRestaurant) return;
  const newStatus = $('modal-status-toggle').checked ? 'active' : 'inactive';
  $('modal-status-label').textContent = newStatus === 'active' ? 'Activo' : 'Inactivo';
  await upsertSetting(currentModalRestaurant.restaurant_id, 'status', newStatus);
  toast(`Estado actualizado a ${newStatus === 'active' ? 'Activo' : 'Inactivo'}`, 'success');
  // Update local state
  const idx = allRestaurants.findIndex(r => r.restaurant_id === currentModalRestaurant.restaurant_id);
  if (idx !== -1) allRestaurants[idx].status = newStatus;
};

// ── INFO TAB ───────────────────────────────────────────────────────────
async function saveRestaurantInfo() {
  if (!currentModalRestaurant) return;
  const rid = currentModalRestaurant.restaurant_id;
  const updates = {
    bar_name: $('info-bar-name').value.trim(),
    bar_city: $('info-bar-city').value.trim(),
    bar_address: $('info-bar-address').value.trim(),
    bar_phone: $('info-bar-phone').value.trim(),
    email: $('info-email').value.trim(),
    subdomain: $('info-subdomain').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-'),
  };

  for (const [key, val] of Object.entries(updates)) {
    await upsertSetting(rid, key, val);
  }
  toast('Información guardada ✓', 'success');

  // Update modal display
  $('modal-restaurant-name').textContent = updates.bar_name || currentModalRestaurant.name;
  $('modal-restaurant-meta').textContent = `${updates.bar_city || ''} · ${updates.subdomain || rid}.gastroexperiencem.es`;

  // Refresh restaurants list
  loadRestaurants();
}

window.openAdminInNewTab = function() {
  if (!currentModalRestaurant) return;
  const url = `https://${currentModalRestaurant.subdomain || currentModalRestaurant.restaurant_id}.gastroexperiencem.es/admin`;
  window.open(url, '_blank');
};

window.openWebInNewTab = function() {
  if (!currentModalRestaurant) return;
  const url = `https://${currentModalRestaurant.subdomain || currentModalRestaurant.restaurant_id}.gastroexperiencem.es`;
  window.open(url, '_blank');
};

// ── CARTA TAB ──────────────────────────────────────────────────────────
async function loadCartaItems() {
  if (!currentModalRestaurant) return;
  const r = currentModalRestaurant;
  const { data, ok } = await supabaseFetchJson(
    `${r.supabase_url}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(r.restaurant_id)}&order=position.asc,created_at.asc`,
    {},
    r.supabase_key
  );
  const tbody = $('carta-tbody');
  if (!ok || !data) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading-cell" style="color:var(--error);"><i class="fas fa-times-circle"></i> Error cargando carta</td></tr>';
    return;
  }
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-dim);">Carta vacía. <button class="btn-success" onclick="openAddMenuItemModal()" style="margin-left:8px;"><i class="fas fa-plus"></i> Añadir plato</button></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(item => `
    <tr>
      <td><strong>${esc(item.name || '')}</strong></td>
      <td style="color:var(--text-dim);font-size:0.85rem;">${esc(item.category || '-')}</td>
      <td><strong>${item.price != null ? Number(item.price).toFixed(2) + ' €' : '-'}</strong></td>
      <td>${item.visible ? '<span style="color:#059669"><i class="fas fa-eye"></i></span>' : '<span style="color:var(--text-muted)"><i class="fas fa-eye-slash"></i></span>'}</td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="action-btn" onclick="deleteMenuItem('${esc(item.id)}')" title="Eliminar"><i class="fas fa-trash" style="color:#DC2626"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.openAddMenuItemModal = function() {
  $('mi-name').value = '';
  $('mi-category').value = '';
  $('mi-price').value = '';
  $('mi-info').value = '';
  $('add-menuitem-modal').style.display = 'flex';
};

window.closeAddMenuItemModal = function() {
  $('add-menuitem-modal').style.display = 'none';
};

window.addMenuItem = async function() {
  if (!currentModalRestaurant) return;
  const name = $('mi-name').value.trim();
  if (!name) { toast('El nombre es obligatorio', 'error'); return; }
  const r = currentModalRestaurant;
  const payload = {
    restaurant_id: r.restaurant_id,
    name,
    category: $('mi-category').value.trim(),
    price: parseFloat($('mi-price').value) || 0,
    info: $('mi-info').value.trim(),
    visible: true,
    position: 1000,
  };
  const res = await supabaseFetch(
    `${r.supabase_url}/rest/v1/menu_items`,
    { method: 'POST', body: JSON.stringify(payload) },
    r.supabase_key
  );
  if (res.ok) {
    toast('Plato añadido ✓', 'success');
    closeAddMenuItemModal();
    loadCartaItems();
  } else {
    toast('Error al añadir plato', 'error');
  }
};

window.deleteMenuItem = async function(id) {
  if (!currentModalRestaurant) return;
  if (!confirm('¿Eliminar este plato?')) return;
  const r = currentModalRestaurant;
  const res = await supabaseFetch(
    `${r.supabase_url}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    r.supabase_key
  );
  if (res.ok) {
    toast('Plato eliminado ✓', 'success');
    loadCartaItems();
  } else {
    toast('Error al eliminar', 'error');
  }
};

// ── RESERVAS TAB ───────────────────────────────────────────────────────
async function loadRestaurantReservations() {
  if (!currentModalRestaurant) return;
  const r = currentModalRestaurant;
  const dateFrom = $('reservas-date-from').value;
  const dateTo = $('reservas-date-to').value;
  if (!dateFrom || !dateTo) { toast('Selecciona ambas fechas', 'error'); return; }

  const { data, ok } = await supabaseFetchJson(
    `${r.supabase_url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(r.restaurant_id)}&date=gte.${dateFrom}&date=lte.${dateTo}&order=date.desc,time.desc`,
    {},
    r.supabase_key
  );
  const tbody = $('reservas-tbody');
  if (!ok || !data) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading-cell" style="color:var(--error);"><i class="fas fa-times-circle"></i> Error</td></tr>';
    return;
  }
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-dim);">Sin reservas en este rango</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(resv => `
    <tr>
      <td>${fmtDate(resv.date)}</td>
      <td>${esc(resv.time || '')}</td>
      <td>${esc(resv.name || '')}</td>
      <td style="color:var(--text-dim);">${esc(resv.phone || '-')}</td>
      <td><strong>${resv.people || 0}</strong></td>
      <td>
        <select class="status-select status-${resv.status}" onchange="changeReservationStatus('${esc(resv.id)}', this.value)">
          <option value="pending" ${resv.status==='pending'?'selected':''}>Pendiente</option>
          <option value="confirmed" ${resv.status==='confirmed'?'selected':''}>Confirmada</option>
          <option value="cancelled" ${resv.status==='cancelled'?'selected':''}>Cancelada</option>
        </select>
      </td>
      <td>
        <button class="action-btn danger" onclick="deleteReservation('${esc(resv.id)}')" title="Eliminar"><i class="fas fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

window.changeReservationStatus = async function(id, status) {
  if (!currentModalRestaurant) return;
  const r = currentModalRestaurant;
  const res = await supabaseFetch(
    `${r.supabase_url}/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) },
    r.supabase_key
  );
  if (res.ok) {
    toast('Estado actualizado ✓', 'success');
  } else {
    toast('Error al actualizar estado', 'error');
  }
};

window.deleteReservation = async function(id) {
  if (!currentModalRestaurant) return;
  if (!confirm('¿Eliminar esta reserva?')) return;
  const r = currentModalRestaurant;
  const res = await supabaseFetch(
    `${r.supabase_url}/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE' },
    r.supabase_key
  );
  if (res.ok) {
    toast('Reserva eliminada ✓', 'success');
    loadRestaurantReservations();
  } else {
    toast('Error al eliminar', 'error');
  }
};

// ── ZONAS TAB ──────────────────────────────────────────────────────────
function loadZonas() {
  const container = $('zonas-list');
  const r = currentModalRestaurant;
  if (!r) { container.innerHTML = ''; return; }
  const zones = r._settings.zones || r._settings.zones_config || [];
  if (zones.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text-dim);">
      Sin zonas configuradas. <button class="btn-success" onclick="openAddZoneModal()" style="margin-left:8px;"><i class="fas fa-plus"></i> Añadir zona</button>
    </div>`;
    return;
  }
  container.innerHTML = zones.map((z, idx) => `
    <div class="zona-item">
      <div class="zona-info">
        <strong>${esc(z.title || z.id)}</strong>
        <span style="color:var(--text-dim);font-size:0.85rem;">Capacidad: ${z.capacity || 0} cubiertos</span>
      </div>
      <div class="zona-actions">
        <button class="action-btn danger" onclick="deleteZone(${idx})"><i class="fas fa-trash"></i></button>
      </div>
    </div>
  `).join('');
}

window.openAddZoneModal = function() {
  $('zone-title').value = '';
  $('zone-capacity').value = '';
  $('add-zone-modal').style.display = 'flex';
};

window.closeAddZoneModal = function() {
  $('add-zone-modal').style.display = 'none';
};

window.addZone = async function() {
  if (!currentModalRestaurant) return;
  const title = $('zone-title').value.trim();
  const capacity = parseInt($('zone-capacity').value) || 20;
  if (!title) { toast('El nombre de zona es obligatorio', 'error'); return; }

  const rid = currentModalRestaurant.restaurant_id;
  const zones = currentModalRestaurant._settings.zones || currentModalRestaurant._settings.zones_config || [];
  const newZone = { id: title.toLowerCase().replace(/\s+/g, '-'), title, capacity };
  zones.push(newZone);
  await upsertSetting(rid, 'zones', zones);
  currentModalRestaurant._settings.zones = zones;
  toast('Zona añadida ✓', 'success');
  closeAddZoneModal();
  loadZonas();
};

window.deleteZone = async function(idx) {
  if (!currentModalRestaurant) return;
  if (!confirm('¿Eliminar esta zona?')) return;
  const rid = currentModalRestaurant.restaurant_id;
  const zones = [...(currentModalRestaurant._settings.zones || currentModalRestaurant._settings.zones_config || [])];
  zones.splice(idx, 1);
  await upsertSetting(rid, 'zones', zones);
  currentModalRestaurant._settings.zones = zones;
  toast('Zona eliminada ✓', 'success');
  loadZonas();
};

// ── HORARIOS TAB ───────────────────────────────────────────────────────
const DAY_NAMES = {
  monday: 'Lunes', tuesday: 'Martes', wednesday: 'Miércoles',
  thursday: 'Jueves', friday: 'Viernes', saturday: 'Sábado', sunday: 'Domingo'
};

function loadSchedule() {
  const grid = $('schedule-grid');
  const r = currentModalRestaurant;
  const schedule = r._settings.weekly_schedule || r._settings.schedule || {};

  grid.innerHTML = Object.entries(DAY_NAMES).map(([day, label]) => {
    const dayData = schedule[day] || { open: false };
    const isOpen = dayData.open !== false;
    return `
    <div class="schedule-day">
      <div class="schedule-day-label">${label}</div>
      <div class="schedule-day-content">
        <label class="toggle-switch" style="margin-bottom:8px;">
          <input type="checkbox" id="sched-${day}-open" ${isOpen ? 'checked' : ''} onchange="toggleDayOpen('${day}')">
          <span class="toggle-slider"></span>
          <span style="font-size:0.8rem;margin-left:4px;">${isOpen ? 'Abierto' : 'Cerrado'}</span>
        </label>
        <div class="schedule-times" id="sched-${day}-times" style="${isOpen ? '' : 'display:none'}">
          <div style="margin-bottom:6px;">
            <label style="font-size:0.72rem;color:var(--text-dim);">Comida</label>
            <div style="display:flex;gap:4px;align-items:center;margin-top:2px;">
              <input type="time" id="sched-${day}-from" value="${dayData.from || '12:00'}" class="time-input">
              <span style="color:var(--text-muted);">—</span>
              <input type="time" id="sched-${day}-to" value="${dayData.to || '16:00'}" class="time-input">
            </div>
          </div>
          <div>
            <label style="font-size:0.72rem;color:var(--text-dim);">Cena</label>
            <div style="display:flex;gap:4px;align-items:center;margin-top:2px;">
              <input type="time" id="sched-${day}-from2" value="${dayData.from2 || '20:00'}" class="time-input">
              <span style="color:var(--text-muted);">—</span>
              <input type="time" id="sched-${day}-to2" value="${dayData.to2 || '23:30'}" class="time-input">
            </div>
          </div>
        </div>
      </div>
    </div>
    `;
  }).join('');
}

window.toggleDayOpen = function(day) {
  const checkbox = $(`sched-${day}-open`);
  const timesDiv = $(`sched-${day}-times`);
  timesDiv.style.display = checkbox.checked ? '' : 'none';
};

async function saveRestaurantSchedule() {
  if (!currentModalRestaurant) return;
  const rid = currentModalRestaurant.restaurant_id;
  const schedule = {};
  for (const day of Object.keys(DAY_NAMES)) {
    const isOpen = $(`sched-${day}-open`)?.checked ?? false;
    if (isOpen) {
      schedule[day] = {
        open: true,
        from: $(`sched-${day}-from`)?.value || '12:00',
        to: $(`sched-${day}-to`)?.value || '16:00',
        from2: $(`sched-${day}-from2`)?.value || '20:00',
        to2: $(`sched-${day}-to2`)?.value || '23:30',
      };
    } else {
      schedule[day] = { open: false };
    }
  }
  await upsertSetting(rid, 'weekly_schedule', schedule);
  currentModalRestaurant._settings.weekly_schedule = schedule;
  toast('Horarios guardados ✓', 'success');
}

// ── PASSWORD TAB ───────────────────────────────────────────────────────
async function saveRestaurantPassword() {
  if (!currentModalRestaurant) return;
  const npw = $('new-restaurant-password').value;
  const cpw = $('confirm-restaurant-password').value;
  if (!npw) { toast('Introduce la nueva contraseña', 'error'); return; }
  if (npw !== cpw) { toast('Las contraseñas no coinciden', 'error'); return; }
  if (npw.length < 4) { toast('La contraseña debe tener al menos 4 caracteres', 'error'); return; }

  const rid = currentModalRestaurant.restaurant_id;
  await upsertSetting(rid, 'admin_password', npw);
  currentModalRestaurant._settings.admin_password = npw;
  $('new-restaurant-password').value = '';
  $('confirm-restaurant-password').value = '';
  toast('Contraseña actualizada ✓', 'success');
}

// ── SETTINGS UPSERT HELPER ─────────────────────────────────────────────
async function upsertSetting(rid, key, value) {
  const payload = {
    restaurant_id: rid,
    key,
    value: JSON.stringify(value),
  };
  const res = await supabaseFetch(
    `${MAIN_SUPABASE_URL}/rest/v1/settings`,
    { method: 'POST', headers: { ...apiHeaders(MAIN_SUPABASE_KEY), 'Prefer': 'resolution=merge-duplicates' }, body: JSON.stringify(payload) },
    MAIN_SUPABASE_KEY
  );
  return res;
}

// ── CREATE NEW CLIENT ──────────────────────────────────────────────────
function previewSubdomain() {
  const name = $('new-name').value.trim();
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  $('subdomain-url').textContent = slug ? `${slug}.gastroexperiencem.es` : '-';
  $('step-info').dataset.slug = slug;
}

function validateStep1() {
  const name = $('new-name').value.trim();
  const city = $('new-city').value.trim();
  const email = $('new-email').value.trim();
  const phone = $('new-phone').value.trim();
  if (!name) { toast('Introduce el nombre del restaurante', 'error'); return; }

  const slug = $('step-info').dataset.slug || name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const rid = `rest-${slug}-${Date.now().toString(36)}`;

  $('confirm-details').innerHTML = `
    <div class="confirm-row"><span class="confirm-label">Nombre</span><span class="confirm-value">${esc(name)}</span></div>
    <div class="confirm-row"><span class="confirm-label">Ciudad</span><span class="confirm-value">${esc(city || '-')}</span></div>
    <div class="confirm-row"><span class="confirm-label">Email Admin</span><span class="confirm-value">${esc(email || '-')}</span></div>
    <div class="confirm-row"><span class="confirm-label">Teléfono</span><span class="confirm-value">${esc(phone || '-')}</span></div>
    <div class="confirm-row"><span class="confirm-label">Subdominio</span><span class="confirm-value" style="color:var(--primary);font-family:monospace;">${esc(slug)}.gastroexperiencem.es</span></div>
    <div class="confirm-row"><span class="confirm-label">Restaurant ID</span><span class="confirm-value" style="font-family:monospace;font-size:0.8rem;">${esc(rid)}</span></div>
  `;

  $('step-info').dataset.name = name;
  $('step-info').dataset.city = city;
  $('step-info').dataset.email = email;
  $('step-info').dataset.phone = phone;
  $('step-info').dataset.rid = rid;
  goToStep('step-confirm');
}

function goToStep(stepId) {
  document.querySelectorAll('.wizard-step').forEach(s => s.classList.remove('active'));
  $(stepId).classList.add('active');
}

function resetWizard() {
  $('new-name').value = '';
  $('new-city').value = '';
  $('new-email').value = '';
  $('new-phone').value = '';
  $('subdomain-url').textContent = '-';
  document.querySelectorAll('.log-entry').forEach(el => {
    el.className = 'log-entry pending';
    el.innerHTML = el.innerHTML.replace(/<i class="fas (fa-spinner|fa-check-circle|fa-times-circle|fa-exclamation-circle)"><\/i>/, '<i class="fas fa-circle"></i>');
  });
  $('creation-progress').style.width = '0%';
  $('creation-status').textContent = 'Iniciando...';
  goToStep('step-info');
}

async function startCreation() {
  const name = $('step-info').dataset.name;
  const city = $('step-info').dataset.city || '';
  const email = $('step-info').dataset.email || '';
  const phone = $('step-info').dataset.phone || '';
  const slug = $('step-info').dataset.slug;
  const rid = $('step-info').dataset.rid;

  goToStep('step-creating');
  $('btn-start-creation').disabled = true;

  const log = (id, msg, status) => {
    const el = $(id);
    if (!el) return;
    el.className = `log-entry ${status}`;
    const iconMap = { pending: 'fa-circle', active: 'fa-spinner fa-spin', done: 'fa-check-circle', error: 'fa-times-circle' };
    el.innerHTML = `<i class="fas ${iconMap[status] || 'fa-circle'}"></i> ${esc(msg)}`;
  };
  const progress = pct => { $('creation-progress').style.width = `${pct}%`; };
  const status = msg => { $('creation-status').textContent = msg; };

  try {
    // Step 1: Create Supabase project
    log('log-supabase', `Creando proyecto Supabase para "${name}"...`, 'active');
    status('Creando proyecto Supabase...');
    progress(10);

    const createRes = await fetch('https://api.supabase.com/v1/projects', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SUPABASE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: slug, organization_id: 'inswykbedvknsyckoztp', db_passphrase: generatePassword(20), region: 'eu-central-1' })
    }).then(r => r.json()).catch(e => ({ error: e.message }));

    if (createRes.error && createRes.error.includes('already exists')) {
      // Project already exists — try to get it
      const getRes = await fetch(`https://api.supabase.com/v1/projects?slug=${slug}`, {
        headers: { 'Authorization': `Bearer ${SUPABASE_TOKEN}` }
      }).then(r => r.json());
      if (Array.isArray(getRes) && getRes.length > 0) {
        createRes.id = getRes[0].id;
      }
    }

    if (!createRes?.id) throw new Error('No se pudo crear proyecto Supabase: ' + JSON.stringify(createRes));

    const projectRef = createRes.id;
    const supabaseUrl = `https://${projectRef}.supabase.co`;
    log('log-supabase', `Proyecto Supabase creado: ${projectRef}`, 'done');
    progress(25);
    status('Esperando que Supabase esté listo...');

    // Step 2: Wait for project to be ACTIVE
    let supabaseKey = '';
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(10000);
      try {
        const proj = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, {
          headers: { 'Authorization': `Bearer ${SUPABASE_TOKEN}` }
        }).then(r => r.json());
        if (proj.status === 'ACTIVE' || proj.status === 'online') {
          ready = true;
          // Try to get anon key
          try {
            const keysRes = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, {
              headers: { 'Authorization': `Bearer ${SUPABASE_TOKEN}` }
            }).then(r => r.json());
            if (Array.isArray(keysRes)) {
              const anon = keysRes.find(k => k.name === 'anon key' || k.name === 'anon');
              supabaseKey = anon?.key || '';
            }
          } catch(e) {}
          break;
        }
      } catch(e) {}
      status(`Esperando Supabase... ${(i+1)*10}s`);
    }

    if (!ready) {
      log('log-config', 'Supabase tardó demasiado.Continuando.', 'error');
    }

    if (!supabaseKey) {
      log('log-config', 'Anon key no disponible. El restaurante funcionará con config manual.', 'error');
    } else {
      log('log-config', 'Supabase activo ✓', 'done');
    }
    progress(50);

    // Step 3: Apply schema via Management API
    log('log-register', 'Aplicando esquema de base de datos...', 'active');
    const rlsSQL = getRLSSQL();
    try {
      await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: rlsSQL })
      }).then(async r => {
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          throw new Error(err.message || 'Query failed');
        }
      });
      log('log-register', 'Esquema aplicado ✓', 'done');
    } catch(e) {
      log('log-register', 'Esquema: ' + e.message.slice(0, 100), 'error');
    }
    progress(70);

    // Step 4: Register in main DB
    log('log-dns', 'Registrando restaurante en GastroExperience...', 'active');
    const mainSettings = [
      { key: 'subdomain', value: slug },
      { key: 'bar_name', value: name },
      { key: 'bar_city', value: city },
      { key: 'email', value: email },
      { key: 'bar_phone', value: phone },
      { key: 'supabase_url', value: supabaseUrl },
      { key: 'supabase_key', value: supabaseKey },
      { key: 'restaurant_id', value: rid },
      { key: 'status', value: 'active' },
      { key: 'weekly_schedule', value: getDefaultSchedule() },
      { key: 'zones', value: [{ id: 'interior', title: 'Interior', capacity: 30 }, { id: 'terraza', title: 'Terraza', capacity: 20 }] },
      { key: 'admin_password', value: 'admin123' },
    ];

    for (const s of mainSettings) {
      await fetch(`${MAIN_SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: { 'apikey': MAIN_SUPABASE_KEY, 'Authorization': `Bearer ${MAIN_SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify({ restaurant_id: rid, key: s.key, value: JSON.stringify(s.value) })
      });
    }
    log('log-dns', `Registrado: ${slug}.gastroexperiencem.es`, 'done');
    progress(85);

    // Step 5: Write to new project's settings (for routing.js discovery)
    if (supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/settings`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify([
            { restaurant_id: rid, key: 'subdomain', value: JSON.stringify(slug) },
            { restaurant_id: rid, key: 'bar_name', value: JSON.stringify(name) },
            { restaurant_id: rid, key: 'bar_city', value: JSON.stringify(city) },
            { restaurant_id: rid, key: 'supabase_url', value: JSON.stringify(supabaseUrl) },
            { restaurant_id: rid, key: 'supabase_key', value: JSON.stringify(supabaseKey) },
          ])
        });
      } catch(e) { console.warn('Could not write to new Supabase:', e); }
    }

    await sleep(2000);

    log('log-complete', `¡${name} creado con éxito!`, 'done');
    progress(100);
    status('¡Listo!');

    $('success-details').innerHTML = `
      <div class="success-icon">🍽️</div>
      <h4>${esc(name)}</h4>
      <p>Tu restaurante está listo. Los cambios pueden tardar 2-5 minutos en propagarse.</p>
      <p style="margin-top:8px;font-size:0.85rem;color:var(--text-dim);">Contraseña admin inicial: <code style="background:var(--surface-2);padding:2px 6px;border-radius:4px;">admin123</code></p>
      <div class="success-links">
        <div class="success-link"><span>🌐 Web pública</span><a href="https://${esc(slug)}.gastroexperiencem.es" target="_blank">https://${esc(slug)}.gastroexperiencem.es</a></div>
        <div class="success-link"><span>⚙️ Panel Admin</span><a href="https://${esc(slug)}.gastroexperiencem.es/admin" target="_blank">https://${esc(slug)}.gastroexperiencem.es/admin</a></div>
        <div class="success-link"><span>🗄️ Base de datos</span><a href="https://supabase.com/dashboard/project/${esc(projectRef)}" target="_blank">${esc(supabaseUrl)}</a></div>
        <div class="success-link"><span>🆔 Restaurant ID</span><span style="font-family:monospace;font-size:0.8rem;">${esc(rid)}</span></div>
      </div>
    `;

    goToStep('step-done');
    toast('¡Restaurante creado con éxito! 🎉', 'success');

  } catch(e) {
    console.error('Creation error:', e);
    log('log-complete', `Error: ${e.message}`, 'error');
    $('creation-status').textContent = 'Error: ' + e.message;
    toast('Error: ' + e.message, 'error');
  } finally {
    $('btn-start-creation').disabled = false;
  }
}

function generatePassword(len = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(len);
  crypto.getRandomValues(array);
  for (let i = 0; i < len; i++) result += chars[array[i] % chars.length];
  return result;
}

function getRLSSQL() {
  return `
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT, category TEXT, price DECIMAL(10,2),
  visible BOOLEAN DEFAULT true, is_sugerencia BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 1000, info TEXT,
  image_url TEXT, allergens JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  date DATE, time TEXT, zone TEXT, people INTEGER,
  name TEXT, phone TEXT, email TEXT,
  status TEXT DEFAULT 'pending', zonename TEXT,
  source TEXT DEFAULT 'web', notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL, key TEXT, value TEXT,
  UNIQUE(restaurant_id, key)
);

CREATE TABLE IF NOT EXISTS special_days (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL, date DATE, is_closed BOOLEAN DEFAULT true,
  UNIQUE(restaurant_id, date)
);

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT, description TEXT, price DECIMAL(10,2),
  category TEXT, available BOOLEAN DEFAULT true,
  position INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS time_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  date DATE, time TEXT, zone TEXT, capacity INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_menu_items_rest ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_rest ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_settings_rest ON settings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_special_days_rest ON special_days(restaurant_id);

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_menu" ON menu_items;
DROP POLICY IF EXISTS "public_reservations" ON reservations;
DROP POLICY IF EXISTS "public_settings" ON settings;
DROP POLICY IF EXISTS "public_special_days" ON special_days;
DROP POLICY IF EXISTS "public_products" ON products;
DROP POLICY IF EXISTS "public_time_slots" ON time_slots;

CREATE POLICY "public_menu" ON menu_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_reservations" ON reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_settings" ON settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_special_days" ON special_days FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_products" ON products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_time_slots" ON time_slots FOR ALL USING (true) WITH CHECK (true);

DROP FUNCTION IF EXISTS public.set_current_restaurant(TEXT);
CREATE OR REPLACE FUNCTION public.set_current_restaurant(p_restaurant_id TEXT) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN PERFORM set_config('app.current_restaurant_id', p_restaurant_id, true); END;
$$;
`;
}

function getDefaultSchedule() {
  return {
    monday:    { open: false },
    tuesday:   { open: true, from: '12:00', to: '16:00', from2: '20:00', to2: '23:30' },
    wednesday: { open: true, from: '12:00', to: '16:00', from2: '20:00', to2: '23:30' },
    thursday:  { open: true, from: '12:00', to: '16:00', from2: '20:00', to2: '23:30' },
    friday:    { open: true, from: '12:00', to: '16:00', from2: '20:00', to2: '00:00' },
    saturday:  { open: true, from: '12:00', to: '16:00', from2: '20:00', to2: '00:00' },
    sunday:    { open: true, from: '12:00', to: '16:00', from2: '20:00', to2: '23:00' }
  };
}

// ── DATABASE BROWSER TAB ───────────────────────────────────────────────
$('db-table-select').addEventListener('change', () => {
  dbCurrentPage = 1;
  loadDbTable();
});

async function loadDbTable() {
  const table = $('db-table-select').value;
  const filter = $('db-restaurant-filter').value.trim();
  dbCurrentTable = table;

  const selectFields = getTableFields(table);
  let url = `${MAIN_SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?select=${selectFields}&order=created_at.desc&limit=${dbPageSize}&offset=${(dbCurrentPage - 1) * dbPageSize}`;
  if (filter) url += `&restaurant_id=ilike.*${encodeURIComponent(filter)}*`;

  const { data, ok } = await supabaseFetchJson(url, {});
  if (!ok || data === null) {
    $('db-tbody').innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:var(--error);"><i class="fas fa-times-circle"></i> Error al cargar tabla</td></tr>`;
    return;
  }
  dbAllRows = data;

  renderDbTable(data, selectFields.split(','));
  updateDbPagination();
}

function getTableFields(table) {
  const map = {
    settings: 'id,restaurant_id,key,value,created_at',
    menu_items: 'id,restaurant_id,name,category,price,visible,position,created_at',
    reservations: 'id,restaurant_id,date,time,name,phone,people,status,created_at',
    special_days: 'id,restaurant_id,date,is_closed,created_at',
    products: 'id,restaurant_id,name,description,price,category,available,created_at',
    time_slots: 'id,restaurant_id,date,time,zone,capacity,created_at',
  };
  return map[table] || 'id,created_at';
}

function renderDbTable(rows, fields) {
  const thead = $('db-thead');
  const tbody = $('db-tbody');

  thead.innerHTML = `<tr>${fields.map(f => `<th>${esc(f)}</th>`).join('')}<th>Acciones</th></tr>`;

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${fields.length + 1}" style="text-align:center;padding:40px;color:var(--text-dim);">
      <i class="fas fa-inbox" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
      Sin datos
    </td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(row => {
    const cols = fields.map(f => {
      let val = row[f];
      if (f === 'value' || f === 'description' || f === 'info' || f === 'allergens') {
        if (val !== null && val !== undefined) {
          try { val = JSON.stringify(JSON.parse(val), null, 1).substring(0, 100); } catch {}
        }
      }
      if (f === 'price') val = val != null ? Number(val).toFixed(2) + ' €' : '-';
      if (f === 'visible' || f === 'available' || f === 'is_closed') {
        val = val ? '<span style="color:#059669"><i class="fas fa-check"></i></span>' : '<span style="color:#DC2626"><i class="fas fa-times"></i></span>';
      }
      if (f === 'created_at' || f === 'date') val = val ? fmtDate(val) : '-';
      return `<td class="db-cell" contenteditable="false" data-id="${esc(row.id)}" data-field="${esc(f)}" data-table="${esc(dbCurrentTable)}">${esc(String(val ?? '-'))}</td>`;
    }).join('');

    const actions = `
      <td>
        <button class="action-btn" onclick="editDbRow(this, '${esc(row.id)}')" title="Editar"><i class="fas fa-edit"></i></button>
        <button class="action-btn danger" onclick="promptDeleteDbRow('${esc(row.id)}')" title="Eliminar"><i class="fas fa-trash"></i></button>
      </td>
    `;
    return `<tr>${cols}${actions}</tr>`;
  }).join('');
}

function updateDbPagination() {
  const total = dbAllRows.length;
  const totalPages = Math.ceil(total / dbPageSize) || 1;
  $('db-page-info').textContent = `Página ${dbCurrentPage} — ${total} filas`;
  $('db-prev').disabled = dbCurrentPage <= 1;
  $('db-next').disabled = total < dbPageSize;
}

function dbPagePrev() {
  if (dbCurrentPage > 1) { dbCurrentPage--; loadDbTable(); }
}

function dbPageNext() {
  dbCurrentPage++; loadDbTable();
}

window.editDbRow = function(btn, id) {
  const cell = btn.closest('tr').querySelector('.db-cell');
  if (!cell) return;

  if (btn.dataset.editing === 'true') {
    // Save
    const table = cell.dataset.table;
    const field = cell.dataset.field;
    const newVal = cell.textContent.trim();
    saveDbCell(id, table, field, newVal);
    btn.innerHTML = '<i class="fas fa-edit"></i>';
    btn.dataset.editing = 'false';
    cell.contentEditable = 'false';
    cell.classList.remove('cell-editing');
  } else {
    // Start editing
    cell.contentEditable = 'true';
    cell.classList.add('cell-editing');
    cell.focus();
    btn.innerHTML = '<i class="fas fa-save" style="color:#059669"></i>';
    btn.dataset.editing = 'true';

    cell.onkeydown = e => {
      if (e.key === 'Enter') { e.preventDefault(); cell.contentEditable = 'false'; btn.click(); }
      if (e.key === 'Escape') { cell.contentEditable = 'false'; cell.classList.remove('cell-editing'); btn.innerHTML = '<i class="fas fa-edit"></i>'; btn.dataset.editing = 'false'; }
    };
  }
};

async function saveDbCell(id, table, field, value) {
  // Try to parse as JSON if it looks like JSON
  let parsedValue = value;
  try { parsedValue = JSON.parse(value); } catch {}

  const res = await supabaseFetch(
    `${MAIN_SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ [field]: parsedValue }) }
  );
  if (res.ok) {
    toast('Celda actualizada ✓', 'success');
  } else {
    toast('Error al guardar', 'error');
    loadDbTable();
  }
}

window.promptDeleteDbRow = function(id) {
  dbPendingDelete = { table: dbCurrentTable, id };
  $('confirm-delete-message').textContent = `¿Eliminar la fila con ID ${id}? Esta acción no se puede deshacer.`;
  $('confirm-delete-modal').style.display = 'flex';
};

window.closeConfirmDeleteModal = function() {
  $('confirm-delete-modal').style.display = 'none';
  dbPendingDelete = null;
};

window.confirmDelete = async function() {
  if (!dbPendingDelete) return;
  const { table, id } = dbPendingDelete;
  const res = await supabaseFetch(
    `${MAIN_SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}?id=eq.${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (res.ok) {
    toast('Fila eliminada ✓', 'success');
    loadDbTable();
  } else {
    toast('Error al eliminar', 'error');
  }
  closeConfirmDeleteModal();
};

function openAddRowModal() {
  const table = dbCurrentTable;
  $('add-row-table-name').textContent = table;
  const fields = getTableFields(table).split(',').filter(f => f !== 'id' && f !== 'created_at');

  const fieldsHtml = fields.map(f => `
    <div class="form-group">
      <label>${esc(f)}</label>
      ${f === 'restaurant_id' ? `<input type="text" id="add-row-${esc(f)}" placeholder="restaurant_id">` :
        f === 'visible' || f === 'available' || f === 'is_closed' ?
        `<select id="add-row-${esc(f)}"><option value="true">true</option><option value="false">false</option></select>` :
        f === 'price' || f === 'capacity' || f === 'people' ?
        `<input type="number" id="add-row-${esc(f)}" placeholder="0">` :
        `<input type="text" id="add-row-${esc(f)}" placeholder="${esc(f)}">`}
    </div>
  `).join('');

  $('add-row-fields').innerHTML = fieldsHtml;
  $('add-row-modal').dataset.fields = fields.join(',');
  $('add-row-modal').style.display = 'flex';
}

function closeAddRowModal() {
  $('add-row-modal').style.display = 'none';
}

window.submitAddRow = async function() {
  const table = dbCurrentTable;
  const fields = ($('add-row-modal').dataset.fields || '').split(',');
  const payload = {};
  for (const f of fields) {
    const el = $(`add-row-${f}`);
    if (!el) continue;
    let val = el.value;
    if (f === 'price' || f === 'capacity' || f === 'people') val = parseFloat(val) || 0;
    if (f === 'visible' || f === 'available' || f === 'is_closed') val = val === 'true';
    if (f === 'value' || f === 'description' || f === 'info') {
      try { val = JSON.parse(val); } catch {}
    }
    payload[f] = val;
  }

  const res = await supabaseFetch(
    `${MAIN_SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`,
    { method: 'POST', body: JSON.stringify(payload) }
  );
  if (res.ok) {
    toast('Fila añadida ✓', 'success');
    closeAddRowModal();
    loadDbTable();
  } else {
    toast('Error al añadir fila', 'error');
  }
};

// ── ANALYTICS TAB ──────────────────────────────────────────────────────
async function loadAnalytics() {
  if (allRestaurants.length === 0) {
    allRestaurants = await getAllRestaurants();
  }

  const allMetrics = [];
  for (const r of allRestaurants) {
    const m7 = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key, 7);
    const m30 = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key, 30);
    allMetrics.push({ ...r, m7, m30 });
  }

  const totalRes30 = allMetrics.reduce((s, r) => s + r.m30.reservations, 0);
  const totalCovers30 = allMetrics.reduce((s, r) => s + r.m30.covers, 0);
  const avgPax = totalRes30 > 0 ? (totalCovers30 / totalRes30).toFixed(1) : '0';

  $('analytics-res-30d').textContent = totalRes30;
  $('analytics-covers-30d').textContent = totalCovers30;
  $('analytics-avg-pax').textContent = avgPax;
  $('analytics-peak-hour').textContent = '-';

  if (typeof Chart === 'undefined') {
    toast('Chart.js no disponible', 'warning');
    return;
  }

  // Chart 1: Reservations by restaurant (7d)
  if (metricsCharts.byRestaurant) metricsCharts.byRestaurant.destroy();
  const ctx1 = $('chart-by-restaurant');
  if (ctx1) {
    metricsCharts.byRestaurant = new Chart(ctx1, {
      type: 'bar',
      data: {
        labels: allMetrics.slice(0, 10).map(r => (r.name || r.restaurant_id).substring(0, 20)),
        datasets: [{
          label: 'Reservas (7d)',
          data: allMetrics.slice(0, 10).map(r => r.m7.reservations),
          backgroundColor: 'rgba(122,16,40,0.8)',
          borderRadius: 6,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  // Chart 2: Covers by restaurant (7d)
  if (metricsCharts.coversByRestaurant) metricsCharts.coversByRestaurant.destroy();
  const ctx2 = $('chart-covers-by-restaurant');
  if (ctx2) {
    metricsCharts.coversByRestaurant = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: allMetrics.slice(0, 10).map(r => (r.name || r.restaurant_id).substring(0, 20)),
        datasets: [{
          label: 'Cubiertos (7d)',
          data: allMetrics.slice(0, 10).map(r => r.m7.covers),
          backgroundColor: 'rgba(201,168,76,0.8)',
          borderRadius: 6,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
  }

  // Chart 3: Trend (30 days)
  if (metricsCharts.trend) metricsCharts.trend.destroy();
  const ctx3 = $('chart-trend');
  if (ctx3) {
    const trendLabels = [];
    const trendData = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      trendLabels.push(dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }));
      trendData.push(Math.round(totalRes30 / 30));
    }
    metricsCharts.trend = new Chart(ctx3, {
      type: 'line',
      data: {
        labels: trendLabels,
        datasets: [{
          label: 'Reservas (media 30d)',
          data: trendData,
          borderColor: '#7A1028',
          backgroundColor: 'rgba(122,16,40,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
        }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }
}

// ── SYSTEM TAB ─────────────────────────────────────────────────────────
async function loadSystem() {
  checkServiceStatus('vercel', 'https://vercel.com');
  checkServiceStatus('supabase', MAIN_SUPABASE_URL);
  checkServiceStatus('github', 'https://github.com/marquezchinchonsl-sketch/gastroexperiencem');
  checkServiceStatus('dns', 'https://gastroexperiencem.es');
}

async function checkServiceStatus(id, url) {
  const card = $(`status-${id}`);
  if (!card) return;
  try {
    const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
    card.querySelector('p').innerHTML = '<span style="color:#059669"><i class="fas fa-check-circle"></i> Operativo</span>';
  } catch(e) {
    // no-cors doesn't give us actual status, try fetch
    try {
      const res = await fetch(url, { method: 'HEAD' });
      card.querySelector('p').innerHTML = res.ok
        ? '<span style="color:#059669"><i class="fas fa-check-circle"></i> Operativo</span>'
        : `<span style="color:#D97706"><i class="fas fa-exclamation-circle"></i> Error ${res.status}</span>`;
    } catch {
      card.querySelector('p').innerHTML = '<span style="color:#DC2626"><i class="fas fa-times-circle"></i> Inaccesible</span>';
    }
  }
}

async function triggerDeploy() {
  toast('Forzando redeploy en Vercel...', 'info');
  try {
    const res = await fetch('https://api.vercel.com/v1/deployments', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer VERCEL_TOKEN_PLACEHOLDER', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gitSource: { type: 'github', repo: GITHUB_REPO, branch: 'main' },
        project: VERCEL_PROJECT,
      })
    });
    if (res.ok) {
      toast('Redeploy triggered ✓', 'success');
    } else {
      toast(`Redeploy error: ${res.status}`, 'error');
    }
  } catch(e) {
    toast('Redeploy error: ' + e.message, 'error');
  }
}

function refreshAllMetrics() {
  toast('Refrescando métricas...', 'info');
  loadOverview();
  setTimeout(() => toast('Métricas actualizadas ✓', 'success'), 2000);
}

function exportAllData() {
  const data = allRestaurants.map(r => ({
    nombre: r.name,
    ciudad: r.city,
    subdominio: r.subdomain,
    restaurant_id: r.restaurant_id,
    reservas_7d: r.metrics?.reservations || 0,
    cubiertos_7d: r.metrics?.covers || 0,
    supabase_url: r.supabase_url,
  }));
  const csv = ['Nombre,Ciudad,Subdominio,ID,Reservas 7d,Cubiertos 7d,Supabase URL'].join('\n') +
    '\n' + data.map(d => Object.values(d).map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gastroexperience_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('Datos exportados ✓', 'success');
}

async function changeMasterPassword() {
  const npw = $('new-master-password').value;
  const cpw = $('confirm-master-password').value;
  if (!npw) { toast('Introduce la nueva contraseña', 'error'); return; }
  if (npw !== cpw) { toast('Las contraseñas no coinciden', 'error'); return; }
  if (npw.length < 4) { toast('Mínimo 4 caracteres', 'error'); return; }

  // Save to settings table
  await upsertSetting('__master__', 'master_password', npw);
  toast('Contraseña actualizada. Nota: el código JS también debe actualizarse para uso persistente.', 'success', 8000);
  $('new-master-password').value = '';
  $('confirm-master-password').value = '';
}

// ── KEYBOARD SHORTCUTS ──────────────────────────────────────────────────
// Escape closes modals
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeRestaurantModal();
    closeAddMenuItemModal();
    closeAddZoneModal();
    closeAddRowModal();
    closeConfirmDeleteModal();
  }
});
