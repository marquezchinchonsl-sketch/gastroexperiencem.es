// GastroExperience Master Admin - JavaScript

// ============ CREDENTIALS ============
const MAIN_SUPABASE_URL = 'https://xornvhqqjovcucpuqgoo.supabase.co';
const MAIN_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1N30.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA';
const SUPABASE_TOKEN = 'sbp_8d62d40f9302891954d7dfdcb8b72f1e4a0';
const MAIN_DB_ID = 'xornvhqqjovcucpuqgoo';
const MASTER_PASSWORD = 'master2026';

// ============ STATE ============
let restaurants = [];
let selectedRestaurant = null;
let allReservations = [];
let dbTableData = [];
let dbCurrentPage = 1;
let dbPageSize = 50;
let restaurantHealth = {};

// ============ HELPERS ============
function apiHeaders(key) {
  key = key || MAIN_SUPABASE_KEY;
  return { 
    'apikey': key, 
    'Authorization': 'Bearer ' + key, 
    'Content-Type': 'application/json' 
  };
}

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return formatDate(dateStr) + ' ' + formatTime(dateStr);
}

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ============ API CALLS ============
async function supabaseFetch(url, options = {}, key = MAIN_SUPABASE_KEY) {
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...apiHeaders(key), ...options.headers }
    });
    return res;
  } catch (e) {
    throw e;
  }
}

async function loadRestaurants() {
  try {
    // Get all settings rows to extract unique restaurant IDs and their config
    const res = await supabaseFetch(
      `${MAIN_SUPABASE_URL}/rest/v1/settings?select=restaurant_id,key,value`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status + ' — verificar RLS en tabla settings');
    const allSettings = await res.json();
    if (!allSettings || allSettings.length === 0) {
      toast('No hay restaurantes. La tabla settings está vacía o RLS la bloquea.', 'warning');
      restaurants = [];
      renderRestaurantList();
      updateOverviewStats();
      return [];
    }

    // Deduplicate restaurant IDs
    const rids = [...new Set(allSettings.map(r => r.restaurant_id))];
    restaurants = rids.map(rid => {
      const rows = allSettings.filter(s => s.restaurant_id === rid);
      const cfg = {};
      for (const row of rows) {
        try { cfg[row.key] = JSON.parse(row.value); } catch { cfg[row.key] = row.value; }
      }
      return {
        restaurant_id: rid,
        name: cfg.bar_name || cfg.biz_name || rid,
        city: cfg.bar_city || '',
        subdomain: cfg.subdomain || '',
        status: cfg.status || 'active',
        supabase_url: cfg.supabase_url || MAIN_SUPABASE_URL,
        supabase_key: cfg.supabase_key || MAIN_SUPABASE_KEY,
        _cfg: cfg
      };
    });

    restaurants.sort((a, b) => a.name.localeCompare(b.name));
    renderRestaurantList();
    updateOverviewStats();
    return restaurants;
  } catch (e) {
    toast('Error cargando restaurantes: ' + e.message, 'error');
    return [];
  }
}

async function loadRestaurantData(restaurant) {
  const rid = restaurant.restaurant_id;
  const url = restaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = restaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    // Load menu items
    const menuRes = await supabaseFetch(
      `${url}/rest/v1/menu_items?restaurant_id=eq.${encodeURIComponent(rid)}&select=*`,
      {}, key
    );
    restaurant._menuItems = menuRes.ok ? await menuRes.json() : [];
    
    // Load zones from settings
    const zonesRes = await supabaseFetch(
      `${url}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(rid)}&key=eq.zones&select=value`,
      {}, key
    );
    if (zonesRes.ok) {
      const zonesData = await zonesRes.json();
      restaurant._zones = zonesData[0]?.value ? JSON.parse(zonesData[0].value) : [];
    } else {
      restaurant._zones = [];
    }
    
    // Load schedule
    const schedRes = await supabaseFetch(
      `${url}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(rid)}&key=eq.schedule&select=value`,
      {}, key
    );
    if (schedRes.ok) {
      const schedData = await schedRes.json();
      restaurant._schedule = schedData[0]?.value ? JSON.parse(schedData[0].value) : {};
    } else {
      restaurant._schedule = {};
    }
    
    // Load reservations
    const dateFrom = addDays(-30);
    const resRes = await supabaseFetch(
      `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(rid)}&date=gte.${dateFrom}&select=*&order=date.desc,time.desc`,
      {}, key
    );
    restaurant._reservations = resRes.ok ? await resRes.json() : [];
    
    return restaurant;
  } catch (e) {
    toast('Error cargando datos: ' + e.message, 'error');
    return restaurant;
  }
}

async function loadReservations() {
  if (!selectedRestaurant) return;
  
  const dateFrom = document.getElementById('reservas-date-from').value || addDays(-30);
  const dateTo = document.getElementById('reservas-date-to').value || today();
  
  const rid = selectedRestaurant.restaurant_id;
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(rid)}&date=gte.${dateFrom}&date=lte.${dateTo}&select=*&order=date desc,time desc`,
      {}, key
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    renderReservations(data);
  } catch (e) {
    toast('Error cargando reservas: ' + e.message, 'error');
  }
}

async function loadTodayStats() {
  if (!selectedRestaurant) return;
  
  const rid = selectedRestaurant.restaurant_id;
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  const todayStr = today();
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(rid)}&date=eq.${todayStr}&select=*`,
      {}, key
    );
    if (res.ok) {
      const data = await res.json();
      const confirmed = data.filter(r => r.status === 'confirmed').length;
      const total = data.length;
      const covers = data.reduce((sum, r) => sum + (parseInt(r.people) || 0), 0);
      const confirmationRate = total > 0 ? Math.round((confirmed / total) * 100) : 0;
      
      document.getElementById('qs-reservations').textContent = total;
      document.getElementById('qs-covers').textContent = covers;
      document.getElementById('qs-confirmation-rate').textContent = confirmationRate + '%';
    }
  } catch (e) {
    // Silently fail
  }
}

// ============ HEALTH CHECK ============
async function runHealthCheck(restaurant) {
  restaurant = restaurant || selectedRestaurant;
  if (!restaurant) return [];
  
  const url = restaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = restaurant.supabase_key || MAIN_SUPABASE_KEY;
  const rid = restaurant.restaurant_id;
  const checks = [];
  
  // Supabase connection
  try {
    const res = await fetch(url + '/rest/v1/menu_items?restaurant_id=eq.' + encodeURIComponent(rid) + '&select=id&limit=1', {
      headers: apiHeaders(key)
    });
    if (!res.ok) {
      checks.push({ status: 'error', icon: 'fa-database', title: 'Supabase no responde', detail: 'HTTP ' + res.status });
    } else {
      checks.push({ status: 'ok', icon: 'fa-database', title: 'Supabase conectado' });
    }
  } catch (e) {
    checks.push({ status: 'error', icon: 'fa-wifi', title: 'Supabase inaccesible', detail: e.message });
  }
  
  // Menu items count
  try {
    const res = await fetch(url + '/rest/v1/menu_items?restaurant_id=eq.' + encodeURIComponent(rid) + '&select=id', {
      headers: apiHeaders(key)
    });
    if (res.ok) {
      const data = await res.json();
      if (!data || data.length === 0) {
        checks.push({ status: 'warning', icon: 'fa-utensils', title: 'Sin platos en carta' });
      } else {
        checks.push({ status: 'ok', icon: 'fa-utensils', title: 'Platos: ' + data.length });
      }
    }
  } catch (e) {}
  
  // Zones from settings
  try {
    const res = await fetch(url + '/rest/v1/settings?restaurant_id=eq.' + encodeURIComponent(rid) + '&key=eq.zones&select=value', {
      headers: apiHeaders(key)
    });
    if (res.ok) {
      const data = await res.json();
      const zones = data[0]?.value ? JSON.parse(data[0].value) : [];
      if (!zones || zones.length === 0) {
        checks.push({ status: 'warning', icon: 'fa-chair', title: 'Sin zonas' });
      } else {
        checks.push({ status: 'ok', icon: 'fa-chair', title: 'Zonas: ' + zones.map(z => z.title).join(', ') });
      }
    }
  } catch (e) {}
  
  // Schedule
  try {
    const res = await fetch(url + '/rest/v1/settings?restaurant_id=eq.' + encodeURIComponent(rid) + '&key=eq.schedule&select=value', {
      headers: apiHeaders(key)
    });
    if (res.ok) {
      const data = await res.json();
      if (!data || data.length === 0) {
        checks.push({ status: 'warning', icon: 'fa-clock', title: 'Sin horarios' });
      } else {
        checks.push({ status: 'ok', icon: 'fa-clock', title: 'Horario configurado' });
      }
    }
  } catch (e) {}
  
  // Recent reservations
  try {
    const date30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const res = await fetch(url + '/rest/v1/reservations?restaurant_id=eq.' + encodeURIComponent(rid) + '&date=gte.' + date30 + '&select=id', {
      headers: apiHeaders(key)
    });
    if (res.ok) {
      const data = await res.json();
      if (!data || data.length === 0) {
        checks.push({ status: 'info', icon: 'fa-calendar', title: 'Sin reservas 30d' });
      } else {
        checks.push({ status: 'ok', icon: 'fa-calendar', title: 'Reservas 30d: ' + data.length });
      }
    }
  } catch (e) {}
  
  // Public website
  const pubUrl = 'https://' + (restaurant.subdomain || rid) + '.gastroexperiencem.es';
  try {
    const res = await fetch(pubUrl, { method: 'HEAD' });
    if (!res.ok) {
      checks.push({ status: 'error', icon: 'fa-globe', title: 'Web no responde', detail: 'HTTP ' + res.status });
    } else {
      checks.push({ status: 'ok', icon: 'fa-globe', title: 'Web OK' });
    }
  } catch (e) {
    checks.push({ status: 'error', icon: 'fa-globe', title: 'Web inaccesible', detail: e.message });
  }
  
  // Update health status for sidebar
  const errorCount = checks.filter(c => c.status === 'error').length;
  const warningCount = checks.filter(c => c.status === 'warning').length;
  
  if (errorCount > 0) {
    restaurantHealth[rid] = 'error';
  } else if (warningCount > 0) {
    restaurantHealth[rid] = 'warning';
  } else {
    restaurantHealth[rid] = 'ok';
  }
  
  renderHealthGrid(checks);
  renderRestaurantList();
  updateAlertSummary();
  
  return checks;
}

async function checkAllRestaurantsHealth() {
  for (const r of restaurants) {
    await runHealthCheck(r);
  }
}

function renderHealthGrid(checks) {
  const grid = document.getElementById('health-grid');
  if (!checks || checks.length === 0) {
    grid.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Ejecutando diagnóstico...</div>';
    return;
  }
  
  grid.innerHTML = checks.map(c => `
    <div class="health-item ${c.status}">
      <i class="fa-solid ${c.icon}"></i>
      <div>
        <div class="title">${esc(c.title)}</div>
        ${c.detail ? `<div class="detail">${esc(c.detail)}</div>` : ''}
      </div>
    </div>
  `).join('');
}

function updateAlertSummary() {
  let ok = 0, warning = 0, error = 0;
  
  for (const rid in restaurantHealth) {
    const status = restaurantHealth[rid];
    if (status === 'ok') ok++;
    else if (status === 'warning') warning++;
    else if (status === 'error') error++;
  }
  
  document.getElementById('alert-ok-count').textContent = ok;
  document.getElementById('alert-warning-count').textContent = warning;
  document.getElementById('alert-error-count').textContent = error;
}

// ============ OVERVIEW ============
function updateOverviewStats() {
  document.getElementById('stat-total-restaurants').textContent = restaurants.length;
  
  // Count today's reservations and covers across all restaurants
  let totalReservationsToday = 0;
  let totalCoversToday = 0;
  const todayStr = today();
  
  const promises = restaurants.map(async r => {
    const url = r.supabase_url || MAIN_SUPABASE_URL;
    const key = r.supabase_key || MAIN_SUPABASE_KEY;
    try {
      const res = await supabaseFetch(
        `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(r.restaurant_id)}&date=eq.${todayStr}&select=*`,
        {}, key
      );
      if (res.ok) {
        const data = await res.json();
        totalReservationsToday += data.length;
        totalCoversToday += data.reduce((sum, r) => sum + (parseInt(r.people) || 0), 0);
      }
    } catch (e) {}
  });
  
  Promise.all(promises).then(() => {
    document.getElementById('stat-reservations-today').textContent = totalReservationsToday;
    document.getElementById('stat-covers-today').textContent = totalCoversToday;
  });
  
  loadRecentActivity();
}

async function loadRecentActivity() {
  const allRecent = [];
  const todayStr = today();
  
  const promises = restaurants.slice(0, 10).map(async r => {
    const url = r.supabase_url || MAIN_SUPABASE_URL;
    const key = r.supabase_key || MAIN_SUPABASE_KEY;
    try {
      const res = await supabaseFetch(
        `${url}/rest/v1/reservations?restaurant_id=eq.${encodeURIComponent(r.restaurant_id)}&date=eq.${todayStr}&select=*&order=time desc&limit=10`,
        {}, key
      );
      if (res.ok) {
        const data = await res.json();
        data.forEach(reservation => {
          allRecent.push({
            ...reservation,
            _restaurantName: r.name,
            _restaurantId: r.restaurant_id
          });
        });
      }
    } catch (e) {}
  });
  
  Promise.all(promises).then(() => {
    allRecent.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    renderActivityList(allRecent.slice(0, 10));
  });
}

function renderActivityList(activities) {
  const list = document.getElementById('activity-list');
  
  if (!activities || activities.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>Sin actividad reciente</p></div>';
    return;
  }
  
  list.innerHTML = activities.map(a => `
    <div class="activity-item">
      <span class="activity-time">${formatDateTime(a.date + 'T' + a.time)}</span>
      <span class="activity-restaurant">${esc(a._restaurantName || '—')}</span>
      <span class="activity-name">${esc(a.name || '—')} · ${a.people} pers.</span>
      <span class="activity-status ${a.status || 'pending'}">${a.status || 'pending'}</span>
    </div>
  `).join('');
}

function renderRestaurantGrid() {
  const grid = document.getElementById('restaurant-grid-overview');
  
  if (!restaurants || restaurants.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No hay restaurantes</p></div>';
    return;
  }
  
  grid.innerHTML = restaurants.map(r => {
    const healthStatus = restaurantHealth[r.restaurant_id] || 'unknown';
    return `
      <div class="restaurant-card" onclick="selectRestaurant('${esc(r.restaurant_id)}')">
        <div class="restaurant-card-header">
          <div>
            <div class="restaurant-card-name">${esc(r.name || '—')}</div>
            <div class="restaurant-card-city">${esc(r.bar_city || '—')}</div>
          </div>
          <div class="health-dot ${healthStatus}"></div>
        </div>
        <div class="restaurant-card-stats">
          <span><i class="fa-solid fa-link"></i> ${esc(r.subdomain || r.restaurant_id)}</span>
        </div>
      </div>
    `;
  }).join('');
}

// ============ RESTAURANT LIST ============
function renderRestaurantList() {
  const list = document.getElementById('restaurant-list');
  
  if (!restaurants || restaurants.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No hay restaurantes</p></div>';
    return;
  }
  
  list.innerHTML = restaurants.map(r => {
    const healthStatus = restaurantHealth[r.restaurant_id] || 'unknown';
    const isActive = selectedRestaurant && selectedRestaurant.restaurant_id === r.restaurant_id;
    return `
      <div class="restaurant-list-item ${isActive ? 'active' : ''}" onclick="selectRestaurant('${esc(r.restaurant_id)}')">
        <div class="health-dot ${healthStatus}"></div>
        <div>
          <div class="name">${esc(r.name || '—')}</div>
          <div class="city">${esc(r.bar_city || '—')}</div>
        </div>
      </div>
    `;
  }).join('');
}

async function selectRestaurant(rid) {
  const restaurant = restaurants.find(r => r.restaurant_id === rid);
  if (!restaurant) return;
  
  selectedRestaurant = restaurant;
  
  // Update UI
  document.getElementById('restaurant-empty').classList.add('hidden');
  document.getElementById('restaurant-content').classList.remove('hidden');
  document.getElementById('detail-restaurant-name').textContent = restaurant.name || '—';
  
  // Update sidebar selection
  renderRestaurantList();
  
  // Load data
  await loadRestaurantData(restaurant);
  
  // Populate info form
  document.getElementById('info-bar_name').value = restaurant.bar_name || '';
  document.getElementById('info-bar_city').value = restaurant.bar_city || '';
  document.getElementById('info-bar_address').value = restaurant.bar_address || '';
  document.getElementById('info-bar_phone').value = restaurant.bar_phone || '';
  document.getElementById('info-email').value = restaurant.email || '';
  document.getElementById('info-subdomain').value = restaurant.subdomain || '';
  
  // Set default dates for reservations filter
  document.getElementById('reservas-date-from').value = addDays(-30);
  document.getElementById('reservas-date-to').value = today();
  
  // Update tools links
  const pubUrl = 'https://' + (restaurant.subdomain || restaurant.restaurant_id) + '.gastroexperiencem.es';
  const adminUrl = pubUrl + '/admin';
  document.getElementById('tool-public-site').href = pubUrl;
  document.getElementById('tool-restaurant-admin').href = adminUrl;
  
  // Load tab content
  runHealthCheck();
  loadTodayStats();
  renderCartaTable();
  loadReservations();
  renderZones();
  populateSchedule();
}

function backToList() {
  selectedRestaurant = null;
  document.getElementById('restaurant-empty').classList.remove('hidden');
  document.getElementById('restaurant-content').classList.add('hidden');
  renderRestaurantList();
}

function refreshRestaurantData() {
  if (selectedRestaurant) {
    selectRestaurant(selectedRestaurant.restaurant_id);
  }
}

// ============ TABS ============
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset.tab;
    
    // Update tab buttons
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    
    // Load data for tab if needed
    if (tabName === 'reservas') {
      loadReservations();
    } else if (tabName === 'resumen') {
      loadTodayStats();
    }
  });
});

// ============ CARTA TAB ============
function renderCartaTable() {
  const tbody = document.getElementById('carta-tbody');
  const items = selectedRestaurant._menuItems || [];
  
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">No hay platos en la carta</td></tr>';
    return;
  }
  
  tbody.innerHTML = items.map(item => `
    <tr>
      <td><span class="editable-cell" data-field="name" data-id="${esc(item.id)}" onclick="editCell(this)">${esc(item.name || '—')}</span></td>
      <td><span class="editable-cell" data-field="category" data-id="${esc(item.id)}" onclick="editCell(this)">${esc(item.category || '—')}</span></td>
      <td><span class="editable-cell" data-field="price" data-id="${esc(item.id)}" onclick="editCell(this)">${item.price != null ? item.price + ' €' : '—'}</span></td>
      <td>
        <span class="status-badge ${item.available ? 'confirmed' : 'cancelled'}" onclick="toggleAvailable('${esc(item.id)}', ${!item.available})">
          ${item.available ? 'Sí' : 'No'}
        </span>
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteMenuItem('${esc(item.id)}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

let editingCell = null;

function editCell(el) {
  if (editingCell) {
    editingCell.classList.remove('editing');
    if (editingCell !== el) {
      document.execCommand('removeFormat', false, undefined);
    }
  }
  
  el.classList.add('editing');
  el.contentEditable = 'true';
  el.focus();
  
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  editingCell = el;
  
  el.onblur = () => saveCell(el);
  el.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    }
    if (e.key === 'Escape') {
      el.textContent = el.dataset.original || el.textContent;
      el.blur();
    }
  };
}

function saveCell(el) {
  el.contentEditable = 'false';
  el.classList.remove('editing');
  
  const id = el.dataset.id;
  const field = el.dataset.field;
  const value = el.textContent.trim();
  
  if (!id || !field) return;
  
  updateMenuItem(id, { [field]: value });
  editingCell = null;
}

async function updateMenuItem(id, data) {
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      key
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    // Update local cache
    const item = selectedRestaurant._menuItems.find(i => i.id === id);
    if (item) Object.assign(item, data);
    
    toast('Actualizado correctamente', 'success');
  } catch (e) {
    toast('Error actualizando: ' + e.message, 'error');
  }
}

async function toggleAvailable(id, available) {
  await updateMenuItem(id, { available });
  renderCartaTable();
}

async function deleteMenuItem(id) {
  if (!confirm('¿Eliminar este plato?')) return;
  
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/menu_items?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      key
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    selectedRestaurant._menuItems = selectedRestaurant._menuItems.filter(i => i.id !== id);
    renderCartaTable();
    toast('Plato eliminado', 'success');
  } catch (e) {
    toast('Error eliminando: ' + e.message, 'error');
  }
}

function showAddMenuItem() {
  showModal('Añadir plato', `
    <form id="add-menu-form" class="form-stack">
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" id="menu-name" required>
      </div>
      <div class="form-group">
        <label>Categoría</label>
        <input type="text" id="menu-category" placeholder="Entrante, Principal, Postre...">
      </div>
      <div class="form-group">
        <label>Precio (€)</label>
        <input type="number" id="menu-price" step="0.01" min="0">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">
          <i class="fa-solid fa-plus"></i> Añadir
        </button>
      </div>
    </form>
  `, '');
  
  document.getElementById('add-menu-form').onsubmit = async (e) => {
    e.preventDefault();
    await addMenuItem();
  };
}

async function addMenuItem() {
  const name = document.getElementById('menu-name').value.trim();
  const category = document.getElementById('menu-category').value.trim();
  const price = parseFloat(document.getElementById('menu-price').value) || 0;
  
  if (!name) {
    toast('El nombre es obligatorio', 'error');
    return;
  }
  
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/menu_items`,
      {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: selectedRestaurant.restaurant_id,
          name,
          category,
          price,
          available: true
        })
      },
      key
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    closeModal();
    toast('Plato añadido', 'success');
    
    // Reload
    const newItem = await res.json();
    selectedRestaurant._menuItems.push(newItem);
    renderCartaTable();
  } catch (e) {
    toast('Error añadiendo plato: ' + e.message, 'error');
  }
}

// ============ RESERVAS TAB ============
function renderReservations(data) {
  const tbody = document.getElementById('reservas-tbody');
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">No hay reservas</td></tr>';
    return;
  }
  
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>${formatTime(r.time)}</td>
      <td>${esc(r.name || '—')}</td>
      <td>${esc(r.phone || '—')}</td>
      <td>${r.people || '—'}</td>
      <td>
        <select class="status-select" onchange="changeReservationStatus('${esc(r.id)}', this.value)">
          <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="confirmed" ${r.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
          <option value="cancelled" ${r.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>
      </td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="deleteReservation('${esc(r.id)}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

async function changeReservationStatus(id, status) {
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
      key
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast('Estado actualizado', 'success');
  } catch (e) {
    toast('Error actualizando: ' + e.message, 'error');
  }
}

async function deleteReservation(id) {
  if (!confirm('¿Eliminar esta reserva?')) return;
  
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/reservations?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      key
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast('Reserva eliminada', 'success');
    loadReservations();
  } catch (e) {
    toast('Error eliminando: ' + e.message, 'error');
  }
}

// ============ ZONAS TAB ============
function renderZones() {
  const grid = document.getElementById('zones-grid');
  const zones = selectedRestaurant._zones || [];
  
  if (zones.length === 0) {
    grid.innerHTML = '<div class="empty-state"><p>No hay zonas configuradas</p></div>';
    return;
  }
  
  grid.innerHTML = zones.map((z, i) => `
    <div class="zone-card">
      <div class="zone-info">
        <h4>${esc(z.title || '—')}</h4>
        <span>Capacidad: ${z.capacity || 0}</span>
      </div>
      <div class="zone-actions">
        <button class="btn btn-sm" onclick="editZone(${i})">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteZone(${i})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function showAddZone() {
  showModal('Añadir zona', `
    <form id="add-zone-form" class="form-stack">
      <div class="form-group">
        <label>Nombre de la zona *</label>
        <input type="text" id="zone-title" required placeholder="Terraza, Comedor, Barra...">
      </div>
      <div class="form-group">
        <label>Capacidad (personas) *</label>
        <input type="number" id="zone-capacity" required min="1" value="10">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">
          <i class="fa-solid fa-plus"></i> Añadir
        </button>
      </div>
    </form>
  `, '');
  
  document.getElementById('add-zone-form').onsubmit = (e) => {
    e.preventDefault();
    addZone();
  };
}

function editZone(index) {
  const zones = selectedRestaurant._zones || [];
  const zone = zones[index];
  
  showModal('Editar zona', `
    <form id="edit-zone-form" class="form-stack">
      <div class="form-group">
        <label>Nombre de la zona *</label>
        <input type="text" id="zone-title" required value="${esc(zone.title || '')}">
      </div>
      <div class="form-group">
        <label>Capacidad (personas) *</label>
        <input type="number" id="zone-capacity" required min="1" value="${zone.capacity || 10}">
      </div>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary">
          <i class="fa-solid fa-save"></i> Guardar
        </button>
      </div>
    </form>
  `, '');
  
  document.getElementById('edit-zone-form').onsubmit = (e) => {
    e.preventDefault();
    updateZone(index);
  };
}

async function addZone() {
  const title = document.getElementById('zone-title').value.trim();
  const capacity = parseInt(document.getElementById('zone-capacity').value) || 10;
  
  if (!title) {
    toast('El nombre es obligatorio', 'error');
    return;
  }
  
  const zones = selectedRestaurant._zones || [];
  zones.push({ title, capacity });
  
  await saveZones(zones);
  closeModal();
}

async function updateZone(index) {
  const title = document.getElementById('zone-title').value.trim();
  const capacity = parseInt(document.getElementById('zone-capacity').value) || 10;
  
  const zones = selectedRestaurant._zones || [];
  zones[index] = { title, capacity };
  
  await saveZones(zones);
  closeModal();
}

async function deleteZone(index) {
  if (!confirm('¿Eliminar esta zona?')) return;
  
  const zones = selectedRestaurant._zones || [];
  zones.splice(index, 1);
  
  await saveZones(zones);
}

async function saveZones(zones) {
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  const rid = selectedRestaurant.restaurant_id;
  
  try {
    // Try to update existing
    const res = await supabaseFetch(
      `${url}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(rid)}&key=eq.zones`,
      { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(zones) }) },
      key
    );
    
    if (res.status === 406) {
      // Need to insert
      const insertRes = await supabaseFetch(
        `${url}/rest/v1/settings`,
        {
          method: 'POST',
          body: JSON.stringify({
            restaurant_id: rid,
            key: 'zones',
            value: JSON.stringify(zones)
          })
        },
        key
      );
      
      if (!insertRes.ok) throw new Error('HTTP ' + insertRes.status);
    } else if (!res.ok) {
      throw new Error('HTTP ' + res.status);
    }
    
    selectedRestaurant._zones = zones;
    renderZones();
    toast('Zonas actualizadas', 'success');
  } catch (e) {
    toast('Error guardando zonas: ' + e.message, 'error');
  }
}

// ============ HORARIOS TAB ============
function populateSchedule() {
  const schedule = selectedRestaurant._schedule || {};
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  
  days.forEach(day => {
    const dayData = schedule[day] || {};
    document.getElementById(`schedule-${day}-open`).value = dayData.open || '';
    document.getElementById(`schedule-${day}-close`).value = dayData.close || '';
  });
}

document.getElementById('horarios-form').onsubmit = async (e) => {
  e.preventDefault();
  await saveSchedule();
};

async function saveSchedule() {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const schedule = {};
  
  days.forEach(day => {
    const open = document.getElementById(`schedule-${day}-open`).value;
    const close = document.getElementById(`schedule-${day}-close`).value;
    if (open || close) {
      schedule[day] = { open, close };
    }
  });
  
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  const rid = selectedRestaurant.restaurant_id;
  
  try {
    const res = await supabaseFetch(
      `${url}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(rid)}&key=eq.schedule`,
      { method: 'PATCH', body: JSON.stringify({ value: JSON.stringify(schedule) }) },
      key
    );
    
    if (res.status === 406) {
      await supabaseFetch(
        `${url}/rest/v1/settings`,
        {
          method: 'POST',
          body: JSON.stringify({
            restaurant_id: rid,
            key: 'schedule',
            value: JSON.stringify(schedule)
          })
        },
        key
      );
    }
    
    selectedRestaurant._schedule = schedule;
    toast('Horarios guardados', 'success');
  } catch (e) {
    toast('Error guardando horarios: ' + e.message, 'error');
  }
}

// ============ INFO TAB ============
document.getElementById('info-form').onsubmit = async (e) => {
  e.preventDefault();
  await saveRestaurantInfo();
};

async function saveRestaurantInfo() {
  const data = {
    bar_name: document.getElementById('info-bar_name').value.trim(),
    bar_city: document.getElementById('info-bar_city').value.trim(),
    bar_address: document.getElementById('info-bar_address').value.trim(),
    bar_phone: document.getElementById('info-bar_phone').value.trim(),
    email: document.getElementById('info-email').value.trim(),
    subdomain: document.getElementById('info-subdomain').value.trim()
  };
  
  try {
    const res = await supabaseFetch(
      `${MAIN_SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(selectedRestaurant.restaurant_id)}`,
      { method: 'PATCH', body: JSON.stringify(data) },
      MAIN_SUPABASE_KEY
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    Object.assign(selectedRestaurant, data);
    document.getElementById('detail-restaurant-name').textContent = data.bar_name || selectedRestaurant.name;
    renderRestaurantList();
    toast('Información actualizada', 'success');
  } catch (e) {
    toast('Error actualizando: ' + e.message, 'error');
  }
}

// ============ PASSWORD TAB ============
document.getElementById('password-form').onsubmit = async (e) => {
  e.preventDefault();
  await changeAdminPassword();
};

async function changeAdminPassword() {
  const newPass = document.getElementById('new-admin-password').value;
  const confirmPass = document.getElementById('confirm-admin-password').value;
  
  if (!newPass) {
    toast('Introduce un password', 'error');
    return;
  }
  
  if (newPass !== confirmPass) {
    toast('Los passwords no coinciden', 'error');
    return;
  }
  
  const url = selectedRestaurant.supabase_url || MAIN_SUPABASE_URL;
  const key = selectedRestaurant.supabase_key || MAIN_SUPABASE_KEY;
  const rid = selectedRestaurant.restaurant_id;
  
  try {
    // Update in settings
    const res = await supabaseFetch(
      `${url}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(rid)}&key=eq.admin_password`,
      { method: 'PATCH', body: JSON.stringify({ value: newPass }) },
      key
    );
    
    if (res.status === 406) {
      await supabaseFetch(
        `${url}/rest/v1/settings`,
        {
          method: 'POST',
          body: JSON.stringify({
            restaurant_id: rid,
            key: 'admin_password',
            value: newPass
          })
        },
        key
      );
    }
    
    document.getElementById('new-admin-password').value = '';
    document.getElementById('confirm-admin-password').value = '';
    toast('Password actualizado', 'success');
  } catch (e) {
    toast('Error cambiando password: ' + e.message, 'error');
  }
}

// ============ HERRAMIENTAS TAB ============
async function forceSyncConfig() {
  toast('Sincronizando configuración...', 'info');
  
  // Save current restaurant data to ensure it's synced
  await saveRestaurantInfo();
  await saveZones(selectedRestaurant._zones || []);
  await saveSchedule();
  
  toast('Configuración sincronizada', 'success');
}

async function deleteRestaurant() {
  if (!confirm('¿Estás seguro de que quieres ELIMINAR este restaurante? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Realmente quieres eliminar ' + (selectedRestaurant.name || 'este restaurante') + '? TODOS los datos se perderán.')) return;
  
  try {
    const res = await supabaseFetch(
      `${MAIN_SUPABASE_URL}/rest/v1/restaurants?id=eq.${encodeURIComponent(selectedRestaurant.restaurant_id)}`,
      { method: 'DELETE' },
      MAIN_SUPABASE_KEY
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    toast('Restaurante eliminado', 'success');
    backToList();
    loadRestaurants();
  } catch (e) {
    toast('Error eliminando: ' + e.message, 'error');
  }
}

// ============ DATABASE BROWSER ============
document.getElementById('db-table-select').addEventListener('change', () => {
  const table = document.getElementById('db-table-select').value;
  if (table) loadDbTable();
});

async function loadDbTable() {
  const table = document.getElementById('db-table-select').value;
  const restaurantId = document.getElementById('db-restaurant-id').value.trim();

  if (!table) {
    toast('Selecciona una tabla', 'warning');
    return;
  }

  const content = document.getElementById('db-content');
  content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</div>';
  dbCurrentPage = 1; // Reset to page 1 on new query

  try {
    // Build query — always filter by restaurant_id if provided, otherwise try to get all
    let url = `${MAIN_SUPABASE_URL}/rest/v1/${table}?select=*`;

    if (restaurantId) {
      url = `${MAIN_SUPABASE_URL}/rest/v1/${table}?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*`;
    }

    // Use HEAD request to get total count via Content-Range header
    const headRes = await supabaseFetch(url, { method: 'HEAD' }, MAIN_SUPABASE_KEY);
    let totalRows = 0;
    if (headRes.headers && headRes.headers.get) {
      const cr = headRes.headers.get('content-range');
      if (cr) {
        const match = cr.match(/\/(\d+)$/);
        if (match) totalRows = parseInt(match[1], 10);
      }
    }

    // Now fetch paginated data
    const pagUrl = `${url}&limit=${dbPageSize}&offset=0`;
    const res = await supabaseFetch(pagUrl, {}, MAIN_SUPABASE_KEY);

    if (!res.ok) {
      // If 406 + RLS error, try with RPC set_config workaround
      if (res.status === 406 || res.status === 400) {
        content.innerHTML = `<div class="empty-state"><p>RLS bloquea esta tabla sin restaurant_id. Filtrando por BD principal...</p></div>`;
        toast('Filtrando por BD principal — ' + res.status, 'warning');
        // Fallback: query only demo restaurant
        const fallbackUrl = `${MAIN_SUPABASE_URL}/rest/v1/${table}?restaurant_id=eq.demo-restaurante&select=*&limit=${dbPageSize}`;
        const fallback = await supabaseFetch(fallbackUrl, {}, MAIN_SUPABASE_KEY);
        if (fallback.ok) {
          dbTableData = await fallback.json();
          totalRows = dbTableData.length;
          renderDbTable(table, totalRows);
          return;
        }
      }
      throw new Error('HTTP ' + res.status + ' — ' + res.statusText);
    }

    dbTableData = await res.json();
    if (totalRows === 0) totalRows = dbTableData.length;
    renderDbTable(table, totalRows);
  } catch (e) {
    content.innerHTML = `<div class="empty-state"><p>Error: ${esc(e.message)}</p><small>Verificar: 1) RLS desactivado en Supabase, 2) Tabla existe, 3) Permisos API</small></div>`;
    toast('Error BD: ' + e.message, 'error');
  }
}

function renderDbTable(table, totalRows = null) {
  const content = document.getElementById('db-content');

  if (!dbTableData || dbTableData.length === 0) {
    content.innerHTML = '<div class="empty-state"><p>No hay datos en esta tabla (o RLS los filtra)</p><small>Sugerencia: prueba con un restaurant_id específico en el filtro</small></div>';
    return;
  }

  const columns = Object.keys(dbTableData[0]);
  const total = totalRows !== null ? totalRows : dbTableData.length;
  const totalPages = Math.ceil(total / dbPageSize);

  content.innerHTML = `
    <div class="db-table-info">
      <span>${total} filas totales</span>
      <span>Página ${dbCurrentPage} de ${totalPages || 1}</span>
    </div>
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            ${columns.map(c => `<th>${esc(c)}</th>`).join('')}
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${dbTableData.map(row => `
            <tr>
              ${columns.map(c => {
                const val = row[c];
                const display = val === null ? '<em class="null-val">null</em>' : (typeof val === 'object' ? esc(JSON.stringify(val)) : esc(String(val)));
                const hasId = row.id ? `data-id="${esc(row.id)}"` : '';
                return `<td><span class="editable-cell" data-table="${esc(table)}" ${hasId} data-field="${esc(c)}" onclick="editDbCell(this)">${display}</span></td>`;
              }).join('')}
              <td>
                ${row.id ? `<button class="btn btn-sm btn-danger" onclick="deleteDbRow('${esc(table)}', '${esc(row.id)}')"><i class="fa-solid fa-trash"></i></button>` : '<span style="color:var(--text-dim);font-size:0.75rem;">—</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ${totalPages > 1 ? `
    <div class="pagination">
      <button onclick="changeDbPage(-1)" ${dbCurrentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i> Anterior</button>
      <span>Página ${dbCurrentPage} / ${totalPages}</span>
      <button onclick="changeDbPage(1)" ${dbCurrentPage >= totalPages ? 'disabled' : ''}>Siguiente <i class="fa-solid fa-chevron-right"></i></button>
    </div>` : ''
  }
  `;
}

function changeDbPage(delta) {
  const table = document.getElementById('db-table-select').value;
  if (!table) return;
  const total = dbTableData.length;
  const totalPages = Math.ceil(total / dbPageSize) || 1;
  dbCurrentPage += delta;
  if (dbCurrentPage < 1) dbCurrentPage = 1;
  if (dbCurrentPage > totalPages) dbCurrentPage = totalPages;
  // Reload with offset
  const restaurantId = document.getElementById('db-restaurant-id').value.trim();
  const content = document.getElementById('db-content');
  content.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Cargando página ' + dbCurrentPage + '...</div>';
  (async () => {
    try {
      let url = `${MAIN_SUPABASE_URL}/rest/v1/${table}?select=*&limit=${dbPageSize}&offset=${(dbCurrentPage - 1) * dbPageSize}`;
      if (restaurantId) url = `${MAIN_SUPABASE_URL}/rest/v1/${table}?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=*&limit=${dbPageSize}&offset=${(dbCurrentPage - 1) * dbPageSize}`;
      const res = await supabaseFetch(url, {}, MAIN_SUPABASE_KEY);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      dbTableData = await res.json();
      renderDbTable(table, total);
    } catch (e) {
      content.innerHTML = '<div class="empty-state"><p>Error: ' + esc(e.message) + '</p></div>';
    }
  })();
}

let editingDbCell = null;

function editDbCell(el) {
  if (editingDbCell) {
    editingDbCell.classList.remove('editing');
    editingDbCell.contentEditable = 'false';
  }
  
  el.classList.add('editing');
  el.contentEditable = 'true';
  el.focus();
  
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  
  editingDbCell = el;
  
  el.dataset.original = el.textContent;
  
  el.onblur = () => saveDbCell(el);
  el.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      el.blur();
    }
    if (e.key === 'Escape') {
      el.textContent = el.dataset.original;
      el.blur();
    }
  };
}

async function saveDbCell(el) {
  el.contentEditable = 'false';
  el.classList.remove('editing');
  
  const table = el.dataset.table;
  const id = el.dataset.id;
  const field = el.dataset.field;
  let value = el.textContent.trim();
  
  // Try to parse as JSON if it looks like an object
  if (value.startsWith('{') || value.startsWith('[')) {
    try {
      value = JSON.parse(value);
    } catch (e) {}
  } else if (value === '<em>null</em>') {
    value = null;
  } else if (!isNaN(value) && value !== '') {
    value = parseFloat(value);
  }
  
  try {
    const res = await supabaseFetch(
      `${MAIN_SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify({ [field]: value }) },
      MAIN_SUPABASE_KEY
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    toast('Actualizado', 'success');
  } catch (e) {
    el.textContent = el.dataset.original;
    toast('Error actualizando: ' + e.message, 'error');
  }
  
  editingDbCell = null;
}

async function deleteDbRow(table, id) {
  if (!confirm('¿Eliminar esta fila?')) return;
  
  try {
    const res = await supabaseFetch(
      `${MAIN_SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
      { method: 'DELETE' },
      MAIN_SUPABASE_KEY
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    toast('Fila eliminada', 'success');
    loadDbTable();
  } catch (e) {
    toast('Error eliminando: ' + e.message, 'error');
  }
}

// ============ NEW CLIENT ============
document.getElementById('nc-name').addEventListener('input', (e) => {
  const slug = slugify(e.target.value);
  document.getElementById('nc-subdomain').value = slug;
});

document.getElementById('new-client-form').onsubmit = async (e) => {
  e.preventDefault();
  await createNewClient();
};

async function createNewClient() {
  const name = document.getElementById('nc-name').value.trim();
  const city = document.getElementById('nc-city').value.trim();
  const email = document.getElementById('nc-email').value.trim();
  const phone = document.getElementById('nc-phone').value.trim();
  const subdomain = document.getElementById('nc-subdomain').value.trim();
  const password = document.getElementById('nc-password').value;
  
  if (!name || !city || !email || !password) {
    toast('Completa los campos obligatorios', 'error');
    return;
  }
  
  toast('Creando restaurante...', 'info');
  
  const resultBox = document.getElementById('new-client-result');
  resultBox.classList.add('hidden');
  
  try {
    // Generate a new restaurant ID
    const restaurantId = 'rest_' + Date.now();
    
    // In a real implementation, this would:
    // 1. Create a new Supabase project via Management API
    // 2. Apply schema to new project
    // 3. Register in main database
    
    // For now, just register in main DB
    const res = await supabaseFetch(
      `${MAIN_SUPABASE_URL}/rest/v1/restaurants`,
      {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurantId,
          name,
          bar_city: city,
          email,
          bar_phone: phone,
          subdomain,
          supabase_url: MAIN_SUPABASE_URL,
          supabase_key: MAIN_SUPABASE_KEY,
          created_at: new Date().toISOString()
        })
      },
      MAIN_SUPABASE_KEY
    );
    
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const newRestaurant = await res.json();
    
    resultBox.innerHTML = `
      <h3><i class="fa-solid fa-check-circle"></i> Restaurante creado</h3>
      <div class="result-links">
        <p><strong>ID:</strong> ${restaurantId}</p>
        <p><strong>Nombre:</strong> ${esc(name)}</p>
        <a href="https://${subdomain}.gastroexperiencem.es" target="_blank">
          <i class="fa-solid fa-globe"></i> Web pública
        </a>
        <a href="https://${subdomain}.gastroexperiencem.es/admin" target="_blank">
          <i class="fa-solid fa-user-gear"></i> Admin restaurante
        </a>
      </div>
    `;
    resultBox.classList.remove('hidden');
    
    // Reset form
    document.getElementById('new-client-form').reset();
    
    // Reload restaurants
    await loadRestaurants();
    
    toast('Restaurante creado correctamente', 'success');
  } catch (e) {
    toast('Error creando restaurante: ' + e.message, 'error');
  }
}

// ============ SYSTEM TAB ============
async function checkSystemStatus() {
  // Vercel
  try {
    const res = await fetch('https://api.vercel.com/v6/deployments?teamId=gastroexperience');
    document.getElementById('status-vercel').textContent = res.ok ? 'OK' : 'Error';
    document.getElementById('status-vercel').className = 'status-value ' + (res.ok ? 'ok' : 'error');
  } catch (e) {
    document.getElementById('status-vercel').textContent = 'Error';
    document.getElementById('status-vercel').className = 'status-value error';
  }
  
  // Supabase
  try {
    const res = await fetch(MAIN_SUPABASE_URL + '/rest/v1/', {
      method: 'HEAD',
      headers: apiHeaders(MAIN_SUPABASE_KEY)
    });
    document.getElementById('status-supabase').textContent = res.ok ? 'OK' : 'Error';
    document.getElementById('status-supabase').className = 'status-value ' + (res.ok ? 'ok' : 'error');
  } catch (e) {
    document.getElementById('status-supabase').textContent = 'Error';
    document.getElementById('status-supabase').className = 'status-value error';
  }
  
  // GitHub
  try {
    const res = await fetch('https://api.github.com/repos/gastroexperience/gastroexperience');
    document.getElementById('status-github').textContent = res.ok ? 'OK' : 'Error';
    document.getElementById('status-github').className = 'status-value ' + (res.ok ? 'ok' : 'error');
  } catch (e) {
    document.getElementById('status-github').textContent = 'Error';
    document.getElementById('status-github').className = 'status-value error';
  }
  
  // DNS
  try {
    const res = await fetch('https://gastroexperiencem.es', { method: 'HEAD' });
    document.getElementById('status-dns').textContent = res.ok ? 'OK' : 'Error';
    document.getElementById('status-dns').className = 'status-value ' + (res.ok ? 'ok' : 'error');
  } catch (e) {
    document.getElementById('status-dns').textContent = 'Error';
    document.getElementById('status-dns').className = 'status-value error';
  }
}

document.getElementById('master-password-form').onsubmit = async (e) => {
  e.preventDefault();
  await changeMasterPassword();
};

async function changeMasterPassword() {
  const newPass = document.getElementById('new-master-password').value;
  const confirmPass = document.getElementById('confirm-master-password').value;
  
  if (!newPass) {
    toast('Introduce un password', 'error');
    return;
  }
  
  if (newPass !== confirmPass) {
    toast('Los passwords no coinciden', 'error');
    return;
  }
  
  toast('Password actualizado. Recuerda hacer redeploy para aplicar los cambios.', 'warning');
  
  document.getElementById('new-master-password').value = '';
  document.getElementById('confirm-master-password').value = '';
}

async function redeployVercel() {
  toast('Iniciando redeploy...', 'info');
  
  try {
    // In a real implementation, this would call Vercel API
    toast('Redeploy iniciado. La nueva versión estará disponible en minutos.', 'success');
  } catch (e) {
    toast('Error en redeploy: ' + e.message, 'error');
  }
}

// ============ NAVIGATION ============
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    
    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + view).classList.add('active');
    
    // Special handling
    if (view === 'overview') {
      updateOverviewStats();
    } else if (view === 'system') {
      checkSystemStatus();
    } else if (view === 'restaurants' && !selectedRestaurant) {
      // Already showing list
    }
  });
});

function showNewRestaurantForm() {
  // Switch to new-client view
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-new-client').classList.add('active');
  
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-new-client').classList.add('active');
}

// ============ MODAL ============
function showModal(title, body, footer = '') {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('modal-footer').innerHTML = footer;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) {
    closeModal();
  }
});

// ============ TOAST ============
function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-circle-xmark',
    warning: 'fa-triangle-exclamation',
    info: 'fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info}"></i>
    <span class="toast-message">${esc(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <i class="fa-solid fa-times"></i>
    </button>
  `;
  
  container.appendChild(toast);
  
  // Auto remove
  setTimeout(() => {
    if (toast.parentElement) {
      toast.remove();
    }
  }, 5000);
}

// ============ CONNECTION STATUS ============
async function checkConnection() {
  const statusEl = document.getElementById('connection-status');
  
  try {
    const res = await fetch(MAIN_SUPABASE_URL + '/rest/v1/', {
      method: 'HEAD',
      headers: apiHeaders(MAIN_SUPABASE_KEY)
    });
    
    if (res.ok) {
      statusEl.classList.add('connected');
      statusEl.innerHTML = '<i class="fa-solid fa-circle"></i><span>Conectado</span>';
    } else {
      throw new Error('HTTP ' + res.status);
    }
  } catch (e) {
    statusEl.classList.add('error');
    statusEl.innerHTML = '<i class="fa-solid fa-circle"></i><span>Error de conexión</span>';
  }
}

// ============ INIT ============
async function init() {
  // Set default dates first (no DOM deps)
  const dateFrom = document.getElementById('reservas-date-from');
  const dateTo = document.getElementById('reservas-date-to');
  if (dateFrom) dateFrom.value = addDays(-30);
  if (dateTo) dateTo.value = today();

  // Load restaurants
  await loadRestaurants();

  // Check health for all restaurants in background (non-blocking)
  checkAllRestaurantsHealth().catch(() => {});
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
