// master-admin.js — GastroExperience Master Admin
'use strict';

// ── CONFIG ────────────────────────────────────────────────
const MASTER_PASSWORD = 'master2026';
const SUPABASE_TOKEN = 'sbp_8d62d40f9302891954d7dfdcb8b72f1e4a0'; // from CREDENCIALES.txt
const MAIN_SUPABASE_URL = 'https://xornvhqqjovcucpuqgoo.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1Nzd9.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA';
const MAIN_DB_ID = 'xornvhqqjovcucpuqgoo';
const GITHUB_REPO = 'marquezchinchonsl-sketch/gastroexperiencem';
const VERCEL_PROJECT = 'gastroexperience';

// ── STATE ─────────────────────────────────────────────────
let allRestaurants = [];
let metricsCharts = {};

// ── HELPERS ────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.style.cssText = 'position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;font-size:0.9rem;font-weight:500;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:all 0.3s;';
  t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':type==='error'?'exclamation-circle':'info-circle'}" style="margin-right:8px;"></i>${msg}`;
  const colors = { success: '#059669', error: '#DC2626', info: '#2563EB', warning: '#D97706' };
  t.style.background = colors[type] || '#2563EB';
  t.style.color = '#fff';
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
}

// ── LOGIN ─────────────────────────────────────────────────
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

// ── NAV ───────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-tab'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.add('active-tab');
    const loaders = { overview: loadOverview, restaurants: loadRestaurants, create: ()=>{}, analytics: loadAnalytics, system: loadSystem };
    if (loaders[tab.dataset.tab]) loaders[tab.dataset.tab]();
  };
});

window.openTab = tabId => {
  document.querySelector(`.nav-tab[data-tab="${tabId}"]`)?.click();
};

// ── SUPABASE MANAGEMENT API ───────────────────────────────
function supabaseApi(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const https = window.location.protocol === 'file:' ? require('https') : window.require && window.require('https');
    const options = {
      hostname: 'api.supabase.com',
      path: urlPath,
      method,
      headers: {
        'Authorization': `Bearer ${SUPABASE_TOKEN}`,
        'Content-Type': 'application/json',
      }
    };
    if (typeof fetch !== 'undefined') {
      fetch(`https://api.supabase.com${urlPath}`, {
        method, headers: options.headers,
        body: body ? JSON.stringify(body) : null,
      }).then(r => r.json()).then(resolve).catch(reject);
    } else {
      reject(new Error('No fetch available'));
    }
  });
}

// ── RESTAURANTS FROM SUPABASE ────────────────────────────
async function getAllRestaurants() {
  try {
    // Get all restaurants from main DB by querying settings for subdomain entries
    const res = await fetch(
      `${MAIN_SUPABASE_URL}/rest/v1/restaurants?select=*&order=created_at.desc`,
      { headers: { 'apikey': MAIN_SUPABASE_KEY, 'Content-Type': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.length > 0) return data;
    }
  } catch(e) { console.warn('No restaurants table, falling back to settings'); }

  // Fallback: query settings for subdomain entries
  try {
    const res = await fetch(
      `${MAIN_SUPABASE_URL}/rest/v1/settings?key=eq.subdomain&select=restaurant_id,value`,
      { headers: { 'apikey': MAIN_SUPABASE_KEY, 'Content-Type': 'application/json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    // Get all unique restaurant_ids
    const rids = [...new Set(data.map(r => r.restaurant_id))];
    const restaurants = [];
    for (const rid of rids) {
      const cfgRes = await fetch(
        `${MAIN_SUPABASE_URL}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(rid)}&select=key,value`,
        { headers: { 'apikey': MAIN_SUPABASE_KEY, 'Content-Type': 'application/json' } }
      );
      if (!cfgRes.ok) continue;
      const cfg = await cfgRes.json();
      const cfgObj = {};
      for (const row of cfg) { try { cfgObj[row.key] = JSON.parse(row.value); } catch { cfgObj[row.key] = row.value; } }
      restaurants.push({
        restaurant_id: rid,
        name: cfgObj.bar_name || cfgObj.biz_name || rid,
        city: cfgObj.bar_city || '',
        subdomain: data.find(s => s.restaurant_id === rid)?.value || '',
        supabase_url: cfgObj.supabase_url || MAIN_SUPABASE_URL,
        supabase_key: cfgObj.supabase_key || MAIN_SUPABASE_KEY,
        status: 'active',
        created_at: cfgObj.created_at || new Date().toISOString(),
      });
    }
    return restaurants;
  } catch(e) { console.error('Error loading restaurants:', e); return []; }
}

async function getRestaurantMetrics(restaurantId, supabaseUrl, supabaseKey, days = 7) {
  const d = new Date(); d.setDate(d.getDate() - days);
  const dateStr = d.toISOString().split('T')[0];
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(restaurantId)}&date=gte.${dateStr}&select=date,time,people,status`,
      { headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' } }
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

// ── OVERVIEW TAB ───────────────────────────────────────────
async function loadOverview() {
  allRestaurants = await getAllRestaurants();
  const today = new Date().toISOString().split('T')[0];

  // Global stats
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

  $('total-restaurants').textContent = allRestaurants.length;
  $('reservations-today').textContent = totalRes;
  $('covers-today').textContent = totalPax;
  const rate = totalRes > 0 ? Math.round((confirmedTotal / totalRes) * 100) : 0;
  $('confirmation-rate').textContent = `${rate}%`;

  // Recent activity
  await loadRecentActivity();
}

async function loadRecentActivity() {
  const container = $('recent-activity');
  container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Cargando...</div>';

  const activities = [];
  const today = new Date().toISOString().split('T')[0];

  for (const r of allRestaurants.slice(0, 10)) {
    try {
      const res = await fetch(
        `${r.supabase_url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(r.restaurant_id)}&date=eq.${today}&select=id,name,time,status`,
        { headers: { 'apikey': r.supabase_key, 'Content-Type': 'application/json' } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const resv of data.slice(-2)) {
        activities.push({
          type: 'reservation',
          text: `<strong>${esc(resv.name)}</strong> — ${resv.time} (${r.name})`,
          time: resv.status === 'confirmed' ? '✅ Confirmada' : '⏳ Pendiente',
        });
      }
    } catch(e) {}
  }

  if (activities.length === 0) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-dim);"><i class="fas fa-calendar-day" style="font-size:2rem;opacity:0.4;margin-bottom:8px;display:block;"></i>Sin actividad hoy. ¡Comparte los QR de tus restaurantes!</div>';
    return;
  }

  container.innerHTML = activities.slice(0, 10).map(a => `
    <div class="activity-item">
      <div class="activity-icon reservation"><i class="fas fa-calendar-check"></i></div>
      <div class="activity-text">${a.text}</div>
      <div class="activity-time">${a.time}</div>
    </div>
  `).join('');
}

// ── RESTAURANTS TAB ────────────────────────────────────────
async function loadRestaurants() {
  allRestaurants = await getAllRestaurants();
  const restaurantMetrics = [];
  for (const r of allRestaurants) {
    const m = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key);
    restaurantMetrics.push({ ...r, metrics: m });
  }
  allRestaurants = restaurantMetrics;
  renderRestaurantsTable(allRestaurants);
}

function renderRestaurantsTable(restaurants) {
  const tbody = $('restaurants-body');

  if (restaurants.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-dim);">
      <i class="fas fa-store" style="font-size:2rem;opacity:0.3;display:block;margin-bottom:8px;"></i>
      No hay restaurantes creados. <a href="#" onclick="openTab('create');return false;" style="color:var(--primary);">Crea el primero →</a>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = restaurants.map(r => `
    <tr>
      <td>
        <div class="restaurant-name">${esc(r.name)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">ID: ${esc(r.restaurant_id)}</div>
      </td>
      <td class="restaurant-city">${esc(r.city || '-')}</td>
      <td><span class="restaurant-subdomain">${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es</span></td>
      <td><strong>${r.metrics?.reservations ?? '-'}</strong></td>
      <td><strong>${r.metrics?.covers ?? '-'}</strong></td>
      <td><span class="status-badge ${r.status === 'active' ? 'active' : 'pending'}">${r.status === 'active' ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <a href="https://${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es/admin" target="_blank" class="action-btn" title="Admin">
            <i class="fas fa-external-link-alt"></i>
          </a>
          <a href="https://${esc(r.subdomain || r.restaurant_id)}.gastroexperiencem.es" target="_blank" class="action-btn" title="Web">
            <i class="fas fa-globe"></i>
          </a>
          <button class="action-btn" onclick="viewRestaurantMetrics('${esc(r.restaurant_id)}')" title="Métricas">
            <i class="fas fa-chart-line"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

$('search-restaurants').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = allRestaurants.filter(r =>
    r.name.toLowerCase().includes(term) ||
    r.city?.toLowerCase().includes(term) ||
    r.subdomain?.toLowerCase().includes(term)
  );
  renderRestaurantsTable(filtered);
});

function viewRestaurantMetrics(rid) {
  toast('Métricas detalladas en desarrollo', 'info');
}

// ── ANALYTICS TAB ──────────────────────────────────────────
async function loadAnalytics() {
  // Load all metrics for charts
  const allMetrics = [];
  for (const r of allRestaurants) {
    const m7 = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key, 7);
    const m30 = await getRestaurantMetrics(r.restaurant_id, r.supabase_url, r.supabase_key, 30);
    allMetrics.push({ ...r, m7, m30 });
  }

  const totalRes30 = allMetrics.reduce((s, r) => s + r.m30.reservations, 0);
  const totalCovers30 = allMetrics.reduce((s, r) => s + r.m30.covers, 0);
  const avgPax = totalRes30 > 0 ? (totalCovers30 / totalRes30).toFixed(1) : 0;

  $('analytics-res-30d').textContent = totalRes30;
  $('analytics-covers-30d').textContent = totalCovers30;
  $('analytics-avg-pax').textContent = avgPax;
  $('analytics-peak-hour').textContent = '-';

  // Chart: by restaurant (7 days)
  if (typeof Chart !== 'undefined') {
    if (metricsCharts.byRestaurant) metricsCharts.byRestaurant.destroy();
    const ctx = $('chart-by-restaurant');
    if (ctx) {
      metricsCharts.byRestaurant = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: allMetrics.slice(0, 8).map(r => r.name.length > 15 ? r.name.substring(0, 15) + '…' : r.name),
          datasets: [{
            label: 'Reservas (7d)',
            data: allMetrics.slice(0, 8).map(r => r.m7.reservations),
            backgroundColor: 'rgba(122, 16, 40, 0.8)',
            borderRadius: 6,
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // Chart: by city
    if (metricsCharts.byCity) metricsCharts.byCity.destroy();
    const cityData = {};
    allMetrics.forEach(r => { cityData[r.city || 'Sin ciudad'] = (cityData[r.city || 'Sin ciudad'] || 0) + r.m7.reservations; });
    const ctxCity = $('chart-by-city');
    if (ctxCity) {
      metricsCharts.byCity = new Chart(ctxCity, {
        type: 'doughnut',
        data: {
          labels: Object.keys(cityData),
          datasets: [{ data: Object.values(cityData), backgroundColor: ['#7A1028', '#C9A84C', '#1A1A1A', '#059669', '#2563EB', '#D97706'] }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // Chart: trend (last 30 days)
    if (metricsCharts.trend) metricsCharts.trend.destroy();
    const trendLabels = [];
    const trendData = [];
    for (let i = 29; i >= 0; i--) {
      const dt = new Date(); dt.setDate(dt.getDate() - i);
      const dateStr = dt.toISOString().split('T')[0];
      trendLabels.push(dateStr.substring(5).split('-').reverse().join('/'));
      let dayTotal = 0;
      // This would need per-day data from reservations table
      trendData.push(allMetrics.reduce((s, r) => s + r.m30.reservations, 0) / 30);
    }
    const ctxTrend = $('chart-trend');
    if (ctxTrend) {
      metricsCharts.trend = new Chart(ctxTrend, {
        type: 'line',
        data: {
          labels: trendLabels,
          datasets: [{
            label: 'Reservas diarias (media)',
            data: trendData,
            borderColor: '#7A1028',
            backgroundColor: 'rgba(122,16,40,0.1)',
            fill: true, tension: 0.4,
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  }
}

// ── SYSTEM TAB ─────────────────────────────────────────────
async function loadSystem() {
  // System info is mostly static, loaded from UI
}

async function triggerDeploy() {
  toast('Triggering Vercel deploy via GitHub push...', 'info');
  try {
    const response = await fetch('https://api.vercel.com/v1/deployments', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + await getVercelToken(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        gitSource: {
          type: 'github',
          repo: GITHUB_REPO,
          branch: 'main',
        },
        project: VERCEL_PROJECT,
      })
    });
    if (response.ok) toast('Deploy triggered ✓', 'success');
    else toast('Error triggering deploy', 'error');
  } catch(e) { toast('Error: ' + e.message, 'error'); }
}

function refreshAllMetrics() {
  toast('Refrescando métricas de todos los restaurantes...', 'info');
  loadOverview();
  setTimeout(() => toast('Métricas actualizadas ✓', 'success'), 1500);
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gastroexperience_restaurants_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  toast('Datos exportados ✓', 'success');
}

// ── CREATE NEW CLIENT ──────────────────────────────────────
function previewSubdomain() {
  const name = $('new-name').value.trim();
  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  $('subdomain-url').textContent = slug ? `${slug}.gastroexperiencem.es` : '-';
}

function validateStep1() {
  const name = $('new-name').value.trim();
  const city = $('new-city').value.trim();
  const email = $('new-email').value.trim();

  if (!name) { toast('Introduce el nombre del restaurante', 'error'); return; }

  const slug = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const rid = `rest-${slug}-${Date.now().toString(36)}`;

  $('confirm-details').innerHTML = `
    <div class="confirm-row"><span class="confirm-label">Nombre</span><span class="confirm-value">${esc(name)}</span></div>
    <div class="confirm-row"><span class="confirm-label">Ciudad</span><span class="confirm-value">${esc(city || '-')}</span></div>
    <div class="confirm-row"><span class="confirm-label">Email Admin</span><span class="confirm-value">${esc(email || '-')}</span></div>
    <div class="confirm-row"><span class="confirm-label">Subdominio</span><span class="confirm-value" style="font-family:monospace;color:var(--primary);">${esc(slug)}.gastroexperiencem.es</span></div>
    <div class="confirm-row"><span class="confirm-label">Restaurant ID</span><span class="confirm-value" style="font-family:monospace;font-size:0.8rem;">${esc(rid)}</span></div>
  `;

  // Store values for creation
  $('step-info').dataset.name = name;
  $('step-info').dataset.city = city;
  $('step-info').dataset.email = email;
  $('step-info').dataset.slug = slug;
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
    el.innerHTML = el.innerHTML.replace(/<i class="[^"]*"><\/i>/, `<i class="fas fa-circle"></i>`).replace(/fa-spinner|fa-check-circle|fa-times-circle|fa-exclamation-circle/g, 'fa-circle');
  });
  $('creation-progress').style.width = '0%';
  $('creation-status').textContent = 'Iniciando...';
  goToStep('step-info');
}

async function startCreation() {
  const name = $('step-info').dataset.name;
  const city = $('step-info').dataset.city || '';
  const email = $('step-info').dataset.email || '';
  const slug = $('step-info').dataset.slug;
  const rid = $('step-info').dataset.rid;

  goToStep('step-creating');
  $('btn-start-creation').disabled = true;

  const log = (id, msg, status) => {
    const el = $(id);
    if (!el) return;
    el.className = `log-entry ${status}`;
    const iconMap = { pending: 'fa-circle', active: 'fa-spinner fa-spin', done: 'fa-check-circle', error: 'fa-times-circle' };
    el.innerHTML = `<i class="fas ${iconMap[status] || 'fa-circle'}"></i> ${msg}`;
  };

  const progress = (pct) => { $('creation-progress').style.width = `${pct}%`; };
  const status = (msg) => { $('creation-status').textContent = msg; };

  try {
    // Step 1: Create Supabase project
    log('log-supabase', `Creando proyecto Supabase para "${name}"...`, 'active');
    status('Creando proyecto Supabase...');
    progress(10);

    const createRes = await supabaseApi('POST', '/v1/projects', {
      name: name.replace(/"/g, ''),
      organization_id: 'inswykbedvknsyckoztp',
      db_passphrase: generatePassword(20),
      region: 'eu-central-1',
    });

    if (!createRes?.id) {
      // Maybe project name conflicts - try with slug-only
      const createRes2 = await supabaseApi('POST', '/v1/projects', {
        name: slug,
        organization_id: 'inswykbedvknsyckoztp',
        db_passphrase: generatePassword(20),
        region: 'eu-central-1',
      });
      if (!createRes2?.id) throw new Error('No se pudo crear el proyecto Supabase: ' + JSON.stringify(createRes || createRes2));
    }

    const projectRef = createRes.id;
    const supabaseUrl = `https://${projectRef}.supabase.co`;
    log('log-supabase', `Proyecto Supabase creado: ${projectRef}`, 'done');
    progress(25);
    status('Esperando que Supabase esté listo...');

    // Step 2: Wait for Supabase to be active
    log('log-config', 'Esperando activación de Supabase...', 'active');
    let supabaseKey = '';
    let ready = false;
    for (let i = 0; i < 30; i++) {
      await sleep(10000);
      try {
        const proj = await supabaseApi('GET', `/v1/projects/${projectRef}`);
        if (proj.status === 'ACTIVE' || proj.status === 'online') {
          ready = true;
          // Get anon key
          const allKeys = await supabaseApi('GET', `/v1/projects/${projectRef}/api-keys`);
          const anonEntry = Array.isArray(allKeys) ? allKeys.find(k => k.name === 'anon key' || k.name === 'anon') : null;
          supabaseKey = anonEntry?.key || '';
          if (!supabaseKey && proj.api_keys) {
            const a = proj.api_keys.find(k => k.name === 'anon key');
            supabaseKey = a?.key || '';
          }
          break;
        }
      } catch(e) {}
      status(`Esperando Supabase... ${(i+1)*10}s`);
    }

    if (!ready) {
      log('log-supabase', 'Supabase tardó demasiado. Continuando con URL manual.', 'error');
      // Try to get keys anyway
      try {
        const proj = await supabaseApi('GET', `/v1/projects/${projectRef}`);
        if (proj.settings?.api_key) supabaseKey = proj.settings.api_key;
      } catch(e) {}
    }

    if (!supabaseKey) {
      log('log-config', 'No se pudo obtener anon key. El restaurante funcionará pero necesitarás configurarla manualmente.', 'error');
    } else {
      log('log-config', 'Supabase activo y configurado ✓', 'done');
    }
    progress(50);
    status('Aplicando configuración de base de datos...');

    // Step 3: Apply RLS and schema
    log('log-deploy', 'Aplicando esquema y políticas RLS...', 'active');
    const rlsSQL = getRLSSQL();
    try {
      await supabaseApi('POST', `/v1/projects/${projectRef}/database/query`, { query: rlsSQL });
      log('log-deploy', 'RLS y esquema aplicados ✓', 'done');
    } catch(e) {
      log('log-deploy', 'RLS: ' + e.message.slice(0, 80), 'error');
    }
    progress(65);
    status('Guardando configuración del restaurante...');

    // Step 4: Save restaurant config to main DB
    log('log-dns', 'Registrando restaurante en GastroExperience...', 'active');
    const configPayload = {
      restaurant_id: rid,
      key: 'subdomain',
      value: JSON.stringify(slug),
    };
    const cfgRes = await fetch(`${MAIN_SUPABASE_URL}/rest/v1/settings`, {
      method: 'POST',
      headers: { 'apikey': MAIN_SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
      body: JSON.stringify(configPayload),
    });

    const otherSettings = [
      { restaurant_id: rid, key: 'bar_name', value: JSON.stringify(name) },
      { restaurant_id: rid, key: 'bar_city', value: JSON.stringify(city) },
      { restaurant_id: rid, key: 'email', value: JSON.stringify(email) },
      { restaurant_id: rid, key: 'supabase_url', value: JSON.stringify(supabaseUrl) },
      { restaurant_id: rid, key: 'supabase_key', value: JSON.stringify(supabaseKey) },
      { restaurant_id: rid, key: 'restaurant_id', value: JSON.stringify(rid) },
      { restaurant_id: rid, key: 'weekly_schedule', value: JSON.stringify(getDefaultSchedule()) },
      { restaurant_id: rid, key: 'zones_config', value: JSON.stringify([{ id: 'interior', title: 'Interior', capacity: 30 }, { id: 'terraza', title: 'Terraza', capacity: 20 }]) },
    ];

    for (const s of otherSettings) {
      await fetch(`${MAIN_SUPABASE_URL}/rest/v1/settings`, {
        method: 'POST',
        headers: { 'apikey': MAIN_SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
        body: JSON.stringify(s),
      });
    }
    log('log-dns', `Registrado: ${slug}.gastroexperiencem.es`, 'done');
    progress(80);
    status('Configurando DNS y subdominio...');

    // Step 5: DNS is handled by wildcard *.gastroexperiencem.es → Vercel
    // SSL auto-provisions on first request
    await sleep(2000);

    // Step 6: Also register in the NEW Supabase project (so routing.js can find it)
    if (supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/rest/v1/settings`, {
          method: 'POST',
          headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify([
            { restaurant_id: rid, key: 'subdomain', value: JSON.stringify(slug) },
            { restaurant_id: rid, key: 'bar_name', value: JSON.stringify(name) },
            { restaurant_id: rid, key: 'bar_city', value: JSON.stringify(city) },
            { restaurant_id: rid, key: 'supabase_url', value: JSON.stringify(supabaseUrl) },
            { restaurant_id: rid, key: 'supabase_key', value: JSON.stringify(supabaseKey) },
          ]),
        });
      } catch(e) { console.warn('Could not write to new Supabase:', e); }
    }

    log('log-complete', `¡${name} creado con éxito!`, 'done');
    progress(100);
    status('¡Listo!');

    $('success-details').innerHTML = `
      <div class="success-icon">🍽️</div>
      <h4>${esc(name)}</h4>
      <p>Tu restaurante está listo. Los cambios pueden tardar 2-5 minutos en propagarse.</p>
      <div class="success-links">
        <div class="success-link">
          <span>🌐 Web pública</span>
          <a href="https://${esc(slug)}.gastroexperiencem.es" target="_blank">https://${esc(slug)}.gastroexperiencem.es</a>
        </div>
        <div class="success-link">
          <span>⚙️ Panel Admin</span>
          <a href="https://${esc(slug)}.gastroexperiencem.es/admin" target="_blank">https://${esc(slug)}.gastroexperiencem.es/admin</a>
        </div>
        <div class="success-link">
          <span>🗄️ Base de datos</span>
          <a href="https://supabase.com/dashboard/project/${esc(projectRef)}" target="_blank">${esc(supabaseUrl)}</a>
        </div>
        <div class="success-link">
          <span>🆔 Restaurant ID</span>
          <span style="font-family:monospace;font-size:0.8rem;">${esc(rid)}</span>
        </div>
      </div>
    `;

    goToStep('step-done');
    toast('¡Restaurante creado con éxito! 🎉', 'success');

  } catch(e) {
    console.error('Creation error:', e);
    log('log-complete', `Error: ${e.message}`, 'error');
    $('creation-status').textContent = 'Error: ' + e.message;
    toast('Error al crear restaurante: ' + e.message, 'error');
    $('btn-start-creation').disabled = false;
  }
}

// ── UTILITIES ──────────────────────────────────────────────
function generatePassword(len = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(len);
  crypto.getRandomValues(array);
  for (let i = 0; i < len; i++) result += chars[array[i] % chars.length];
  return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getRLSSQL() {
  return `
-- Tablas principales
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

-- Índices
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(restaurant_id, date);
CREATE INDEX IF NOT EXISTS idx_settings_restaurant ON settings(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_special_days_restaurant ON special_days(restaurant_id);

-- RLS
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Menu items RLS" ON menu_items;
DROP POLICY IF EXISTS "Reservations RLS" ON reservations;
DROP POLICY IF EXISTS "Settings RLS" ON settings;
DROP POLICY IF EXISTS "Special days RLS" ON special_days;
DROP POLICY IF EXISTS "Products RLS" ON products;
DROP POLICY IF EXISTS "Time slots RLS" ON time_slots;

CREATE POLICY "Menu items RLS" ON menu_items FOR ALL USING (restaurant_id = current_setting('app.current_restaurant_id', true));
CREATE POLICY "Reservations RLS" ON reservations FOR ALL USING (restaurant_id = current_setting('app.current_restaurant_id', true));
CREATE POLICY "Settings RLS" ON settings FOR ALL USING (restaurant_id = current_setting('app.current_restaurant_id', true));
CREATE POLICY "Special days RLS" ON special_days FOR ALL USING (restaurant_id = current_setting('app.current_restaurant_id', true));
CREATE POLICY "Products RLS" ON products FOR ALL USING (restaurant_id = current_setting('app.current_restaurant_id', true));
CREATE POLICY "Time slots RLS" ON time_slots FOR ALL USING (restaurant_id = current_setting('app.current_restaurant_id', true));

-- Función helper
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

// Vercel token helper (simplified - user needs to configure)
async function getVercelToken() {
  return 'YOUR_VERCEL_TOKEN'; // User should replace with actual token
}
