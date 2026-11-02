// Thier Décor public runtime configuration.
// SAFE FOR THE BROWSER: only public identifiers and publishable keys belong here.
// NEVER add Supabase service-role/secret keys, Cloudflare secrets, or shared passwords.
window.TD_CONFIG = Object.freeze({
  apiUrl: "", // Fill after the new Cloudflare Worker is created.
  adminUid: "DNlHoogN8vMCsZN0hyIC6yPS64J2",
  supabase: {
    url: "", // Fill after the new Supabase project is created.
    publishableKey: "" // Fill with the new project publishable key.
  },
  // Firebase remains the current administrator sign-in project for now.
  firebase: {
    apiKey: "AIzaSyBmob1xf1KYX3GD96WITFWeRN3kuVBBtis",
    authDomain: "thier-decor.firebaseapp.com",
    projectId: "thier-decor",
    storageBucket: "thier-decor.firebasestorage.app",
    messagingSenderId: "257928891637",
    appId: "1:257928891637:web:6f28e77af2f7d569a809bc"
  }
});
