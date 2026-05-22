const { createClient } = require('@supabase/supabase-js');
const APP_CONFIG = {
  supabaseUrl: "https://xornvhqqjovcucpuqgoo.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhvcm52aHFxam92Y3VjcHVxZ29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4MzMzNTcsImV4cCI6MjA5MzQwOTM1N30.h_BtfKYbUF31nlgLJMRsEHK28tne9chq7bhYnM5uwFA",
  restaurantId: "demo-restaurante"
};

const supabase = createClient(APP_CONFIG.supabaseUrl, APP_CONFIG.supabaseKey);

async function test() {
  console.log('Testing connection to Supabase...');
  const { data, error } = await supabase.from('settings').select('*').eq('restaurant_id', APP_CONFIG.restaurantId);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Data count:', data.length);
    console.log('Data:', JSON.stringify(data, null, 2));
  }
}

test();
