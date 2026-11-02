const firebaseConfig = window.TD_CONFIG?.firebase || {};

window.firebaseReady = false;

(function initFirebase() {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
        console.error('❌ إعدادات Firebase غير مكتملة. راجع td-config.js.');
        return;
    }
    if (typeof firebase === 'undefined') {
        console.warn('⚠️ Firebase SDK غير محمل.');
        return;
    }
    try {
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        window.firebaseReady = true;
        console.log('✅ Firebase Auth جاهز');
    } catch (err) {
        console.error('❌ Firebase init failed:', err);
    }
})();
