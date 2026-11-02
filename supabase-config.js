const supabaseConfig = window.TD_CONFIG?.supabase || {};
const supabaseUrl = String(supabaseConfig.url || '').trim();
const supabaseKey = String(supabaseConfig.publishableKey || '').trim();

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ إعدادات Supabase العامة غير مكتملة. راجع td-config.js.');
} else if (typeof supabase === 'undefined') {
    console.error('❌ مكتبة Supabase غير محملة.');
} else {
    window.supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
    // Compatibility alias for older read-only code paths.
    window.supabase = window.supabaseClient;
    console.log('✅ Supabase client initialized.');
}
