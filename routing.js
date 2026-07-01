/**
 * routing.js — GastroExperience Multi-tenant subdomain routing
 * 
 * Lee el subdominio de la URL y carga la config del restaurante
 * correspondiente desde Supabase. Si no hay subdominio (domain raíz),
 * usa la config por defecto de config.js.
 * 
 * Para nuevos restaurantes: el script new-client.js crea una entrada
 * en la tabla 'settings' con key='subdomain' y value=<subdomain>.
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

      // Cargar toda la config del restaurante
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

      const cfg = {};
      for (const row of configData) {
        try { cfg[row.key] = JSON.parse(row.value); } 
        catch { cfg[row.key] = row.value; }
      }
      cfg.restaurantId = restaurantId;
      return cfg;
    } catch (e) {
      console.error('Error cargando config del restaurante:', e);
      return null;
    }
  }

  // ── Aplicar config al APP_CONFIG global ────────────────
  function applyRestaurantConfig(cfg) {
    if (!cfg) return;
    Object.keys(cfg).forEach(key => {
      if (key === 'restaurantId') {
        APP_CONFIG.restaurantId = cfg[key];
      } else if (key !== 'barName' && key !== 'barTagline' && key !== 'barCity') {
        // No sobreescribir valores personalizados del bar
      }
    });
    if (cfg.barName)    APP_CONFIG.barName    = cfg.barName;
    if (cfg.barTagline) APP_CONFIG.barTagline = cfg.barTagline;
    if (cfg.barCity)    APP_CONFIG.barCity    = cfg.barCity;
    if (cfg.barAddress) APP_CONFIG.barAddress = cfg.barAddress;
    if (cfg.barPhone)   APP_CONFIG.barPhone   = cfg.barPhone;
    if (cfg.whatsapp)  APP_CONFIG.whatsapp   = cfg.whatsapp;
    if (cfg.instagram) APP_CONFIG.instagram = cfg.instagram;
    if (cfg.restaurantId) APP_CONFIG.restaurantId = cfg.restaurantId;
    window.__ROUTING__.config = cfg;
  }

  // ── Inicialización ────────────────────────────────────
  // Para páginas públicas: cargar config async y esperar
  // Para admin: la config se carga antes de inicializar Supabase
  if (window.__ROUTING__.subdomain) {
    loadRestaurantConfig(window.__ROUTING__.subdomain).then(cfg => {
      if (cfg) {
        applyRestaurantConfig(cfg);
        window.__ROUTING__.restaurantId = cfg.restaurantId;
        // Notificar a supabase.js que actualice el restaurant context
        window.dispatchEvent(new CustomEvent('restaurant-config-loaded', { detail: cfg }));
      }
      window.__ROUTING__.loaded = true;
    });
  } else {
    window.__ROUTING__.loaded = true;
  }
})();
