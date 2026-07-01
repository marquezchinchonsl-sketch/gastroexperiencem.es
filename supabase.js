// supabase.js — MasReservas
// Carga Supabase como ES Module para evitar conflictos de global
// Si ya está definido, no cargar
if (typeof window.supabase !== 'undefined') {
  // Ya existe, no hacer nada
  window.__supabaseReady = true;
} else {
  // Cargar como ES module y esperar a que esté listo
  window.__supabaseReady = false;
  import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')
    .then(m => {
      window.supabase = m.default;
      window.__supabaseReady = true;
    })
    .catch(e => {
      console.error('Error loading supabase:', e);
    });
}
