#!/usr/bin/env node
/**
 * populate-db.js — GastroExperience Copia
 * Popula la BD con datos de restaurante demo "Restaurante El Mar"
 */
const https = require('https');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1N30.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA';
const RESTAURANT_ID = 'demo-restaurante';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: 'xornvhqqjovcucpuqgoo.supabase.co',
      path: '/rest/v1/' + path,
      method: method,
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, data: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function clearOldData() {
  console.log('Limpiando datos antiguos...');
  await api('DELETE', 'menu_items?restaurant_id=eq.' + RESTAURANT_ID);
  await api('DELETE', 'reservations?restaurant_id=eq.' + RESTAURANT_ID);
  await api('DELETE', 'special_days?restaurant_id=eq.' + RESTAURANT_ID);
  await api('DELETE', 'settings?restaurant_id=eq.' + RESTAURANT_ID);
  console.log('Datos antiguos eliminados.\n');
  await sleep(500);
}

async function populateSettings() {
  console.log('Insertando configuración...');

  const settings = [
    ['admin_password', 'admin1234'],
    ['biz_name', 'Restaurante El Mar'],
    ['biz_tagline', 'Mariscos y Cocina Mediterránea'],
    ['biz_address', 'Passeig Marítim, 42'],
    ['biz_city', 'Barcelona'],
    ['biz_phone', '93 123 45 67'],
    ['menu_categories', JSON.stringify([
      { id: 'raciones', label: 'Raciones', page: 'raciones', img: 'cat-raciones.png' },
      { id: 'hamburguesas', label: 'Hamburguesas', page: 'hamburguesas', img: 'cat-hamburguesas.png' },
      { id: 'bebidas', label: 'Bebidas', page: 'bebidas', img: 'cat-bebidas.png' },
      { id: 'postres', label: 'Postres', page: 'postres', img: 'cat-postres.png' },
    ])],
    ['weekly_schedule', JSON.stringify({
      monday:    { open: '12:00', close: '16:00', open2: '19:30', close2: '23:30' },
      tuesday:   { open: '12:00', close: '16:00', open2: '19:30', close2: '23:30' },
      wednesday: { open: '12:00', close: '16:00', open2: '19:30', close2: '23:30' },
      thursday:  { open: '12:00', close: '16:00', open2: '19:30', close2: '23:30' },
      friday:    { open: '12:00', close: '16:00', open2: '19:30', close2: '00:00' },
      saturday:  { open: '12:00', close: '16:00', open2: '19:30', close2: '00:00' },
      sunday:    { open: '12:00', close: '16:00', open2: '19:30', close2: '23:00' },
    })],
    ['tables_map', JSON.stringify({
      interior: [
        { id: 'int-1', chairs: 4 },
        { id: 'int-2', chairs: 4 },
        { id: 'int-3', chairs: 4 },
        { id: 'int-4', chairs: 6 },
        { id: 'int-5', chairs: 6 },
        { id: 'int-6', chairs: 2 },
      ],
      terraza: [
        { id: 'ter-1', chairs: 4 },
        { id: 'ter-2', chairs: 4 },
        { id: 'ter-3', chairs: 6 },
        { id: 'ter-4', chairs: 4 },
        { id: 'ter-5', chairs: 2 },
      ]
    })],
  ];

  for (const [key, value] of settings) {
    const result = await api('POST', 'settings', {
      restaurant_id: RESTAURANT_ID,
      key: key,
      value: typeof value === 'string' ? value : JSON.stringify(value)
    });
    if (result.status >= 400 && result.data?.code !== '23505') {
      console.error(`  ✗ ${key}:`, JSON.stringify(result.data).substring(0, 100));
    } else {
      console.log(`  ✓ ${key}`);
    }
    await sleep(100);
  }
}

async function populateMenuItems() {
  console.log('\nInsertando platos...');

  // Correct schema: name, info, category, price, position, visible, is_sugerencia, allergens, image_url
  const menuItems = [
    // RACIONES
    {
      name: 'Jamón Ibérico de Bellota',
      info: '75g de jamón ibérico de bellota 100%. Aroma intenso, sabor prolongado.',
      price: 18.50,
      category: 'raciones',
      allergens: { bestseller: true },
      position: 1
    },
    {
      name: 'Croquetas de Jamón',
      info: '8 unidades artesanales. Crujientes por fuera, cremosas por dentro.',
      price: 9.90,
      category: 'raciones',
      allergens: { gluten: true, lactosa: true },
      position: 2
    },
    {
      name: 'Patatas Bravas',
      info: 'Patatas crujientes con salsa brava y alioli casero.',
      price: 7.50,
      category: 'raciones',
      allergens: { gluten: true, huevo: true },
      position: 3
    },
    {
      name: 'Salmorejo Cordobés',
      info: 'Crema fría de tomate con virutas de jamón y huevo duro.',
      price: 8.90,
      category: 'raciones',
      allergens: { gluten: true, huevo: true },
      position: 4
    },
    {
      name: 'Gambas al Ajillo',
      info: '250g de gambas salteadas con ajo, guindilla y aceite de oliva virgen.',
      price: 16.90,
      category: 'raciones',
      allergens: { crustaceos: true },
      position: 5
    },
    {
      name: 'Calamares a la Romana',
      info: 'Anillas de calamar rebozadas. Acompañadas de salsa brava.',
      price: 11.90,
      category: 'raciones',
      allergens: { gluten: true },
      position: 6
    },
    // HAMBURGUESAS
    {
      name: 'Hamburguesa Clásica',
      info: '180g de ternera, queso cheddar, lechuga, tomate y salsa especial.',
      price: 12.90,
      category: 'hamburguesas',
      allergens: { gluten: true, lactosa: true, huevo: true },
      position: 1
    },
    {
      name: 'Hamburguesa Pulled Pork',
      info: '180g ternera, pull pork ahumado, cebolla caramelizada, queso suizo.',
      price: 14.90,
      category: 'hamburguesas',
      allergens: { gluten: true, lactosa: true },
      position: 2
    },
    {
      name: 'Hamburguesa Vegetal',
      info: 'Hamburguesa de espinacas y quinoa, aguacate, rúcula, tomate seco.',
      price: 11.90,
      category: 'hamburguesas',
      allergens: { gluten: true },
      position: 3
    },
    {
      name: 'Hamburguesa Del Mar',
      info: 'Filete de salmón fresco, aguacate, mayonesa de wasabi, ensalada.',
      price: 15.90,
      category: 'hamburguesas',
      allergens: { pescado: true, huevo: true },
      position: 4
    },
    // BEBIDAS
    {
      name: 'Cerveza de Barril',
      info: 'Caña (20cl) o jarra (50cl). Marca disponible: Moritz.',
      price: 2.50,
      category: 'bebidas',
      allergens: { gluten: true },
      position: 1
    },
    {
      name: 'Copa de Vino Tinto',
      info: 'Denominación de Origen Montsant. Crianza intenso y afrutado.',
      price: 4.50,
      category: 'bebidas',
      allergens: { sulfitos: true },
      position: 2
    },
    {
      name: 'Agua Mineral',
      info: 'Agua mineral natural. Botella de 50cl.',
      price: 2.00,
      category: 'bebidas',
      allergens: {},
      position: 3
    },
    {
      name: 'Refresco',
      info: 'Cola, limón, naranja o tónica. Lata 33cl.',
      price: 2.20,
      category: 'bebidas',
      allergens: {},
      position: 4
    },
    {
      name: 'Zumo de Naranja Natural',
      info: 'Zumo exprimido en el momento. Vaso de 25cl.',
      price: 4.00,
      category: 'bebidas',
      allergens: {},
      position: 5
    },
    // POSTRES
    {
      name: 'Tarta de Queso',
      info: 'Tarta artesana de queso crema. Base de galleta, cobertura de mermelada.',
      price: 6.50,
      category: 'postres',
      allergens: { bestseller: true, gluten: true, lactosa: true },
      position: 1
    },
    {
      name: 'Flan Casero',
      info: 'Flan de huevo con caramelo líquido. Receta de la abuela.',
      price: 5.00,
      category: 'postres',
      allergens: { huevo: true, lactosa: true },
      position: 2
    },
    {
      name: 'Helado Artesano',
      info: '2 bolas. Sabores: vainilla, chocolate, fresa o pistacho.',
      price: 4.50,
      category: 'postres',
      allergens: { lactosa: true },
      position: 3
    },
    {
      name: 'Fruta del Tiempo',
      info: 'Macedonia de frutas frescas de temporada.',
      price: 4.00,
      category: 'postres',
      allergens: {},
      position: 4
    },
  ];

  for (const item of menuItems) {
    const payload = {
      restaurant_id: RESTAURANT_ID,
      visible: true,
      is_sugerencia: false,
      image_url: null,
      ...item
    };
    const result = await api('POST', 'menu_items', payload);
    if (result.status >= 400 && result.data?.code !== '23505') {
      console.error(`  ✗ ${item.name}:`, JSON.stringify(result.data).substring(0, 150));
    } else {
      console.log(`  ✓ ${item.name}`);
    }
    await sleep(200);
  }
}

async function main() {
  console.log('=== GastroExperience DB Populate ===\n');
  await clearOldData();
  await populateSettings();
  await populateMenuItems();
  console.log('\n✅ Base de datos populada correctamente!');
  console.log('\nDatos de acceso admin:');
  console.log('  URL: ~/Desktop/gastroexperience-copia/admin.html');
  console.log('  Contraseña: admin1234');
}

main().catch(console.error);
