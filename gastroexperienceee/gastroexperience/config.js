// ============================================================
//  GastroExperience — config.js
//  ⚠️  ESTE ES EL ÚNICO ARCHIVO QUE CAMBIA POR CADA CLIENTE
// ============================================================

const APP_CONFIG = {

  // ── 1. IDENTIDAD DEL NEGOCIO ────────────────────────────
  barName:    "MI RESTAURANTE",
  barTagline: "Gastrobar · Cocina de Mercado",
  barAddress: "Calle Ejemplo, 1",
  barCity:    "Madrid",
  barPhone:   "600 000 000",
  barPhone2:  "",

  // ── 2. REDES SOCIALES (dejar "" si no aplica) ───────────
  instagram:    "",
  facebook:     "",
  googleReviews:"",
  whatsapp:     "",

  // ── 3. URL PÚBLICA DEL SITIO (para el QR) ──────────────
  siteUrl: "https://gastroexperience.es",

  // ── 4. BASE DE DATOS SUPABASE ──────────────────────────
  supabaseUrl: "https://xornvhqqjovcucpuqgoo.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1N30.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA",

  // ── 5. ID ÚNICO DEL RESTAURANTE ────────────────────────
  restaurantId: "demo-restaurante",

  // ── 6. ZONAS DEL LOCAL ─────────────────────────────────
  zones: [
    { id: "interior", title: "Interior",  capacity: 20 },
    { id: "terraza",  title: "Terraza",   capacity: 30 },
  ],

  // ── 7. CATEGORÍAS DE LA CARTA ──────────────────────────
  menuCategories: [
    { id: "raciones",     label: "Raciones",     page: "raciones",     img: "images/cat-raciones.png"     },
    { id: "hamburguesas", label: "Hamburguesas",  page: "hamburguesas",  img: "images/cat-hamburguesas.png" },
    { id: "bebidas",      label: "Bebidas",       page: "bebidas",       img: "images/cat-bebidas.png"      },
    { id: "postres",      label: "Postres",        page: "postres",       img: "images/cat-postres.png"      },
  ],

  // ── 8. CONTRASEÑA DEL PANEL DE ADMIN ──────────────────
  adminPasswords: ["admin1234"],

};

if (typeof module !== 'undefined') module.exports = APP_CONFIG;

// ── SAAS FEATURES: TRADUCCIÓN Y TRACKING ─────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    // 1. Inyectar Google Translate en clientes
    if (document.body && !document.getElementById('google_translate_element') && !window.location.pathname.includes('admin')) {
      const gt = document.createElement('div');
      gt.id = 'google_translate_element';
      gt.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:9999; background:white; border-radius:8px; padding:5px; box-shadow:0 4px 12px rgba(0,0,0,0.1);';
      document.body.appendChild(gt);

      window.googleTranslateElementInit = function() {
        new google.translate.TranslateElement({pageLanguage: 'es', includedLanguages: 'en,fr,de,it,pt,es', layout: google.translate.TranslateElement.InlineLayout.SIMPLE}, 'google_translate_element');
      };
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit';
      document.body.appendChild(script);
    }

    // 2. Tracking de Vistas de Categorías
    let path = window.location.pathname.split('/').pop() || 'index';
    if (path.endsWith('.html')) path = path.replace('.html', '');
    if (path === 'index' || path === '') path = 'index'; // Normalizar inicio
    if (!window.location.pathname.includes('admin') && typeof supabase !== 'undefined') {
      const db = supabase.createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);
      db.from('settings').select('value').eq('restaurant_id', APP_CONFIG.restaurantId).eq('key', 'stats_views').single()
        .then(({data}) => {
          let views = data?.value ? JSON.parse(data.value) : {};
          views[path] = (views[path] || 0) + 1;
          db.from('settings').upsert({ restaurant_id: APP_CONFIG.restaurantId, key: 'stats_views', value: JSON.stringify(views) }).then();
        });

      // 3. WebSockets para auto-refresh MÁGICO en Cliente
      if (path.includes('reservas')) {
        db.channel('public:reservations_client')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `restaurant_id=eq.${APP_CONFIG.restaurantId}` }, () => {
             if (window.renderSlots) window.renderSlots();
          }).subscribe();
          
        db.channel('public:settings_client')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `restaurant_id=eq.${APP_CONFIG.restaurantId}` }, async () => {
             if (window.loadZones) await window.loadZones();
             if (window.renderSlots) window.renderSlots();
          }).subscribe();
          
        db.channel('public:special_days_client')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'special_days', filter: `restaurant_id=eq.${APP_CONFIG.restaurantId}` }, () => {
             if (window.renderSlots) window.renderSlots();
          }).subscribe();
      }
      else if (path.includes('index') || path === '' || path === '/') {
        db.channel('public:settings_home')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `restaurant_id=eq.${APP_CONFIG.restaurantId}` }, () => {
             if (window.loadCategories) window.loadCategories();
          }).subscribe();
      }
      else {
        db.channel('public:menu_items_client')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items', filter: `restaurant_id=eq.${APP_CONFIG.restaurantId}` }, () => {
             if (window.loadProducts) {
               const content = document.getElementById('menu-content');
               if (content) {
                 Array.from(content.querySelectorAll('.menu-item, .subcategory-title')).forEach(c => c.remove());
               }
               window.loadProducts();
             }
          }).subscribe();
      }
    }

    // 4. Parche "Más Vendido" en la UI de cliente
    setTimeout(() => {
      if (typeof ALLERGEN_NAMES !== 'undefined') {
        ALLERGEN_NAMES['bestseller'] = '🔥 MÁS VENDIDO';
      }
    }, 50);
  });
}
