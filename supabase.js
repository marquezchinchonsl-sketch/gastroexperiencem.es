// supabase.js — GastroExperience
// Previene doble-carga del CDN de Supabase
(function() {
  if (typeof window.supabase !== 'undefined') return;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  s.onload = function() { window.__supabaseLoaded = true; };
  document.head.appendChild(s);
})();
