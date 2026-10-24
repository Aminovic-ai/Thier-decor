const supabaseUrl = 'https://xdsbnmtthvqgdlytwpes.supabase.co';
const supabaseKey = 'sb_publishable_7F6Bg9zRlX61rdZo60A4iQ_ZYBvqt1b';

if (typeof supabase === 'undefined') {
    console.error('❌ مكتبة Supabase غير محملة.');
} else {
    window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    // Compatibility alias for any older code paths; app.js should prefer supabaseClient.
    window.supabase = window.supabaseClient;
    console.log('✅ Supabase connecté avec succès!');
}