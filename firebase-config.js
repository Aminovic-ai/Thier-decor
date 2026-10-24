const firebaseConfig = {
    apiKey: "AIzaSyBmob1xf1KYX3GD96WITFWeRN3kuVBBtis",
    authDomain: "thier-decor.firebaseapp.com",
    projectId: "thier-decor",
    storageBucket: "thier-decor.firebasestorage.app",
    messagingSenderId: "257928891637",
    appId: "1:257928891637:web:6f28e77af2f7d569a809bc"
};

window.firebaseReady = false;

(function initFirebase() {
    if (typeof firebase === 'undefined') { 
        console.warn('⚠️ Firebase SDK غير محمل.'); 
        return; 
    }
    try {
        if (!firebase.apps.length) { 
            firebase.initializeApp(firebaseConfig); 
        }
        window.firebaseReady = true; 
        console.log('✅ Firebase (Auth) prêt');
    } catch (err) { 
        console.error('❌ Firebase init failed:', err); 
    }
})();