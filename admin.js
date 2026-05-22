// admin.js — GastroExperience
const RID = APP_CONFIG.restaurantId;
const db  = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
const ALLERGENS = ['gluten','crustaceos','huevos','pescado','cacahuetes','soja','lacteos','frutos_cascara','apio','mostaza','sesamo','azufre','altramuces','moluscos','setas'];
const ALLERGEN_NAMES = {gluten:'Gluten',crustaceos:'Crustáceos',huevos:'Huevos',pescado:'Pescado',cacahuetes:'Cacahuetes',soja:'Soja',lacteos:'Lácteos',frutos_cascara:'Frutos secos',apio:'Apio',mostaza:'Mostaza',sesamo:'Sésamo',azufre:'Azufre',altramuces:'Altramuces',moluscos:'Moluscos',setas:'Setas'};

// ── Config UI ────────────────────────────────────────────
document.getElementById('login-bar-name').textContent = APP_CONFIG.barName;
document.getElementById('admin-bar-label').textContent = APP_CONFIG.barName;
document.title = `Admin | ${APP_CONFIG.barName}`;

// Rellenar categorías en selects
const CATEGORIES = APP_CONFIG.menuCategories.map(c => ({ id: c.id, label: c.label }));
['category-filter','p-category'].forEach(id => {
  const el = document.getElementById(id);
  if (!el) return;
  CATEGORIES.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; el.appendChild(o); });
});

// Allergens grid en modal
const ag = document.getElementById('allergens-grid');
ALLERGENS.forEach(a => {
  ag.innerHTML += `<div class="checkbox-group"><input type="checkbox" id="a-${a}"><label for="a-${a}">${ALLERGEN_NAMES[a]}</label></div>`;
});

// Stat cards para zonas
const zsc = document.getElementById('zone-stats-container');
APP_CONFIG.zones.forEach(z => {
  zsc.innerHTML += `<div class="stat-card"><h3>${z.title}</h3><p id="count-${z.id}">0</p><div style="width:100%;height:6px;background:var(--surface-3);border-radius:3px;margin-top:8px;overflow:hidden;"><div id="bar-${z.id}" style="width:0%;height:100%;background:var(--gold);transition:width 0.5s;"></div></div></div>`;
});

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
const pwInput      = document.getElementById('admin-password');
async function checkLogin() {
  const inputVal = pwInput.value.trim();
  
  // Primero comprobamos si hay contraseña en BD
  let dbPass = null;
  try {
    const { data } = await db.from('settings').select('value').eq('restaurant_id', RID).eq('key', 'admin_password').maybeSingle();
    dbPass = data;
  } catch(e) { console.warn('DB pass fetch error', e); }
  const validPasswords = dbPass ? [dbPass.value] : APP_CONFIG.adminPasswords;

  if (validPasswords.includes(inputVal)) {
    sessionStorage.setItem('admin_auth','true');
    loginOverlay.classList.add('login-hide');
    const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'metrics';
    const map = { reservations: loadDashboard, menu: loadProducts, schedule: loadSchedule, categories: loadCategories, config: loadConfigTab, qr: loadQR, metrics: loadMetrics, tables: loadTablesMap, business: loadBusinessTab, integrations: loadIntegrations };
    if (map[activeTab]) map[activeTab]();
    checkOnboarding();
  } else {
    pwInput.classList.add('shake');
    pwInput.value = '';
    setTimeout(() => pwInput.classList.remove('shake'), 500);
  }
}
document.getElementById('login-btn').onclick = checkLogin;
pwInput.onkeydown = e => { if(e.key==='Enter') checkLogin(); };
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('admin_auth') === 'true') {
    console.log('Autologin: Restaurando sesión desde sessionStorage');
    loginOverlay.classList.add('login-hide');
    const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'metrics';
    const map = { reservations: loadDashboard, menu: loadProducts, schedule: loadSchedule, categories: loadCategories, config: loadConfigTab, qr: loadQR, metrics: loadMetrics, tables: loadTablesMap, business: loadBusinessTab, integrations: loadIntegrations };
    if (map[activeTab]) {
      console.log('Autologin: Cargando pestaña ' + activeTab);
      map[activeTab]();
    }
    checkOnboarding();
    resetSessionTimeout();
  }
});

// ── Seguridad Ligera: Timeout de sesión ────────────────────
let sessionTimer;
let lastSessionReset = 0;
function resetSessionTimeout() {
  const now = Date.now();
  if (now - lastSessionReset < 2000) return;
  lastSessionReset = now;
  clearTimeout(sessionTimer);
  if (sessionStorage.getItem('admin_auth') === 'true') {
    sessionTimer = setTimeout(() => {
      sessionStorage.removeItem('admin_auth');
      toast('Sesión caducada por inactividad', 'warning');
      setTimeout(() => window.location.reload(), 1500);
    }, 15 * 60 * 1000); // 15 min
  }
}
document.addEventListener('mousemove', resetSessionTimeout);
document.addEventListener('keydown', resetSessionTimeout);
document.addEventListener('touchstart', resetSessionTimeout);

// ── WebSockets ───────────────────────────────────────────
db.channel('public:reservations')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `restaurant_id=eq.${RID}` }, () => {
    if(document.getElementById('tab-app-dashboard').classList.contains('active-tab')) loadMetrics(); // Update badges on home
    if(document.getElementById('tab-reservations').classList.contains('active-tab')) loadDashboard();
    if(document.getElementById('tab-metrics').classList.contains('active-tab')) loadMetrics();
  }).subscribe();

db.channel('public:menu_items')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${RID}` }, () => {
    if(document.getElementById('tab-menu').classList.contains('active-tab')) loadProducts();
  }).subscribe();

// ── Nav tabs ──────────────────────────────────────────────
window.openTab = (tabId) => {
  const tab = document.querySelector(`.nav-tab[data-tab="${tabId}"]`);
  if (!tab) return;
  
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-tab'));
  
  tab.classList.add('active');
  document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active-tab');
  
  const map = { 
    reservations: loadDashboard, menu: loadProducts, schedule: loadSchedule, 
    categories: loadCategories, config: loadConfigTab, qr: loadQR, 
    metrics: loadMetrics, tables: loadTablesMap, business: loadBusinessTab, 
    integrations: loadIntegrations 
  };
  if (map[tab.dataset.tab]) map[tab.dataset.tab]();
  
  // En móvil, manejar botón de volver
  const backBtn = document.getElementById('back-to-dashboard');
  if (backBtn) {
    if (window.innerWidth <= 992) {
      backBtn.style.display = (tab.dataset.tab === 'app-dashboard') ? 'none' : 'flex';
      // Si entramos en una sección, ocultamos el título principal para ganar espacio
      if (tab.dataset.tab !== 'app-dashboard') {
        document.getElementById('admin-title').style.fontSize = '0.9rem';
      } else {
        document.getElementById('admin-title').style.fontSize = '';
      }
    } else {
      backBtn.style.display = 'none';
    }
  }
};

document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.onclick = () => openTab(tab.dataset.tab);
});

document.getElementById('back-to-dashboard').onclick = () => openTab('app-dashboard');

// ── RESERVAS ──────────────────────────────────────────────
const dateInput = document.getElementById('admin-date-select');
dateInput.value = ''; // Por defecto vacío para mostrar todas las pendientes
dateInput.onchange = loadDashboard;

let resStatusFilter = null; // null, 'pending', 'confirmed'

async function loadDashboard() {
  const btn = document.getElementById('refresh-btn');
  let orig = '';
  if (btn) {
    orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
  }

  if (!tablesData || tablesData.length === 0) {
    const tRes = await db.from('settings').select('value').eq('restaurant_id', RID).eq('key', 'tables_map').maybeSingle();
    if (tRes.data && tRes.data.value) tablesData = JSON.parse(tRes.data.value);
  }

  let query = db.from('reservations').select('*').eq('restaurant_id', RID).neq('status', 'cancelled');
  
  if (dateInput.value) {
    query = query.eq('date', dateInput.value).order('time');
    if (resStatusFilter) query = query.eq('status', resStatusFilter);
  } else {
    // Si no hay fecha, mostramos desde hoy en adelante (hora local)
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const today = new Date(Date.now() - tzOffset).toISOString().split('T')[0];
    query = query.gte('date', today).order('date').order('time');
    if (resStatusFilter) query = query.eq('status', resStatusFilter);
    else query = query.eq('status', 'pending'); // Por defecto pendientes
  }
  
  try {
    const { data, error } = await query;
    if (error) throw error;
    updateStats(data || []);
    renderTable(data || []);
  } catch (err) {
    console.error('Error cargando reservas:', err);
    toast('Error al cargar reservas. Reintenta.', 'error');
  } finally {
    if (btn) btn.innerHTML = orig;
  }
}

// Botones de filtro de reservas
document.getElementById('refresh-btn').onclick = loadDashboard;

document.getElementById('view-all-btn').onclick = () => {
  dateInput.value = '';
  resStatusFilter = 'pending';
  loadDashboard();
};

document.getElementById('view-confirmed-btn').onclick = () => {
  dateInput.value = '';
  resStatusFilter = 'confirmed';
  loadDashboard();
};

document.getElementById('clear-btn').onclick = async () => {
  const d = dateInput.value;
  if (!d) { toast('Selecciona una fecha específica primero', 'error'); return; }
  if (confirm(`¿Bloquear el día ${d} para no recibir más reservas?`)) {
    try {
      const { error } = await db.from('special_days').upsert({ restaurant_id: RID, date: d, is_closed: true }, { onConflict: 'restaurant_id,date' });
      if (error) throw error;
      toast(`Día ${d} bloqueado`, 'success');
    } catch(err) {
      console.error('Error bloqueando día:', err);
      toast('Error al bloquear día: ' + err.message, 'error');
    }
  }
};

document.getElementById('add-manual-res-btn').onclick = () => {
  window.open('reservas.html?ref=walk-in', '_blank');
};

document.getElementById('search-reservations').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#reservations-body tr');
  rows.forEach(row => {
    row.style.display = row.innerText.toLowerCase().includes(term) ? '' : 'none';
  });
});

document.getElementById('export-csv-btn').onclick = async () => {
  const d = dateInput.value;
  let query = db.from('reservations').select('*').eq('restaurant_id', RID).order('time');
  if (d) query = query.eq('date', d);
  const { data } = await query;
  if (!data || !data.length) { toast('No hay datos para exportar', 'info'); return; }
  
  const headers = ['Fecha', 'Hora', 'Nombre', 'Telefono', 'Pax', 'Zona', 'Estado'];
  const rows = data.map(r => [r.date, r.time, `"${r.name}"`, r.phone, r.people, r.zonename||r.zone, r.status]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reservas_${d||'todas'}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

function updateStats(res) {
  document.getElementById('total-count').textContent  = res.length;
  document.getElementById('total-people').textContent = res.reduce((s,r) => s + parseInt(r.people||0), 0);
  APP_CONFIG.zones.forEach(z => {
    const el = document.getElementById(`count-${z.id}`);
    const bar = document.getElementById(`bar-${z.id}`);
    const pax = res.filter(r => r.zone === z.id).reduce((s,r) => s + parseInt(r.people||0), 0);
    const capacity = z.capacity || 1;
    const pct = Math.min(100, Math.round((pax/capacity)*100));
    
    if (el) el.innerHTML = `${pax} pax <span style="font-size:0.8rem; color:var(--text-dim);">(${pct}%)</span>`;
    if (bar) {
      bar.style.width = `${pct}%`;
      bar.style.background = pct >= 100 ? 'var(--error)' : (pct >= 80 ? 'var(--warning)' : 'var(--gold)');
    }
  });
}

function renderTable(res) {
  const tbody = document.getElementById('reservations-body');
  const noMsg = document.getElementById('no-data-message');
  const tableContainer = document.querySelector('#tab-reservations .table-container');
  const thead = tbody.closest('table').querySelector('thead tr');
  if (thead) thead.innerHTML = '<th>Origen</th><th>Hora</th><th>Fecha</th><th>Cliente</th><th>Pax</th><th>Zona</th><th>Mesa</th><th>Contacto</th><th>Estado</th><th style="text-align:right;">Acciones</th>';
  
  tbody.innerHTML = '';
  if (res.length === 0) {
    if(noMsg) noMsg.style.display = 'block';
    if(tableContainer) tableContainer.style.display = 'none';
  } else {
    if(noMsg) noMsg.style.display = 'none';
    if(tableContainer) tableContainer.style.display = 'block';
  }
  res.forEach(r => {
    const sourceIcons = {
      'web': '<i class="fas fa-globe" title="Web" style="color:var(--gold);"></i>',
      'google': '<i class="fab fa-google" title="Google Maps" style="color:#4285F4;"></i>',
      'phone': '<i class="fas fa-phone-alt" title="Teléfono" style="color:var(--info);"></i>',
      'walk-in': '<i class="fas fa-walking" title="Presencial" style="color:var(--success);"></i>'
    };
    const sourceIcon = sourceIcons[r.source] || '<i class="fas fa-globe" title="Web" style="color:var(--gold);"></i>';
    const confirmed = r.status === 'confirmed';

    let tableOptions = '<option value="">Sin asignar</option>';
    if (tablesData && tablesData.length > 0) {
      const zoneTables = tablesData.filter(t => t.zone === r.zone);
      zoneTables.forEach((t) => {
        const tIndex = tablesData.indexOf(t);
        const isSelected = r.notes === `TABLE:${tIndex}` ? 'selected' : '';
        tableOptions += `<option value="${tIndex}" ${isSelected}>${t.name} (${t.capacity} pax)</option>`;
      });
    }
    const tableSelectHtml = `<select class="table-assign-select" data-id="${r.id}" style="padding:4px; border-radius:4px; border:1px solid var(--border); font-size:0.8rem; background:var(--surface);">${tableOptions}</select>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;">${sourceIcon}</td>
      <td><strong>${r.time}</strong></td>
      <td style="font-size:0.8rem;color:var(--text-dim);">${r.date}</td>
      <td><strong>${r.name}</strong></td>
      <td>${r.people || 0}</td>
      <td><span class="zone-tag ${r.zone==='terrace'?'zone-terrace':''}">${r.zonename||r.zone}</span></td>
      <td>${tableSelectHtml}</td>
      <td><div style="font-size:0.85rem;">${r.phone}</div><div style="font-size:0.72rem;color:var(--text-dim);">${r.email}</div></td>
      <td><span class="status-badge ${r.status}">${confirmed?'Confirmada':'Pendiente'}</span></td>
      <td style="text-align:right;display:flex;gap:6px;justify-content:flex-end;">
        ${confirmed
          ? '<button class="action-btn notified" disabled><i class="fas fa-check"></i> Confirmado</button>'
          : `<button class="action-btn confirm-res-btn" data-id="${r.id}" data-email="${r.email}" data-name="${r.name}" data-date="${r.date}" data-time="${r.time}" data-people="${r.people}" data-zone="${r.zone}"><i class="fas fa-check"></i> Confirmar</button>`}
        <button class="action-btn delete-btn" data-id="${r.id}"><i class="fas fa-trash"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Delegación de eventos para botones
  tbody.querySelectorAll('.table-assign-select').forEach(sel => {
    sel.onchange = async () => {
      const val = sel.value;
      const resId = sel.dataset.id;
      const notesVal = val !== "" ? `TABLE:${val}` : null;
      await db.from('reservations').update({ notes: notesVal }).eq('id', resId);
      toast('Mesa asignada ✓', 'success');
    };
  });
  tbody.querySelectorAll('.confirm-res-btn').forEach(btn => {
    btn.onclick = () => {
      const { id, email, name, date, time, people, zone } = btn.dataset;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirmando...'; 
      btn.disabled = true;
      confirmReservation(id, email, name, date, time, people, zone).finally(() => {
        btn.innerHTML = '<i class="fas fa-check"></i> Confirmar';
        btn.disabled = false;
      });
    };
  });
  tbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.onclick = () => {
      const origHtml = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      btn.disabled = true;
      deleteReservation(btn.dataset.id).finally(() => {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      });
    };
  });
}

async function confirmReservation(id, email, name, date, time, people, zone) {
  if (!confirm(`¿Confirmar reserva de ${name}?`)) return;
  
  try {
    // Buscar asignación de mesa automática
    let notesVal = null;
    if (tablesData && tablesData.length > 0) {
      // Fetch all reservations for that day to find occupied tables
      const { data: dayRes } = await db.from('reservations').select('notes, time').eq('date', date).eq('restaurant_id', RID);
      const occupiedAtTime = (dayRes || []).filter(r => r.time === time && r.notes && r.notes.startsWith('TABLE:')).map(r => parseInt(r.notes.split(':')[1]));
      
      const pax = parseInt(people || 0);
      const possibleTables = tablesData.map((t, idx) => ({...t, idx})).filter(t => t.zone === zone && !occupiedAtTime.includes(t.idx) && t.capacity >= pax).sort((a,b) => a.capacity - b.capacity);
      
      if (possibleTables.length > 0) {
        notesVal = `TABLE:${possibleTables[0].idx}`;
      }
    }

    // 1. Actualizar estado en DB primero y notas (mesa)
    const updatePayload = { status: 'confirmed' };
    if (notesVal) updatePayload.notes = notesVal;

    const { error: updErr } = await db.from('reservations').update(updatePayload).eq('id', id).eq('restaurant_id', RID);
    if (updErr) throw updErr;
    
    toast(notesVal ? 'Reserva confirmada y mesa auto-asignada ✓' : 'Reserva confirmada ✓', 'success');
    loadDashboard(); // Refrescar UI inmediatamente

    // 2. Intentar enviar Email (opcional si falla)
    const { data: cfg } = await db.from('settings').select('*').eq('restaurant_id', RID);
    const get = k => cfg?.find(s => s.key === k)?.value;
    const pub = get('ejs_public_key'), svc = get('ejs_service_id'), tpl = get('ejs_template_client');
    
    if (pub && svc && tpl) {
      if (email && email.includes('@')) {
        try {
          emailjs.init(pub);
          await emailjs.send(svc, tpl, { 
            to_name: name, to_email: email, client_email: email, 
            reservation_date: date, reservation_time: time, 
            bar_name: APP_CONFIG.barName 
          });
          toast('Email de confirmación enviado', 'success');
        } catch(e) { 
          console.warn('EmailJS error:', e);
          toast('Reserva confirmada, pero falló el envío del email', 'warning');
        }
      } else {
        toast('Confirmada (Cliente sin email)', 'info');
      }
    }
  } catch(err) {
    console.error('Error al confirmar:', err);
    toast('Error: ' + (err.message || 'No se pudo completar la acción'), 'error');
  }
}

async function deleteReservation(id) {
  if (!confirm('¿Eliminar esta reserva definitivamente?')) return;
  
  try {
    const { error } = await db.from('reservations').delete().eq('id', id).eq('restaurant_id', RID);
    if (error) throw error;
    
    toast('Reserva eliminada con éxito','info');
    loadDashboard();
  } catch(err) {
    console.error('Error al eliminar:', err);
    toast('No se pudo eliminar: ' + err.message, 'error');
  }
}

// ── RESERVA MANUAL ────────────────────────────────────────
const resModal = document.getElementById('reservation-modal');
if (document.getElementById('add-manual-res-btn')) {
  document.getElementById('add-manual-res-btn').onclick = () => {
    const sel = document.getElementById('m-zone');
    sel.innerHTML = '';
    const zones = (typeof zonesData !== 'undefined' && zonesData.length > 0) ? zonesData : APP_CONFIG.zones;
    zones.forEach(z => { const o = document.createElement('option'); o.value = z.id; o.textContent = z.title; sel.appendChild(o); });
    document.getElementById('manual-res-form').reset();
    document.getElementById('m-date').value = new Date().toISOString().split('T')[0];
    resModal.classList.add('open');
  };
}
if (document.getElementById('close-res-modal')) {
  document.getElementById('close-res-modal').onclick = () => resModal.classList.remove('open');
}

document.getElementById('manual-res-form').onsubmit = async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creando...';
  
  const payload = {
    restaurant_id: RID,
    name: document.getElementById('m-name').value,
    phone: document.getElementById('m-phone').value,
    date: document.getElementById('m-date').value,
    time: document.getElementById('m-time').value,
    people: parseInt(document.getElementById('m-people').value),
    zone: document.getElementById('m-zone').value,
    zonename: document.getElementById('m-zone').options[document.getElementById('m-zone').selectedIndex].text,
    source: document.getElementById('m-source').value,
    status: 'confirmed'
  };
  
  const { error } = await db.from('reservations').insert([payload]);
  if (error) { toast('Error: ' + error.message, 'error'); }
  else {
    toast('Reserva manual creada ✓', 'success');
    resModal.classList.remove('open');
    loadDashboard();
  }
  btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Crear Reserva';
};

// Asignación global inmediata
window.confirmReservation = confirmReservation;
window.deleteReservation = deleteReservation;

// (Handlers ya definidos arriba — no duplicar)

// ── PRODUCTOS ─────────────────────────────────────────────
let allProducts = [];

async function loadProducts() {
  try {
    const { data, error } = await db.from('menu_items').select('*').eq('restaurant_id', RID).order('position');
    if (error) throw error;
    allProducts = data || [];
  } catch (err) {
    console.warn('Fallo al cargar de BD, usando datos demo:', err);
    // Fallback a demo data
    allProducts = [];
    if (typeof DEMO_PRODUCTS !== 'undefined') {
      Object.keys(DEMO_PRODUCTS).forEach(cat => {
        const demo = DEMO_PRODUCTS[cat].map((p, i) => ({ ...p, id: 'demo-'+cat+'-'+i, category: cat, restaurant_id: RID, visible: true }));
        allProducts = allProducts.concat(demo);
      });
    }
    toast('Nota: Cargando datos de demostración (Error BD)', 'info');
  }
  renderProducts();
}

function renderProducts() {
  const tbody   = document.getElementById('products-body');
  const noProductsMsg = document.getElementById('no-products-message');
  const tableContainer = document.querySelector('#tab-menu .table-container');
  const catVal  = document.getElementById('category-filter').value;
  const search  = document.getElementById('product-search').value.toLowerCase();
  let filtered  = allProducts.filter(p => p.category === catVal);
  if (search) filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
  document.getElementById('displayed-products-count').textContent = filtered.length;
  tbody.innerHTML = '';
  
  if (filtered.length === 0) {
    noProductsMsg.style.display = 'block';
    tableContainer.style.display = 'none';
  } else {
    noProductsMsg.style.display = 'none';
    tableContainer.style.display = 'block';
  }
  filtered.forEach(p => {
    const allergenBadges = ALLERGENS.filter(a => p.allergens?.[a]).map(a => `<span style="font-size:0.65rem;padding:2px 6px;background:var(--surface-3);border:1px solid var(--border);border-radius:4px;color:var(--text-dim);">${ALLERGEN_NAMES[a]}</span>`).join(' ');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align:center;color:var(--gold);font-weight:700;">${p.position||0}</td>
      <td style="text-align:center;"><i class="fas ${p.visible?'fa-eye':'fa-eye-slash'}" style="color:${p.visible?'var(--success)':'var(--error)'}"></i></td>
      <td style="display:flex;align-items:center;gap:10px;">
        ${p.image_url?`<img src="${p.image_url}" style="width:38px;height:38px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" alt="">`:''}
        <div><strong>${p.name}</strong>${p.is_sugerencia?' <span title="Recomendación" style="font-size:0.9rem;">⭐</span>':''}${p.allergens?.bestseller?' <span title="Más Vendido" style="font-size:0.9rem;">🔥</span>':''}<div style="font-size:0.75rem;color:var(--text-dim);">${(p.info||'').substring(0,40)}</div></div>
      </td>
      <td style="color:var(--text-dim);font-size:0.82rem;">${p.category}</td>
      <td style="color:var(--success);font-weight:700;">${parseFloat(p.price || 0).toFixed(2)} €</td>
      <td style="font-size:0.7rem;">${allergenBadges||'<span style="color:var(--text-muted)">—</span>'}</td>
      <td style="text-align:right;">
        <button class="action-btn edit-btn" onclick="openEditModal('${p.id}')"><i class="fas fa-edit"></i></button>
        <button class="action-btn delete-btn" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
      </td>`;
    tbody.appendChild(tr);
  });
}

document.getElementById('category-filter').onchange = renderProducts;
document.getElementById('product-search').oninput   = renderProducts;
document.getElementById('refresh-products-btn').onclick = loadProducts;

// Modal producto
const productModal = document.getElementById('product-modal');
document.getElementById('close-product-modal').onclick = () => productModal.classList.remove('open');

document.getElementById('add-product-btn').onclick = () => {
  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('modal-title').textContent = 'Añadir Producto';
  document.getElementById('image-preview-container').style.display = 'none';
  ALLERGENS.forEach(a => document.getElementById(`a-${a}`).checked = false);
  if(document.getElementById('p-bestseller')) document.getElementById('p-bestseller').checked = false;
  productModal.classList.add('open');
};

window.openEditModal = id => {
  const p = allProducts.find(x => x.id == id);
  if (!p) return;
  document.getElementById('product-id').value    = p.id;
  document.getElementById('p-name').value        = p.name;
  document.getElementById('p-info').value        = p.info||'';
  document.getElementById('p-category').value    = p.category;
  document.getElementById('p-price').value       = p.price;
  document.getElementById('p-position').value    = p.position||0;
  document.getElementById('p-visible').checked   = p.visible;
  document.getElementById('p-sugerencia').checked= p.is_sugerencia;
  document.getElementById('p-image-url').value   = p.image_url||'';
  const prev = document.getElementById('image-preview');
  const prevC= document.getElementById('image-preview-container');
  if (p.image_url) { prev.src = p.image_url; prevC.style.display='block'; } else { prevC.style.display='none'; }
  ALLERGENS.forEach(a => document.getElementById(`a-${a}`).checked = p.allergens?.[a]||false);
  if(document.getElementById('p-bestseller')) document.getElementById('p-bestseller').checked = p.allergens?.bestseller||false;
  document.getElementById('modal-title').textContent = 'Editar Producto';
  productModal.classList.add('open');
};

window.previewImage = e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('image-preview').src = ev.target.result;
    document.getElementById('image-preview-container').style.display = 'block';
  };
  reader.readAsDataURL(file);
};

document.getElementById('product-form').onsubmit = async e => {
  e.preventDefault();
  const btn = document.querySelector('#product-form .save-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  const id = document.getElementById('product-id').value;
  let imageUrl = document.getElementById('p-image-url').value;
  const fileInput = document.getElementById('p-image');
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const path = `${RID}/${Date.now()}.${file.name.split('.').pop()}`;
    const { error: upErr } = await db.storage.from('menu-images').upload(path, file, { upsert: true });
    if (upErr) {
      console.error('Error uploading image:', upErr);
      toast('Error al subir la imagen: ' + upErr.message, 'error');
      // If upload fails, we show the error but allow the product to be saved without the new image
      // or we could stop here. Let's at least log it properly.
    } else {
      const { data: urlData } = db.storage.from('menu-images').getPublicUrl(path);
      imageUrl = urlData.publicUrl;
      console.log('Imagen subida con éxito:', imageUrl);
    }
  }
  const allergens = {};
  ALLERGENS.forEach(a => allergens[a] = document.getElementById(`a-${a}`).checked);
  if(document.getElementById('p-bestseller')) allergens.bestseller = document.getElementById('p-bestseller').checked;
  const payload = {
    restaurant_id: RID,
    name:          document.getElementById('p-name').value,
    info:          document.getElementById('p-info').value,
    category:      document.getElementById('p-category').value,
    price:         parseFloat(document.getElementById('p-price').value) || 0,
    position:      parseInt(document.getElementById('p-position').value)||1000,
    visible:       document.getElementById('p-visible').checked,
    is_sugerencia: document.getElementById('p-sugerencia').checked,
    image_url:     imageUrl,
    allergens,
  };
  try {
    if (id) await db.from('menu_items').update(payload).eq('id', id);
    else    await db.from('menu_items').insert([payload]);
    productModal.classList.remove('open');
    loadProducts();
    toast(id ? 'Producto actualizado ✓' : 'Producto añadido ✓','success');
    checkOnboarding();
  } catch (err) {
    console.error('Error guardando producto:', err);
    toast('Error al guardar producto', 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Producto';
  }
};

window.deleteProduct = async id => {
  if (!confirm('¿Borrar este producto?')) return;
  await db.from('menu_items').delete().eq('id', id);
  loadProducts();
  toast('Producto eliminado','info');
};

// Importar carta inteligente
document.getElementById('import-data-btn').onclick = () => {
  const sel = document.getElementById('import-category-select');
  sel.innerHTML = '';
  CATEGORIES.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.label; sel.appendChild(o); });
  document.getElementById('import-text').value = '';
  document.getElementById('import-modal').classList.add('open');
};

document.getElementById('close-import-modal').onclick = () => document.getElementById('import-modal').classList.remove('open');

document.getElementById('process-import-btn').onclick = async () => {
  const btn = document.getElementById('process-import-btn');
  const text = document.getElementById('import-text').value;
  const cat = document.getElementById('import-category-select').value;
  if(!text.trim()) { toast('Pega texto primero','error'); return; }
  
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';
  
  const lines = text.split('\n');
  const payloads = [];
  lines.forEach(line => {
    line = line.trim();
    if(!line) return;
    // Regex para "Nombre plato 12.50", "Nombre plato 12", "Nombre plato - 12,50€"
    const match = line.match(/(.+?)(?:[\s:-]*)([\d]+(?:[.,][\d]{1,2})?)[\s]*€?$/);
    if(match) {
      payloads.push({ restaurant_id: RID, name: match[1].trim(), price: parseFloat(match[2].replace(',','.')), category: cat, visible: true, allergens: {} });
    } else {
      payloads.push({ restaurant_id: RID, name: line, price: 0, category: cat, visible: true, allergens: {} });
    }
  });
  
  if (payloads.length > 0) {
    try {
      const { error } = await db.from('menu_items').insert(payloads);
      if (error) throw error;
      toast(`${payloads.length} platos importados ✓`, 'success');
      loadProducts();
      if (typeof checkOnboarding === 'function') checkOnboarding();
    } catch(err) {
      toast('Error al importar: ' + err.message, 'error');
    } finally {
      document.getElementById('import-modal').classList.remove('open');
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Extraer y Crear Platos';
    }
  } else {
    document.getElementById('import-modal').classList.remove('open');
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Extraer y Crear Platos';
  }
};
// ── HORARIO SEMANAL (editor completo por día) ─────────────
const DAYS = [
  { key: 'lunes',     label: 'Lunes',     default: { open: false } },
  { key: 'martes',   label: 'Martes',    default: { open: false } },
  { key: 'miercoles',label: 'Miércoles', default: { open: true, from: '13:00', to: '16:00', from2: '20:00', to2: '23:30' } },
  { key: 'jueves',   label: 'Jueves',    default: { open: true, from: '13:00', to: '16:00', from2: '20:00', to2: '23:30' } },
  { key: 'viernes',  label: 'Viernes',   default: { open: true, from: '13:00', to: '16:00', from2: '20:00', to2: '23:30' } },
  { key: 'sabado',   label: 'Sábado',    default: { open: true, from: '13:00', to: '16:00', from2: '20:00', to2: '23:30' } },
  { key: 'domingo',  label: 'Domingo',   default: { open: true, from: '13:00', to: '16:00', from2: '20:00', to2: '23:30' } },
];

async function loadSchedule() {
  const { data } = await db.from('settings').select('*').eq('key', 'weekly_schedule').eq('restaurant_id', RID).maybeSingle();
  let schedule = {};
  if (data?.value) { try { schedule = JSON.parse(data.value); } catch(e){} }
  renderScheduleGrid(schedule);
  loadSpecialDays();
}

function renderScheduleGrid(schedule) {
  const grid = document.getElementById('weekly-schedule-grid');
  grid.innerHTML = '';
  DAYS.forEach(day => {
    const s = schedule[day.key] || day.default;
    const isOpen = s.open !== false;
    const card = document.createElement('div');
    card.className = `day-card${!isOpen ? ' closed-day' : ''}`;
    card.id = `day-card-${day.key}`;
    card.innerHTML = `
      <div class="day-header">
        <h3>${day.label}</h3>
        <div style="display:flex; align-items:center; gap:10px;">
          <span class="status-badge ${isOpen ? 'open' : 'closed'}" id="badge-${day.key}">
            ${isOpen ? 'Abierto' : 'Cerrado'}
          </span>
          <label class="status-switch">
            <input type="checkbox" id="toggle-${day.key}" ${isOpen ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="time-shift" id="shift-1-${day.key}" style="${!isOpen ? 'opacity:0.4; pointer-events:none;' : ''}">
        <div class="shift-label"><i class="fas fa-sun"></i> Turno Comidas</div>
        <div class="time-inputs-row">
          <div class="time-input-group">
            <input type="time" id="from-${day.key}" value="${s.from || '13:00'}" ${!isOpen ? 'disabled' : ''}>
          </div>
          <div class="time-separator"></div>
          <div class="time-input-group">
            <input type="time" id="to-${day.key}" value="${s.to || '16:30'}" ${!isOpen ? 'disabled' : ''}>
          </div>
        </div>
      </div>

      <div class="time-shift" id="shift-2-${day.key}" style="${!isOpen ? 'opacity:0.4; pointer-events:none;' : ''}">
        <div class="shift-label"><i class="fas fa-moon"></i> Turno Cenas (Opcional)</div>
        <div class="time-inputs-row">
          <div class="time-input-group">
            <input type="time" id="from2-${day.key}" value="${s.from2 || ''}" ${!isOpen ? 'disabled' : ''}>
          </div>
          <div class="time-separator"></div>
          <div class="time-input-group">
            <input type="time" id="to2-${day.key}" value="${s.to2 || ''}" ${!isOpen ? 'disabled' : ''}>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
    // Evento de cambio de estado
    card.querySelector(`#toggle-${day.key}`).onchange = (e) => {
      const open = e.target.checked;
      card.classList.toggle('closed-day', !open);
      
      const badge = document.getElementById(`badge-${day.key}`);
      if (badge) {
        badge.textContent = open ? 'Abierto' : 'Cerrado';
        badge.className = `status-badge ${open ? 'open' : 'closed'}`;
      }
      
      [1, 2].forEach(num => {
        const shift = document.getElementById(`shift-${num}-${day.key}`);
        if (shift) {
          shift.style.opacity = open ? '1' : '0.4';
          shift.style.pointerEvents = open ? 'all' : 'none';
        }
      });
      
      card.querySelectorAll('input[type="time"]').forEach(i => i.disabled = !open);
    };
  });
}

document.getElementById('save-schedule-btn').onclick = async () => {
  const btn = document.getElementById('save-schedule-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  const schedule = {};
  DAYS.forEach(day => {
    const isOpen = document.getElementById(`toggle-${day.key}`)?.checked || false;
    schedule[day.key] = {
      open: isOpen,
      from: document.getElementById(`from-${day.key}`)?.value || '',
      to:   document.getElementById(`to-${day.key}`)?.value   || '',
      from2: document.getElementById(`from2-${day.key}`)?.value || '',
      to2:   document.getElementById(`to2-${day.key}`)?.value   || '',
    };
  });
  try {
    const { error } = await db.from('settings').upsert({ restaurant_id: RID, key: 'weekly_schedule', value: JSON.stringify(schedule) }, { onConflict: 'restaurant_id,key' });
    if (error) throw error;
    toast('Horario semanal guardado ✓', 'success');
    checkOnboarding();
  } catch(err) {
    console.error('Error guardando horario:', err);
    toast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Horario Semanal';
  }
};

async function loadSpecialDays() {
  const { data } = await db.from('special_days').select('*').eq('restaurant_id', RID).order('date');
  const { data: rData } = await db.from('settings').select('value').eq('restaurant_id', RID).eq('key','special_reasons').maybeSingle();
  let reasons = {};
  try { if (rData?.value) reasons = JSON.parse(rData.value); } catch(e){}
  const tbody = document.getElementById('special-days-body');
  tbody.innerHTML = '';
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px;">No hay días especiales.</td></tr>';
    return;
  }
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${item.date}</strong></td>
      <td>${item.is_closed
        ? `<span style="color:var(--error);font-weight:700;"><i class="fas fa-times-circle"></i> CERRADO</span> <span style="font-size:0.8rem;color:var(--text-dim);">(${reasons[item.date]||'Excepcional'})</span>`
        : `<span style="color:var(--success);font-weight:700;"><i class="fas fa-check-circle"></i> ABIERTO</span> <span style="font-size:0.8rem;color:var(--text-dim);">(${reasons[item.date]||'Excepción'})</span>`}</td>
      <td style="text-align:right;"><button class="action-btn delete-btn" onclick="deleteSpecialDay('${item.date}')"><i class="fas fa-trash"></i> Quitar</button></td>`;
    tbody.appendChild(tr);
  });
}

async function setSpecialDay(closed) {
  const d = document.getElementById('special-date-input').value;
  const reason = document.getElementById('special-reason-input') ? document.getElementById('special-reason-input').value : '';
  if (!d) { toast('Selecciona una fecha','error'); return; }
  await db.from('special_days').upsert({ restaurant_id: RID, date: d, is_closed: closed }, { onConflict: 'restaurant_id,date' });
  
  const { data: rData } = await db.from('settings').select('value').eq('restaurant_id', RID).eq('key','special_reasons').maybeSingle();
  let reasons = {};
  try { if (rData?.value) reasons = JSON.parse(rData.value); } catch(e){}
  reasons[d] = reason;
  await db.from('settings').upsert({ restaurant_id: RID, key: 'special_reasons', value: JSON.stringify(reasons) }, { onConflict: 'restaurant_id,key' });

  loadSpecialDays();
  toast(`Día ${d} marcado como ${closed?'CERRADO':'ABIERTO (excepción)'}`, closed?'error':'success');
}

document.getElementById('add-special-close-btn').onclick = () => setSpecialDay(true);
document.getElementById('add-special-open-btn').onclick  = () => setSpecialDay(false);
window.deleteSpecialDay = async date => {
  await db.from('special_days').delete().eq('date', date).eq('restaurant_id', RID);
  loadSpecialDays();
  toast('Día especial eliminado','info');
};

// ── SECCIONES / CATEGORÍAS ────────────────────────────────
async function loadCategories() {
  const { data } = await db.from('settings').select('*').eq('key','menu_categories').eq('restaurant_id', RID).maybeSingle();
  let cats = APP_CONFIG.menuCategories;
  if (data?.value) { try { cats = JSON.parse(data.value); } catch(e){} }
  renderCategoriesList(cats);
  
  // Actualizar selects de categorías en todo el admin
  const selects = ['category-filter', 'p-category', 'import-category-select'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    el.innerHTML = '';
    cats.forEach(c => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.label;
      el.appendChild(o);
    });
    if (currentVal && Array.from(el.options).some(o => o.value === currentVal)) {
      el.value = currentVal;
    }
  });
}

function renderCategoriesList(cats) {
  const list = document.getElementById('categories-list');
  list.innerHTML = '';
  cats.forEach((cat, i) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--surface-2);border:1.5px solid var(--border);border-radius:12px;';
    div.innerHTML = `
      <span style="font-size:1.1rem;cursor:grab;">⠿</span>
      <input type="text" value="${cat.label}" data-idx="${i}" data-field="label" placeholder="Nombre de sección"
        style="flex:1;padding:8px 12px;background:var(--surface);border:1.5px solid var(--border);border-radius:9px;font-family:var(--font-body);font-size:0.9rem;color:var(--text);outline:none;" onfocus="this.style.borderColor='var(--border-gold)'" onblur="this.style.borderColor='var(--border)'">
      <input type="text" value="${cat.id}" data-idx="${i}" data-field="id" placeholder="id (ej: pizzas)"
        style="width:130px;padding:8px 12px;background:var(--surface);border:1.5px solid var(--border);border-radius:9px;font-family:var(--font-body);font-size:0.85rem;color:var(--text-dim);outline:none;" onfocus="this.style.borderColor='var(--border-gold)'" onblur="this.style.borderColor='var(--border)'">
      <button onclick="removeCategory(${i})" class="action-btn delete-btn" style="flex-shrink:0;"><i class="fas fa-trash"></i></button>`;
    div.querySelectorAll('input').forEach(inp => {
      inp.oninput = () => {
        cats[parseInt(inp.dataset.idx)][inp.dataset.field] = inp.value;
      };
    });
    list.appendChild(div);
  });
  list._cats = cats;
}

window.removeCategory = idx => {
  const list = document.getElementById('categories-list');
  const cats = list._cats;
  if (!confirm(`¿Eliminar la sección "${cats[idx].label}"? Los productos no se borran.`)) return;
  cats.splice(idx, 1);
  renderCategoriesList(cats);
};

document.getElementById('add-category-btn').onclick = () => {
  const list = document.getElementById('categories-list');
  const cats = list._cats || [];
  cats.push({ id: `nueva-seccion-${Date.now()}`, label: 'Nueva Sección', page: 'menu', img: '' });
  renderCategoriesList(cats);
};

if (document.getElementById('ai-generate-menu-btn')) {
  document.getElementById('ai-generate-menu-btn').onclick = async () => {
    const style = prompt("¿Qué tipo de comida sirves? (Ej: Italiana, Tradicional, Fusión, Burgers...)");
    if (!style) return;
    const btn = document.getElementById('ai-generate-menu-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    
    setTimeout(async () => {
      const list = document.getElementById('categories-list');
      const cats = list._cats || [];
      const newCats = [
        { id: `entrantes-${Date.now()}`, label: `Entrantes estilo ${style}`, page: "entrantes", img: "images/cat-raciones.png" },
        { id: `principales-${Date.now()}`, label: `Principales de ${style}`, page: "principales", img: "images/cat-hamburguesas.png" },
        { id: `postres-${Date.now()}`, label: `Postres Artesanos`, page: "postres", img: "images/cat-postres.png" },
        { id: `bebidas-${Date.now()}`, label: "Bodega y Bebidas", page: "bebidas", img: "images/cat-bebidas.png" }
      ];
      cats.push(...newCats);
      renderCategoriesList(cats);
      toast('Secciones generadas mágicamente con IA ✨', 'success');
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Autocompletar Carta Base con IA';
    }, 1500);
  };
}

async function saveCategories() {
  const list = document.getElementById('categories-list');
  const cats = list._cats;
  if (!cats) return;
  try {
    const { error } = await db.from('settings').upsert({ restaurant_id: RID, key: 'menu_categories', value: JSON.stringify(cats) }, { onConflict: 'restaurant_id,key' });
    if (error) throw error;
    // Actualizar config en memoria
    APP_CONFIG.menuCategories = cats;
    // Refrescar todos los selects de categorías
    const selects = ['category-filter', 'p-category', 'import-category-select'];
    selects.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const currentVal = el.value;
      el.innerHTML = '';
      cats.forEach(c => {
        const o = document.createElement('option');
        o.value = c.id;
        o.textContent = c.label;
        el.appendChild(o);
      });
      if (currentVal && Array.from(el.options).some(o => o.value === currentVal)) {
        el.value = currentVal;
      }
    });
    toast('Secciones guardadas ✓', 'success');
  } catch(err) {
    toast('Error al guardar: ' + err.message, 'error');
  }
}
// Botón guardar categorías (añadido dinámicamente)
setTimeout(() => {
  const catSection = document.querySelector('#tab-categories .section-card');
  if (catSection && !document.getElementById('save-cats-btn')) {
    const btn = document.createElement('button');
    btn.id = 'save-cats-btn';
    btn.className = 'save-btn'; btn.style.marginTop = '14px';
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Secciones';
    btn.onclick = saveCategories;
    catSection.appendChild(btn);
  }
}, 100);

// ── NEGOCIO Y PERFIL ──────────────────────────────────────
async function loadBusinessTab() {
  const { data } = await db.from('settings').select('*').eq('restaurant_id', RID);
  if (!data) return;

  const get = k => data.find(x => x.key === k)?.value || '';

  document.getElementById('biz-name').value      = get('biz_name') || APP_CONFIG.barName;
  document.getElementById('biz-tagline').value   = get('biz_tagline') || APP_CONFIG.barTagline;
  document.getElementById('biz-address').value   = get('biz_address') || APP_CONFIG.barAddress;
  document.getElementById('biz-city').value      = get('biz_city') || APP_CONFIG.barCity;
  document.getElementById('biz-phone').value     = get('biz_phone') || APP_CONFIG.barPhone;
  document.getElementById('biz-instagram').value = get('biz_instagram') || APP_CONFIG.instagram;
}

document.getElementById('save-biz-info-btn').onclick = async () => {
  const btn = document.getElementById('save-biz-info-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

  const payload = [
    { restaurant_id: RID, key: 'biz_name',      value: document.getElementById('biz-name').value },
    { restaurant_id: RID, key: 'biz_tagline',   value: document.getElementById('biz-tagline').value },
    { restaurant_id: RID, key: 'biz_address',   value: document.getElementById('biz-address').value },
    { restaurant_id: RID, key: 'biz_city',      value: document.getElementById('biz-city').value },
    { restaurant_id: RID, key: 'biz_phone',     value: document.getElementById('biz-phone').value },
    { restaurant_id: RID, key: 'biz_instagram', value: document.getElementById('biz-instagram').value },
  ];

  try {
    const { error } = await db.from('settings').upsert(payload, { onConflict: 'restaurant_id,key' });
    if (error) throw error;
    document.getElementById('admin-bar-label').textContent = document.getElementById('biz-name').value;
    APP_CONFIG.barName = document.getElementById('biz-name').value;
    toast('Información del negocio actualizada ✓', 'success');
  } catch(err) {
    toast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Cambios';
  }
};

document.getElementById('save-biz-pass-btn').onclick = async () => {
  const pass = document.getElementById('biz-new-password').value.trim();
  if (pass.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return; }

  if (!confirm('¿Seguro que quieres cambiar la contraseña de acceso? Deberás usar la nueva la próxima vez.')) return;

  const btn = document.getElementById('save-biz-pass-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';

  try {
    const { error } = await db.from('settings').upsert({ restaurant_id: RID, key: 'admin_password', value: pass }, { onConflict: 'restaurant_id,key' });
    if (error) throw error;
    toast('Contraseña actualizada con éxito ✓', 'success');
    document.getElementById('biz-new-password').value = '';
  } catch(err) {
    toast('Error al cambiar contraseña: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-key"></i> Actualizar Contraseña';
  }
};

window.togglePasswordView = (id) => {
  const input = document.getElementById(id);
  const icon = event.currentTarget.querySelector('i');
  if (input.type === 'password') {
    input.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    input.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
};

// ── CONFIGURACIÓN ─────────────────────────────────────────
async function loadConfigTab() {
  const { data } = await db.from('settings').select('*').eq('restaurant_id', RID);
  if (!data) return;
  const map = { ejs_admin_email:'ejs-admin-email', ejs_public_key:'ejs-public-key', ejs_service_id:'ejs-service-id', ejs_template_admin:'ejs-template-admin', ejs_template_client:'ejs-template-client' };
  Object.entries(map).forEach(([key, elId]) => {
    const s = data.find(x => x.key === key);
    if (s) document.getElementById(elId).value = s.value;
  });
  const autoConf = data.find(x => x.key === 'auto_confirm');
  if (autoConf && document.getElementById('auto-confirm-toggle')) {
    document.getElementById('auto-confirm-toggle').checked = autoConf.value === 'true';
  }
  const limitPax = data.find(x => x.key === 'limit_pax');
  if (limitPax && document.getElementById('cfg-limit-pax')) {
    document.getElementById('cfg-limit-pax').value = limitPax.value;
  }
}

if(document.getElementById('save-limits-btn')) {
  document.getElementById('save-limits-btn').onclick = async () => {
    const btn = document.getElementById('save-limits-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    const val = document.getElementById('cfg-limit-pax').value;
    try {
      const { error } = await db.from('settings').upsert({ restaurant_id: RID, key: 'limit_pax', value: val }, { onConflict: 'restaurant_id,key' });
      if (error) throw error;
      toast('Límite guardado ✓','success');
    } catch(err) {
      toast('Error al guardar límite: ' + err.message, 'error');
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Límite';
    }
  };
}

document.getElementById('save-ejs-btn').onclick = async () => {
  const btn = document.getElementById('save-ejs-btn');
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  const map = { ejs_admin_email:'ejs-admin-email', ejs_public_key:'ejs-public-key', ejs_service_id:'ejs-service-id', ejs_template_admin:'ejs-template-admin', ejs_template_client:'ejs-template-client' };
  
  const payload = [];
  for (const [key, elId] of Object.entries(map)) {
    payload.push({ restaurant_id: RID, key, value: document.getElementById(elId).value });
  }
  
  const autoConf = document.getElementById('auto-confirm-toggle').checked;
  payload.push({ restaurant_id: RID, key: 'auto_confirm', value: autoConf ? 'true' : 'false' });

  try {
    const { error } = await db.from('settings').upsert(payload, { onConflict: 'restaurant_id,key' });
    if (error) throw error;
    toast('Preferencias guardadas ✓','success');
  } catch(err) {
    toast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Guardar Preferencias';
  }
};

document.getElementById('init-db-btn').onclick = () => {
  const sql = `-- Ejecutar en Supabase SQL Editor
CREATE TABLE IF NOT EXISTS menu_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT NOT NULL,
  name TEXT, category TEXT, price DECIMAL,
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
-- Índices
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant ON reservations(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(restaurant_id, date);`;
  document.getElementById('db-init-msg').innerHTML =
    `<meta name="viewport" content="width=device-width, initial-scale=1.0"><textarea style="width:100%;height:14rem;background:#000;color:#4ade80;font-family:monospace;padding:12px;border-radius:8px;border:1px solid #333;resize:vertical;">${sql}</textarea>`;
};

// ── QR ────────────────────────────────────────────────────
async function loadQR() {
  localStorage.setItem('onboarding_qr', 'true');
  if (typeof checkOnboarding === 'function') checkOnboarding();
  
  const target = document.getElementById('qr-target-select') ? document.getElementById('qr-target-select').value : '';
  const color = document.getElementById('qr-color-select') ? document.getElementById('qr-color-select').value : '#000000';
  
  let baseUrl = APP_CONFIG.siteUrl || window.location.origin;
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  const url = target ? `${baseUrl}/${target}?ref=qr` : `${baseUrl}?ref=qr`;
  
  document.getElementById('qr-url-display').textContent = url;
  document.getElementById('qr-label').textContent = url;
  const canvas = document.getElementById('qr-canvas');
  QRCode.toCanvas(canvas, url, { width: 240, margin: 2, color: { dark: color, light:'#ffffff' } });

  try {
    const { data: qData } = await db.from('settings').select('value').eq('restaurant_id', RID).eq('key', 'qr_scans').maybeSingle();
    const scans = qData?.value || 0;
    if(document.getElementById('qr-scan-count')) document.getElementById('qr-scan-count').innerHTML = `<i class="fas fa-chart-line"></i> Escaneos Totales: ${scans}`;
  } catch(e) {}
}

if(document.getElementById('qr-target-select')) document.getElementById('qr-target-select').onchange = loadQR;
if(document.getElementById('qr-color-select')) document.getElementById('qr-color-select').oninput = loadQR;

document.getElementById('download-qr-btn').onclick = () => {
  const canvas = document.getElementById('qr-canvas');
  const link   = document.createElement('a');
  link.download = `qr_${APP_CONFIG.restaurantId}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
  toast('QR descargado ✓','success');
};

document.getElementById('print-qr-btn').onclick = () => {
  const canvas = document.getElementById('qr-canvas');
  const win    = window.open('','_blank');
  win.document.write(`<html><body style="text-align:center;font-family:sans-serif;padding:40px;">
    <h2>${APP_CONFIG.barName}</h2>
    <p style="color:#888;margin-bottom:20px;">Escanea para ver nuestra carta</p>
    <img src="${canvas.toDataURL()}" style="width:240px;"><br>
    <p style="font-size:12px;color:#aaa;margin-top:16px;">${APP_CONFIG.siteUrl}</p>
  </body></html>`);
  win.print();
};

// ── METRICAS ──────────────────────────────────────────────
let chartRes, chartZones, chartViews;
async function loadMetrics() {
  const btn = document.getElementById('refresh-metrics-btn');
  if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';
  
  try {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const dateStr = d.toISOString().split('T')[0];
    
    const [resData, viewsData] = await Promise.all([
      db.from('reservations').select('*').eq('restaurant_id', APP_CONFIG.restaurantId).gte('date', dateStr),
      db.from('settings').select('value').eq('restaurant_id', APP_CONFIG.restaurantId).eq('key', 'stats_views').maybeSingle()
    ]);
    
    const res = (resData.data || []).filter(r => r.status !== 'cancelled');
    let views = {};
    if (viewsData.data && viewsData.data.value) {
      try { views = JSON.parse(viewsData.data.value); } catch(e){}
    }
    
    const elRes = document.getElementById('metric-total-res');
    if (elRes) elRes.textContent = res.length;
    
    const elPax = document.getElementById('metric-total-pax');
    if (elPax) elPax.textContent = res.reduce((s,r) => s + parseInt(r.people||0), 0);
    
    const hours = {};
    res.forEach(r => { if(r.status==='confirmed') hours[r.time] = (hours[r.time]||0) + 1; });
    const peak = Object.keys(hours).sort((a,b) => hours[b] - hours[a])[0];
    const elPeak = document.getElementById('metric-peak-hour');
    if (elPeak) elPeak.textContent = peak || '-';
    
    const last7Days = [];
    for(let i=6; i>=0; i--) {
      let dt = new Date(); dt.setDate(dt.getDate() - i);
      last7Days.push(dt.toISOString().split('T')[0]);
    }
    const resByDay = last7Days.map(date => res.filter(r => r.date === date).length);
    
    if (typeof Chart !== 'undefined') {
      if (chartRes) { chartRes.destroy(); chartRes = null; }
      const cvRes = document.getElementById('chart-reservations');
      if (cvRes) {
        chartRes = new Chart(cvRes, {
          type: 'bar',
          data: {
            labels: last7Days.map(x => x.substring(5).split('-').reverse().join('/')),
            datasets: [{ label: 'Reservas', data: resByDay, backgroundColor: '#C5A866', borderRadius: 4 }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
      
      const zoneCounts = {};
      APP_CONFIG.zones.forEach(z => zoneCounts[z.id] = 0);
      res.forEach(r => { if(zoneCounts[r.zone] !== undefined) zoneCounts[r.zone]++; });
      
      if (chartZones) { chartZones.destroy(); chartZones = null; }
      const cvZones = document.getElementById('chart-zones');
      if (cvZones) {
        chartZones = new Chart(cvZones, {
          type: 'doughnut',
          data: {
            labels: APP_CONFIG.zones.map(z => z.title),
            datasets: [{ data: APP_CONFIG.zones.map(z => zoneCounts[z.id]), backgroundColor: ['#C5A866', '#1A1A1A', '#e5e7eb'] }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }

      if (chartViews) { chartViews.destroy(); chartViews = null; }
      const viewLabels = Object.keys(views).filter(k => k !== 'index.html').sort((a,b) => views[b] - views[a]).slice(0,5);
      const viewData = viewLabels.map(k => views[k]);
      const cvViews = document.getElementById('chart-views');
      if (cvViews) {
        chartViews = new Chart(cvViews, {
          type: 'pie',
          data: {
            labels: viewLabels.map(l => l.replace('.html','').toUpperCase()),
            datasets: [{ data: viewData, backgroundColor: ['#C5A866', '#1A1A1A', '#e5e7eb', '#888888', '#333333'] }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
      }
    }
  } catch(e) {
    console.error('Metrics Error:', e);
  } finally {
    if (btn) btn.innerHTML = '<i class="fas fa-sync-alt"></i> Actualizar Datos';
  }
}
document.getElementById('refresh-metrics-btn').onclick = loadMetrics;

// ── ONBOARDING SAAS ─────────────────────────────────────────
async function checkOnboarding() {
  try {
    const { data: prods } = await db.from('menu_items').select('id').eq('restaurant_id', RID).limit(1);
    const { data: sched } = await db.from('settings').select('id').eq('restaurant_id', RID).eq('key', 'weekly_schedule').maybeSingle();
    
    const hasPlato = prods && prods.length > 0;
    const hasHorario = !!sched;
    const hasQR = localStorage.getItem('onboarding_qr') === 'true';
    
    document.getElementById('chk-onb-plato').checked = hasPlato;
    document.getElementById('chk-onb-horario').checked = hasHorario;
    document.getElementById('chk-onb-qr').checked = hasQR;
    
    let completed = (hasPlato ? 1 : 0) + (hasHorario ? 1 : 0) + (hasQR ? 1 : 0);
    document.getElementById('onboarding-progress').textContent = `${completed}/3 completados`;
    
    const widget = document.getElementById('onboarding-widget');
    if (completed < 3) {
      widget.style.display = 'block';
    } else {
      widget.style.display = 'none';
    }
    console.log('Configuración dinámica cargada al 100% desde Supabase');
  } catch(e) {
    console.warn('Error cargando config dinámica:', e);
  }
}

// ── PLANO DE MESAS ─────────────────────────────────────────
let tablesData = [];
let zonesData = [];
let draggingTable = null;
let dragOffset = { x: 0, y: 0 };

async function loadTablesMap() {
  const selectedDate = document.getElementById('admin-date-select').value || new Date().toISOString().split('T')[0];
  const [tablesRes, zonesRes, resRes] = await Promise.all([
    db.from('settings').select('value').eq('restaurant_id', RID).eq('key', 'tables_map').maybeSingle(),
    db.from('settings').select('value').eq('restaurant_id', RID).eq('key', 'zones_config').maybeSingle(),
    db.from('reservations').select('notes').eq('date', selectedDate).eq('restaurant_id', RID)
  ]);
  
  tablesData = [];
  try { if (tablesRes.data?.value) tablesData = JSON.parse(tablesRes.data.value); } catch(e){}
  zonesData = APP_CONFIG.zones;
  try { if (zonesRes.data?.value) zonesData = JSON.parse(zonesRes.data.value); } catch(e){}
  
  const occupiedTables = (resRes.data || []).filter(r => r.notes && r.notes.startsWith('TABLE:')).map(r => parseInt(r.notes.split(':')[1]));
  
  renderZonesList();
  renderTablesList();
  renderTablesMap(occupiedTables);
}

function renderZonesList() {
  const list = document.getElementById('zones-list');
  list.innerHTML = '';
  if (zonesData.length === 0) {
    list.innerHTML = `
      <div style="padding:20px; text-align:center; border:2px dashed var(--border); border-radius:10px; color:var(--text-dim);">
        <i class="fas fa-map-marked-alt" style="font-size:1.5rem; margin-bottom:8px; color:var(--text-muted);"></i>
        <p style="font-size:0.9rem;">Aún no has añadido zonas. Usa el formulario de arriba.</p>
      </div>`;
    return;
  }

  // Badge de resumen total
  const totalCap = zonesData.reduce((s, z) => s + (parseInt(z.capacity)||0), 0);
  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px 14px; background:var(--gold-dim); border:1px solid var(--border-gold); border-radius:8px; margin-bottom:4px;';
  summary.innerHTML = `<i class="fas fa-chart-pie" style="color:var(--gold);"></i> <span style="font-size:0.9rem; color:var(--text);"><strong>${zonesData.length} zonas</strong> · Aforo total del local: <strong>${totalCap} personas</strong></span>`;
  list.appendChild(summary);

  zonesData.forEach((z, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:grid; grid-template-columns:1fr auto auto; gap:12px; align-items:center; padding:14px 16px; background:var(--surface); border-radius:10px; border:1px solid var(--border); box-shadow:var(--shadow-sm);';
    div.innerHTML = `
      <div>
        <strong style="display:block; font-size:1rem; color:var(--text);">${z.title}</strong>
        <span style="font-size:0.8rem; color:var(--text-dim);">Los clientes podrán elegir esta zona al reservar</span>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <label style="font-size:0.8rem; color:var(--text-dim); white-space:nowrap;"><i class="fas fa-users" style="color:var(--gold);"></i> Aforo máx.</label>
        <input type="number" value="${z.capacity}" min="1" max="500"
          onchange="updateZoneCapacity(${idx}, this.value)"
          style="width:70px; padding:6px 10px; border:1px solid var(--border); border-radius:6px; font-size:0.9rem; font-weight:600; text-align:center; background:var(--surface-2); color:var(--text); outline:none;"
          onfocus="this.style.borderColor='var(--gold)'"
          onblur="this.style.borderColor='var(--border)'">
        <span style="font-size:0.8rem; color:var(--text-dim);">pax</span>
      </div>
      <button onclick="removeZone(${idx})"
        style="background:var(--error-bg); border:none; color:var(--error); padding:8px 12px; border-radius:6px; cursor:pointer; font-size:0.85rem; font-weight:600; display:flex; align-items:center; gap:6px;"
        onmouseenter="this.style.background='var(--error)';this.style.color='#fff'"
        onmouseleave="this.style.background='var(--error-bg)';this.style.color='var(--error)'">
        <i class="fas fa-trash"></i> Eliminar
      </button>
    `;
    list.appendChild(div);
  });
}

document.getElementById('add-zone-btn').onclick = () => {
  const titleEl = document.getElementById('new-zone-name');
  const capEl   = document.getElementById('new-zone-capacity');
  const title    = titleEl.value.trim();
  const capacity = parseInt(capEl.value) || 20;

  if (!title) {
    titleEl.style.borderColor = 'var(--error)';
    setTimeout(() => titleEl.style.borderColor = '', 2000);
    return;
  }

  const id = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '_');
  // Evitar duplicados de ID
  const finalId = zonesData.find(z => z.id === id) ? id + '_' + Date.now() : id;
  zonesData.push({ id: finalId, title, capacity });
  renderZonesList();
  // Limpiar formulario
  titleEl.value = '';
  capEl.value = '';
};

window.removeZone = (idx) => {
  if(confirm(`¿Eliminar la zona "${zonesData[idx].title}"? Las reservas existentes de esta zona no se borrarán pero no podrán usarla.`)) {
    zonesData.splice(idx, 1);
    renderZonesList();
  }
};

window.updateZoneCapacity = (idx, val) => {
  zonesData[idx].capacity = parseInt(val) || 0;
};

function renderTablesList() {
  const list = document.getElementById('tables-list');
  list.innerHTML = '';
  if (tablesData.length === 0) {
    list.innerHTML = '<p style="color:var(--text-dim); font-size:0.9rem; text-align:center; padding:20px;">No hay mesas creadas.</p>';
    return;
  }
  tablesData.forEach((t, idx) => {
    const div = document.createElement('div');
    div.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--surface); border-radius:8px; border:1px solid var(--border); box-shadow:var(--shadow-sm); transition:transform 0.2s; cursor:pointer;';
    div.onmouseenter = () => div.style.borderColor = 'var(--gold)';
    div.onmouseleave = () => div.style.borderColor = 'var(--border)';
    div.innerHTML = `
      <div>
        <strong style="display:block; font-size:0.95rem; color:var(--text);">${t.name}</strong>
        <span style="font-size:0.8rem; color:var(--text-dim);"><i class="fas fa-users" style="color:var(--gold);"></i> Pax: ${t.capacity}</span>
      </div>
      <button onclick="removeTable(${idx})" style="background:var(--error-bg); border:none; color:var(--error); padding:8px; border-radius:6px; cursor:pointer; transition:background 0.2s;" onmouseenter="this.style.background='var(--error)'; this.style.color='#fff';" onmouseleave="this.style.background='var(--error-bg)'; this.style.color='var(--error)';"><i class="fas fa-trash"></i></button>
    `;
    list.appendChild(div);
  });
}

function renderTablesMap(occupiedTables = []) {
  const mapArea = document.getElementById('tables-map-area');
  mapArea.innerHTML = '';
  
  if (tablesData.length === 0) {
    mapArea.innerHTML = '<div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; color:var(--text-dim);"><i class="fas fa-chair" style="font-size:2rem; margin-bottom:10px; opacity:0.5;"></i><p>Usa el botón "Nueva Mesa" para empezar a dibujar</p></div>';
  }

  tablesData.forEach((t, idx) => {
    const el = document.createElement('div');
    const width = t.shape === 'round' ? 60 : 70;
    const height = t.shape === 'round' ? 60 : 70; // made them squares or circles for better aesthetics
    
    const isOccupied = occupiedTables.includes(idx);
    const borderColor = isOccupied ? 'var(--error)' : 'var(--success)';
    const bgColor = isOccupied ? 'var(--error-bg)' : 'var(--success-bg)';
    const textColor = isOccupied ? 'var(--error)' : 'var(--success)';

    el.style.cssText = `
      position: absolute; 
      left: ${t.x || 10}%; 
      top: ${t.y || 10}%; 
      width: ${width}px; 
      height: ${height}px; 
      border-radius: ${t.shape === 'round' ? '50%' : '8px'}; 
      background: ${bgColor}; 
      border: 2px solid ${borderColor}; 
      display: flex; 
      flex-direction: column; 
      justify-content: center; 
      align-items: center; 
      cursor: grab; 
      box-shadow: var(--shadow);
      user-select: none;
      transition: box-shadow 0.2s, border-color 0.2s;
    `;
    
    // Add internal grid or seats visual? Let's just keep it simple and elegant.
    el.innerHTML = `<span style="font-weight:700; font-size:0.9rem; color:${textColor};">${t.name}</span><span style="font-size:0.7rem; color:var(--text-dim); margin-top:2px;">${t.capacity} pax</span>`;
    
    // Drag Events
    const handleStart = (e) => {
      draggingTable = idx;
      const areaRect = mapArea.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      dragOffset.x = clientX - elRect.left;
      dragOffset.y = clientY - elRect.top;
      el.style.cursor = 'grabbing';
      el.style.zIndex = 100;
      el.style.boxShadow = 'var(--shadow-lg)';
      el.style.borderColor = 'var(--gold)';
    };
    
    el.onmousedown = handleStart;
    el.ontouchstart = (e) => { handleStart(e); e.preventDefault(); };
    
    mapArea.appendChild(el);
  });
}

const handleMove = e => {
  if (draggingTable !== null) {
    const mapArea = document.getElementById('tables-map-area');
    const areaRect = mapArea.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    let newX = clientX - areaRect.left - dragOffset.x;
    let newY = clientY - areaRect.top - dragOffset.y;
    
    const width = 70; // Use standard or dynamic
    const height = 70;
    newX = Math.max(0, Math.min(newX, areaRect.width - width));
    newY = Math.max(0, Math.min(newY, areaRect.height - height));
    
    tablesData[draggingTable].x = (newX / areaRect.width) * 100;
    tablesData[draggingTable].y = (newY / areaRect.height) * 100;
    
    const allTables = Array.from(mapArea.children).filter(c => c.style.position === 'absolute');
    if(allTables[draggingTable]) {
       allTables[draggingTable].style.left = tablesData[draggingTable].x + '%';
       allTables[draggingTable].style.top = tablesData[draggingTable].y + '%';
    }
  }
};

document.addEventListener('mousemove', handleMove);
document.addEventListener('touchmove', handleMove, { passive: false });

const handleEnd = () => {
  if (draggingTable !== null) {
    draggingTable = null;
    loadTablesMap(); 
  }
};

document.addEventListener('mouseup', handleEnd);
document.addEventListener('touchend', handleEnd);

document.getElementById('add-table-btn').onclick = () => {
  if (zonesData.length === 0) { alert('Añade primero una Sala/Zona arriba'); return; }
  const name = prompt('Nombre de la mesa (Ej: Mesa 1, Terraza A, VIP...):');
  if (!name) return;
  const capacity = prompt('¿Cuántas personas caben en esta mesa?:', '4');
  const shapeStr = prompt('¿Forma de la mesa? (Escribe "cuadrada" o "redonda"):', 'cuadrada');
  const shape = shapeStr && shapeStr.toLowerCase().includes('redond') ? 'round' : 'square';
  
  let zoneNames = zonesData.map(z => z.title).join(', ');
  const zoneTitle = prompt(`¿En qué zona está? (${zoneNames}):`, zonesData[0].title);
  const matchedZone = zonesData.find(z => z.title.toLowerCase() === zoneTitle.toLowerCase()) || zonesData[0];
  
  // Default to center
  tablesData.push({ name, capacity: parseInt(capacity)||4, shape, zone: matchedZone.id, x: 45, y: 45 });
  renderTablesList();
  loadTablesMap();
};

window.removeTable = (idx) => {
  if(confirm('¿Eliminar esta mesa definitivamente del plano?')) {
    tablesData.splice(idx, 1);
    renderTablesList();
    loadTablesMap();
  }
};

document.getElementById('save-tables-btn').onclick = async () => {
  const btn = document.getElementById('save-tables-btn');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  
  const payload = [
    { restaurant_id: RID, key: 'tables_map', value: JSON.stringify(tablesData) },
    { restaurant_id: RID, key: 'zones_config', value: JSON.stringify(zonesData) }
  ];
  try {
    const { error } = await db.from('settings').upsert(payload, { onConflict: 'restaurant_id,key' });
    if (error) throw error;
    toast('Configuración de Zonas y Mesas guardada', 'success');
  } catch(err) {
    console.error('Error guardando plano:', err);
    toast('Error al guardar: ' + err.message, 'error');
  } finally {
    btn.innerHTML = '<i class="fas fa-save"></i> Guardar Plano';
  }
};

// ── INTEGRACIONES ──────────────────────────────────────────
async function loadIntegrations() {
  const { data } = await db.from('settings').select('*').eq('restaurant_id', RID);
  const get = k => data?.find(s => s.key === k)?.value;
  
  if (document.getElementById('gcal-id')) {
    document.getElementById('gcal-id').value = get('gcal_id') || '';
  }
  
  // URL de reserva para Google Maps
  let baseUrl = APP_CONFIG.siteUrl || window.location.origin;
  if (!baseUrl.endsWith('/')) baseUrl += '/';
  const resUrl = baseUrl + 'reservas.html?ref=google';
  if (document.getElementById('google-res-url')) {
    document.getElementById('google-res-url').textContent = resUrl;
  }
}

if (document.getElementById('save-gcal-btn')) {
  document.getElementById('save-gcal-btn').onclick = async () => {
    const id = document.getElementById('gcal-id').value.trim();
    await db.from('settings').upsert({ restaurant_id: RID, key: 'gcal_id', value: id }, { onConflict: 'restaurant_id,key' });
    toast('Configuración de Google Calendar guardada ✓', 'success');
  };
}

window.copyToClipboard = (id) => {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => toast('Enlace copiado al portapapeles', 'success'));
};
