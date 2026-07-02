/**
 * routing.js — GastroExperience Multi-tenant subdomain routing
 * 
 * Lee el subdominio de la URL y carga la config del restaurante
 * correspondiente desde Supabase (tabla 'settings', key='subdomain').
 * Actualiza APP_CONFIG con las credenciales del restaurante y
 * re-inicializa el cliente Supabase global para usar la BD correcta.
 * 
 * Si no hay subdominio (dominio raíz), usa config.js por defecto.
 */

(function() {
  'use strict';

  // ── Extraer subdominio de la URL ────────────────────────
  function getSubdomain() {
    const host = window.location.hostname; // e.g. "barpepe.gastroexperiencem.es"
    const parts = host.split('.');
    // Si tenemos subdominio (3+ partes): subdominio.dominio.tld
    if (parts.length >= 3 && parts[0] !== 'www') {
      return parts[0]; // "barpepe"
    }
    return null; // Dominio principal o localhost
  }

  // ── Guardar restaurant_id para uso por supabase.js y config.js ──
  window.__ROUTING__ = {
    subdomain: getSubdomain(),
    restaurantId: null, // se填充 después de cargar config
    config: null,       // se填充 después de cargar config
    loaded: false
  };

  // ── Cargar config del restaurante desde Supabase ───────
  async function loadRestaurantConfig(subdomain) {
    if (!subdomain) return null;

    try {
      const res = await fetch(
        `${APP_CONFIG.supabaseUrl}/rest/v1/settings?key=eq.subdomain&value=eq.${encodeURIComponent(subdomain)}&select=restaurant_id`,
        {
          headers: {
            'apikey': APP_CONFIG.supabaseKey,
            'Content-Type': 'application/json'
          }
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || data.length === 0) return null;

      const restaurantId = data[0].restaurant_id;

      // Cargar toda la config del restaurante desde la MISMA BD
      // (el proyecto Supabase donde está registrada esta config)
      const configRes = await fetch(
        `${APP_CONFIG.supabaseUrl}/rest/v1/settings?restaurant_id=eq.${encodeURIComponent(restaurantId)}&select=key,value`,
        {
          headers: {
            'apikey': APP_CONFIG.supabaseKey,
            'Content-Type': 'application/json'
          }
        }
      );
      if (!configRes.ok) return null;
      const configData = await configRes.json();

      const cfg = { restaurant_id: restaurantId };
      for (const row of configData) {
        try { cfg[row.key] = JSON.parse(row.value); } 
        catch { cfg[row.key] = row.value; }
      }
      return cfg;
    } catch (e) {
      console.error('Error cargando config del restaurante:', e);
      return null;
    }
  }

  // ── Aplicar config al APP_CONFIG global ────────────────
  function applyRestaurantConfig(cfg) {
    if (!cfg) return;
    
    // Actualizar credentials si el restaurante tiene su propia BD
    if (cfg.supabase_url)  APP_CONFIG.supabaseUrl  = cfg.supabase_url;
    if (cfg.supabase_key)  APP_CONFIG.supabaseKey  = cfg.supabase_key;
    if (cfg.restaurant_id) APP_CONFIG.restaurantId = cfg.restaurant_id;
    
    // Info pública del bar
    if (cfg.bar_name)     APP_CONFIG.barName     = cfg.bar_name;
    if (cfg.bar_tagline)  APP_CONFIG.barTagline  = cfg.bar_tagline;
    if (cfg.bar_city)     APP_CONFIG.barCity      = cfg.bar_city;
    if (cfg.bar_address)  APP_CONFIG.barAddress   = cfg.bar_address;
    if (cfg.bar_phone)    APP_CONFIG.barPhone     = cfg.bar_phone;
    if (cfg.whatsapp)     APP_CONFIG.whatsapp     = cfg.whatsapp;
    if (cfg.instagram)    APP_CONFIG.instagram    = cfg.instagram;
    if (cfg.biz_name)     APP_CONFIG.barName      = cfg.biz_name;
    
    // Aplicar schedule y zonas si existen
    if (cfg.weekly_schedule) {
      try {
        const sched = typeof cfg.weekly_schedule === 'string' ? JSON.parse(cfg.weekly_schedule) : cfg.weekly_schedule;
        APP_CONFIG.weeklySchedule = sched;
      } catch(e) {}
    }
    if (cfg.zones_config) {
      try {
        const zones = typeof cfg.zones_config === 'string' ? JSON.parse(cfg.zones_config) : cfg.zones_config;
        APP_CONFIG.zones = zones;
      } catch(e) {}
    }
    
    window.__ROUTING__.config = cfg;
    
    // Re-inicializar Supabase client con las credenciales correctas
    if (typeof window.supabase !== 'undefined' && APP_CONFIG.supabaseUrl && APP_CONFIG.supabaseKey) {
      try {
        window.db = window.supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
        // Actualizar el canal RLS con el restaurant_id correcto
        if (cfg.restaurant_id && window.db.rpc) {
          window.db.rpc('set_current_restaurant', { p_restaurant_id: cfg.restaurant_id }).then(()=>{}).catch(()=>{});
        }
      } catch(e) { console.warn('Supabase re-init error:', e); }
    }
    
    // Actualizar标签栏
    if (cfg.bar_name || cfg.biz_name) {
      const name = cfg.bar_name || cfg.biz_name;
      if (window.__UPDATE_BAR_NAME__) window.__UPDATE_BAR_NAME__(name);
    }
  }

  // ── Inicialización ────────────────────────────────────
  if (window.__ROUTING__.subdomain) {
    loadRestaurantConfig(window.__ROUTING__.subdomain).then(cfg => {
      if (cfg) {
        applyRestaurantConfig(cfg);
        window.__ROUTING__.restaurantId = cfg.restaurant_id || cfg.restaurantId;
        window.dispatchEvent(new CustomEvent('restaurant-config-loaded', { detail: cfg }));
      }
      window.__ROUTING__.loaded = true;
      window.dispatchEvent(new CustomEvent('routing-complete'));
    });
  } else {
    window.__ROUTING__.loaded = true;
    window.dispatchEvent(new CustomEvent('routing-complete'));
  }
})();
