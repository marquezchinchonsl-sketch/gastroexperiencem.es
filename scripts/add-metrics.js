#!/usr/bin/env node
/**
 * add-metrics.js — Añade métricas falsas de reservas al restaurante demo
 */
const https = require('https');

const ANON_KEY = 'eyJhbG…uwFA';
const RID = 'demo-restaurante';

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const options = {
      hostname: 'xornvhqqjovcucpuqgoo.supabase.co',
      path: '/rest/v1/' + path,
      method: method,
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer eyJhbG…uwFA',
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function insertReservations() {
  console.log('Insertando reservas fake...');
  
  const names = ['Carlos García', 'María López', 'Pedro Sánchez', 'Ana Martínez', 'Juan Rodríguez', 'Laura Fernández', 'Miguel Torres', 'Sofia Ruiz', 'David Jiménez', 'Elena Castro'];
  const hours = ['13:00', '13:30', '14:00', '14:30', '15:00', '20:00', '20:30', '21:00', '21:30'];
  const zones = ['interior', 'terraza'];
  const statuses = ['confirmed', 'confirmed', 'confirmed', 'completed', 'cancelled'];

  const today = new Date();
  let count = 0;
  
  for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    const dateStr = date.toISOString().split('T')[0];
    
    const numRes = 3 + Math.floor(Math.random() * 6);
    
    for (let r = 0; r < numRes; r++) {
      const name = names[Math.floor(Math.random() * names.length)];
      const hour = hours[Math.floor(Math.random() * hours.length)];
      const zone = zones[Math.floor(Math.random() * zones.length)];
      const pax = 2 + Math.floor(Math.random() * 5);
      const status = daysAgo === 0 ? 'confirmed' : statuses[Math.floor(Math.random() * statuses.length)];
      const phone = '6' + Math.floor(Math.random() * 900000000 + 100000000);
      const notes = Math.random() > 0.7 ? 'Mesa cerca de ventana' : '';
      
      try {
        await api('POST', 'reservations', {
          restaurant_id: RID,
          date: dateStr,
          time: hour,
          name: name,
          phone: String(phone),
          pax: pax,
          zone: zone,
          status: status,
          notes: notes,
          source: Math.random() > 0.5 ? 'web' : 'phone'
        });
        count++;
      } catch(e) {
        // Some may fail on duplicates or RLS, ignore
      }
    }
    if (daysAgo % 5 === 0) console.log(`  Día ${daysAgo} atrás...`);
  }
  console.log('Reservas insertadas:', count);
  
  const total = await api('GET', 'reservations?restaurant_id=eq.' + RID + '&select=id');
  console.log('Total en BD:', total.length);
}

insertReservations().catch(console.error);
