const K = { products: 'td_prod', orders: 'td_ord', expenses: 'td_exp', settings: 'td_set', customers: 'td_cust', session: 'td_sess', cart: 'td_cart', lang: 'td_lang', messages: 'td_msg', requests: 'td_req', wishlist: 'td_wish' };
let state = { products: [], orders: [], expenses: [], customers: [], messages: [], requests: [], session: null, cart: [], wishlist: [], currentLang: 'ar', settings: { shopName: 'Thier Décor', shopPhone: '', promoText: '', promoActive: false, customPrices: {}, manualSalesAdjustment: 0, adActive: false, adImages: [], adText: '', adEndTime: '', coupons: [] } };
window.state = state;
let currentCategory = 'all'; let currentOrderFilter = 'all'; let tempUploadedImages = []; let currentAuthMode = 'login'; let pendingCheckout = false;
let tempAdImages = []; let adSliderInterval = null; let currentAdIndex = 0; let appliedCoupon = null; let lastKnownOrderId = null; let lastKnownMessageId = null;
// Stock changes made while editing an order are drafts until Save is pressed.
window.pendingStockDelta = new Map();
let editingOrderOriginal = null;

function playNotificationSound() {
    try {
        const audio = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
        audio.volume = 0.5; audio.play().catch(e => console.log('المتصفح منع الصوت:', e));
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } catch (e) {}
}
if ('Notification' in window) Notification.requestPermission();

const save = (key, val) => {
    try {
        // Never persist customer password hashes or recovery PINs in browser storage.
        const safeVal = key === K.customers && Array.isArray(val)
            ? val.map(customer => { const copy = { ...customer }; delete copy.password; delete copy.recoveryPin; return copy; })
            : val;
        localStorage.setItem(key, JSON.stringify(safeVal));
    } catch (e) { console.warn('Local cache save failed:', e); }
};
const load = (key, def) => { try { const d = localStorage.getItem(key); return d ? JSON.parse(d) : def; } catch (e) { return def; } };
const esc = (s) => s ? String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]) : '';
const fmtMoney = (amt) => (Number(amt) || 0).toLocaleString('fr-FR') + (state.currentLang === 'ar' ? ' دج' : ' DA');

function toast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.className = 'toast show ' + (type === 'error' ? 'error' : '');
    setTimeout(() => t.className = 'toast', 3000);
}
window.toast = toast;

const i18n = {
    ar: {
        delivery_method: "طريقة التوصيل", courier_company: "شركة التوصيل", delivery_type: "نوع التوصيل", home_delivery: "التوصيل للمنزل", office_delivery: "التوصيل للمكتب", no_offices: "لا توجد نقاط استلام مسجلة لهذه الولاية", yalidine_network: "Yalidine / Guepex", yalidine_prices_title: "أسعار التوصيل Yalidine / Guepex (58 ولاية)", yalidine_prices_note: "اترك الحقل فارغًا لاستخدام السعر الافتراضي، أو أدخل السعر الذي تريده بالدينار.", save_yalidine_prices: "حفظ أسعار Yalidine / Guepex", tagline: "تسوق أونلاين", my_account: "حسابي", cart: "السلة", home: "الرئيسية", my_orders: "طلباتي", my_messages: "رسائلي", my_requests: "طلباتي الخاصة", settings: "إعداداتي",
        hero_title: "عروض الموسم", hero_desc: "أفضل المنتجات وتوصيل لكل الولايات", available_products: "المنتجات", categories: "الأصناف",
        cart_title: "🛒 السلة", checkout_btn: "إتمام الطلب", orders_title: "📋 طلباتي", profile_title: "👤 الملف الشخصي",
        full_name: "الاسم", phone: "الهاتف", address: "العنوان", save_changes: "حفظ", logout: "خروج",
        admin_title: "لوحة التحكم", login_btn: "دخول آمن", register_btn: "إنشاء حساب", back_to_shop: "العودة", return_to_visitor: "العودة لصفحة الزائر",
        admin_home: "الملخص", admin_orders: "الطلبيات", admin_products: "المنتجات", admin_expenses: "المصروفات", admin_customers: "الزبائن",
        admin_messages: "الرسائل", admin_reports: "التقارير", admin_settings: "الإعدادات", admin_requests: "طلبات خاصة", show_store: "المتجر",
        capital: "رأس المال", sales: "المبيعات", expenses: "المصروفات", profit: "الربح", all: "الكل", new: "جديدة", confirmed: "مؤكدة",
        on_the_way: "في الطريق", out_for_delivery: "لحظة الاستلام", delivered: "مسلمة", cancelled: "ملغاة", confirm_receipt: "📦 تأكيد الاستلام",
        add_product: "إضافة منتج", add_expense: "إضافة مصروف", general_settings: "عام", delivery_settings: "التوصيل", shop_name: "اسم المتجر", shop_phone: "رقم هاتف المتجر", shop_address: "عنوان المتجر",
        logo_url: "رابط صورة الشعار (Logo)", admin_pass: "كلمة سر المسؤول", recovery_pin: "الرقم السري للاسترجاع", forgot_pass: "نسيت كلمة السر؟",
        address_placeholder_admin: "الجزائر العاصمة...", recovery_placeholder: "مثال: 123456", promo_text: "نص الإشهار", activate_promo: "تفعيل الإشهار",
        save_settings: "حفظ الإعدادات", wilaya: "الولاية", company: "الشركة", home_price: "سعر المنزل", desk_price: "سعر المكتب",
        save_prices: "حفظ الأسعار", delivery_note: "* ملاحظة: أي سعر تقوم بحفظه هنا سيلغي السعر الافتراضي.", add_to_cart: "أضف للسلة",
        confirm_order: "تأكيد", delivery_cost: "التوصيل:", product_name: "اسم المنتج", price: "السعر", cost: "التكلفة", quantity: "الكمية",
        category: "الصنف", images_upload: "إضافة صور من الهاتف", description: "الوصف", save: "حفظ", title: "العنوان", amount: "المبلغ",
        date: "التاريخ", password: "كلمة المرور", contact_us: "اتصل بنا / شكاوى", message_text: "نص الرسالة", send_message: "إرسال",
        tracking_code: "كود التتبع", save_and_send: "حفظ وإرسال", your_tracking_code: "كود التتبع الخاص بك", admin_replies: "ردود الإدارة ورسائلي",
        your_message: "رسالتك", admin_reply: "رد الإدارة", under_review: "قيد المراجعة...", reply_placeholder: "اكتب ردك للزبون هنا...",
        send_reply: "إرسال الرد", previous_reply: "ردك السابق", no_messages: "لا توجد رسائل حالياً", no_previous_messages: "لا توجد رسائل سابقة",
        login_to_see_messages: "سجل الدخول لرؤية رسائلك", write_message_first: "اكتب رسالتك أولاً", write_reply_first: "اكتب رداً أولاً",
        msg_sent_success: "تم إرسال رسالتك بنجاح", reply_sent_success: "تم إرسال الرد بنجاح", delete_message_confirm: "حذف هذه الرسالة؟",
        tracking_saved_success: "تم حفظ كود التتبع", message_placeholder: "اكتب رسالتك هنا...", delete: "حذف", cancel: "إلغاء",
        order_details: "تفاصيل الطلب", delivery_address: "عنوان التوصيل", delivery_options: "خيارات التوصيل", products_price: "سعر المنتجات:",
        total_price: "المجموع الكلي:", commune_placeholder: "اكتب اسم البلدية...", select_office: "اختر المكتب المتوفر...",
        no_office: "لا يوجد مكتب في هذه الولاية", address_placeholder: "العنوان التفصيلي...", search_placeholder: "ابحث...",
        search_customers_placeholder: "ابحث بالاسم أو رقم الهاتف...", welcome_back: "مرحباً بك مجدداً", welcome_new: "تم إنشاء حسابك بنجاح",
        logged_out: "تم تسجيل الخروج", debt_alert: "تنبيه: لديك دين متبقٍ", paid_amount: "المبلغ المدفوع", remaining_debt: "الدين المتبقي",
        save_debt: "حفظ الدين", free_delivery: "توصيل مجاني", is_pack_label: "هل هذا المنتج باك (Pack)؟",
        is_special_label: "⭐ هل هذا منتج خاص (يُصنع حسب الطلب)؟", special_badge: "خاص", pack_badge: "باك",
        rep_day: "📅 تقرير اليوم", rep_week: "🗓️ تقرير الأسبوع", rep_month: "📆 تقرير الشهر", request_product: "اطلب منتجك الخاص (سنوفره لك)",
        submit_request: "إرسال الطلب", edit_order: "تعديل الطلب", save_changes_order: "حفظ التعديلات", add_product_to_order: "إضافة منتج للطلب",
        no_requests: "لا توجد طلبات حالياً", request_sent_success: "تم إرسال طلبك للمسؤول بنجاح", request_details: "تفاصيل المنتج المطلوب",
        cart_empty: "السلة فارغة", login_first: "يرجى تسجيل الدخول أولاً", complete_address: "أكمل معلومات العنوان", updated: "تم التحديث",
        deleted: "تم الحذف", max_stock: "الكمية القصوى", wrong_pass: "كلمة السر خاطئة", saved: "تم الحفظ", save_failed: "حدث خطأ",
        top_only_feature: "👑 هذه الخدمة متاحة لأصحاب التاج فقط", admin_debts: "الديون", wishlist_title: "مفضلتي", points_title: "نقاط الولاء", 
        coupons_tab: "كوبونات الخصم", image_ads_title: "إشهار الصور", activate_ad: "تفعيل إشهار الصور", ad_text: "نص الإشهار", ad_endtime: "وقت الانتهاء", 
        ad_images: "الصور", print_labels: "طباعة بوالص الشحن", export_orders: "تصدير الطلبات", export_customers: "تصدير الزبائن", 
        sort_default: "الترتيب الافتراضي", sort_price_asc: "السعر: من الأقل للأعلى", sort_price_desc: "السعر: من الأعلى للأقل", sort_newest: "الأحدث أولاً", 
        calc_delivery: "احسب التوصيل:", reviews_title: "تقييمات الزبائن ⭐", review_placeholder: "اكتب تقييمك...", coupon_placeholder: "كود الخصم...", 
        apply: "تطبيق", discount: "الخصم", call_us: "اتصل بنا للطلب", home_del: "🏠 المنزل", desk_del: "🏢 المكتب", add_coupon: "إضافة", 
        new_products_title: "✨ منتجات جديدة وصلت!", new_products_desc: "تصفح أحدث المنتجات المضافة حديثاً", print_invoice: "طباعة الفاتورة",
        no_products: "لا توجد منتجات", no_orders: "لا توجد طلبيات", no_customers: "لا يوجد زبائن", no_results: "لا يوجد نتائج",
        no_debts: "لا توجد ديون", status_pending: "قيد المعالجة", status_fulfilled: "تم التوفير", status_rejected: "مرفوض",
        grant_crown: "منح تاج", grant_star: "منح نجمة", block: "حظر", unblock: "فك الحظر", crown: "تاج", star: "نجمة", blocked_badge: "محظور",
        export_noest: "تصدير طلبيات Noest (CSV)", download_excel: "تحميل ملف CSV", noest_prices: "🚚 أسعار Noest",
        confirm_receipt_q: "هل أنت متأكد من أنك استلمت هذا الطلب؟", receipt_confirmed: "✅ تم تأكيد الاستلام، شكراً لك!",
        order_num: "طلب", total_with_delivery: "المجموع + التوصيل:", date_label: "التاريخ",
        ends_soon: "ينتهي قريباً", review_export: "راجع قبل التصدير:", review_export_desc: "عدّل الأسعار أو احذف الصفوف، ثم اضغط تحميل الملف.",
        rows_count: "عدد الصفوف:", update: "تحديث", select_wilaya_first: "اختر الولاية أولاً...", empty_wishlist: "مفضلتك فارغة",
        delete_order_confirm: "حذف الطلب نهائياً؟", delete_product_confirm: "حذف المنتج؟", delete_customer_confirm: "حذف الزبون نهائياً؟ (طلباته ستبقى)",
        delete_expense_confirm: "حذف المصروف؟", delete_request_confirm: "حذف الطلب الخاص؟", reject_request_confirm: "رفض الطلب الخاص؟",
        no_reviews: "لا توجد تقييمات.", no_products_cart: "لا توجد منتجات في السلة.", error_connection: "حدث خطأ في الاتصال",
        save_error: "خطأ في الحفظ: ", insert_error: "خطأ في الإضافة: ", order_failed: "❌ فشل حفظ الطلب", error_fetch: "حدث خطأ في تحميل البيانات"
    },
    fr: {
        delivery_method: "Mode de livraison", courier_company: "Transporteur", delivery_type: "Type de livraison", home_delivery: "Livraison à domicile", office_delivery: "Livraison au bureau", no_offices: "Aucun point de retrait enregistré pour cette wilaya", yalidine_network: "Yalidine / Guepex", yalidine_prices_title: "Tarifs Yalidine / Guepex (58 wilayas)", yalidine_prices_note: "Laissez le champ vide pour utiliser le tarif par défaut, ou saisissez un tarif en dinars.", save_yalidine_prices: "Enregistrer les tarifs Yalidine / Guepex",
        tagline: "Achetez en ligne", my_account: "Mon Compte", cart: "Panier", home: "Accueil", my_orders: "Mes Commandes", my_messages: "Mes Messages",
        my_requests: "Mes Demandes", settings: "Paramètres", hero_title: "Offres de la saison", hero_desc: "Meilleurs produits et livraison partout",
        available_products: "Produits", categories: "Catégories", cart_title: "🛒 Panier", checkout_btn: "Commander", orders_title: "📋 Mes Commandes",
        profile_title: "👤 Profil", full_name: "Nom", phone: "Téléphone", address: "Adresse", save_changes: "Sauver", logout: "Déconnexion",
        admin_title: "Tableau de Bord", login_btn: "Connexion", register_btn: "S'inscrire", back_to_shop: "Retour", return_to_visitor: "Retour", admin_home: "Résumé",
        admin_orders: "Commandes", admin_products: "Produits", admin_expenses: "Dépenses", admin_customers: "Clients", admin_messages: "Messages",
        admin_reports: "Rapports", admin_settings: "Paramètres", admin_requests: "Demandes spéciales", show_store: "Boutique", capital: "Capital",
        sales: "Ventes", expenses: "Dépenses", profit: "Bénéfice", all: "Tous", new: "Nouveau", confirmed: "Confirmée", 
        on_the_way: "En route", out_for_delivery: "En cours de livraison", delivered: "Livré", cancelled: "Annulé", confirm_receipt: "📦 Confirmer la réception",
        add_product: "Ajouter Produit", add_expense: "Ajouter Dépense", general_settings: "Général",
        delivery_settings: "Livraison", shop_name: "Nom de la boutique", shop_phone: "Téléphone", shop_address: "Adresse",
        logo_url: "URL du logo", admin_pass: "Mot de passe Admin", recovery_pin: "Code de récupération", forgot_pass: "Mot de passe oublié ?",
        address_placeholder_admin: "Alger...", recovery_placeholder: "Ex: 123456", promo_text: "Texte d'annonce", activate_promo: "Activer l'annonce",
        save_settings: "Sauver Paramètres", wilaya: "Wilaya", company: "Société", home_price: "Prix Domicile", desk_price: "Prix Bureau",
        save_prices: "Sauver Prix", delivery_note: "* Remarque : Tout prix enregistré ici annulera le prix par défaut.", add_to_cart: "Ajouter au panier",
        confirm_order: "Confirmer", delivery_cost: "Livraison:", product_name: "Nom du produit", price: "Prix", cost: "Coût", quantity: "Quantité",
        category: "Catégorie", images_upload: "Ajouter des photos", description: "Description", save: "Sauver", title: "Titre",
        amount: "Montant", date: "Date", password: "Mot de passe", contact_us: "Contactez-nous", message_text: "Texte du message",
        send_message: "Envoyer", tracking_code: "Code de suivi", save_and_send: "Sauvegarder et envoyer", your_tracking_code: "Votre code",
        admin_replies: "Réponses", your_message: "Votre message", admin_reply: "Réponse", under_review: "En cours...",
        reply_placeholder: "Écrivez votre réponse...", send_reply: "Envoyer", previous_reply: "Votre réponse", no_messages: "Aucun message",
        no_previous_messages: "Aucun message précédent", login_to_see_messages: "Connectez-vous", write_message_first: "Écrivez d'abord",
        write_reply_first: "Écrivez une réponse", msg_sent_success: "Message envoyé", reply_sent_success: "Réponse envoyée", 
        delete_message_confirm: "Supprimer ?", tracking_saved_success: "Code enregistré", message_placeholder: "Écrivez ici...", 
        delete: "Supprimer", cancel: "Annuler", order_details: "Détails", delivery_address: "Adresse", 
        delivery_options: "Options", products_price: "Produits:", total_price: "Total:", commune_placeholder: "Commune...", 
        select_office: "Choisir...", no_office: "Aucun bureau", address_placeholder: "Adresse...", search_placeholder: "Rechercher...",
        search_customers_placeholder: "Chercher client...", welcome_back: "Bon retour", welcome_new: "Compte créé", 
        logged_out: "Déconnecté", debt_alert: "Dette restante", paid_amount: "Montant payé", remaining_debt: "Reste à payer",
        save_debt: "Sauver", free_delivery: "Gratuit", is_pack_label: "Pack ?", is_special_label: "Spécial ?", special_badge: "SPÉCIAL", 
        pack_badge: "PACK", rep_day: "📅 Jour", rep_week: "🗓️ Semaine", rep_month: "📆 Mois", request_product: "Demander un produit",
        submit_request: "Envoyer", edit_order: "Modifier", save_changes_order: "Enregistrer", add_product_to_order: "Ajouter", 
        no_requests: "Aucune demande", request_sent_success: "Demande envoyée", request_details: "Détails", cart_empty: "Panier vide", 
        login_first: "Connectez-vous", complete_address: "Complétez", updated: "Mis à jour", deleted: "Supprimé", max_stock: "Stock max", 
        wrong_pass: "Mot de passe incorrect", saved: "Sauvegardé", save_failed: "Erreur", top_only_feature: "👑 Réservé VIP", admin_debts: "Dettes", 
        wishlist_title: "Ma Liste", points_title: "Points", coupons_tab: "Coupons", image_ads_title: "Publicité", activate_ad: "Activer", 
        ad_text: "Texte", ad_endtime: "Date fin", ad_images: "Images", print_labels: "Imprimer Bons", export_orders: "Exporter Commandes", 
        export_customers: "Exporter Clients", sort_default: "Défaut", sort_price_asc: "Prix +", sort_price_desc: "Prix -", sort_newest: "Nouveaux", 
        calc_delivery: "Livraison:", reviews_title: "Avis ⭐", review_placeholder: "Votre avis...", coupon_placeholder: "Code promo...", 
        apply: "Appliquer", discount: "Remise", call_us: "Appelez-nous", home_del: "🏠 Domicile", desk_del: "🏢 Bureau", add_coupon: "Ajouter",
        new_products_title: "✨ Nouveaux produits !", new_products_desc: "Découvrez les derniers produits", print_invoice: "Imprimer Facture",
        no_products: "Aucun produit", no_orders: "Aucune commande", no_customers: "Aucun client", no_results: "Aucun résultat",
        no_debts: "Aucune dette", status_pending: "En cours", status_fulfilled: "Fourni", status_rejected: "Rejeté",
        grant_crown: "Couronne", grant_star: "Étoile", block: "Bloquer", unblock: "Débloquer", crown: "Couronne", star: "Étoile", blocked_badge: "Bloqué",
        export_noest: "Exporter Commandes Noest (CSV)", download_excel: "Télécharger CSV", noest_prices: "🚚 Prix Noest",
        confirm_receipt_q: "Êtes-vous sûr d'avoir reçu cette commande ?", receipt_confirmed: "✅ Réception confirmée, merci !",
        order_num: "Commande", total_with_delivery: "Total + Livraison:", date_label: "Date",
        ends_soon: "Bientôt terminé", review_export: "Vérifier avant export :", review_export_desc: "Modifiez les prix ou supprimez des lignes, puis cliquez sur Télécharger.",
        rows_count: "Nombre de lignes :", update: "Actualiser", select_wilaya_first: "Choisir la wilaya...", empty_wishlist: "Votre liste est vide",
        delete_order_confirm: "Supprimer la commande ?", delete_product_confirm: "Supprimer le produit ?", delete_customer_confirm: "Supprimer le client ? (commandes conservées)",
        delete_expense_confirm: "Supprimer la dépense ?", delete_request_confirm: "Supprimer la demande ?", reject_request_confirm: "Rejeter la demande ?",
        no_reviews: "Aucun avis.", no_products_cart: "Panier vide.", error_connection: "Erreur de connexion",
        save_error: "Erreur de sauvegarde : ", insert_error: "Erreur d'ajout : ", order_failed: "❌ Échec de la commande", error_fetch: "Erreur de chargement"
    }
};
Object.assign(i18n.ar, { notifications: "الإشعارات", mark_all_read: "تحديد الكل كمقروء", store_analytics: "إحصائيات المتجر", registered_customers: "الزبائن المسجلون", all_orders: "كل الطلبيات", new_orders: "الطلبيات الجديدة", all_messages: "الرسائل", visits_today: "زيارات اليوم", visits_total: "إجمالي الزيارات", refresh: "تحديث" });
Object.assign(i18n.fr, { notifications: "Notifications", mark_all_read: "Tout marquer comme lu", store_analytics: "Statistiques de la boutique", registered_customers: "Clients inscrits", all_orders: "Toutes les commandes", new_orders: "Nouvelles commandes", all_messages: "Messages", visits_today: "Visites aujourd'hui", visits_total: "Total des visites", refresh: "Actualiser" });

Object.assign(i18n.ar, { view_categories:"عرض الأصناف", view_all_products:"عرض كل المنتجات", create_pack:"إنشاء Pack", create_promo:"برومو", pack_name:"اسم المجموعة", pack_category:"صنف المجموعة", choose_pack_products:"اختر المنتجات والكميات", pack_price:"السعر الكامل للـ Pack (دج)", choose_product:"اختر المنتج", original_price:"السعر الأصلي", promo_price:"سعر البرومو (دج)", promo_start:"بداية العرض (اختياري)", promo_end:"نهاية العرض (اختياري)", remove_promo:"إلغاء البرومو", promo_badge:"عرض خاص", pack_items:"محتويات Pack", select_one_product:"اختر منتجًا واحدًا على الأقل", invalid_promo_price:"سعر البرومو يجب أن يكون أقل من السعر الأصلي", category_products_count:"منتج", no_categories:"لا توجد أصناف بعد", promo_saved:"تم حفظ البرومو", pack_saved:"تم إنشاء Pack بنجاح", promo_active:"برومو", pack_total_regular:"السعر قبل التخفيض" });
Object.assign(i18n.fr, { view_categories:"Voir les catégories", view_all_products:"Voir tous les produits", create_pack:"Créer un Pack", create_promo:"Promotion", pack_name:"Nom du Pack", pack_category:"Catégorie du Pack", choose_pack_products:"Choisir les produits et quantités", pack_price:"Prix total du Pack (DA)", choose_product:"Choisir un produit", original_price:"Prix original", promo_price:"Prix promotionnel (DA)", promo_start:"Début de l’offre (facultatif)", promo_end:"Fin de l’offre (facultatif)", remove_promo:"Retirer la promotion", promo_badge:"PROMO", pack_items:"Contenu du Pack", select_one_product:"Choisissez au moins un produit", invalid_promo_price:"Le prix promotionnel doit être inférieur au prix original", category_products_count:"produit(s)", no_categories:"Aucune catégorie pour le moment", promo_saved:"Promotion enregistrée", pack_saved:"Pack créé avec succès", promo_active:"PROMO", pack_total_regular:"Prix avant réduction" });

const NOEST_STATIONS = {
    "1": [{ name: "Adrar", code: "1A" }], "2": [{ name: "Chlef", code: "2A" }, { name: "Tenes", code: "2B" }],
    "3": [{ name: "Laghouat", code: "3A" }, { name: "Aflou", code: "3B" }], "4": [{ name: "Ain Mlila", code: "4A" }, { name: "Oum El Bouaghi", code: "4B" }, { name: "Ain Beida", code: "4C" }],
    "5": [{ name: "Batna", code: "5A" }, { name: "Barika", code: "5B" }, { name: "Batna Centre", code: "5C" }], "6": [{ name: "Bejaia", code: "6A" }, { name: "Akbou", code: "6B" }, { name: "El Kseur", code: "6C" }],
    "7": [{ name: "Biskra", code: "7A" }], "8": [{ name: "Bechar", code: "8A" }], "9": [{ name: "Blida", code: "9A" }, { name: "Boufarik", code: "9B" }, { name: "Mouzaia", code: "9C" }],
    "10": [{ name: "Bouira", code: "10A" }, { name: "Lakhdaria", code: "10B" }], "11": [{ name: "Tamanrasset", code: "11A" }], "12": [{ name: "Tebessa", code: "12A" }, { name: "El Ouenza", code: "12B" }, { name: "Bir El Ater", code: "12C" }],
    "13": [{ name: "Tlemcen", code: "13A" }, { name: "Maghnia", code: "13B" }, { name: "Mansourah", code: "13C" }], "14": [{ name: "Tiaret", code: "14A" }, { name: "Frenda", code: "14B" }, { name: "Ksar Chellala", code: "14C" }],
    "15": [{ name: "Tizi Ouzou", code: "15A" }, { name: "Azazga", code: "15B" }, { name: "Draa Ben Khedda", code: "15C" }], "16": [{ name: "Bir Mourad Rais", code: "16A" }, { name: "Bab Ezzouar", code: "16B" }, { name: "Cheraga", code: "16C" }, { name: "Reghaia", code: "16D" }, { name: "Alger Centre", code: "16E" }, { name: "Baba Hassen", code: "16F" }, { name: "Baraki", code: "16G" }, { name: "Bordj El Bahri", code: "16H" }, { name: "Zeralda", code: "16I" }, { name: "Birkhadem", code: "16J" }, { name: "Hussein Dey", code: "16K" }, { name: "Draria", code: "16L" }],
    "17": [{ name: "Djelfa", code: "17A" }, { name: "Ain Ouassara", code: "17B" }], "18": [{ name: "Jijel", code: "18A" }, { name: "El Milia", code: "18B" }], "19": [{ name: "Setif", code: "19A" }, { name: "El Eulma", code: "19B" }, { name: "Ain Oulmene", code: "19C" }, { name: "Setif Zone Activite", code: "19D" }],
    "20": [{ name: "Saida", code: "20A" }], "21": [{ name: "Skikda", code: "21A" }, { name: "Azzaba", code: "21B" }, { name: "Collo", code: "21C" }], "22": [{ name: "Sidi Bel Abbes", code: "22A" }, { name: "Telagh", code: "22B" }],
    "23": [{ name: "Annaba", code: "23A" }, { name: "El Bouni", code: "23B" }], "24": [{ name: "Guelma", code: "24A" }], "25": [{ name: "Zouaghi", code: "25A" }, { name: "Ali Mendjli", code: "25B" }, { name: "Constantine", code: "25C" }],
    "26": [{ name: "Medea", code: "26A" }, { name: "Ksar El Boukhari", code: "26B" }], "27": [{ name: "Mostaganem", code: "27A" }, { name: "Sidi Lakhdar", code: "27B" }], "28": [{ name: "Msila", code: "28A" }, { name: "Bousaada", code: "28B" }],
    "29": [{ name: "Mascara - Mohamadia", code: "29A" }, { name: "Mascara", code: "29B" }], "30": [{ name: "Ouargla", code: "30A" }, { name: "Hassi Messaoud", code: "30B" }], "31": [{ name: "Maraval", code: "31A" }, { name: "Bir El Djir", code: "31B" }, { name: "Oran", code: "31C" }, { name: "Arzew", code: "31D" }, { name: "Essabah", code: "31E" }],
    "32": [{ name: "El Bayadh", code: "32A" }], "33": [{ name: "Illizi", code: "33A" }], "34": [{ name: "Bordj Bou Arreridj", code: "34A" }, { name: "Ras El Oued", code: "34B" }], "35": [{ name: "Boumerdes", code: "35A" }, { name: "Ouled Moussa", code: "35B" }, { name: "Bordj Menaiel", code: "35C" }, { name: "Dellys", code: "35D" }],
    "36": [{ name: "El Tarf", code: "36A" }], "37": [{ name: "Tindouf", code: "37A" }], "38": [{ name: "Tissemsilt", code: "38A" }], "39": [{ name: "El Oued", code: "39A" }], "40": [{ name: "Khenchela", code: "40A" }],
    "41": [{ name: "Souk Ahras", code: "41A" }], "42": [{ name: "Tipaza", code: "42A" }, { name: "Kolea", code: "42B" }], "43": [{ name: "Mila", code: "43A" }, { name: "Chelghoum Laid", code: "43B" }, { name: "Tadjenanet", code: "43C" }, { name: "Ferdjioua", code: "43D" }],
    "44": [{ name: "Ain Defla", code: "44A" }, { name: "Khemis Miliana", code: "44B" }], "45": [{ name: "Mechria", code: "45A" }], "46": [{ name: "Ain Temouchent", code: "46A" }], "47": [{ name: "Ghardaia", code: "47A" }], "48": [{ name: "Relizane", code: "48A" }],
    "49": [{ name: "Timimoun", code: "49A" }], "51": [{ name: "Ouled Djellal", code: "51A" }], "52": [{ name: "Beni Abbes", code: "52A" }], "53": [{ name: "In Salah", code: "53A" }], "55": [{ name: "Touggourt", code: "55A" }], "56": [{ name: "Djanet", code: "56A" }], "57": [{ name: "El M'Ghair", code: "57A" }], "58": [{ name: "El Meniaa", code: "58A" }]
};

const YALIDINE_STATIONS = {
  "1": [
    {
      "name": "Adrar",
      "code": "10101",
      "address": "Rue Benhachem Maamar"
    },
    {
      "name": "Reggane",
      "code": "10401",
      "address": "حي 20 مسكن للتوفير والاحتياط"
    }
  ],
  "2": [
    {
      "name": "Chlef",
      "code": "21101",
      "address": "Route nationale N4"
    }
  ],
  "3": [
    {
      "name": "Aflou",
      "code": "31901",
      "address": "Hai Zahi Ben Aissa, Route El Bayadh"
    }
  ],
  "4": [
    {
      "name": "Aïn Beïda",
      "code": "40201",
      "address": "Cité Villigence lot 5 N°48"
    },
    {
      "name": "Aïn M’lila",
      "code": "40301",
      "address": "Route Messas"
    },
    {
      "name": "Oum El Bouaghi",
      "code": "40101",
      "address": "Cité El Moustakbel"
    },
    {
      "name": "Agence de Barika [Guepex]",
      "code": "54201",
      "address": "Boulevard Azil Abdul Rahman, Rue Les Freres Debache, Route De Batna"
    }
  ],
  "5": [
    {
      "name": "Batna - 500 Logements",
      "code": "50101",
      "address": "Lotissement Meddour"
    },
    {
      "name": "Agence du CHU Route de Tazoult [Guepex]",
      "code": "50103",
      "address": "Cité frères Lombarkia, ex parc à fourrage"
    },
    {
      "name": "Agence Merouana [Guepex]",
      "code": "50401",
      "address": "75 Logements, ancienne station de taxis, Merouana"
    }
  ],
  "6": [
    {
      "name": "Akbou",
      "code": "62501",
      "address": "Cité 16 Logements EPLF"
    },
    {
      "name": "Béjaïa - Edimco",
      "code": "60102",
      "address": "Zone industrielle, Rue Mahfoudi Fateh"
    },
    {
      "name": "Agence de Béjaïa Cité Tobal [Guepex]",
      "code": "60101",
      "address": "Cité Tobal en face de Syken collège"
    },
    {
      "name": "Agence de El Kseur [Guepex]",
      "code": "64001",
      "address": "Rue Zema Abdelkader, commune d’El Kseur"
    }
  ],
  "7": [
    {
      "name": "El Kantara",
      "code": "71601",
      "address": "Coopérative El Amel, cité 5 juillet"
    },
    {
      "name": "Agence de Tolga [Guepex]",
      "code": "73201",
      "address": "طولقة، بسكرة"
    }
  ],
  "8": [
    {
      "name": "Béchar - Centre Ville",
      "code": "80101",
      "address": "Cité Hai El Badr, Lot 50"
    }
  ],
  "9": [
    {
      "name": "Blida",
      "code": "90101",
      "address": "Zone industrielle Ben Boulaid"
    },
    {
      "name": "Bouinan",
      "code": "90301",
      "address": "Bouinan"
    },
    {
      "name": "Larbaa",
      "code": "92102",
      "address": "Stade communal"
    },
    {
      "name": "Ouled Yaïch",
      "code": "90701",
      "address": "Rue de la Mosquée"
    }
  ],
  "10": [
    {
      "name": "Bouira",
      "code": "101601",
      "address": "Lotissement Amar Khoudja B0"
    },
    {
      "name": "Lakhdaria",
      "code": "103101",
      "address": "Cité Si Lakhdar"
    }
  ],
  "11": [
    {
      "name": "Tamanrasset - Tahaggart",
      "code": "110102",
      "address": "Tahaggart Charkia, face mosquée F. Zahraa"
    }
  ],
  "12": [
    {
      "name": "Tébessa",
      "code": "120101",
      "address": "Boulevard Houari Boumediene"
    },
    {
      "name": "Tébessa - Skanska",
      "code": "120103",
      "address": "Cité El Amel, Skanska"
    }
  ],
  "13": [
    {
      "name": "Chetouane",
      "code": "135001",
      "address": "Zone industrielle"
    },
    {
      "name": "Maghnia",
      "code": "132701",
      "address": "Tafna N°4, Cité Perri"
    },
    {
      "name": "Remchi",
      "code": "130401",
      "address": "Rue Takia Ben Abdallah"
    },
    {
      "name": "Tlemcen - Mansourah",
      "code": "130103",
      "address": "Boulevard Imama"
    }
  ],
  "14": [
    {
      "name": "Tiaret",
      "code": "143901",
      "address": "Rue Police Amer N°161"
    }
  ],
  "15": [
    {
      "name": "Azazga",
      "code": "151801",
      "address": "Rue Djurdjura"
    },
    {
      "name": "Beni Douala",
      "code": "153201",
      "address": "Beni Douala"
    },
    {
      "name": "Draa El Mizan",
      "code": "151001",
      "address": "Rue Abane Ramdane"
    },
    {
      "name": "Tizi Ouzou - Nouvelle Ville",
      "code": "150102",
      "address": "Nouvelle Ville"
    },
    {
      "name": "Agence de Draâ Ben Khedda [Guepex]",
      "code": "154701",
      "address": "Touares 01, Draâ Ben Khedda"
    },
    {
      "name": "Agence de Tizi Gheniff [Guepex]",
      "code": "151101",
      "address": "Rue Fatoum Amar, Tizi Gheniff"
    },
    {
      "name": "Agence de Bekkar [Guepex]",
      "code": "150101",
      "address": "Cité Bekkar, Tizi Ouzou"
    }
  ],
  "16": [
    {
      "name": "Bab Ezzouar",
      "code": "162102",
      "address": "EPLF"
    },
    {
      "name": "Birkhadem",
      "code": "161201",
      "address": "Cité Les Vergers Villa N°1"
    },
    {
      "name": "Bordj El Bahri",
      "code": "163901",
      "address": "Groupe de propriété 3065"
    },
    {
      "name": "Bordj El Kiffan",
      "code": "163001",
      "address": "Rue 1er Novembre, Cité Mimouni"
    },
    {
      "name": "Cheraga - Dar Diaf",
      "code": "165001",
      "address": "Dar Diaf"
    },
    {
      "name": "Cheraga - HUB Plateau",
      "code": "165002",
      "address": "Rue Aïn Benian"
    },
    {
      "name": "Hussein Dey",
      "code": "161701",
      "address": "Route Tripoli N°152"
    },
    {
      "name": "Kouba",
      "code": "161801",
      "address": "Lotissement 26 Tranche 56"
    },
    {
      "name": "Reghaïa - DNC",
      "code": "164301",
      "address": "Cité El Ouancharis, DNC"
    },
    {
      "name": "Agence de Aïn Benian [Guepex]",
      "code": "164401",
      "address": "19 Route Al-Jamilah, Aïn Benian"
    },
    {
      "name": "Agence Sacré-Cœur [Guepex]",
      "code": "160101",
      "address": "116 Didouche Mourad, Sacré Cœur"
    },
    {
      "name": "Agence de Bab El Oued [Guepex]",
      "code": "160501",
      "address": "107 Rue Colonel Lotfi, Bab El Oued"
    },
    {
      "name": "Agence de Baraki [Guepex]",
      "code": "161401",
      "address": "Route de Larbâa, Baraki"
    },
    {
      "name": "Agence de Birtouta [Guepex]",
      "code": "163401",
      "address": "06 Rue El Moudjahid Hamida Mouhamed, Birtouta"
    },
    {
      "name": "Agence De Amara [Guepex]",
      "code": "165003",
      "address": "Zone d’Activités El Amara, Cheraga"
    },
    {
      "name": "Agence de Draria [Guepex]",
      "code": "165301",
      "address": "Cité Darbush 145, Draria"
    },
    {
      "name": "Agence de Ouled Fayet [Guepex]",
      "code": "165101",
      "address": "19 Route du Stade Communal, Ouled Fayet"
    },
    {
      "name": "Agence de Zeralda [Guepex]",
      "code": "164601",
      "address": "Cité Yesswel Kouider N°01, Zeralda"
    }
  ],
  "17": [
    {
      "name": "Aïn Oussara",
      "code": "170501",
      "address": "Cité Mohamed Boudiaf"
    },
    {
      "name": "Djelfa",
      "code": "171401",
      "address": "Cité Boutrifis, route de Boussaâda"
    }
  ],
  "18": [
    {
      "name": "Jijel",
      "code": "180101",
      "address": "Village Mustapha, route Soummam N°24"
    },
    {
      "name": "Kaous",
      "code": "181401",
      "address": "Cité Amoura Messouad N°02"
    },
    {
      "name": "Agence de El Milia [Guepex]",
      "code": "180901",
      "address": "Rue Boulakirba Zidane"
    },
    {
      "name": "Agence de Taher [Guepex]",
      "code": "180501",
      "address": "Quartier Zemouch, Taher"
    }
  ],
  "19": [
    {
      "name": "El Eulma",
      "code": "193202",
      "address": "Rue Abdelaziz Khaled N°119"
    },
    {
      "name": "Sétif - Tinar",
      "code": "195506",
      "address": "Cité 600 logements Tinar"
    },
    {
      "name": "Sétif - Maabouda",
      "code": "195501",
      "address": "Cité Maabouda"
    },
    {
      "name": "Sétif - Centre Ville",
      "code": "195505",
      "address": "Rue Merkache Abdelhamid"
    }
  ],
  "20": [
    {
      "name": "Saïda",
      "code": "201101",
      "address": "Cité Riadh"
    }
  ],
  "21": [
    {
      "name": "Skikda - Filfila",
      "code": "212201",
      "address": "Cité Khazouz Tahar"
    },
    {
      "name": "Skikda - Messiouen",
      "code": "213501",
      "address": "30 logements, rue de Chaussée"
    },
    {
      "name": "Skikda - L’Espérance",
      "code": "213502",
      "address": "Rue El Reboua El Djamila"
    },
    {
      "name": "Tamalous",
      "code": "213601",
      "address": "Raf Souk Villa 03 N°04"
    },
    {
      "name": "Agence de Collo [Guepex]",
      "code": "211401",
      "address": "Boulevard Ruwaibah Taher, Collo"
    },
    {
      "name": "Agence de El Harrouch [Guepex]",
      "code": "211801",
      "address": "Cité 24 Logements Sociaux, El Harrouch"
    },
    {
      "name": "Agence de Faubourg [Guepex]",
      "code": "213503",
      "address": "Rue Bachir Boukadoum, Skikda"
    }
  ],
  "22": [
    {
      "name": "Sidi Bel Abbès",
      "code": "223601",
      "address": "Rue Mascara"
    },
    {
      "name": "Agence Benhamouda [Guepex]",
      "code": "223602",
      "address": "Monté Sogral avant la mosquée El Safaa"
    }
  ],
  "23": [
    {
      "name": "Annaba - Valmascort",
      "code": "230101",
      "address": "Avenue Seddik Benyahia"
    },
    {
      "name": "Annaba - El Hadjar",
      "code": "230301",
      "address": "Rue Larbi Ben M’hidi"
    },
    {
      "name": "Agence de Sidi Brahim [Guepex]",
      "code": "230102",
      "address": "Champs de Mars numéro 3"
    },
    {
      "name": "Agence de El Bouni [Guepex]",
      "code": "230501",
      "address": "El Bouni Centre"
    }
  ],
  "24": [
    {
      "name": "Guelma",
      "code": "241901",
      "address": "Route Ain Larbi, local N°01"
    },
    {
      "name": "Agence de Oued Zenati [Guepex]",
      "code": "243001",
      "address": "Magasin Num 02, Oued Zenati"
    }
  ],
  "25": [
    {
      "name": "Constantine - Belle Vue",
      "code": "250401",
      "address": "70 Rue Belle Vue"
    },
    {
      "name": "Didouche Mourad",
      "code": "250501",
      "address": "El Riadh N°10"
    },
    {
      "name": "Ali Mendjeli - Nouvelle Ville",
      "code": "250602",
      "address": "Zone d’Activité N°47"
    },
    {
      "name": "Agence Sidi Mabrouk [Guepex]",
      "code": "250402",
      "address": "نهج لعراقب احمد رقم 09"
    },
    {
      "name": "Agence d’El Khroub [Guepex]",
      "code": "250601",
      "address": "Cité Bouhali Mohamed Said, El Khroub"
    }
  ],
  "26": [
    {
      "name": "Beni Slimane",
      "code": "260701",
      "address": "Subdivision Beni Slimane"
    },
    {
      "name": "Ksar Boukhari",
      "code": "263101",
      "address": "Rue Zibouche Zebra"
    },
    {
      "name": "Médéa - M’sallah",
      "code": "263301",
      "address": "Rue M’sallah"
    },
    {
      "name": "Tablat",
      "code": "265901",
      "address": "Rue Nationale N°08"
    },
    {
      "name": "Agence Berrouaghia [Guepex]",
      "code": "260801",
      "address": "Lotissement Ali Ben Haoua, Médéa"
    },
    {
      "name": "Agence de Médéa Pole Urbain [Guepex]",
      "code": "263302",
      "address": "Cité 80 Logs LSP Pole Urbain"
    }
  ],
  "27": [
    {
      "name": "Mostaganem - Salamandre",
      "code": "271801",
      "address": "Rond-point de la Douane"
    },
    {
      "name": "Agence de Kharouba [Guepex]",
      "code": "271802",
      "address": "Cité 600 Logement Kharouba, Mostaganem"
    }
  ],
  "28": [
    {
      "name": "Bou Saâda",
      "code": "281201",
      "address": "Cité 20 Août"
    },
    {
      "name": "M’Sila - Salem Mall",
      "code": "282802",
      "address": "Salem Shopping Mall"
    },
    {
      "name": "Agence de Berhoum [Guepex]",
      "code": "281001",
      "address": "حي زيغود يوسف، برهوم"
    },
    {
      "name": "Agence Sidi Aïssa [Guepex]",
      "code": "283901",
      "address": "حي الوئام المدني، سيدي عيسى"
    }
  ],
  "29": [
    {
      "name": "Mascara",
      "code": "292801",
      "address": "Zone 08 près de la poste Emir Abdelkader"
    },
    {
      "name": "Sig",
      "code": "294301",
      "address": "Rue Zirout Youcef"
    },
    {
      "name": "Tighennif",
      "code": "294401",
      "address": "Rue Bahloul Brahim"
    }
  ],
  "30": [
    {
      "name": "Hassi Messaoud",
      "code": "300801",
      "address": "Derrière la CNAS"
    },
    {
      "name": "Ouargla - Chetti el Wekal",
      "code": "301302",
      "address": "Avenue 1er novembre 1954"
    },
    {
      "name": "Agence de Ouargla Centre Ville [Guepex]",
      "code": "301301",
      "address": "حي حركات، ورقلة"
    }
  ],
  "31": [
    {
      "name": "Oran - El Morchid",
      "code": "310301",
      "address": "Coopérative Dar El Amel N°68"
    },
    {
      "name": "Oran - Fernand Ville",
      "code": "310302",
      "address": "65 Rue 1er Novembre, Hai Khemisti"
    },
    {
      "name": "Agence de Arzew [Guepex]",
      "code": "310601",
      "address": "17 Lotissement N 66 Plan Lot 167, Arzew"
    }
  ],
  "32": [
    {
      "name": "El Bayadh",
      "code": "320101",
      "address": "Rue Mohamed Touil"
    }
  ],
  "34": [
    {
      "name": "Bordj Bou Arreridj",
      "code": "340601",
      "address": "Cité 17 octobre, rue Ameur Tahar N°5"
    }
  ],
  "35": [
    {
      "name": "Boumerdès",
      "code": "350101",
      "address": "Cité Foés bâtiment B local N°04"
    },
    {
      "name": "Ouled Moussa",
      "code": "352001",
      "address": "Quartier Baroudi"
    },
    {
      "name": "Agence de Bordj Menaiel [Guepex]",
      "code": "350501",
      "address": "Rue Bouira Boualem, Bordj Menaiel"
    },
    {
      "name": "Agence Boudouaou [Guepex]",
      "code": "350201",
      "address": "36 logements, Boudouaou"
    }
  ],
  "36": [
    {
      "name": "Dréan",
      "code": "361301",
      "address": "Rue Imzaouda Al-Arbi"
    },
    {
      "name": "El Tarf",
      "code": "361701",
      "address": "Cité Les Vergers"
    }
  ],
  "37": [
    {
      "name": "Tindouf",
      "code": "370201",
      "address": "Cités Moussani"
    }
  ],
  "38": [
    {
      "name": "Ammari",
      "code": "380101",
      "address": "Ammari"
    },
    {
      "name": "Tissemsilt",
      "code": "382101",
      "address": "Rue Bouis Ali N°33 B"
    }
  ],
  "39": [
    {
      "name": "El Oued",
      "code": "390101",
      "address": "Cité El Moudjahidine"
    }
  ],
  "40": [
    {
      "name": "Khenchela",
      "code": "401302",
      "address": "Route de Meskiana N°30"
    }
  ],
  "41": [
    {
      "name": "Sedrata",
      "code": "410201",
      "address": "Rue 20 Août 1956"
    },
    {
      "name": "Souk Ahras",
      "code": "410101",
      "address": "Cité El Louz Lot 64"
    }
  ],
  "42": [
    {
      "name": "Bou Ismaïl",
      "code": "422601",
      "address": "Lotissement Polyclinique"
    },
    {
      "name": "Tipaza",
      "code": "420101",
      "address": "Cité M’hamed Bougara"
    }
  ],
  "43": [
    {
      "name": "Chelghoum Laid",
      "code": "430801",
      "address": "Rue 1er Novembre"
    },
    {
      "name": "Mila - Centre de tri",
      "code": "431601",
      "address": "Rue De Zerghia"
    },
    {
      "name": "Mila",
      "code": "431602",
      "address": "Rue Ben Garaa Ennawar"
    }
  ],
  "44": [
    {
      "name": "Aïn Defla - Centre Ville",
      "code": "440103",
      "address": "Rue Tberbi Tayeb"
    },
    {
      "name": "El Attaf",
      "code": "442101",
      "address": "Rue Mohamed Khemisti"
    }
  ],
  "46": [
    {
      "name": "Aïn Témouchent",
      "code": "460401",
      "address": "Hai Zitoun"
    },
    {
      "name": "Agence de Beni Saf [Guepex]",
      "code": "460701",
      "address": "Cité Sohbi, Beni Saf"
    }
  ],
  "47": [
    {
      "name": "Ghardaïa - Hadj Messaoud",
      "code": "470704",
      "address": "Cité Hadj Messaoud"
    },
    {
      "name": "Ghardaïa - Bouhraoua",
      "code": "470702",
      "address": "Bouhraoua"
    },
    {
      "name": "Agence de Ghardaia Thenia [Guepex]",
      "code": "470701",
      "address": "Thenia, à côté du Lycée Moufdi Zakaria"
    }
  ],
  "48": [
    {
      "name": "Relizane",
      "code": "483001",
      "address": "Boulevard 69, Zaghloul"
    }
  ],
  "49": [
    {
      "name": "Timimoun",
      "code": "490901",
      "address": "Rue Mohamed El Hashemi"
    }
  ],
  "51": [
    {
      "name": "Ouled Djellal",
      "code": "512601",
      "address": "Rue Gasmi Ibrahim"
    }
  ],
  "53": [
    {
      "name": "In Salah",
      "code": "530801",
      "address": "Centre-ville, près de la poste"
    }
  ],
  "55": [
    {
      "name": "Touggourt",
      "code": "552001",
      "address": "Cité Rimal 01"
    }
  ],
  "57": [
    {
      "name": "El M’Ghair",
      "code": "572701",
      "address": "Lotissement 360 logements"
    },
    {
      "name": "Agence de Djamaa [Guepex]",
      "code": "572801",
      "address": "Cité Essalam, Djamaa, El M’Ghair"
    }
  ],
  "58": [
    {
      "name": "El Menia",
      "code": "580601",
      "address": "Route Unite Africaine"
    }
  ],
  "45": [
    {"name": "Agence de Mecheria [Guepex]", "code": "450201", "address": "Rue Abdellaoui Mohammed, Mecheria"}
  ],
  "56": [
    {"name": "Agence de Djanet [Guepex]", "code": "560201", "address": "Tin Khatma, Djanet"}
  ],
};

const ALGERIA_WILAYAS = [
    { code: 1, name: '01 - أدرار', yalidineHome: 1000, yalidineDesk: 600, noestHome: 1500, noestDesk: 1000 }, { code: 2, name: '02 - الشلف', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 3, name: '03 - الأغواط', yalidineHome: 800, yalidineDesk: 400, noestHome: 1000, noestDesk: 600 },
    { code: 4, name: '04 - أم البواقي', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 5, name: '05 - باتنة', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 6, name: '06 - بجاية', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 },
    { code: 7, name: '07 - بسكرة', yalidineHome: 800, yalidineDesk: 400, noestHome: 1000, noestDesk: 600 }, { code: 8, name: '08 - بشار', yalidineHome: 1000, yalidineDesk: 600, noestHome: 1200, noestDesk: 800 }, { code: 9, name: '09 - البليدة', yalidineHome: 600, yalidineDesk: 300, noestHome: 600, noestDesk: 400 },
    { code: 10, name: '10 - البويرة', yalidineHome: 700, yalidineDesk: 350, noestHome: 500, noestDesk: 300 }, { code: 11, name: '11 - تمنراست', yalidineHome: 1200, yalidineDesk: 700, noestHome: 2000, noestDesk: 1500 }, { code: 12, name: '12 - تبسة', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 },
    { code: 13, name: '13 - تلمسان', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 14, name: '14 - تيارت', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 }, { code: 15, name: '15 - تيزي وزو', yalidineHome: 750, yalidineDesk: 350, noestHome: 700, noestDesk: 450 },
    { code: 16, name: '16 - الجزائر', yalidineHome: 600, yalidineDesk: 300, noestHome: 650, noestDesk: 400 }, { code: 17, name: '17 - الجلفة', yalidineHome: 800, yalidineDesk: 400, noestHome: 1000, noestDesk: 600 }, { code: 18, name: '18 - جيجل', yalidineHome: 800, yalidineDesk: 400, noestHome: 850, noestDesk: 500 },
    { code: 19, name: '19 - سطيف', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 20, name: '20 - سعيدة', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 }, { code: 21, name: '21 - سكيكدة', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 },
    { code: 22, name: '22 - سيدي بلعباس', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 23, name: '23 - عنابة', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 24, name: '24 - قالمة', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 },
    { code: 25, name: '25 - قسنطينة', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 26, name: '26 - المدية', yalidineHome: 800, yalidineDesk: 400, noestHome: 700, noestDesk: 450 }, { code: 27, name: '27 - مستغانم', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 },
    { code: 28, name: '28 - المسيلة', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 29, name: '29 - معسكر', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 30, name: '30 - ورقلة', yalidineHome: 1000, yalidineDesk: 600, noestHome: 1100, noestDesk: 700 },
    { code: 31, name: '31 - وهران', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 32, name: '32 - البيض', yalidineHome: 900, yalidineDesk: 500, noestHome: 1200, noestDesk: 800 }, { code: 33, name: '33 - إليزي', yalidineHome: 1200, yalidineDesk: 700, noestHome: 1900, noestDesk: 1500 },
    { code: 34, name: '34 - برج بوعريريج', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 35, name: '35 - بومرداس', yalidineHome: 700, yalidineDesk: 350, noestHome: 600, noestDesk: 400 }, { code: 36, name: '36 - الطارف', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 },
    { code: 37, name: '37 - تندوف', yalidineHome: 1300, yalidineDesk: 800, noestHome: 1700, noestDesk: 1000 }, { code: 38, name: '38 - تسمسيلت', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 39, name: '39 - الوادي', yalidineHome: 900, yalidineDesk: 500, noestHome: 1100, noestDesk: 700 },
    { code: 40, name: '40 - خنشلة', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 }, { code: 41, name: '41 - سوق أهراس', yalidineHome: 800, yalidineDesk: 400, noestHome: 900, noestDesk: 600 }, { code: 42, name: '42 - تيبازة', yalidineHome: 750, yalidineDesk: 350, noestHome: 600, noestDesk: 400 },
    { code: 43, name: '43 - ميلة', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 44, name: '44 - عين الدفلى', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 45, name: '45 - النعامة', yalidineHome: 900, yalidineDesk: 500, noestHome: 1200, noestDesk: 800 },
    { code: 46, name: '46 - عين تموشنت', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 }, { code: 47, name: '47 - غرداية', yalidineHome: 900, yalidineDesk: 500, noestHome: 1100, noestDesk: 700 }, { code: 48, name: '48 - غليزان', yalidineHome: 800, yalidineDesk: 400, noestHome: 800, noestDesk: 500 },
    { code: 49, name: '49 - تيميمون', yalidineHome: 1200, yalidineDesk: 700, noestHome: 1500, noestDesk: 1000 }, { code: 50, name: '50 - برج باجي مختار', yalidineHome: 1300, yalidineDesk: 800, noestHome: 1700, noestDesk: 1100 }, { code: 51, name: '51 - أولاد جلال', yalidineHome: 900, yalidineDesk: 500, noestHome: 1000, noestDesk: 600 },
    { code: 52, name: '52 - بني عباس', yalidineHome: 1200, yalidineDesk: 700, noestHome: 1200, noestDesk: 800 }, { code: 53, name: '53 - عين صالح', yalidineHome: 1300, yalidineDesk: 800, noestHome: 1800, noestDesk: 1200 }, { code: 54, name: '54 - عين قزام', yalidineHome: 1400, yalidineDesk: 900, noestHome: 2200, noestDesk: 1600 },
    { code: 55, name: '55 - تقرت', yalidineHome: 1000, yalidineDesk: 600, noestHome: 1100, noestDesk: 700 }, { code: 56, name: '56 - جانت', yalidineHome: 1400, yalidineDesk: 900, noestHome: 2200, noestDesk: 1600 }, { code: 57, name: '57 - المغير', yalidineHome: 900, yalidineDesk: 500, noestHome: 1100, noestDesk: 700 }, { code: 58, name: '58 - المنيعة', yalidineHome: 1000, yalidineDesk: 600, noestHome: 1100, noestDesk: 700 }
];

function switchLanguage(lang) {
    state.currentLang = lang; save(K.lang, lang);
    document.getElementById('html-root').setAttribute('lang', lang);
    document.getElementById('html-root').setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
    const langBtn = document.getElementById('lang-btn-text'); if (langBtn) langBtn.textContent = lang === 'ar' ? 'FR' : 'AR';
    document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); if (i18n[lang][k]) el.textContent = i18n[lang][k]; });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { const k = el.getAttribute('data-i18n-placeholder'); if (i18n[lang][k]) el.setAttribute('placeholder', i18n[lang][k]); });
    
    renderShop(); renderCategories(); renderCart(); renderMyOrders(); renderCustomerMessages(); renderMyRequests(); renderProfile(); renderNewProducts(); renderWishlist(); if (window.renderCustomerNotifications) window.renderCustomerNotifications();
    const adminTitle = document.getElementById('admin-page-title'); if (adminTitle) { const activeAdmin = document.querySelector('.admin-nav a.active'); const sec = activeAdmin?.getAttribute('onclick')?.match(/adminGo\(['"]([^'"]+)/)?.[1]; const titleKey = sec === 'orders' ? 'admin_orders' : sec === 'products' ? 'admin_products' : sec === 'customers' ? 'admin_customers' : sec === 'messages' ? 'admin_messages' : sec === 'expenses' ? 'admin_expenses' : sec === 'reports' ? 'admin_reports' : sec === 'settings' ? 'admin_settings' : sec === 'requests' ? 'admin_requests' : sec === 'analytics' ? null : 'admin_home'; if (titleKey && i18n[lang][titleKey]) adminTitle.textContent = i18n[lang][titleKey]; else if (sec === 'analytics') adminTitle.textContent = lang === 'ar' ? 'إحصائيات المتجر' : 'Statistiques du magasin'; }
    const stationLabel = document.querySelector('#group-station label'); if (stationLabel) stationLabel.textContent = lang === 'ar' ? '📍 اختر مكتب NOEST' : '📍 Choisissez un bureau NOEST';
    if (document.getElementById('sec-dashboard') && document.getElementById('sec-dashboard').style.display !== 'none') renderAdminHome();
    if (document.getElementById('sec-orders') && document.getElementById('sec-orders').style.display !== 'none') renderAdminOrdersList();
    if (document.getElementById('sec-products') && document.getElementById('sec-products').style.display !== 'none') renderAdminProducts();
    if (document.getElementById('sec-customers') && document.getElementById('sec-customers').style.display !== 'none') renderAdminCustomers();
    if (document.getElementById('sec-messages') && document.getElementById('sec-messages').style.display !== 'none') renderAdminMessages();
    if (document.getElementById('sec-expenses') && document.getElementById('sec-expenses').style.display !== 'none') renderAdminExpenses();
    if (document.getElementById('sec-reports') && document.getElementById('sec-reports').style.display !== 'none') renderAdminReports();
    if (document.getElementById('sec-requests') && document.getElementById('sec-requests').style.display !== 'none') renderAdminRequests();
    if (document.getElementById('sec-debts') && document.getElementById('sec-debts').style.display !== 'none') renderAdminDebts();
    if (document.getElementById('sec-settings') && document.getElementById('sec-settings').style.display !== 'none') { renderAdminSettings(); }
    toast(lang === 'ar' ? 'تم التحويل للعربية' : 'Langue changée');
}
window.switchLanguage = switchLanguage;

function updateUIBasedOnSession() {
    const topNav = document.getElementById('store-nav-container');
    const contactBtn = document.getElementById('btn-contact-us');
    const logoutBtn = document.getElementById('btn-logout-header');
    if (topNav) topNav.style.display = 'none'; if (contactBtn) contactBtn.style.display = 'none'; if (logoutBtn) logoutBtn.style.display = 'none';
    if (state.session && state.session.role === 'customer') {
        if (topNav) topNav.style.display = 'block';
        if (contactBtn) contactBtn.style.display = 'flex';
        if (logoutBtn) logoutBtn.style.display = 'flex';
    }
    updateProductRequestButton();
}
window.updateUIBasedOnSession = updateUIBasedOnSession;

function goScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); updateUIBasedOnSession(); window.scrollTo(0, 0); }
window.goScreen = goScreen;

function shopGo(id) {
    if ((id === 'orders' || id === 'profile' || id === 'messages' || id === 'myrequests' || id === 'wishlist' || id === 'notifications') && (!state.session || state.session.role !== 'customer')) {
        toast(i18n[state.currentLang].login_first, 'error'); openCustomerAuthModal(); return;
    }
    document.querySelectorAll('#screen-shop .page').forEach(p => p.classList.remove('active')); document.getElementById('s-' + id).classList.add('active');
    const navLinks = document.querySelectorAll('.store-nav .nav-links li'); navLinks.forEach(li => li.classList.remove('active'));
    const navMap = { shop: 0, orders: 1, messages: 2, notifications: 3, myrequests: 4, profile: 5 };
    const navIndex = navMap[id];
    if (navIndex !== undefined && navLinks[navIndex]) navLinks[navIndex].classList.add('active');
    if (id === 'shop') renderShop(); if (id === 'cart') renderCart(); if (id === 'orders') renderMyOrders(); if (id === 'profile') renderProfile(); if (id === 'messages') renderCustomerMessages(); if (id === 'notifications' && typeof window.renderCustomerNotifications === 'function') window.renderCustomerNotifications(); if (id === 'myrequests') renderMyRequests(); if (id === 'wishlist') renderWishlist();
    window.scrollTo(0, 0);
}
window.shopGo = shopGo;

function openModal(id) { document.getElementById(id).classList.add('active'); }
window.openModal = openModal;
function closeModal(id) { document.getElementById(id).classList.remove('active'); if (id === 'm-product-form') window.pendingRequestId = null; }
window.closeModal = closeModal;

function adminLogout() { if (firebase.auth().currentUser) firebase.auth().signOut(); goScreen('screen-shop'); updateUIBasedOnSession(); toast('✅ ' + i18n[state.currentLang].logged_out); }
window.adminLogout = adminLogout;

function logoutCustomer() {
    state.session = null; save(K.session, null); closeModal('m-customer-auth'); state.wishlist = []; save(K.wishlist, []); updateWishlistBadge();
    updateUIBasedOnSession(); shopGo('shop'); toast('✅ ' + i18n[state.currentLang].logged_out);
}
window.logoutCustomer = logoutCustomer;

function updateProductRequestButton() {
    const btn = document.getElementById('btn-product-request'); if (!btn) return;
    if (state.session && state.session.role === 'customer') {
        const cust = state.customers.find(x => x.id === state.session.id);
        if (cust && cust.isTop === true) { btn.style.display = 'inline-flex'; return; }
    }
    btn.style.display = 'none';
}
window.updateProductRequestButton = updateProductRequestButton;

const PRODUCT_CACHE_TTL_MS = 3 * 60 * 1000;
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
let lastProductsFetchAt = 0;
let lastSettingsFetchAt = 0;
let loadRefreshInProgress = false;

async function loadOrdersListener(options = {}) {
    if (!window.supabaseClient) throw new Error('Supabase client is unavailable');
    // A manual refresh may wait for the current refresh instead of silently doing nothing.
    if (loadRefreshInProgress) {
        if (!options.forceWait) return;
        while (loadRefreshInProgress) await new Promise(resolve => setTimeout(resolve, 50));
    }
    loadRefreshInProgress = true;
    try {
        const now = Date.now();
        // Avoid re-reading public catalog on every order event; use the locally cached catalog for up to 3 minutes.
        if (options.forceProducts || !state.products.length || (now - lastProductsFetchAt) >= PRODUCT_CACHE_TTL_MS) {
            const { data: products, error: productsError } = await window.supabaseClient.from('products').select('*');
            if (!productsError && products) { state.products = products; save(K.products, products); lastProductsFetchAt = now; } else if (productsError) console.error('Supabase products read failed:', productsError.message);
        }
        if (options.forceSettings || !state.settings || (now - lastSettingsFetchAt) >= SETTINGS_CACHE_TTL_MS) {
            const { data: settings, error: settingsError } = await window.supabaseClient.from('settings').select('*').eq('id', 1).single();
            if (!settingsError && settings) { state.settings = settings; save(K.settings, settings); lastSettingsFetchAt = now; } else if (settingsError) console.error('Supabase settings read failed:', settingsError.message);
        }
        
        let query = window.supabaseClient.from('orders').select('*').order('id', { ascending: false });
        const isFirebaseAdmin = Boolean(window.firebaseReady && typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser);
        if (state.session && state.session.role === 'customer' && !isFirebaseAdmin) {
            const cust = state.customers.find(x => String(x.id) === String(state.session.id));
            if (!cust || !cust.phone) {
                state.orders = [];
            } else {
                query = query.eq('customerPhone', cust.phone);
                const { data: orders, error: ordersError } = await query;
                if (!ordersError && orders) { state.orders = orders; save(K.orders, orders); }
                else if (ordersError) console.error('Customer orders read failed:', ordersError.message);
                // Load only this customer's messages and product requests after refresh.
                const { data: ownMessages, error: messagesError } = await window.supabaseClient.from('messages').select('*').eq('customerId', cust.id).order('id', { ascending: false });
                if (!messagesError && ownMessages) { state.messages = ownMessages; save(K.messages, ownMessages); }
                else if (messagesError) console.warn('Customer messages are unavailable under current database policies:', messagesError.message);
                const { data: ownRequests, error: requestsError } = await window.supabaseClient.from('requests').select('*').eq('customerPhone', cust.phone).order('id', { ascending: false });
                if (!requestsError && ownRequests) { state.requests = ownRequests; save(K.requests, ownRequests); }
                else if (requestsError) console.warn('Customer requests are unavailable under current database policies:', requestsError.message);
            }
        } else if (isFirebaseAdmin) {
            const { data: orders, error: ordersError } = await query;
            if (!ordersError && orders) { state.orders = orders; save(K.orders, orders); }
        } else {
            // Visitors must never fetch the private orders table.
            state.orders = [];
        }

        if (firebase.auth().currentUser) {
            const { data: customers, error: customersError } = await window.supabaseClient.from('customers').select('*');
            if (customersError) console.error('Supabase customers read failed:', customersError.message);
            if (customers) { state.customers = customers; save(K.customers, customers); renderAdminCustomers(document.getElementById('admin-customer-search')?.value || ''); }
            const { data: messages } = await window.supabaseClient.from('messages').select('*').order('id', { ascending: false });
            if (messages) { state.messages = messages; save(K.messages, messages); }
            const { data: requests } = await window.supabaseClient.from('requests').select('*').order('id', { ascending: false });
            if (requests) { state.requests = requests; save(K.requests, requests); }
            const { data: expenses } = await window.supabaseClient.from('expenses').select('*');
            if (expenses) { state.expenses = expenses; save(K.expenses, expenses); }
        }

        renderShop(); renderCategories(); renderMyOrders(); renderAdminOrdersList(); renderAdminHome(); updateAdminBadges();
        renderPromoBanner(); updateStoreBranding(); renderSliderAd();
    } catch (error) { console.error('Supabase refresh failed:', error); return false; }
    finally { loadRefreshInProgress = false; }
    return true;
}
window.loadOrdersListener = loadOrdersListener;

// Manual admin refresh: fetch the current catalog/settings and admin data on demand.
let adminRefreshRunning = false;
async function adminRefreshAll() {
    if (adminRefreshRunning) return;
    if (!window.supabaseClient) {
        toast(state.currentLang === 'fr' ? 'Connexion à la base de données indisponible.' : 'الاتصال بقاعدة البيانات غير متاح.', 'error');
        return;
    }
    adminRefreshRunning = true;
    const btn = document.querySelector('.admin-manual-refresh');
    const icon = document.getElementById('admin-refresh-icon');
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');
    try {
        lastProductsFetchAt = 0;
        lastSettingsFetchAt = 0;
        const refreshed = await loadOrdersListener({ forceProducts: true, forceSettings: true, forceWait: true });
        if (refreshed !== true) throw new Error('Refresh did not complete');
        const msg = state.currentLang === 'fr' ? 'Mise à jour terminée.' : 'تم التحديث بنجاح.';
        toast('✓ ' + msg);
        const title = state.currentLang === 'fr' ? 'Dernière mise à jour' : 'آخر تحديث';
        if (btn) { btn.title = title + ': ' + new Date().toLocaleTimeString(); }
    } catch (err) {
        console.error('Manual refresh failed:', err);
        toast(state.currentLang === 'fr' ? 'Échec de la mise à jour.' : 'فشل التحديث.', 'error');
    } finally {
        adminRefreshRunning = false;
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}
window.adminRefreshAll = adminRefreshAll;

// Fallback catalog refresh if Realtime is disconnected. Only run while this page is visible;
// Realtime remains the preferred instant update path.
let catalogFallbackTimer = null;
function startCatalogFallbackRefresh() {
    if (catalogFallbackTimer) clearInterval(catalogFallbackTimer);
    catalogFallbackTimer = setInterval(async () => {
        if (document.hidden || !window.supabaseClient || loadRefreshInProgress) return;
        const now = Date.now();
        if (now - lastProductsFetchAt < PRODUCT_CACHE_TTL_MS) return;
        try {
            const { data, error } = await window.supabaseClient.from('products').select('*');
            if (error || !data) return;
            state.products = data; save(K.products, data); lastProductsFetchAt = Date.now();
            renderShop(); renderCategories(); renderPromoBanner(); renderNewProducts();
        } catch (err) { console.warn('Catalog fallback refresh failed:', err); }
    }, 30 * 1000);
}


document.addEventListener('DOMContentLoaded', () => {
    state.products = load(K.products, []); state.orders = load(K.orders, []); state.expenses = load(K.expenses, []); state.settings = load(K.settings, state.settings);
    state.customers = load(K.customers, []); save(K.customers, state.customers); state.messages = load(K.messages, []); state.requests = load(K.requests, []); state.session = load(K.session, null);
    state.cart = load(K.cart, []); state.currentLang = load(K.lang, 'ar'); state.wishlist = load(K.wishlist, []);

    if (state.currentLang !== 'ar') switchLanguage(state.currentLang);
    renderCategories(); renderShop(); renderPromoBanner(); updateStoreBranding(); updateUIBasedOnSession(); updateCartBadge(); updateWishlistBadge();

    (function initAdminLongPress() {
        const waitForBtn = setInterval(() => {
            const langBtn = document.getElementById('lang-btn'); if (!langBtn) return;
            clearInterval(waitForBtn);
            let pressTimer, progressRAF, startTime, longPressTriggered = false, progressEl;
            const cleanup = () => { clearTimeout(pressTimer); cancelAnimationFrame(progressRAF); if (progressEl && progressEl.parentNode) progressEl.remove(); progressEl = null; };
            const startPress = (e) => {
                longPressTriggered = false; startTime = Date.now();
                progressEl = document.createElement('span'); progressEl.className = 'lang-press-progress'; langBtn.appendChild(progressEl);
                pressTimer = setTimeout(() => { longPressTriggered = true; cleanup(); if (navigator.vibrate) navigator.vibrate(100); goScreen('screen-admin-login'); }, 5000);
                const tick = () => { const pct = Math.min((Date.now() - startTime) / 5000, 1); if (progressEl) progressEl.style.setProperty('--p', pct); if (pct < 1) progressRAF = requestAnimationFrame(tick); };
                progressRAF = requestAnimationFrame(tick);
            };
            const endPress = () => { if (!longPressTriggered) cleanup(); };
            langBtn.addEventListener('pointerdown', startPress); langBtn.addEventListener('pointerup', endPress); langBtn.addEventListener('pointerleave', endPress);
            langBtn.addEventListener('click', (e) => { if (longPressTriggered) { e.preventDefault(); longPressTriggered = false; return; } switchLanguage(state.currentLang === 'ar' ? 'fr' : 'ar'); });
        }, 300);
    })();

    if (window.supabaseClient) {
        loadOrdersListener();
        startCatalogFallbackRefresh();
    }

    const adminForm = document.getElementById('admin-login-form');
    if (adminForm) {
        adminForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('admin-login-email').value.trim(); const enteredPass = document.getElementById('admin-login-pass').value.trim();
            if (!window.firebaseReady || typeof firebase === 'undefined' || !firebase.auth) {
                toast(state.currentLang === 'fr' ? 'Le service de connexion est indisponible.' : 'خدمة تسجيل دخول المدير غير متاحة حالياً.', 'error');
                return;
            }
            firebase.auth().signInWithEmailAndPassword(email, enteredPass)
                .then(() => { document.getElementById('admin-login-email').value = ''; document.getElementById('admin-login-pass').value = ''; goScreen('screen-admin'); adminGo('dashboard'); toast('✅ ' + i18n[state.currentLang].welcome_back); })
                .catch((error) => { console.error(error); toast('❌ ' + error.message, 'error'); if (navigator.vibrate) navigator.vibrate(200); });
        });
    }

    if (window.firebaseReady && typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (!user && document.getElementById('screen-admin')?.classList.contains('active')) { goScreen('screen-shop'); }
            if (typeof window.supabaseClient === 'undefined' || !window.supabaseClient) return;
            Promise.resolve(loadOrdersListener()).catch((error) => console.error('loadOrdersListener failed after auth change:', error));
        });
    }
});

function renderPromoBanner() { 
    const container = document.getElementById('promo-banner-container'); const textEl = document.getElementById('promo-scrolling-text'); 
    if (!container || !textEl) return; 
    if (state.settings.promoActive && state.settings.promoText) { 
        const safePromoText = esc(state.settings.promoText);
        const repeatedText = `🌟 ${safePromoText} &nbsp;&nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;&nbsp; ${safePromoText} &nbsp;&nbsp;&nbsp;&nbsp; ✦ &nbsp;&nbsp;&nbsp;&nbsp; ${safePromoText} &nbsp;&nbsp;&nbsp;&nbsp; 🌟`;
        textEl.innerHTML = repeatedText; 
        const duration = Math.max(10, state.settings.promoText.length * 0.3); textEl.style.animation = `marquee ${duration}s linear infinite`;
        container.style.display = 'block'; 
    } else { container.style.display = 'none'; } 
}
window.renderPromoBanner = renderPromoBanner;

function updateStoreBranding() {
    const nameEl = document.getElementById('shop-name-header'); if (nameEl && state.settings.shopName) nameEl.textContent = state.settings.shopName;
    const logoEl = document.getElementById('shop-logo-img-container');
    if (logoEl) {
        if (state.settings.logoUrl) { logoEl.innerHTML = `<img src="${esc(state.settings.logoUrl)}" style="width:100%;height:100%;object-fit:contain;border-radius:8px;">`; logoEl.style.background = 'transparent'; logoEl.style.color = 'transparent'; }
        else { logoEl.innerHTML = 'TD'; logoEl.style.background = 'var(--primary)'; logoEl.style.color = '#fff'; }
    }
}
window.updateStoreBranding = updateStoreBranding;

function renderCategories() {
    const c = document.getElementById('store-categories'); if (!c) return;
    const categories = ['all', ...new Set(state.products.map(p => p.category).filter(Boolean))];
    c.innerHTML = categories.map(cat => `<div class="category-item ${cat === currentCategory ? 'active' : ''}" onclick="filterByCategory('${cat}')">${cat === 'all' ? i18n[state.currentLang].all : esc(cat)}</div>`).join('');
}
window.renderCategories = renderCategories;

function filterByCategory(cat) { currentCategory = cat; renderCategories(); renderShop(); }
window.filterByCategory = filterByCategory;

function sortShopProducts(val) {
    let list = state.products.filter(p => p.qty > 0); if (currentCategory !== 'all') list = list.filter(p => p.category === currentCategory);
    if (val === 'price-asc') list.sort((a,b) => a.price - b.price); else if (val === 'price-desc') list.sort((a,b) => b.price - a.price); else if (val === 'newest') list.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    renderShopHTML(list);
}
window.sortShopProducts = sortShopProducts;

function renderShop() {
    let list = state.products.filter(p => p.qty > 0); if (currentCategory !== 'all') list = list.filter(p => p.category === currentCategory);
    renderShopHTML(list); renderNewProducts();
}
window.renderShop = renderShop;

function renderShopHTML(list) {
    const c = document.getElementById('s-products'); if (!c) return;
    if (list.length === 0) { c.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;">${i18n[state.currentLang].no_products}</div>`; return; }
    c.innerHTML = list.map(p => {
        const packBadge = p.isPack ? `<div class="pack-badge"><i class="fas fa-gift"></i> ${i18n[state.currentLang].pack_badge}</div>` : ''; const promoBadge = effectiveProductPrice(p) < Number(p.price) ? `<div class="promo-pill shop-promo-pill">${i18n[state.currentLang].promo_badge}</div>` : '';
        const specialBadge = p.isSpecial ? `<div style="position:absolute; top:10px; left:10px; background:#8b5cf6; color:#fff; padding:4px 10px; border-radius:20px; font-size:0.7rem; font-weight:900; z-index:10; box-shadow:0 2px 5px rgba(139,92,246,0.4);"><i class="fas fa-star"></i> ${i18n[state.currentLang].special_badge}</div>` : '';
        const lowStock = p.qty <= 3 ? `<div style="position:absolute; bottom:10px; left:10px; background:#ef4444; color:#fff; padding:2px 6px; border-radius:4px; font-size:0.65rem; font-weight:bold;">${p.qty} ${i18n[state.currentLang].max_stock}</div>` : '';
        const isWish = state.wishlist.includes(p.id);
        return `<div class="product-card" onclick="showProductView(${p.id})">${packBadge}${promoBadge}${specialBadge}${lowStock}
            <div class="product-img">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" loading="lazy">` : '📦'}</div>
            <div class="product-actions-under-image"><button class="product-mini-action ${isWish ? 'is-favorite' : ''}" aria-label="${state.currentLang === 'ar' ? 'المفضلة' : 'Favoris'}" title="${state.currentLang === 'ar' ? 'المفضلة' : 'Favoris'}" onclick="event.stopPropagation();toggleWishlist(${p.id})"><i class="fas fa-heart"></i></button><button class="product-mini-action product-mini-cart" aria-label="${state.currentLang === 'ar' ? 'أضف للسلة' : 'Ajouter au panier'}" title="${state.currentLang === 'ar' ? 'أضف للسلة' : 'Ajouter au panier'}" onclick="event.stopPropagation();addToCart(${p.id})"><i class="fas fa-shopping-basket"></i></button></div>
            <div class="product-info"><div style="background: #e0f2fe; color: #0284c7; font-size: 0.7rem; font-weight: bold; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 6px; width: fit-content;">${esc(p.category || i18n[state.currentLang].all)}</div><h3 style="font-size:0.9rem; margin-bottom:8px; color:var(--text-dark); font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.name)}</h3><div style="display:flex; justify-content:flex-start; align-items:center; margin-top:auto; padding-top:8px; border-top:1px dashed var(--border);"><div style="font-weight:900; font-size:1.1rem; color:#000;">${(effectiveProductPrice(p)<Number(p.price))?`<del style="font-size:.78rem;color:#94a3b8;margin-inline-end:6px;">${fmtMoney(p.price)}</del>`:''}${fmtMoney(effectiveProductPrice(p))}</div></div></div></div>`;
    }).join('');
}

function renderNewProducts() {
    const box = document.getElementById('new-products-box'); const list = document.getElementById('new-products-list'); if (!box || !list) return;
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000); const newProds = state.products.filter(p => p.qty > 0 && p.createdAt && Number.isFinite(new Date(p.createdAt).getTime()) && new Date(p.createdAt).getTime() > sevenDaysAgo).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);
    if (newProds.length === 0) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    list.innerHTML = newProds.map(p => `<div onclick="showProductView(${p.id})" style="min-width:140px; background:#fff; border-radius:10px; border:1px solid var(--border); padding:10px; cursor:pointer; text-align:center;"><div style="height:80px; background:var(--bg-light); border-radius:6px; display:flex; align-items:center; justify-content:center; font-size:2rem; margin-bottom:8px;">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" style="width:100%;height:100%;object-fit:contain;">` : '📦'}</div><div style="font-size:0.8rem; font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${esc(p.name)}</div><div style="font-size:0.9rem; font-weight:900; color:#000; margin-top:5px;">${fmtMoney(effectiveProductPrice(p))}</div></div>`).join('');
}
window.renderNewProducts = renderNewProducts;

function filterShopProducts(q) {
    const c = document.getElementById('s-products'); if (!c) return; if (!q.trim()) { renderShop(); return; }
    const lq = q.toLowerCase(); let list = state.products.filter(p => p.qty > 0 && (p.name.toLowerCase().includes(lq) || (p.category || '').toLowerCase().includes(lq)));
    renderShopHTML(list);
}
window.filterShopProducts = filterShopProducts;

function toggleWishlist(id) {
    if (!state.session) { toast(i18n[state.currentLang].login_first, 'error'); openCustomerAuthModal(); return; }
    const idx = state.wishlist.indexOf(id); if (idx > -1) state.wishlist.splice(idx, 1); else state.wishlist.push(id);
    save(K.wishlist, state.wishlist); updateWishlistBadge(); renderWishlist(); renderShop();
    const cust = state.customers.find(c => c.id === state.session.id);
    if (cust) { cust.wishlist = state.wishlist; save(K.customers, state.customers); if (window.supabaseClient) window.supabaseClient.from('customers').update({ wishlist: state.wishlist }).eq('id', cust.id).then(); }
    toast(idx > -1 ? '✓' : '❤️');
}
window.toggleWishlist = toggleWishlist;

function updateWishlistBadge() { const b = document.getElementById('wishlist-badge'); if (b) { b.textContent = state.wishlist.length; b.style.display = state.wishlist.length > 0 ? 'flex' : 'none'; } }
function renderWishlist() {
    const c = document.getElementById('s-wishlist-items'); if (!c) return;
    const items = state.products.filter(p => state.wishlist.includes(p.id));
    if (items.length === 0) { c.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;">${i18n[state.currentLang].empty_wishlist}</div>`; return; }
    c.innerHTML = items.map(p => `<div class="product-card" onclick="showProductView(${p.id})"><div class="product-img">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}">` : '📦'}</div><div class="product-info"><h3>${esc(p.name)}</h3><div style="font-weight:900;margin:10px 0;">${fmtMoney(p.price)}</div><button class="btn-primary" style="width:100%;padding:8px;" onclick="event.stopPropagation();addToCart(${p.id})">${i18n[state.currentLang].add_to_cart}</button></div></div>`).join('');
}
window.updateWishlistBadge = updateWishlistBadge; window.renderWishlist = renderWishlist;

function showProductView(id) {
    const p = state.products.find(x => x.id === id); if (!p) return;
    document.getElementById('pv-name').textContent = p.name; document.getElementById('pv-price').textContent = fmtMoney(effectiveProductPrice(p)); const packDescription = p.isPack && Array.isArray(p.packItems) ? `\n\n${i18n[state.currentLang].pack_items}: ${p.packItems.map(item => { const product=state.products.find(x=>x.id===item.id); return product ? `${product.name} × ${item.qty}` : ''; }).filter(Boolean).join(', ')}` : ''; document.getElementById('pv-desc').textContent = (p.desc || '') + packDescription;
    const imgBox = document.getElementById('pv-image-box');
    if (p.images && p.images.length > 0) { imgBox.innerHTML = `<div class="product-gallery">${p.images.map(img => `<img src="${esc(img)}">`).join('')}</div>`; }
    else { imgBox.innerHTML = '<div style="height:200px;background:#f1f5f9;text-align:center;font-size:3rem;">📦</div>'; }
    const revList = document.getElementById('pv-reviews-list'); if (p.reviews && p.reviews.length > 0) { revList.innerHTML = p.reviews.map(r => `<div style="border-bottom:1px dashed #eee; padding:5px 0;"><strong>${esc(r.name)}</strong> <span style="color:#f59e0b;">${'⭐'.repeat(r.stars)}</span><br><small>${esc(r.text)}</small></div>`).join(''); } else { revList.innerHTML = `<small>${i18n[state.currentLang].no_reviews}</small>`; }
    document.getElementById('pv-add-to-cart').setAttribute('data-id', p.id);
    document.getElementById('pv-add-to-cart').onclick = () => { addToCart(p.id); closeModal('m-product-view'); };
    openModal('m-product-view');
}
window.showProductView = showProductView;


function submitReview() {
    if (!state.session) return toast(i18n[state.currentLang].login_first, 'error');
    const stars = document.getElementById('pv-review-stars').value; const text = document.getElementById('pv-review-text').value.trim(); if (!text) return toast(i18n[state.currentLang].review_placeholder, 'error');
    const productId = document.getElementById('pv-add-to-cart').getAttribute('data-id'); const prod = state.products.find(p => p.id === Number(productId)); if (!prod) return;
    if (!prod.reviews) prod.reviews = [];
    const reviewer = state.customers.find(c => String(c.id) === String(state.session.id));
    if (!reviewer) return toast(i18n[state.currentLang].login_first, 'error');
    prod.reviews.push({ name: reviewer.name || 'زبون', stars, text, date: new Date().toISOString() });
    save(K.products, state.products); if (window.supabaseClient) window.supabaseClient.from('products').update({ reviews: prod.reviews }).eq('id', prod.id).then();
    document.getElementById('pv-review-text').value = ''; showProductView(prod.id); toast('✅');
}
window.submitReview = submitReview;

function addToCart(id) {
    const p = state.products.find(x => x.id === id); if (!p) return;
    if (Number(p.qty) <= 0) return toast(i18n[state.currentLang].max_stock, 'error');
    const item = state.cart.find(x => x.id === id);
    if (item) { if (item.qty < p.qty) item.qty++; else return toast(i18n[state.currentLang].max_stock, 'error'); }
    else { state.cart.push({ id: p.id, name: p.name, price: effectiveProductPrice(p), qty: 1 }); }
    save(K.cart, state.cart); updateCartBadge(); toast('✓');
}
window.addToCart = addToCart;

function updateCartBadge() { const b = document.getElementById('cart-badge'); if (b) { const q = state.cart.reduce((s, i) => s + i.qty, 0); b.textContent = q; b.style.display = q > 0 ? 'flex' : 'none'; } }
function updateCartQty(id, d) { const item = state.cart.find(c => c.id === id); if (!item) return; item.qty += d; if (item.qty <= 0) state.cart = state.cart.filter(c => c.id !== id); save(K.cart, state.cart); renderCart(); updateCartBadge(); }
function removeFromCart(id) { state.cart = state.cart.filter(c => c.id !== id); save(K.cart, state.cart); renderCart(); updateCartBadge(); }
window.updateCartBadge = updateCartBadge; window.updateCartQty = updateCartQty; window.removeFromCart = removeFromCart;

function renderCart() {
    const c = document.getElementById('s-cart-items'); const sum = document.getElementById('s-cart-summary'); if (!c) return;
    if (state.cart.length === 0) { c.innerHTML = `<div style="text-align:center;padding:40px;">${i18n[state.currentLang].cart_empty}</div>`; sum.innerHTML = ''; return; }
    c.innerHTML = state.cart.map(i => `<div class="admin-card"><div><strong>${esc(i.name)}</strong><br><small>${fmtMoney(i.price)} x ${i.qty}</small></div><div style="display:flex;gap:10px;align-items:center;"><button onclick="updateCartQty(${i.id},-1)" style="padding:5px;">-</button><span>${i.qty}</span><button onclick="updateCartQty(${i.id},1)" style="padding:5px;">+</button><button onclick="removeFromCart(${i.id})" style="color:red;border:none;background:none;">🗑</button></div></div>`).join('');
    sum.innerHTML = `<div class="delivery-cost-box">${i18n[state.currentLang].total_price} ${fmtMoney(state.cart.reduce((s, i) => s + i.price * i.qty, 0))}</div>`;
}
window.renderCart = renderCart;

function openShopCheckout() {
    if (state.cart.length === 0) return toast(i18n[state.currentLang].cart_empty, 'error');
    if (!state.session || state.session.role !== 'customer') { pendingCheckout = true; toast(i18n[state.currentLang].login_first, 'error'); openCustomerAuthModal(); return; }
    document.getElementById('chk-coupon').value = ''; appliedCoupon = null;
    populateWilayas();
    document.getElementById('chk-courier').value = 'noest';
    document.getElementById('chk-type').value = 'home';
    toggleStationField();
    updateDeliveryPrice();
    openModal('m-checkout');
}
window.openShopCheckout = openShopCheckout;

function populateWilayas() { const s = document.getElementById('chk-wilaya'); if (s) s.innerHTML = `<option value="">${i18n[state.currentLang].select_wilaya_first}</option>` + ALGERIA_WILAYAS.map(w => `<option value="${w.code}">${esc(w.name)}</option>`).join(''); }
window.populateWilayas = populateWilayas;

function handleWilayaChange() { updateDeliveryPrice(); populateCourierStations(); }
function handleTypeChange() { toggleStationField(); handleWilayaChange(); }
function handleCourierChange() { toggleStationField(); handleWilayaChange(); }
function toggleStationField() {
    const courier = document.getElementById('chk-courier').value; const type = document.getElementById('chk-type').value;
    const group = document.getElementById('group-station');
    const communeGroup = document.getElementById('group-commune');
    const addressInput = document.getElementById('chk-address')?.closest('.form-group');
    const office = type === 'stopdesk';
    if (group) group.style.display = office ? 'block' : 'none';
    if (communeGroup) communeGroup.style.display = office ? 'none' : 'block';
    if (addressInput) addressInput.style.display = office ? 'none' : 'block';
    const label = group?.querySelector('label');
    if (label) label.textContent = (courier === 'yalidine' ? '📍 ' + i18n[state.currentLang].yalidine_network : '📍 NOEST');
    if (!office) { const sel=document.getElementById('chk-station'); if(sel) sel.value=''; }
}
function populateCourierStations() {
    const wilayaCode = parseInt(document.getElementById('chk-wilaya').value);
    const courier = document.getElementById('chk-courier').value;
    const type = document.getElementById('chk-type').value;
    const select = document.getElementById('chk-station'); if (!select) return;
    if (type !== 'stopdesk') return;
    if (!wilayaCode) { select.innerHTML = `<option value="">${i18n[state.currentLang].select_wilaya_first}</option>`; return; }
    let stations = courier === 'yalidine' ? (YALIDINE_STATIONS[String(wilayaCode)] || []) : (NOEST_STATIONS[String(wilayaCode)] || []);
    if (stations.length === 0) { select.innerHTML = `<option value="">${i18n[state.currentLang].no_offices}</option>`; return; }
    select.innerHTML = `<option value="">${i18n[state.currentLang].select_office}</option>` + stations.map(s => {
        const label = `${s.name}${s.address ? ' — ' + s.address : ''}`;
        return `<option value="${esc(s.code)}" data-name="${esc(s.name)}" data-address="${esc(s.address || '')}">${esc(label)} (${esc(s.code)})</option>`;
    }).join('');
}
function populateNoestStations() { populateCourierStations(); }
window.handleWilayaChange = handleWilayaChange; window.handleTypeChange = handleTypeChange; window.handleCourierChange = handleCourierChange; window.populateNoestStations = populateNoestStations; window.populateCourierStations = populateCourierStations;

function normalizePromoPhone(phone) { return String(phone || '').replace(/[^0-9]/g, ''); }
async function applyCoupon() {
    const code = document.getElementById('chk-coupon').value.trim().toUpperCase();
    const customer = state.session && state.session.role === 'customer' ? state.customers.find(x => x.id === state.session.id) : null;
    if (!customer || !customer.phone) return toast('سجّل الدخول برقم هاتفك أولًا / Connectez-vous avec votre téléphone', 'error');
    if (!code) return toast('أدخل كود البرومو / Saisissez le code promo', 'error');
    if (!window.supabaseClient) return toast('يلزم الاتصال بقاعدة البيانات للتحقق من البرومو', 'error');
    try {
        const { data, error } = await window.supabaseClient.rpc('td_check_promo', { p_code: code, p_phone: customer.phone });
        if (error) throw error;
        if (!data || data.valid !== true) {
            const messages = { phone_mismatch: 'هذا الكود غير مرتبط برقم هاتفك', limit_reached: 'انتهى عدد استعمالات هذا الكود', expired: 'انتهت صلاحية الكود', inactive: 'هذا الكود متوقف', not_found: 'كود غير صحيح' };
            appliedCoupon = null; updateDeliveryPrice(); return toast(messages[data?.reason] || 'كود غير صالح', 'error');
        }
        appliedCoupon = { code: data.code, discount: Number(data.discount), phone: customer.phone, maxUses: data.maxUses, used: data.used };
        updateDeliveryPrice(); toast(`✓ تم تطبيق تخفيض ${data.discount}%`);
    } catch (e) { console.error('Promo validation failed', e); appliedCoupon = null; updateDeliveryPrice(); toast('تعذر التحقق من الكود. شغّل ملف SQL الخاص بالبرومو في Supabase.', 'error'); }
}
window.applyCoupon = applyCoupon;

function updateDeliveryPrice() {
    const wId = parseInt(document.getElementById('chk-wilaya').value); const comp = document.getElementById('chk-courier').value; const type = document.getElementById('chk-type').value;
    const w = ALGERIA_WILAYAS.find(x => x.code === wId); let delPrice = 0;
    if (w) { delPrice = comp === 'yalidine' ? (type === 'home' ? w.yalidineHome : w.yalidineDesk) : (type === 'home' ? w.noestHome : w.noestDesk); if (state.settings.customPrices?.[wId]?.[comp]?.[type === 'home' ? 'home' : 'desk']) delPrice = state.settings.customPrices[wId][comp][type === 'home' ? 'home' : 'desk']; }
    let itemsTotal = state.cart.reduce((s, i) => s + i.price * i.qty, 0); let discountAmount = 0;
    if (appliedCoupon) { discountAmount = itemsTotal * (appliedCoupon.discount / 100); itemsTotal -= discountAmount; }
    const total = itemsTotal + delPrice;
    document.getElementById('chk-discount').textContent = fmtMoney(discountAmount);
    document.getElementById('chk-del-price').textContent = fmtMoney(delPrice); 
    document.getElementById('chk-items-total').textContent = fmtMoney(itemsTotal + discountAmount); 
    document.getElementById('chk-total-price').textContent = fmtMoney(total);
}
window.updateDeliveryPrice = updateDeliveryPrice;

async function confirmShopOrder() {
    if (!state.session || state.session.role !== 'customer') return toast(i18n[state.currentLang].login_first, 'error');
    const c = state.customers.find(x => x.id === state.session.id); if (!c) return toast('حساب الزبون غير موجود', 'error');
    const wilayaCode = parseInt(document.getElementById('chk-wilaya').value); const type = document.getElementById('chk-type').value; const courier = document.getElementById('chk-courier').value;
    const commune = document.getElementById('chk-commune').value.trim(); const address = document.getElementById('chk-address').value.trim();
    const stationSelect = document.getElementById('chk-station'); const stationCode = type === 'stopdesk' ? stationSelect.value : '';
    const stationName = stationSelect && stationSelect.value ? (stationSelect.options[stationSelect.selectedIndex]?.dataset.name || '') : '';
    const stationAddress = stationSelect && stationSelect.value ? (stationSelect.options[stationSelect.selectedIndex]?.dataset.address || '') : '';
    const finalCommune = type === 'stopdesk' ? (stationName || '') : commune;
    const finalAddress = type === 'stopdesk' ? stationAddress : address;
    if (!wilayaCode) return toast(i18n[state.currentLang].select_wilaya_first, 'error');
    if (type === 'home' && (!commune || !address)) return toast(i18n[state.currentLang].complete_address, 'error');
    if (type === 'stopdesk' && !stationCode) return toast(i18n[state.currentLang].select_office, 'error');

    const wData = ALGERIA_WILAYAS.find(w => w.code === wilayaCode);
    let delPrice = wData ? (courier === 'yalidine' ? (type === 'home' ? wData.yalidineHome : wData.yalidineDesk) : (type === 'home' ? wData.noestHome : wData.noestDesk)) : 800;
    if (state.settings.customPrices?.[wilayaCode]?.[courier]?.[type === 'home' ? 'home' : 'desk']) delPrice = state.settings.customPrices[wilayaCode][courier][type === 'home' ? 'home' : 'desk'];

    const orderItems = [];
    let priceChanged = false;
    for (const ci of state.cart) {
        const prod = state.products.find(p => String(p.id) === String(ci.id));
        if (!prod) return toast(state.currentLang === 'fr' ? 'Un produit de votre panier n’est plus disponible. Retirez-le puis réessayez.' : 'أحد منتجات السلة لم يعد متاحاً. أزله من السلة ثم حاول مجدداً.', 'error');
        const currentPrice = Number(effectiveProductPrice(prod)) || 0;
        if (currentPrice !== Number(ci.price)) {
            ci.price = currentPrice;
            ci.name = prod.name;
            priceChanged = true;
        }
        orderItems.push({ id: prod.id, name: prod.name, price: currentPrice, qty: Number(ci.qty) || 0, cost: Number(prod.cost) || 0, isPack: Boolean(prod.isPack), packItems: Array.isArray(prod.packItems) ? prod.packItems : [] });
    }
    if (priceChanged) {
        save(K.cart, state.cart); renderCart(); updateCartBadge();
        return toast(state.currentLang === 'fr' ? 'Certains prix ont changé. Vérifiez votre panier avant de confirmer la commande.' : 'تغيّرت أسعار بعض المنتجات. راجع السلة ثم أكّد الطلبية من جديد.', 'error');
    }
    let itemsTotal = orderItems.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0); let discountAmount = 0;
    if (appliedCoupon) { discountAmount = itemsTotal * (appliedCoupon.discount / 100); itemsTotal -= discountAmount; }
    const total = itemsTotal + delPrice;

    if (window.supabaseClient) {
        try {
            let outOfStock = [];
            const requiredByProduct = new Map();
            for (const item of orderItems) {
                requiredByProduct.set(String(item.id), (requiredByProduct.get(String(item.id)) || 0) + item.qty);
                if (item.isPack) for (const comp of item.packItems) {
                    const key = String(comp.id);
                    requiredByProduct.set(key, (requiredByProduct.get(key) || 0) + (Number(comp.qty) || 0) * item.qty);
                }
            }
            for (const [productId, requiredQty] of requiredByProduct) {
                const { data, error: stockError } = await window.supabaseClient.from('products').select('id,name,qty').eq('id', productId).maybeSingle();
                if (stockError) throw stockError;
                if (!data || Number(data.qty) < requiredQty) outOfStock.push(`"${data?.name || orderItems.find(x => String(x.id) === productId)?.name || 'Produit'}"`);
            }
            if (outOfStock.length > 0) { return toast(`❌ ${i18n[state.currentLang].max_stock}: ${[...new Set(outOfStock)].join(' و ')}`, 'error'); }
        } catch (error) { return toast(i18n[state.currentLang].error_connection, 'error'); }
    }

    const order = { id: Date.now(), customerId: state.session.id, customerName: c.name, customerPhone: c.phone, items: orderItems, itemsTotal: itemsTotal + discountAmount, discount: discountAmount, couponCode: appliedCoupon ? appliedCoupon.code : null, promoCode: appliedCoupon ? appliedCoupon.code : null, promoDiscountPercent: appliedCoupon ? appliedCoupon.discount : 0, promoDiscountAmount: discountAmount, deliveryPrice: delPrice, total: total, courier, deliveryType: type, wilaya: wData.name, commune: finalCommune, address: finalAddress, stationCode: stationCode || null, stationName: stationName || null, stationAddress: stationAddress || null, status: 'new', createdAt: new Date().toISOString() };

    if (appliedCoupon && window.supabaseClient) {
        // Recheck at submission time; the database atomically records each order ID only once.
        const { data: check, error: checkError } = await window.supabaseClient.rpc('td_check_promo', { p_code: appliedCoupon.code, p_phone: c.phone });
        if (checkError || !check || check.valid !== true) { appliedCoupon = null; updateDeliveryPrice(); return toast('انتهت صلاحية البرومو أو استُنفدت استعمالاته. أعد إدخال الكود.', 'error'); }
        const freshDiscount = Number(check.discount);
        if (freshDiscount !== Number(order.promoDiscountPercent)) return toast('تغيرت نسبة التخفيض. أعد تطبيق الكود من جديد.', 'error');
    }

    if (window.supabaseClient) {
        try {
            // The database RPC locks all stock rows and inserts the order + stock deductions atomically.
            const { data: created, error } = await window.supabaseClient.rpc('td_create_order', { p_order: order });
            if (error) throw error;
            if (!created || created.ok !== true) throw new Error('Order creation was not confirmed by the database.');
            const stockDeltas = getOrderStockDeltas(orderItems);
            for (const [productId, quantity] of stockDeltas) {
                const prod = state.products.find(p => String(p.id) === String(productId));
                if (prod) prod.qty = Math.max(0, Number(prod.qty) - Number(quantity));
            }
        } catch (error) { console.error(error); return toast(i18n[state.currentLang].order_failed, 'error'); }
    } else { return toast('يلزم الاتصال بقاعدة البيانات لإتمام الطلبية', 'error'); }

    const pointsEarned = Math.floor(total / 100); c.points = (c.points || 0) + pointsEarned;
    if (window.supabaseClient) window.supabaseClient.from('customers').update({ points: c.points }).eq('id', c.id).then();

    state.orders.unshift(order); save(K.orders, state.orders); save(K.products, state.products); save(K.customers, state.customers);
    state.cart = []; save(K.cart, state.cart); updateCartBadge(); closeModal('m-checkout'); toast('✅ ' + i18n[state.currentLang].saved); shopGo('orders'); renderShop();
}
window.confirmShopOrder = confirmShopOrder;
function callStore() { const phone = state.settings.shopPhone ? state.settings.shopPhone.replace(/[^0-9+]/g, '') : ''; if (!phone) return toast(i18n[state.currentLang].save_failed, 'error'); window.location.href = `tel:${phone}`; }
window.callStore = callStore;

function handleAccountClick() { if (state.session && state.session.role === 'customer') shopGo('profile'); else openCustomerAuthModal(); }
function openCustomerAuthModal() {
    if (state.session) {
        const cust = state.customers.find(x => x.id === state.session.id);
        document.getElementById('auth-logged-out').style.display = 'none'; document.getElementById('auth-logged-in').style.display = 'block';
        document.getElementById('auth-welcome').textContent = `${i18n[state.currentLang].welcome_back} ${cust ? cust.name : ''}`;
    } else {
        document.getElementById('auth-logged-out').style.display = 'block'; document.getElementById('auth-logged-in').style.display = 'none';
        document.getElementById('auth-name').value = ''; document.getElementById('auth-phone').value = ''; document.getElementById('auth-pass').value = ''; document.getElementById('auth-recovery-pin').value = '';
        switchAuthMode('login');
    }
    openModal('m-customer-auth');
}
window.handleAccountClick = handleAccountClick; window.openCustomerAuthModal = openCustomerAuthModal;

function switchAuthMode(mode) {
    currentAuthMode = mode;
    if (mode === 'login') {
        document.getElementById('btn-auth-login').style.borderBottom = '2px solid var(--primary)'; document.getElementById('btn-auth-login').style.color = 'var(--primary)';
        document.getElementById('btn-auth-register').style.borderBottom = 'none'; document.getElementById('btn-auth-register').style.color = 'var(--text-mid)';
        document.getElementById('group-auth-name').style.display = 'none'; document.getElementById('group-auth-recovery').style.display = 'none';
        document.getElementById('group-forgot-pass').style.display = 'block'; document.getElementById('btn-auth-submit').textContent = i18n[state.currentLang].login_btn;
    } else {
        document.getElementById('btn-auth-register').style.borderBottom = '2px solid var(--primary)'; document.getElementById('btn-auth-register').style.color = 'var(--primary)';
        document.getElementById('btn-auth-login').style.borderBottom = 'none'; document.getElementById('btn-auth-login').style.color = 'var(--text-mid)';
        document.getElementById('group-auth-name').style.display = 'block'; document.getElementById('group-auth-recovery').style.display = 'block';
        document.getElementById('group-forgot-pass').style.display = 'none'; document.getElementById('btn-auth-submit').textContent = i18n[state.currentLang].register_btn;
    }
}
window.switchAuthMode = switchAuthMode;

async function confirmCustomerAuth() {
    const phone = document.getElementById('auth-phone').value.trim(); const pass = document.getElementById('auth-pass').value.trim();
    const name = document.getElementById('auth-name').value.trim(); const recoveryPin = document.getElementById('auth-recovery-pin').value.trim();
    const submitBtn = document.getElementById('btn-auth-submit');
    if (!phone || !pass) return toast(i18n[state.currentLang].login_first, 'error');
    if (submitBtn.disabled) return; submitBtn.disabled = true; const originalText = submitBtn.textContent; submitBtn.textContent = '...';

    try {
        const hashedPass = CryptoJS.SHA256(pass).toString();
        let c = null;
        if (window.supabaseClient) { const { data, error } = await window.supabaseClient.from('customers').select('*').eq('phone', phone).limit(1).maybeSingle(); if (error) throw new Error(error.message); if (data) c = data; }
        
        if (currentAuthMode === 'login') {
            if (!c) throw new Error('رقم الهاتف غير مسجل');
            if (c.isBlocked) throw new Error('🚫 عذراً، هذا الحساب محظور.');
            const isOldPlain = c.password === pass; const isNewHashed = c.password === hashedPass;
            if (!isOldPlain && !isNewHashed) throw new Error(i18n[state.currentLang].wrong_pass);
            if (isOldPlain) { c.password = hashedPass; save(K.customers, state.customers); if (window.supabaseClient) await window.supabaseClient.from('customers').update({ password: hashedPass }).eq('id', c.id); }
            toast(`✅ ${i18n[state.currentLang].welcome_back} ${c.name}`);
        } else {
            if (c) { if (c.isBlocked) throw new Error('🚫 هذا الحساب محظور'); throw new Error('❌ رقم الهاتف هذا مسجل مسبقاً!'); }
            if (!name) throw new Error('أدخل الاسم'); if (!recoveryPin) throw new Error('أدخل الرقم السري');
            const newCustomer = { id: Date.now(), name, phone, password: hashedPass, isVip: false, isTop: false, isBlocked: false, points: 0, recoveryPin: recoveryPin, wishlist: [] };
            if (window.supabaseClient) { const { error } = await window.supabaseClient.from('customers').insert([newCustomer]); if (error) throw new Error(error.message); }
            state.customers.push(newCustomer); c = newCustomer;
            toast(`✅ ${i18n[state.currentLang].welcome_new}`);
        }
        
        state.session = { id: c.id, role: 'customer' }; save(K.session, state.session); state.wishlist = c.wishlist || []; save(K.wishlist, state.wishlist); updateWishlistBadge();
        closeModal('m-customer-auth'); updateUIBasedOnSession(); loadOrdersListener();
        if (pendingCheckout) { pendingCheckout = false; openShopCheckout(); } else { shopGo('profile'); }
    } catch (error) { toast(error.message, 'error'); } finally { submitBtn.disabled = false; submitBtn.textContent = originalText; }
}
window.confirmCustomerAuth = confirmCustomerAuth;

async function customerForgotPassword() {
    const phone = prompt("أدخل رقم الهاتف الذي سجلت به:"); if (!phone) return;
    let c = null;
    if (window.supabaseClient) { const { data, error } = await window.supabaseClient.from('customers').select('*').eq('phone', phone.trim()).limit(1).maybeSingle(); if (error) throw new Error(error.message); if (data) c = data; }
    if (!c) return toast("❌ هذا الرقم غير مسجل لدينا!", "error");
    const pin = prompt("أدخل الرقم السري للاسترجاع (Recovery PIN):"); if (pin !== c.recoveryPin) return toast("❌ الرقم السري غير صحيح!", "error");
    const newPass = prompt("✅ تم التحقق بنجاح!\nأدخل كلمة المرور الجديدة:");
    if (newPass && newPass.trim().length >= 4) {
        const hashedPass = CryptoJS.SHA256(newPass.trim()).toString(); c.password = hashedPass; save(K.customers, state.customers);
        if (window.supabaseClient) await window.supabaseClient.from('customers').update({ password: hashedPass }).eq('id', c.id);
        toast("✅ تم تغيير كلمة المرور بنجاح!");
        document.getElementById('auth-phone').value = c.phone; document.getElementById('auth-pass').value = ''; document.getElementById('auth-pass').focus();
    } else if (newPass) { toast("❌ كلمة المرور قصيرة جداً", "error"); }
}
window.customerForgotPassword = customerForgotPassword;

function renderProfile() {
    const n = document.getElementById('p-name'), p = document.getElementById('p-phone'), a = document.getElementById('p-address'); if (!n) return;
    if (!state.session) { n.value = ''; p.value = ''; a.value = ''; return; }
    const c = state.customers.find(x => x.id === state.session.id); if (c) { n.value = c.name || ''; p.value = c.phone || ''; a.value = c.address || ''; document.getElementById('p-points').textContent = `${c.points || 0}`; }
}
window.renderProfile = renderProfile;

async function updateCustomerProfile() {
    if (!state.session) return;
    const c = state.customers.find(x => String(x.id) === String(state.session.id));
    if (!c) return toast(i18n[state.currentLang].error_fetch, 'error');
    const payload = { name: document.getElementById('p-name').value.trim(), phone: document.getElementById('p-phone').value.trim(), address: document.getElementById('p-address').value.trim() };
    if (!window.supabaseClient) return toast(i18n[state.currentLang].error_connection, 'error');
    if (!payload.name || !payload.phone) return toast(state.currentLang === 'fr' ? 'Le nom et le téléphone sont obligatoires.' : 'الاسم ورقم الهاتف إجباريان.', 'error');
    if (payload.phone !== String(c.phone || '')) {
        const { data: existing, error: duplicateError } = await window.supabaseClient.from('customers').select('id').eq('phone', payload.phone).neq('id', c.id).limit(1);
        if (duplicateError) return toast(state.currentLang === 'fr' ? 'Impossible de vérifier ce numéro. Réessayez.' : 'تعذر التحقق من رقم الهاتف. حاول مجدداً.', 'error');
        if (existing && existing.length) return toast(state.currentLang === 'fr' ? 'Ce numéro est déjà utilisé par un autre compte.' : 'هذا الهاتف مستعمل من حساب آخر', 'error');
        const { data: priorOrders, error: ordersCheckError } = await window.supabaseClient.from('orders').select('id').eq('customerPhone', c.phone).limit(1);
        if (ordersCheckError) return toast(state.currentLang === 'fr' ? 'Impossible de vérifier les anciennes commandes. Le téléphone n’a pas été modifié.' : 'تعذر التحقق من الطلبيات القديمة. لم يتم تغيير الهاتف.', 'error');
        if (priorOrders && priorOrders.length) return toast(state.currentLang === 'fr' ? 'Le téléphone ne peut pas être modifié après une commande. Contactez le magasin.' : 'لا يمكن تغيير الهاتف بعد وجود طلبيات سابقة. اتصل بالمتجر للمساعدة.', 'error');
    }
    const { error } = await window.supabaseClient.from('customers').update(payload).eq('id', c.id);
    if (error) { console.error('Customer profile update failed:', error); return toast('❌ ' + error.message, 'error'); }
    Object.assign(c, payload); save(K.customers, state.customers);
    toast('✅ ' + i18n[state.currentLang].saved); setTimeout(() => { shopGo('shop'); }, 1000);
}
window.updateCustomerProfile = updateCustomerProfile;

function renderMyOrders() {
    const c = document.getElementById('s-orders-list'); if (!c) return;
    if (!state.session) { c.innerHTML = `<div style="text-align:center;padding:40px;">${i18n[state.currentLang].login_to_see_messages}<br><br><button class="btn-primary" onclick="openCustomerAuthModal()">${i18n[state.currentLang].login_btn}</button></div>`; return; }
    const cust = state.customers.find(x => String(x.id) === String(state.session.id)); if (!cust) { c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">${i18n[state.currentLang].error_fetch}</div>`; return; }
    const myOrders = state.orders.filter(o => String(o.customerPhone).trim() === String(cust.phone).trim());
    if (myOrders.length === 0) { c.innerHTML = `<div style="text-align:center;padding:40px;">${i18n[state.currentLang].no_orders}</div>`; return; }
    const statusMap = { 'new': { text: i18n[state.currentLang].new, color: '#d97706', bg: '#fef3c7' }, 'confirmed': { text: i18n[state.currentLang].confirmed, color: '#2563eb', bg: '#dbeafe' }, 'on_the_way': { text: i18n[state.currentLang].on_the_way, color: '#7c3aed', bg: '#ede9fe' }, 'out_for_delivery': { text: i18n[state.currentLang].out_for_delivery, color: '#c026d3', bg: '#fae8ff' }, 'delivered': { text: i18n[state.currentLang].delivered, color: '#059669', bg: '#d1fae5' }, 'cancelled': { text: i18n[state.currentLang].cancelled, color: '#dc2626', bg: '#fee2e2' } };
    c.innerHTML = myOrders.map(o => {
        const status = statusMap[o.status] || statusMap['new']; const paid = o.paidAmount ?? o.total; const debt = o.total - paid;
        let debtHtml = ''; if (debt > 0) { debtHtml = `<div style="background: #fee2e2; border: 1px solid #ef4444; padding: 10px; border-radius: 8px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center;"><span style="font-weight: bold; color: #b91c1c;"><i class="fas fa-exclamation-triangle"></i> ${i18n[state.currentLang].debt_alert}</span><span style="font-family: monospace; font-size: 1.1rem; font-weight: 900; color: #b91c1c;">${fmtMoney(debt)}</span></div>`; }
        let confirmBtnHtml = ''; if (o.status === 'on_the_way' || o.status === 'out_for_delivery') { confirmBtnHtml = `<button onclick="customerConfirmReceipt(${o.id})" class="btn-primary" style="background:#10b981; margin-top:10px; width:100%; padding:10px;">${i18n[state.currentLang].confirm_receipt}</button>`; }
        const itemsList = o.items.map(i => { const components = i.isPack && Array.isArray(i.packItems) && i.packItems.length ? `<div style="font-size:0.78rem; margin:2px 0 5px 10px; color:var(--text-mid);">${i.packItems.map(comp => `${esc(state.products.find(p => String(p.id) === String(comp.id))?.name || comp.name || 'Produit')} × ${Number(comp.qty)||0}`).join(' · ')}</div>` : ''; return `<div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-mid); margin-bottom:4px;"><span>${esc(i.name)} (x${i.qty})</span><span>${fmtMoney(i.price * i.qty)}</span></div>${components}`; }).join('');
        return `<div class="admin-card" style="flex-direction: column; align-items: stretch; gap: 12px; margin-bottom: 15px;"><div style="display:flex; justify-content: space-between; align-items: center;"><strong style="font-size: 1.1rem;">${i18n[state.currentLang].order_num} #${String(o.id).slice(-6)}</strong><span style="background:${status.bg}; color:${status.color}; padding: 6px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: bold;">${status.text}</span></div>${o.trackingNumber ? `<div style="background: #e0f2fe; border: 1px solid #7dd3fc; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;"><span style="font-weight: bold; color: #0369a1;"><i class="fas fa-truck"></i> ${i18n[state.currentLang].your_tracking_code}:</span><span style="font-family: monospace; font-size: 1.2rem; font-weight: 900; color: #0f172a;">${esc(o.trackingNumber)}</span></div>` : ''}<div style="background:var(--bg-light); padding:10px; border-radius:8px;">${itemsList}<div style="display:flex; justify-content:space-between; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border); font-weight:bold;"><span>${i18n[state.currentLang].total_with_delivery}</span><span>${fmtMoney(o.total)}</span></div></div>${debtHtml}${confirmBtnHtml}<div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border); padding-top: 12px; flex-wrap: wrap; gap: 10px;"><small style="color: var(--text-mid);">${new Date(o.createdAt).toLocaleDateString()}</small><button onclick="printOrderInvoice(${o.id})" class="btn-primary" style="padding:10px 15px; width:auto; background:#6366f1;"><i class="fas fa-print"></i> ${i18n[state.currentLang].print_invoice}</button></div></div>`;
    }).join('');
}
window.renderMyOrders = renderMyOrders;

async function customerConfirmReceipt(orderId) {
    if (!confirm(i18n[state.currentLang].confirm_receipt_q)) return;
    const o = state.orders.find(x => x.id === orderId);
    if (o) { o.status = 'delivered'; save(K.orders, state.orders); if (window.supabaseClient) await window.supabaseClient.from('orders').update({ status: 'delivered' }).eq('id', orderId); toast(i18n[state.currentLang].receipt_confirmed); renderMyOrders(); }
}
window.customerConfirmReceipt = customerConfirmReceipt;

function printOrderInvoice(orderId) {
    const order = state.orders.find(o => o.id === orderId); if (!order) return;
    const storeName = state.settings.shopName || 'Thier Décor'; const storePhone = state.settings.shopPhone || ''; const storeAddress = state.settings.shopAddress || '';
    let rows = order.items.map(i => { const components = i.isPack && Array.isArray(i.packItems) && i.packItems.length ? `<br><small style="color:#64748b;">Composition : ${i.packItems.map(comp => `${esc(state.products.find(p => String(p.id) === String(comp.id))?.name || comp.name || 'Produit')} × ${Number(comp.qty)||0}`).join(' · ')}</small>` : ''; return `<tr><td style="padding:12px; border-bottom:1px solid #eee;">${esc(i.name)}${components}</td><td style="padding:12px; border-bottom:1px solid #eee; text-align:center;">${i.qty}</td><td style="padding:12px; border-bottom:1px solid #eee; text-align:right;">${Number(i.price||0).toLocaleString('fr-FR')} DA</td><td style="padding:12px; border-bottom:1px solid #eee; text-align:right;">${(Number(i.price||0) * Number(i.qty||0)).toLocaleString('fr-FR')} DA</td></tr>`; }).join('');
    const date = new Date(order.createdAt).toLocaleDateString('fr-FR');
    const paid = order.paidAmount ?? order.total; const debt = order.total - paid;
    let debtRow = ''; if (debt > 0) { debtRow = `<div style="display:flex; justify-content:space-between; margin-top:10px; color:#dc2626; font-weight:bold; font-size:16px;"><span>Reste à payer :</span><span>${debt.toLocaleString('fr-FR')} DA</span></div>`; }
    const htmlContent = `<html><head><meta charset="UTF-8"><title>Facture</title><style>body { font-family: sans-serif; padding:40px; } .header { border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px; display:flex; justify-content:space-between;} table { width: 100%; border-collapse: collapse; } th { background: #f8fafc; padding: 12px; text-align: right; } .totals { width: 50%; float: right; margin-top:20px;} .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }</style></head><body><div class="header"><div><h1>${esc(storeName)}</h1><p>${esc(storePhone)}</p><p>${esc(storeAddress)}</p></div><div><h2>FACTURE</h2><p>N° : #${String(order.id).slice(-6)}</p><p>Date : ${date}</p></div></div><p><strong>Client :</strong> ${esc(order.customerName)}</p><p><strong>Tél :</strong> ${esc(order.customerPhone)}</p><p><strong>Adresse :</strong> ${esc(order.wilaya)} - ${esc(order.commune)} - ${esc(order.address)}</p><br><table><thead><tr><th>Produit</th><th style="text-align: center;">Qté</th><th style="text-align: right;">P.U</th><th style="text-align: right;">Total</th></tr></thead><tbody>${rows}</tbody></table><div class="totals"><div class="total-row"><span>Sous-total :</span><span>${Number(order.itemsTotal ?? (order.items||[]).reduce((sum,i)=>sum+Number(i.price||0)*Number(i.qty||0),0)).toLocaleString('fr-FR')} DA</span></div><div class="total-row"><span>Livraison :</span><span>${(Number(order.deliveryPrice) || 0).toLocaleString('fr-FR')} DA</span></div>${(Number(order.discount) || 0) > 0 ? `<div class="total-row" style="color:#059669"><span>Remise ${order.promoCode ? '«' + esc(order.promoCode) + '»' : ''} :</span><span>− ${(Number(order.discount) || 0).toLocaleString('fr-FR')} DA</span></div>` : ''}<div class="total-row" style="font-weight:bold; font-size:18px;"><span>Total TTC :</span><span>${Number(order.total||0).toLocaleString('fr-FR')} DA</span></div>${debtRow}</div><div style="clear:both; padding-top:50px;"></div><script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script></body></html>`;
    const printWindow = window.open('', '_blank');
    if (printWindow) { printWindow.document.open(); printWindow.document.write(htmlContent); printWindow.document.close(); } else { toast(i18n[state.currentLang].save_failed, 'error'); }
}
window.printOrderInvoice = printOrderInvoice;

function renderMyRequests() {
    const c = document.getElementById('s-myrequests-list'); if (!c) return; if (!state.session) return;
    const cust = state.customers.find(x => String(x.id) === String(state.session.id)); if (!cust) { c.innerHTML = `<div style="text-align:center;padding:20px;">${i18n[state.currentLang].no_requests}</div>`; return; } const myReqs = state.requests.filter(r => String(r.customerId || '') === String(cust.id) || r.customerPhone === cust.phone);
    const explainer = `<div style="background: var(--primary-light); padding: 12px; border-radius: 8px; margin-bottom: 15px; border: 1px solid var(--border);"><p style="margin: 0; font-size: 0.85rem; color: var(--text-dark); font-weight: bold;">📋</p></div>`;
    if (myReqs.length === 0) { c.innerHTML = explainer + `<div style="text-align:center; padding: 40px 20px; color: var(--text-mid);">${i18n[state.currentLang].no_requests}</div>`; return; }
    c.innerHTML = explainer + myReqs.map(r => { const isFulfilled = r.status === 'fulfilled'; const isRejected = r.status === 'rejected'; const requestStatusText = isFulfilled ? i18n[state.currentLang].status_fulfilled : (isRejected ? i18n[state.currentLang].status_rejected : i18n[state.currentLang].status_pending); const requestStatusColor = isFulfilled ? '#10b981' : (isRejected ? '#ef4444' : '#f59e0b'); return `<div class="admin-card" style="border-right: 4px solid ${requestStatusColor}; flex-direction: column; align-items: stretch; gap: 8px;"><div style="display: flex; justify-content: space-between; align-items: center;"><strong style="font-size: 1rem;">${esc(r.productName)} (x${r.qty})</strong><span style="background: ${isFulfilled ? '#d1fae5' : (isRejected ? '#fee2e2' : '#fef3c7')}; color: ${isFulfilled ? '#059669' : (isRejected ? '#b91c1c' : '#d97706')}; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: bold;">${requestStatusText}</span></div>${r.details ? `<div style="font-size: 0.8rem; color: var(--text-mid);">📝 ${esc(r.details)}</div>` : ''}</div>`; }).join('');
}
window.renderMyRequests = renderMyRequests;

function openMessageModal() { document.getElementById('msg-text').value = ''; openModal('m-customer-message'); }
async function submitCustomerMessage() {
    const text = document.getElementById('msg-text').value.trim(); if (!text) return toast(i18n[state.currentLang].write_message_first, 'error');
    let name = '', phone = '';
    if (state.session) { const cust = state.customers.find(x => x.id === state.session.id); name = cust ? cust.name : 'زبون'; phone = cust ? cust.phone : ''; } else { name = 'زائر'; phone = 'غير متوفر'; }
    const msg = { id: Date.now(), customerId: state.session ? state.session.id : null, name: name, phone: phone, text: text, date: new Date().toISOString() };
    state.messages.unshift(msg); save(K.messages, state.messages); if (window.supabaseClient) await window.supabaseClient.from('messages').insert([msg]);
    closeModal('m-customer-message'); toast(`✅ ${i18n[state.currentLang].msg_sent_success}`);
}
window.openMessageModal = openMessageModal; window.submitCustomerMessage = submitCustomerMessage;

function renderCustomerMessages() {
    const c = document.getElementById('s-customer-messages-list'); if (!c || !state.session) return;
    const cust = state.customers.find(x => x.id === state.session.id); const myMessages = state.messages.filter(m => m.customerId === state.session.id || m.phone === (cust ? cust.phone : ''));
    if (myMessages.length === 0) { c.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-mid);">${i18n[state.currentLang].no_previous_messages}</div>`; return; }
    c.innerHTML = myMessages.map(m => `<div class="admin-card" style="flex-direction: column; align-items: stretch; margin-bottom:10px; border-right: 4px solid ${m.reply ? 'var(--success)' : 'var(--primary)'};"><div style="margin-bottom:8px;"><small style="color:var(--text-mid);">${i18n[state.currentLang].your_message} (${new Date(m.date).toLocaleDateString()}):</small><p style="font-weight:bold; margin-top:4px;">${esc(m.text)}</p></div>${m.reply ? `<div style="background:var(--primary-light); padding:10px; border-radius:8px; border:1px solid var(--border);"><small style="color:var(--primary); font-weight:bold;"><i class="fas fa-reply"></i> ${i18n[state.currentLang].admin_reply}:</small><p style="margin-top:4px;">${esc(m.reply)}</p></div>` : `<div style="text-align:center; font-size:0.8rem; color:var(--text-mid);">${i18n[state.currentLang].under_review}</div>`}</div>`).join('');
}
window.renderCustomerMessages = renderCustomerMessages;

function adminGo(sec, btnElement) {
    document.querySelectorAll('.admin-section').forEach(s => s.style.display = 'none'); document.getElementById('sec-' + sec).style.display = 'block';
    document.querySelectorAll('.admin-nav a').forEach(a => a.classList.remove('active')); if (btnElement) btnElement.classList.add('active');
    const titleKey = sec === 'dashboard' ? 'admin_home' : 'admin_' + sec; document.getElementById('admin-page-title').textContent = i18n[state.currentLang][titleKey] || sec;
    if (sec === 'dashboard') renderAdminHome(); if (sec === 'orders') renderAdminOrdersList(); if (sec === 'products') renderAdminProducts(); if (sec === 'customers') renderAdminCustomers(); if (sec === 'messages') renderAdminMessages(); if (sec === 'expenses') renderAdminExpenses(); if (sec === 'reports') renderAdminReports(); if (sec === 'requests') renderAdminRequests(); if (sec === 'debts') renderAdminDebts(); if (sec === 'settings') { renderAdminSettings(); }
}
window.adminGo = adminGo;

function switchSettingsTab(tab, btn) {
    document.querySelectorAll('.settings-content').forEach(c => c.style.display = 'none'); document.getElementById('set-tab-' + tab).style.display = 'block';
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active');
    if (tab === 'coupons') renderCouponsList();
    if (tab === 'noest-prices') renderNoestPricesTab();
    if (tab === 'yalidine-prices') renderYalidinePricesTab();
}
window.switchSettingsTab = switchSettingsTab;

function renderAdminHome() {
    const cap = state.products.reduce((s, p) => s + Number(p.cost || 0) * Number(p.qty || 0), 0); const sT = state.orders.reduce((s, o) => s + Number(o.itemsTotal || 0), 0) + Number(state.settings.manualSalesAdjustment || 0); const eT = state.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    document.getElementById('a-capital-value').textContent = fmtMoney(cap); document.getElementById('a-total-sales').textContent = fmtMoney(sT); document.getElementById('a-total-expenses').textContent = fmtMoney(eT); document.getElementById('a-net-profit').textContent = fmtMoney(sT - cap - eT);
}
window.renderAdminHome = renderAdminHome;

async function adjustSales() { const val = prompt("", state.settings.manualSalesAdjustment || 0); if (val === null) return; const num = Number(val); if (isNaN(num)) return toast(i18n[state.currentLang].save_failed, 'error'); state.settings.manualSalesAdjustment = num; save(K.settings, state.settings); if (window.supabaseClient) await window.supabaseClient.from('settings').update({ manualSalesAdjustment: num }).eq('id', 1); renderAdminHome(); toast('✅ ' + i18n[state.currentLang].saved); }
window.adjustSales = adjustSales;

function normalizeOrderStatus(status) {
    const value = String(status || 'new').trim().toLowerCase().replace(/[ -]+/g, '_');
    const aliases = { 'nouveau': 'new', 'nouvelle': 'new', 'new_order': 'new', 'confirmed_order': 'confirmed', 'confirmée': 'confirmed', 'confirmee': 'confirmed', 'en_route': 'on_the_way', 'onway': 'on_the_way', 'en_cours': 'on_the_way', 'en_cours_de_livraison': 'out_for_delivery', 'outfordelivery': 'out_for_delivery', 'livre': 'delivered', 'livrée': 'delivered', 'livree': 'delivered', 'delivered_order': 'delivered', 'annule': 'cancelled', 'annulé': 'cancelled', 'annulee': 'cancelled', 'annulée': 'cancelled' };
    return aliases[value] || value;
}

function filterAdminOrders(status, btn) {
    currentOrderFilter = normalizeOrderStatus(status);
    document.querySelectorAll('#sec-orders .filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderAdminOrdersList();
}
window.filterAdminOrders = filterAdminOrders;

function renderAdminOrdersList() {
    const c = document.getElementById('a-orders-list'); if (!c) return;
    const f = currentOrderFilter === 'all' ? state.orders : state.orders.filter(o => normalizeOrderStatus(o.status) === currentOrderFilter);
    if (f.length === 0) { c.innerHTML = `<div style="text-align:center;padding:20px;">${i18n[state.currentLang].no_orders}</div>`; return; }
    c.innerHTML = f.map(o => {
        const customer = state.customers.find(cust => cust.phone === o.customerPhone || cust.id === o.customerId);
        const isStar = customer && customer.isVip; const isCrown = customer && customer.isTop; let badges = ''; if (isCrown) badges += '<span title="VIP" style="font-size:1.2rem;">👑</span>'; if (isStar) badges += '<span title="Dette" style="font-size:1.2rem;">⭐</span>';
        let borderColor = 'var(--border)'; if (isCrown) borderColor = '#eab308'; else if (isStar) borderColor = '#f59e0b';
        const orderDate = new Date(o.createdAt).toLocaleString(state.currentLang === 'ar' ? 'ar-DZ' : 'fr-FR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
        
        let deliveryBadge = '';
        if (o.deliveryType === 'stopdesk') {
            deliveryBadge = `<span style="background:#fef3c7; color:#b45309; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:bold; display:inline-block; margin-top:5px; border:1px solid #fcd34d;"><i class="fas fa-building"></i> ${esc(o.courier || 'NOEST').toUpperCase()} (مكتب: ${esc(o.stationName || 'غير محدد')})</span>`;
        } else {
            deliveryBadge = `<span style="background:#dcfce7; color:#15803d; padding:3px 8px; border-radius:6px; font-size:0.75rem; font-weight:bold; display:inline-block; margin-top:5px; border:1px solid #86efac;"><i class="fas fa-home"></i> ${esc(o.courier || 'NOEST').toUpperCase()} (المنزل)</span>`;
        }

        return `<div class="admin-card" style="flex-direction: column; align-items: stretch; gap: 10px; border-right: 5px solid ${borderColor};"><div style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:10px;"><div class="admin-card-info"><strong>#${String(o.id).slice(-6)}</strong> - <span style="font-weight:900; font-size:1.05rem; color:var(--text-dark);">${esc(o.customerName)} ${badges}</span><a href="tel:${esc(o.customerPhone)}" style="color:green; margin-right:10px;"><i class="fas fa-phone"></i></a><br><small style="color:var(--primary); font-weight:bold; background:var(--primary-light); padding:2px 6px; border-radius:4px; display:inline-block; margin: 4px 0;"><i class="far fa-clock"></i> ${orderDate}</small><br><small>${esc(o.wilaya)} - ${fmtMoney(o.total)}</small><br>${deliveryBadge}</div><div class="admin-card-actions"><button class="btn-icon" onclick="viewOrderDetails(${o.id})" style="background:#e0f2fe; color:#0284c7;"><i class="fas fa-eye"></i></button><select onchange="updateOrderStatus(${o.id}, this.value)" style="padding:5px;border-radius:5px;font-weight:bold;"><option value="new" ${normalizeOrderStatus(o.status) === 'new' ? 'selected' : ''}>${i18n[state.currentLang].new}</option><option value="confirmed" ${normalizeOrderStatus(o.status) === 'confirmed' ? 'selected' : ''}>${i18n[state.currentLang].confirmed}</option><option value="on_the_way" ${normalizeOrderStatus(o.status) === 'on_the_way' ? 'selected' : ''}>${i18n[state.currentLang].on_the_way}</option><option value="out_for_delivery" ${normalizeOrderStatus(o.status) === 'out_for_delivery' ? 'selected' : ''}>${i18n[state.currentLang].out_for_delivery}</option><option value="delivered" ${normalizeOrderStatus(o.status) === 'delivered' ? 'selected' : ''}>${i18n[state.currentLang].delivered}</option><option value="cancelled" ${normalizeOrderStatus(o.status) === 'cancelled' ? 'selected' : ''}>${i18n[state.currentLang].cancelled}</option></select><button class="btn-icon" onclick="printOrderInvoice(${o.id})" title="Print"><i class="fas fa-print"></i></button><button class="btn-danger" onclick="deleteOrder(${o.id})" title="Delete"><i class="fas fa-trash"></i></button></div></div><div style="display:flex; gap:5px; background:var(--bg-light); padding:10px; border-radius:8px; border:1px dashed var(--primary);"><input type="text" id="track-input-${o.id}" value="${o.trackingNumber || ''}" placeholder="${i18n[state.currentLang].tracking_code}" style="flex:1; padding:8px; border:1px solid var(--border); border-radius:6px; font-family:monospace; font-weight:bold;"><button onclick="saveTrackingCode(${o.id})" class="btn-primary" style="width:auto; padding:8px 15px; border-radius:6px;"><i class="fas fa-paper-plane"></i> ${i18n[state.currentLang].save}</button></div></div>`;
    }).join('');
}
window.renderAdminOrdersList = renderAdminOrdersList;


async function saveTrackingCode(orderId) { const input = document.getElementById('track-input-' + orderId); if (!input) return; const code = input.value.trim(); const order = state.orders.find(o => o.id === orderId); if (order) { order.trackingNumber = code; save(K.orders, state.orders); if (window.supabaseClient) await window.supabaseClient.from('orders').update({ trackingNumber: code }).eq('id', orderId); toast('✅ ' + i18n[state.currentLang].saved); } }
window.saveTrackingCode = saveTrackingCode;

function getOrderStockDeltas(items) {
    const deltas = new Map();
    for (const item of (Array.isArray(items) ? items : [])) {
        const qty = Math.max(0, Number(item.qty) || 0);
        const id = String(item.id);
        deltas.set(id, (deltas.get(id) || 0) + qty);
        if (item.isPack && Array.isArray(item.packItems)) {
            for (const comp of item.packItems) {
                const compId = String(comp.id);
                deltas.set(compId, (deltas.get(compId) || 0) + (Math.max(0, Number(comp.qty) || 0) * qty));
            }
        }
    }
    return deltas;
}

function addOrderStockDelta(target, item, multiplier) {
    const qty = Math.max(0, Number(item?.qty) || 0);
    const add = (id, amount) => {
        const key = String(id);
        target.set(key, (Number(target.get(key)) || 0) + amount);
    };
    if (!item) return;
    add(item.id, multiplier * qty);
    if (item.isPack && Array.isArray(item.packItems)) {
        for (const comp of item.packItems) add(comp.id, multiplier * (Math.max(0, Number(comp.qty) || 0) * qty));
    }
}

async function updateOrderStatus(id, status) {
    const order=state.orders.find(x=>String(x.id)===String(id)); if(!order||!window.supabaseClient)return;
    const previousStatus=order.status, nextStatus=normalizeOrderStatus(status); if(previousStatus===nextStatus)return;
    const restored=[];
    try {
        if(nextStatus==='cancelled' && previousStatus!=='cancelled') {
            for (const [productId, qtyBack] of getOrderStockDeltas(order.items)) {
                const prod=state.products.find(p=>String(p.id)===productId); if(!prod) throw new Error('Product missing while restoring stock: '+productId);
                const oldQty=Number(prod.qty||0), nextQty=oldQty+qtyBack;
                const {error}=await window.supabaseClient.from('products').update({qty:nextQty}).eq('id',prod.id); if(error)throw error;
                restored.push({prod,oldQty,nextQty});
            }
        }
        const {error}=await window.supabaseClient.from('orders').update({status:nextStatus}).eq('id',id); if(error)throw error;
        order.status=nextStatus; restored.forEach(x=>x.prod.qty=x.nextQty); save(K.orders,state.orders); save(K.products,state.products);
        toast('✓ '+i18n[state.currentLang].updated);
    } catch(error) {
        for(const x of restored.reverse()) { try{await window.supabaseClient.from('products').update({qty:x.oldQty}).eq('id',x.prod.id);}catch(_){} }
        order.status=previousStatus; save(K.orders,state.orders); save(K.products,state.products); console.error('Order status update failed:',error); toast((state.currentLang==='ar'?'تعذر تحديث الطلبية: ':'Impossible de mettre à jour : ')+(error.message||''),'error');
    }
    renderAdminOrdersList(); renderAdminHome(); renderShop(); updateAdminBadges();
}
window.updateOrderStatus = updateOrderStatus;

async function deleteOrder(id) {
    if(!confirm(i18n[state.currentLang].delete_order_confirm))return;
    if(!window.supabaseClient)return toast(i18n[state.currentLang].error_connection,'error');
    const order=state.orders.find(o=>String(o.id)===String(id)); if(!order)return;
    const restored=[];
    try {
        if(normalizeOrderStatus(order.status)!=='cancelled') for(const [productId, qtyBack] of getOrderStockDeltas(order.items)) {
            const prod=state.products.find(p=>String(p.id)===productId); if(!prod) throw new Error('Product missing while restoring stock: '+productId);
            const oldQty=Number(prod.qty||0), nextQty=oldQty+qtyBack;
            const {error}=await window.supabaseClient.from('products').update({qty:nextQty}).eq('id',prod.id); if(error)throw error;
            restored.push({prod,oldQty,nextQty});
        }
        const {error}=await window.supabaseClient.from('orders').delete().eq('id',id); if(error)throw error;
        restored.forEach(x=>x.prod.qty=x.nextQty); state.orders=state.orders.filter(o=>String(o.id)!==String(id)); save(K.orders,state.orders);save(K.products,state.products);renderAdminOrdersList();renderAdminHome();renderShop();toast('✅ '+i18n[state.currentLang].deleted);
    } catch(error) {
        for(const x of restored.reverse()){try{await window.supabaseClient.from('products').update({qty:x.oldQty}).eq('id',x.prod.id);}catch(_){}}
        console.error('Delete order failed:',error);toast((state.currentLang==='ar'?'تعذر حذف الطلبية: ':'Échec de suppression : ')+(error.message||''),'error');
    }
}
window.deleteOrder = deleteOrder;

function viewOrderDetails(orderId) {
    const order = state.orders.find(o => o.id === orderId); if (!order) return; const customer = state.customers.find(c => c.phone === order.customerPhone); const isVip = customer && customer.isVip;
    const itemsHtml = order.items.map(i => { const components = i.isPack && Array.isArray(i.packItems) && i.packItems.length ? `<div style="font-size:0.8rem;color:var(--text-mid);margin-top:4px;">${i.packItems.map(comp => `${esc(state.products.find(p => String(p.id) === String(comp.id))?.name || comp.name || 'Produit')} × ${Number(comp.qty)||0}`).join(' · ')}</div>` : ''; return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding:10px 0;"><div><strong>${esc(i.name)}</strong><br><small style="color:var(--text-mid);">${i.qty} × ${fmtMoney(i.price)}</small>${components}</div><div style="font-weight:900;">${fmtMoney(i.price * i.qty)}</div></div>`; }).join('');
    const paid = order.paidAmount ?? order.total; const debt = order.total - paid;
    let actionButtons = `<div style="margin-top:20px; border-top:2px dashed var(--border); padding-top:15px;"><h4 style="margin-bottom:10px; color:var(--primary);">Actions</h4><button onclick="makeDeliveryFree(${order.id})" class="btn-secondary" style="margin-bottom:10px; background:#10b981; color:white;"><i class="fas fa-truck"></i> ${i18n[state.currentLang].free_delivery}</button><button onclick="openEditOrder(${order.id})" class="btn-secondary" style="margin-bottom:10px; background:#f59e0b; color:white;"><i class="fas fa-edit"></i> ${i18n[state.currentLang].edit_order}</button>`;
       const itemsOnly = order.itemsTotal ?? (order.total - (order.deliveryPrice || 0));
    actionButtons += `<div style="background:#f0fdf4; padding:10px; border-radius:8px; border:1px solid #86efac; margin-top:10px;">
        <label style="font-weight:bold; color:#15803d; display:block; margin-bottom:5px;"><i class="fas fa-money-bill-wave"></i> تسجيل الدفع${isVip ? ' ⭐' : ''}</label>
        <div style="display:flex; gap:5px; margin-bottom:10px; flex-wrap:wrap;">
            <button type="button" onclick="document.getElementById('paid-amount-${order.id}').value=${order.total}; calcDebt(${order.id}, ${order.total})" style="flex:1; padding:6px; font-size:0.75rem; background:#d1fae5; color:#059669; border:1px solid #10b981; border-radius:6px; font-weight:bold;"><i class="fas fa-check-double"></i> دفع الكل (${fmtMoney(order.total)})</button>
            <button type="button" onclick="document.getElementById('paid-amount-${order.id}').value=${itemsOnly}; calcDebt(${order.id}, ${order.total})" style="flex:1; padding:6px; font-size:0.75rem; background:#e0f2fe; color:#0284c7; border:1px solid #38bdf8; border-radius:6px; font-weight:bold;"><i class="fas fa-box-open"></i> دفع المنتجات فقط (${fmtMoney(itemsOnly)})</button>
            <button type="button" onclick="document.getElementById('paid-amount-${order.id}').value=${order.deliveryPrice || 0}; calcDebt(${order.id}, ${order.total})" style="flex:1; padding:6px; font-size:0.75rem; background:#fef3c7; color:#b45309; border:1px solid #fcd34d; border-radius:6px; font-weight:bold;"><i class="fas fa-truck"></i> دفع التوصيل فقط (${fmtMoney(order.deliveryPrice || 0)})</button>
        </div>
        <div class="form-group"><label>${i18n[state.currentLang].paid_amount}</label><input type="number" id="paid-amount-${order.id}" value="${paid}" oninput="calcDebt(${order.id}, ${order.total})" style="padding:8px; border-radius:6px; border:1px solid #cbd5e1; width:100%;"></div>
        <div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:10px;"><span>${i18n[state.currentLang].remaining_debt}:</span><span id="debt-display-${order.id}" style="color:var(--danger);">${fmtMoney(debt)}</span></div>
        <button onclick="saveOrderDebt(${order.id})" class="btn-primary" style="padding:8px; background:#10b981; width:100%;">${i18n[state.currentLang].save_debt}</button>
    </div>`;
    actionButtons += `</div>`;
    document.getElementById('order-details-body').innerHTML = `<div style="margin-bottom:15px; background:var(--primary-light); padding:15px; border-radius:8px; border:1px solid var(--border);"><p><strong>${i18n[state.currentLang].full_name}:</strong> ${esc(order.customerName)} ${isVip ? '⭐' : ''}</p><p><strong>${i18n[state.currentLang].phone}:</strong> <a href="tel:${esc(order.customerPhone)}" style="color:green; font-weight:bold;">${esc(order.customerPhone)}</a></p><p><strong>${i18n[state.currentLang].address}:</strong> ${esc(order.wilaya)} - ${esc(order.commune)} - ${esc(order.address)}</p><p><strong>${i18n[state.currentLang].delivery_cost}</strong> ${esc(order.courier)}</p>${order.promoCode || order.couponCode ? `<p><strong>كود البرومو:</strong> ${esc(order.promoCode || order.couponCode)} — <strong>التخفيض:</strong> ${Number(order.promoDiscountPercent || 0)}% (${fmtMoney(order.promoDiscountAmount ?? order.discount ?? 0)})</p>` : ''}</div><h4 style="margin-bottom:10px;">${i18n[state.currentLang].products_price}</h4><div style="margin-bottom:20px;">${itemsHtml}</div><div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:8px;"><span>${i18n[state.currentLang].products_price}</span><span>${fmtMoney(order.itemsTotal)}</span></div>${(order.promoCode || order.couponCode || Number(order.discount || 0) > 0) ? `<div style="display:flex;justify-content:space-between;font-weight:bold;margin-bottom:8px;color:#059669"><span>تخفيض البرومو (${Number(order.promoDiscountPercent || 0)}%)</span><span>− ${fmtMoney(order.promoDiscountAmount ?? order.discount ?? 0)}</span></div>` : ''}<div style="display:flex; justify-content:space-between; font-weight:bold; margin-bottom:15px; color:var(--primary);"><span>${i18n[state.currentLang].delivery_cost}</span><span>${fmtMoney(order.deliveryPrice)}</span></div><div style="display:flex; justify-content:space-between; font-weight:900; font-size:1.3rem; border-top:2px solid var(--border); padding-top:15px;"><span>${i18n[state.currentLang].total_price}</span><span>${fmtMoney(order.total)}</span></div>${debt > 0 ? `<div style="display:flex; justify-content:space-between; font-weight:bold; font-size:1.1rem; margin-top:10px; color:var(--danger);"><span>${i18n[state.currentLang].remaining_debt}:</span><span>${fmtMoney(debt)}</span></div>` : ''}${actionButtons}`;
    openModal('m-order-details');
}
window.viewOrderDetails = viewOrderDetails;

async function makeDeliveryFree(orderId) { const o = state.orders.find(x => x.id === orderId); if (!o) return; o.deliveryPrice = 0; o.total = Math.max(0, (Number(o.itemsTotal) || 0) - (Number(o.discount) || 0)); save(K.orders, state.orders); if (window.supabaseClient) await window.supabaseClient.from('orders').update({ deliveryPrice: 0, total: Math.max(0, (Number(o.itemsTotal) || 0) - (Number(o.discount) || 0)) }).eq('id', orderId); toast('✅ ' + i18n[state.currentLang].saved); viewOrderDetails(orderId); renderAdminOrdersList(); }
window.makeDeliveryFree = makeDeliveryFree;

function calcDebt(orderId, totalAmount) { const paid = Number(document.getElementById(`paid-amount-${orderId}`).value) || 0; const debt = totalAmount - paid; document.getElementById(`debt-display-${orderId}`).textContent = fmtMoney(debt > 0 ? debt : 0); }
window.calcDebt = calcDebt;

async function saveOrderDebt(orderId) { const o = state.orders.find(x => x.id === orderId); if (!o) return; const paid = Number(document.getElementById(`paid-amount-${orderId}`).value) || 0; o.paidAmount = paid; save(K.orders, state.orders); if (window.supabaseClient) await window.supabaseClient.from('orders').update({ paidAmount: paid }).eq('id', orderId); toast('✅ ' + i18n[state.currentLang].saved); closeModal('m-order-details'); renderAdminOrdersList(); }
window.saveOrderDebt = saveOrderDebt;

function openEditOrder(orderId) {
    const o = state.orders.find(x => String(x.id) === String(orderId)); if (!o) return;
    window.editingOrderId = orderId;
    editingOrderOriginal = JSON.parse(JSON.stringify(o));
    window.pendingStockDelta = new Map();
    closeModal('m-order-details'); renderEditOrderBody(o); openModal('m-edit-order');
}
window.openEditOrder = openEditOrder;
function renderEditOrderBody(o) {
    const itemsHtml = (o.items || []).map((i, idx) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid var(--border);"><div><strong>${esc(i.name)}</strong><br><small>${Number(i.qty)||0} × ${fmtMoney(i.price)}</small></div><button onclick="removeItemFromEditOrder(${idx})" class="btn-danger" style="padding:5px 10px;">✕</button></div>`).join('');
    const availableProducts = state.products.filter(p => (Number(p.qty||0) + Number(window.pendingStockDelta.get(String(p.id))||0)) > 0 && !(o.items||[]).find(i => String(i.id) === String(p.id)));
    const productsOptions = availableProducts.map(p => `<option value="${esc(String(p.id))}">${esc(p.name)} - ${fmtMoney(p.price)} (${Math.max(0,Number(p.qty||0)+Number(window.pendingStockDelta.get(String(p.id))||0))})</option>`).join('');
    document.getElementById('edit-order-body').innerHTML = `<h4 style="margin-bottom:10px;">${i18n[state.currentLang].products_price}</h4><div>${itemsHtml || '<p></p>'}</div><h4 style="margin:15px 0 10px 0;">${i18n[state.currentLang].add_product_to_order}</h4><div style="display:flex;gap:8px;"><select id="edit-add-product" style="flex:1;padding:8px;border-radius:6px;border:1px solid var(--border);"><option value="">...</option>${productsOptions}</select><input type="number" id="edit-add-qty" value="1" min="1" step="1" style="width:70px;padding:8px;border:1px solid var(--border);border-radius:6px;"><button onclick="addProductToOrder()" class="btn-primary" style="width:auto;padding:8px 15px;"><i class="fas fa-plus"></i></button></div><div style="margin-top:20px;text-align:center;"><button onclick="saveChangesOrder()" class="btn-primary" style="padding:12px 30px;">${i18n[state.currentLang].save_changes_order}</button></div>`;
}
function removeItemFromEditOrder(idx) {
    const o = state.orders.find(x => String(x.id) === String(window.editingOrderId)); if (!o || !o.items[idx]) return;
    const item = o.items[idx];
    addOrderStockDelta(window.pendingStockDelta, item, 1);
    o.items.splice(idx,1); recalcEditedOrder(o); renderEditOrderBody(o);
}
window.removeItemFromEditOrder = removeItemFromEditOrder;
function addProductToOrder() {
    const o = state.orders.find(x => String(x.id) === String(window.editingOrderId)); if (!o) return;
    const prodId = document.getElementById('edit-add-product').value; const qty = Number(document.getElementById('edit-add-qty').value);
    if (!prodId || !Number.isInteger(qty) || qty < 1) return toast(i18n[state.currentLang].max_stock, 'error');
    const prod = state.products.find(p => String(p.id) === String(prodId)); if (!prod) return toast(i18n[state.currentLang].no_products, 'error');
    const requirements = new Map([[String(prod.id), qty]]);
    if (prod.isPack && Array.isArray(prod.packItems)) for (const comp of prod.packItems) {
        const key = String(comp.id);
        requirements.set(key, (requirements.get(key) || 0) + (Number(comp.qty) || 0) * qty);
    }
    for (const [productId, requiredQty] of requirements) {
        const stockProduct = state.products.find(p => String(p.id) === productId);
        const available = Number(stockProduct?.qty || 0) + Number(window.pendingStockDelta.get(productId) || 0);
        if (!stockProduct || available < requiredQty) return toast(`${i18n[state.currentLang].max_stock}: ${stockProduct?.name || prod.name}`, 'error');
    }
    for (const [productId, requiredQty] of requirements) window.pendingStockDelta.set(productId, Number(window.pendingStockDelta.get(productId)||0) - requiredQty);
    const existing = o.items.find(i => String(i.id) === String(prod.id));
    if (existing) existing.qty = Number(existing.qty||0) + qty; else o.items.push({id:prod.id,name:prod.name,price:Number(effectiveProductPrice(prod)||0),qty,cost:Number(prod.cost||0),isPack:Boolean(prod.isPack),packItems:Array.isArray(prod.packItems)?JSON.parse(JSON.stringify(prod.packItems)):[]});
    recalcEditedOrder(o); renderEditOrderBody(o);
}
window.addProductToOrder = addProductToOrder;
function recalcEditedOrder(o) {
    o.itemsTotal = (o.items||[]).reduce((sum,i)=>sum + Number(i.price||0)*Number(i.qty||0),0);
    const discount = Math.max(0, Number(o.discount)||0);
    o.total = Math.max(0, o.itemsTotal - discount + Math.max(0,Number(o.deliveryPrice)||0));
}
async function saveChangesOrder() {
    const o = state.orders.find(x => String(x.id) === String(window.editingOrderId)); if (!o || !window.supabaseClient) return toast(i18n[state.currentLang].error_connection,'error');
    recalcEditedOrder(o);
    const changedProducts=[];
    try {
        // Apply the drafted stock deltas only when the order is explicitly saved.
        for (const [id, delta] of window.pendingStockDelta.entries()) {
            if (!delta) continue;
            const prod=state.products.find(p=>String(p.id)===String(id)); if(!prod) throw new Error('Product missing: '+id);
            const nextQty=Number(prod.qty||0)+Number(delta); if(nextQty<0) throw new Error('Insufficient stock for '+prod.name);
            const {error}=await window.supabaseClient.from('products').update({qty:nextQty}).eq('id',prod.id);
            if(error) throw error;
            changedProducts.push({prod,oldQty:Number(prod.qty||0),nextQty});
        }
        const {error:orderError}=await window.supabaseClient.from('orders').update({items:o.items,itemsTotal:o.itemsTotal,discount:Number(o.discount)||0,total:o.total}).eq('id',o.id);
        if(orderError) throw orderError;
        changedProducts.forEach(x=>x.prod.qty=x.nextQty);
        save(K.orders,state.orders); save(K.products,state.products);
        window.pendingStockDelta.clear(); editingOrderOriginal=null;
        closeModal('m-edit-order'); toast('✅ '+i18n[state.currentLang].saved); renderAdminOrdersList(); renderAdminHome(); renderShop();
        await loadOrdersListener({forceProducts:true,forceWait:true});
    } catch(error) {
        console.error('Order edit failed:',error);
        for (const x of changedProducts.reverse()) { try { await window.supabaseClient.from('products').update({qty:x.oldQty}).eq('id',x.prod.id); } catch(_){} }
        if (editingOrderOriginal) { const idx=state.orders.findIndex(x=>String(x.id)===String(window.editingOrderId)); if(idx>=0) state.orders[idx]=editingOrderOriginal; }
        window.pendingStockDelta.clear(); save(K.orders,state.orders); save(K.products,state.products);
        toast((state.currentLang==='ar'?'تعذر حفظ التعديلات: ':'Échec de sauvegarde : ')+(error.message||''),'error'); renderAdminOrdersList(); renderShop();
    }
}
window.saveChangesOrder = saveChangesOrder;

function printLabels() {
    const newOrders = state.orders.filter(o => o.status === 'new'); if (newOrders.length === 0) return toast(i18n[state.currentLang].no_orders, 'error');
    let labelsHtml = ''; newOrders.forEach(o => { labelsHtml += `<div class="label"><div class="header">Thier Décor - ${esc(o.courier || '')}</div><p><strong>Order:</strong> #${esc(String(o.id).slice(-6))}</p><p><strong>Name:</strong> ${esc(o.customerName)}</p><p><strong>Phone:</strong> ${esc(o.customerPhone)}</p><p><strong>Address:</strong> ${esc(o.wilaya)} - ${esc(o.commune)} - ${esc(o.address)}</p><p><strong>Total:</strong> ${Number(o.total)||0} DA</p></div>`; });
    const htmlContent = `<html><head><title>Labels</title><style>body { font-family: sans-serif; padding: 20px; } .label { border: 2px solid #000; padding: 15px; margin-bottom: 15px; page-break-inside: avoid; } .header { font-weight: bold; font-size: 18px; border-bottom: 1px solid #000; padding-bottom: 10px; margin-bottom: 10px; }</style></head><body>${labelsHtml}</body></html>`;
    const printWindow = window.open('', '_blank'); if (printWindow) { printWindow.document.open(); printWindow.document.write(htmlContent); printWindow.document.close(); setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500); }
}
window.printLabels = printLabels;

function renderAdminCustomers(query = '') {
    const c = document.getElementById('a-customers-list'); if (!c) return;
    let list = state.customers; if (query && query.trim() !== '') { const q = query.trim().toLowerCase(); list = list.filter(cust => (cust.phone && cust.phone.includes(q)) || (cust.name && cust.name.toLowerCase().includes(q))); }
    if (list.length === 0) { c.innerHTML = `<div style="text-align:center;padding:20px;">${query ? i18n[state.currentLang].no_results : i18n[state.currentLang].no_customers}</div>`; return; }
    c.innerHTML = list.map(cust => {
        const isBlocked = cust.isBlocked === true; const textColor = isBlocked ? 'color: #dc2626;' : 'color: inherit;';
        return `<div class="admin-card" style="flex-direction: column; align-items: stretch; gap: 10px; opacity: ${isBlocked ? '0.7' : '1'}; border-right: ${isBlocked ? '4px solid #dc2626' : 'none'};"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;"><div><strong style="font-size:1rem; ${textColor}">${cust.isTop ? '👑' : ''} ${esc(cust.name)} ${cust.isVip ? '⭐' : ''} ${isBlocked ? `<span style="font-size:0.75rem; background:#dc2626; color:#fff; padding:2px 6px; border-radius:4px;">${i18n[state.currentLang].blocked_badge}</span>` : ''}</strong><br><a href="tel:${esc(cust.phone)}" style="color:var(--success); font-weight:bold;"><i class="fas fa-phone"></i> ${esc(cust.phone)}</a></div></div><div style="display:flex; gap:8px; flex-wrap:wrap; padding-top:8px; border-top:1px dashed var(--border);"><button onclick="toggleCustomerTop(${cust.id})" style="background:${cust.isTop ? '#eab308' : '#f1f5f9'}; color:${cust.isTop ? '#fff' : '#64748b'}; padding:8px; border-radius:6px; border:none;"><i class="fas fa-crown"></i> ${cust.isTop ? i18n[state.currentLang].crown : i18n[state.currentLang].grant_crown}</button><button onclick="toggleCustomerVip(${cust.id})" style="background:${cust.isVip ? '#f59e0b' : '#f1f5f9'}; color:${cust.isVip ? '#fff' : '#64748b'}; padding:8px; border-radius:6px; border:none;"><i class="fas fa-star"></i> ${cust.isVip ? i18n[state.currentLang].star : i18n[state.currentLang].grant_star}</button><button onclick="toggleCustomerBlock(${cust.id})" style="background:${isBlocked ? '#fef2f2' : '#fee2e2'}; color:${isBlocked ? '#16a34a' : '#dc2626'}; padding:8px; border-radius:6px; border:1px solid ${isBlocked ? '#16a34a' : '#dc2626'};"><i class="fas fa-ban"></i> ${isBlocked ? i18n[state.currentLang].unblock : i18n[state.currentLang].block}</button><button onclick="deleteCustomer(${cust.id})" style="background:#f1f5f9; color:#64748b; padding:8px; border-radius:6px; border:none;"><i class="fas fa-trash"></i></button></div></div>`;
    }).join('');
}
window.renderAdminCustomers = renderAdminCustomers;
function filterAdminCustomers(query) { renderAdminCustomers(query); }
window.filterAdminCustomers = filterAdminCustomers;

async function toggleCustomerVip(id) { const c = state.customers.find(x => x.id === id); if (c) { c.isVip = !c.isVip; save(K.customers, state.customers); if (window.supabaseClient) await window.supabaseClient.from('customers').update({ isVip: c.isVip }).eq('id', id); renderAdminCustomers(document.getElementById('admin-customer-search')?.value); toast(c.isVip ? '⭐' : '✓'); } }
window.toggleCustomerVip = toggleCustomerVip;

async function toggleCustomerTop(id) { const c = state.customers.find(x => x.id === id); if (c) { c.isTop = !c.isTop; save(K.customers, state.customers); if (window.supabaseClient) await window.supabaseClient.from('customers').update({ isTop: c.isTop }).eq('id', id); renderAdminCustomers(document.getElementById('admin-customer-search')?.value); updateProductRequestButton(); toast(c.isTop ? '👑' : '✓'); } }
window.toggleCustomerTop = toggleCustomerTop;

async function toggleCustomerBlock(id) { const c = state.customers.find(x => x.id === id); if (!c) return; c.isBlocked = !c.isBlocked; save(K.customers, state.customers); if (window.supabaseClient) { try { await window.supabaseClient.from('customers').update({ isBlocked: c.isBlocked }).eq('id', id); } catch (e) { toast('❌ ' + i18n[state.currentLang].save_failed, 'error'); return; } } if (c.isBlocked && state.session && state.session.id === id) { setTimeout(() => { logoutCustomer(); toast('🚫', 'error'); }, 500); } renderAdminCustomers(document.getElementById('admin-customer-search')?.value); toast(c.isBlocked ? '🚫' : '✅'); }
window.toggleCustomerBlock = toggleCustomerBlock;

async function deleteCustomer(id) { if (!confirm(i18n[state.currentLang].delete_customer_confirm)) return; state.customers = state.customers.filter(c => c.id !== id); save(K.customers, state.customers); if (window.supabaseClient) await window.supabaseClient.from('customers').delete().eq('id', id); renderAdminCustomers(); toast('✅ ' + i18n[state.currentLang].deleted); }
window.deleteCustomer = deleteCustomer;

function effectiveProductPrice(p) {
    if (!p) return 0;
    const promo = Number(p.promoPrice);
    const now = new Date();
    const startOk = !p.promoStart || p.promoStart <= now.toISOString().slice(0,10);
    const endOk = !p.promoEnd || p.promoEnd >= now.toISOString().slice(0,10);
    return promo > 0 && promo < Number(p.price) && startOk && endOk ? promo : Number(p.price) || 0;
}
window.effectiveProductPrice = effectiveProductPrice;
function setAdminProductView(view) {
    const cats = document.getElementById('a-products-categories');
    const list = document.getElementById('a-products-list');
    if (view === 'categories') { cats.style.display='grid'; list.style.display='none'; renderAdminProductCategories(); }
    else { cats.style.display='none'; list.style.display='grid'; renderAdminProducts(view); }
}
window.setAdminProductView = setAdminProductView;
function renderAdminProductCategories() {
    const box=document.getElementById('a-products-categories'); if(!box) return;
    const groups={}; state.products.forEach(p=>{const name=(p.category||i18n[state.currentLang].all).trim(); groups[name]=(groups[name]||0)+1;});
    const entries=Object.entries(groups); box.innerHTML=entries.length?entries.map(([name,count])=>`<button class="admin-category-tile" onclick="filterAdminProductsByCategory(decodeURIComponent('${encodeURIComponent(name)}'))"><strong>${esc(name)}</strong><span>${count} ${i18n[state.currentLang].category_products_count}</span></button>`).join(''):`<div class="admin-card">${i18n[state.currentLang].no_categories}</div>`;
}
window.renderAdminProductCategories=renderAdminProductCategories;
function filterAdminProductsByCategory(category) { renderAdminProducts('all', category); document.getElementById('a-products-categories').style.display='none'; document.getElementById('a-products-list').style.display='grid'; }
window.filterAdminProductsByCategory=filterAdminProductsByCategory;
function openPackModal() {
    document.getElementById('pack-name').value=''; document.getElementById('pack-category').value='Packs'; document.getElementById('pack-price').value=''; document.getElementById('pack-qty').value='1'; document.getElementById('pack-desc').value='';
    const box=document.getElementById('pack-products-choices'); box.innerHTML=state.products.filter(p=>!p.isPack).map(p=>`<label class="pack-product-choice"><input type="checkbox" value="${p.id}" class="pack-product-check"><span>${esc(p.name)} — ${fmtMoney(effectiveProductPrice(p))}</span><input aria-label="${i18n[state.currentLang].quantity}" type="number" min="1" value="1" class="pack-product-qty" data-product-id="${p.id}"></label>`).join('') || `<p>${i18n[state.currentLang].no_products}</p>`; openModal('m-pack-form');
}
window.openPackModal=openPackModal;
async function savePack() {
    const name=document.getElementById('pack-name').value.trim(); const price=Number(document.getElementById('pack-price').value); const qty=Math.max(0,Number(document.getElementById('pack-qty').value)||0); const category=document.getElementById('pack-category').value.trim()||'Packs';
    const packItems=[...document.querySelectorAll('.pack-product-check:checked')].map(ch=>({id:Number(ch.value),qty:Math.max(1,Number(document.querySelector(`.pack-product-qty[data-product-id="${ch.value}"]`)?.value)||1)}));
    if(!name||!price) return toast(i18n[state.currentLang].save_failed,'error'); if(!packItems.length) return toast(i18n[state.currentLang].select_one_product,'error');
    const description=document.getElementById('pack-desc').value.trim(); const packCost=packItems.reduce((sum,pi)=>{const component=state.products.find(cp=>String(cp.id)===String(pi.id));return sum+(Number(component?.cost)||0)*(Number(pi.qty)||0);},0); const newP={id:Date.now(),name,price,cost:packCost,qty,category,desc:description,images:(state.products.find(p=>String(p.id)===String(packItems[0].id))?.images||[]).slice(0,1),isPack:true,packItems,createdAt:new Date().toISOString()};
    if(window.supabaseClient){const {error}=await window.supabaseClient.from('products').insert([newP]); if(error)return toast(i18n[state.currentLang].save_error+error.message,'error');}
    state.products.push(newP); save(K.products,state.products); closeModal('m-pack-form'); renderAdminProducts(); renderCategories(); renderShop(); toast('✓ '+i18n[state.currentLang].pack_saved);
}
window.savePack=savePack;
function openPromoModal() { const sel=document.getElementById('promo-product'); sel.innerHTML=state.products.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join(''); if(!state.products.length) return toast(i18n[state.currentLang].no_products,'error'); updatePromoOriginalPrice(); const p=state.products.find(x=>x.id===Number(sel.value)); document.getElementById('promo-price').value=p?.promoPrice||''; document.getElementById('promo-start').value=p?.promoStart||''; document.getElementById('promo-end').value=p?.promoEnd||''; openModal('m-promo-form'); }
window.openPromoModal=openPromoModal;
function updatePromoOriginalPrice(){const p=state.products.find(x=>x.id===Number(document.getElementById('promo-product')?.value)); const el=document.getElementById('promo-original-price'); if(el)el.value=p?.price||''; const pr=document.getElementById('promo-price'); if(p&&pr&&!pr.value&&p.promoPrice)pr.value=p.promoPrice;}
window.updatePromoOriginalPrice=updatePromoOriginalPrice;
async function savePromo(){const id=Number(document.getElementById('promo-product').value);const p=state.products.find(x=>x.id===id);if(!p)return;const promoPrice=Number(document.getElementById('promo-price').value);if(!(promoPrice>0&&promoPrice<Number(p.price)))return toast(i18n[state.currentLang].invalid_promo_price,'error');p.promoPrice=promoPrice;p.promoStart=document.getElementById('promo-start').value||null;p.promoEnd=document.getElementById('promo-end').value||null;if(window.supabaseClient){const {error}=await window.supabaseClient.from('products').update({promoPrice:p.promoPrice,promoStart:p.promoStart,promoEnd:p.promoEnd}).eq('id',id);if(error)return toast(i18n[state.currentLang].save_error+error.message,'error');}save(K.products,state.products);closeModal('m-promo-form');renderAdminProducts();renderShop();renderNewProducts();toast('✓ '+i18n[state.currentLang].promo_saved);}
window.savePromo=savePromo;
async function removePromo(){const id=Number(document.getElementById('promo-product').value);const p=state.products.find(x=>x.id===id);if(!p)return;p.promoPrice=null;p.promoStart=null;p.promoEnd=null;if(window.supabaseClient){const {error}=await window.supabaseClient.from('products').update({promoPrice:null,promoStart:null,promoEnd:null}).eq('id',id);if(error)return toast(i18n[state.currentLang].save_error+error.message,'error');}save(K.products,state.products);closeModal('m-promo-form');renderAdminProducts();renderShop();renderNewProducts();toast('✓ '+i18n[state.currentLang].saved);}
window.removePromo=removePromo;

function renderAdminProducts(view = 'all', categoryFilter = null) {
    const c = document.getElementById('a-products-list'); if (!c) return;
    let products = state.products.slice(); if (view === 'packs') products = products.filter(p => p.isPack); if (categoryFilter !== null) products = products.filter(p => (p.category || i18n[state.currentLang].all) === categoryFilter);
    c.innerHTML = products.map(p => { const activePrice=effectiveProductPrice(p); const promo=activePrice < Number(p.price); return `<div class="admin-card"><div style="display:flex;align-items:center;gap:15px;"><div style="width:58px;height:58px;background:#eff8ff;border-radius:10px;overflow:hidden;flex-shrink:0;">${p.images && p.images[0] ? `<img src="${esc(p.images[0])}" style="width:100%;height:100%;object-fit:cover;">` : '📦'}</div><div><strong>${esc(p.name)} ${p.isPack ? `(${i18n[state.currentLang].pack_badge})` : ''} ${p.isSpecial ? `(${i18n[state.currentLang].special_badge})` : ''} ${promo ? `<span class="promo-pill">${i18n[state.currentLang].promo_badge}</span>` : ''}</strong><br><small>${promo ? `<del>${fmtMoney(p.price)}</del> <b>${fmtMoney(activePrice)}</b>` : fmtMoney(p.price)} · ${i18n[state.currentLang].quantity}: ${p.qty}</small>${p.isPack && Array.isArray(p.packItems) ? `<br><small>${i18n[state.currentLang].pack_items}: ${p.packItems.map(i=>esc(state.products.find(x=>x.id===i.id)?.name||'')).filter(Boolean).join('، ')}</small>` : ''}</div></div><div class="admin-card-actions"><button class="btn-icon" title="${i18n[state.currentLang].create_promo}" onclick="openPromoModalFor(${p.id})"><i class="fas fa-tags"></i></button><button class="btn-icon" title="${i18n[state.currentLang].edit_order}" onclick="openProductModal(${p.id})"><i class="fas fa-edit"></i></button><button class="btn-danger" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button></div></div>`; }).join('') || `<div class="admin-card">${i18n[state.currentLang].no_products}</div>`;
}
function openPromoModalFor(id){openPromoModal();const s=document.getElementById('promo-product');s.value=String(id);updatePromoOriginalPrice();const p=state.products.find(x=>x.id===id);document.getElementById('promo-price').value=p?.promoPrice||'';document.getElementById('promo-start').value=p?.promoStart||'';document.getElementById('promo-end').value=p?.promoEnd||'';}
window.openPromoModalFor=openPromoModalFor;
window.renderAdminProducts = renderAdminProducts;

function openProductModal(id = null) {
    const p = id ? state.products.find(x => x.id === id) : null;
    document.getElementById('pf-title').textContent = p ? i18n[state.currentLang].edit_order : i18n[state.currentLang].add_product;
    document.getElementById('pf-id').value = id || ''; document.getElementById('pf-name').value = p ? p.name : ''; document.getElementById('pf-price').value = p ? p.price : '';
    document.getElementById('pf-cost').value = p ? p.cost : ''; document.getElementById('pf-qty').value = p ? p.qty : ''; document.getElementById('pf-category').value = p ? p.category : '';
    document.getElementById('pf-desc').value = p ? p.desc : ''; tempUploadedImages = (p && p.images) ? [...p.images] : []; if (!p) window.pendingRequestId = null;
    renderImagePreviews(); openModal('m-product-form');
}
window.openProductModal = openProductModal;

function handleImageUpload(event) {
    const files = event.target.files; if (!files.length) return;
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) { const img = new Image(); img.onload = function() { const canvas = document.createElement('canvas'); const MAX_WIDTH = 800; let scale = 1; if (img.width > MAX_WIDTH) scale = MAX_WIDTH / img.width; canvas.width = img.width * scale; canvas.height = img.height * scale; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); tempUploadedImages.push(canvas.toDataURL('image/jpeg', 0.7)); renderImagePreviews(); }; img.src = e.target.result; };
        reader.readAsDataURL(file);
    });
    event.target.value = '';
}
window.handleImageUpload = handleImageUpload;

function renderImagePreviews() { const grid = document.getElementById('pf-preview'); grid.innerHTML = tempUploadedImages.map((img, index) => `<div style="position:relative;"><img src="${img}" style="width:100%; height:80px; object-fit:cover; border-radius:8px;"><button onclick="removeUploadedImage(${index})" style="position:absolute; top:-5px; right:-5px; background:var(--danger); color:#fff; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer;">✕</button></div>`).join(''); }
function removeUploadedImage(index) { tempUploadedImages.splice(index, 1); renderImagePreviews(); }
window.removeUploadedImage = removeUploadedImage;

async function saveProduct() {
    const id = document.getElementById('pf-id').value;
    const n = document.getElementById('pf-name').value.trim();
    const price = Number(document.getElementById('pf-price').value);
    const cost = Number(document.getElementById('pf-cost').value) || 0;
    const qty = Number(document.getElementById('pf-qty').value) || 0;
    const cat = document.getElementById('pf-category').value.trim();
    const desc = document.getElementById('pf-desc').value.trim();
    if (!n || !(price > 0) || qty < 0) return toast(i18n[state.currentLang].save_failed, 'error');
    if (!window.supabaseClient) return toast(state.currentLang === 'fr' ? 'Connexion à la base de données indisponible. Réessayez après actualisation.' : 'الاتصال بقاعدة البيانات غير متاح. حدّث الصفحة ثم أعد المحاولة.', 'error');
    const existingProduct = id ? state.products.find(x => String(x.id) === String(id)) : null;
    const newP = { name: n, price, cost, qty, category: cat, desc, images: tempUploadedImages, isPack: existingProduct?.isPack || false, packItems: existingProduct?.packItems || [], isSpecial: existingProduct?.isSpecial || false, promoPrice: existingProduct?.promoPrice || null, promoStart: existingProduct?.promoStart || null, promoEnd: existingProduct?.promoEnd || null };
    try {
        let error;
        if (id) {
            const result = await window.supabaseClient.from('products').update(newP).eq('id', id).select('id');
            error = result.error;
            if (!error && (!result.data || result.data.length === 0)) error = new Error('لم يتم تحديث أي صف؛ تحقق من صلاحيات RLS ومعرّف المنتج.');
        } else {
            newP.id = Date.now();
            newP.createdAt = new Date().toISOString();
            const result = await window.supabaseClient.from('products').insert([newP]).select('id');
            error = result.error;
            if (!error && (!result.data || result.data.length === 0)) error = new Error('لم يؤكد الخادم حفظ المنتج.');
        }
        if (error) {
            console.error('saveProduct Supabase error:', error);
            return toast((state.currentLang === 'fr' ? 'Échec de sauvegarde: ' : 'فشل حفظ المنتج: ') + (error.message || String(error)), 'error');
        }
        if (id) { const idx = state.products.findIndex(x => String(x.id) === String(id)); if (idx >= 0) state.products[idx] = { ...state.products[idx], ...newP }; }
        else state.products.push(newP);
        save(K.products, state.products);
        if (window.pendingRequestId) {
            const req = state.requests.find(r => String(r.id) === String(window.pendingRequestId));
            if (req) {
                const { error: requestError } = await window.supabaseClient.from('requests').update({ status: 'fulfilled' }).eq('id', req.id);
                if (requestError) console.warn('Could not update product request status:', requestError.message);
                else { req.status = 'fulfilled'; save(K.requests, state.requests); await notifyCustomerProductAvailable(req); }
            }
            window.pendingRequestId = null; renderAdminRequests(); toast('🎉');
        } else toast('✅ ' + i18n[state.currentLang].saved);
        closeModal('m-product-form'); renderCategories(); renderAdminProducts(); renderShop(); renderNewProducts();
    } catch (error) {
        console.error('saveProduct failed:', error);
        toast((state.currentLang === 'fr' ? 'Échec de sauvegarde: ' : 'فشل حفظ المنتج: ') + (error.message || String(error)), 'error');
    }
}
window.saveProduct = saveProduct;

async function deleteProduct(id) { if (!confirm(i18n[state.currentLang].delete_product_confirm)) return; state.products = state.products.filter(p => p.id !== id); save(K.products, state.products); if (window.supabaseClient) await window.supabaseClient.from('products').delete().eq('id', id); renderCategories(); renderAdminProducts(); renderShop(); }
window.deleteProduct = deleteProduct;

function renderAdminMessages() {
    const c = document.getElementById('a-messages-list'); if (!c) return;
    if (state.messages.length === 0) { c.innerHTML = `<div style="text-align:center;padding:20px;">${i18n[state.currentLang].no_messages}</div>`; return; }
    c.innerHTML = state.messages.map(m => `<div class="admin-card" style="flex-direction: column; align-items: stretch; gap: 10px; border-right: 4px solid ${m.reply ? 'var(--success)' : 'var(--primary)'};"><div style="display:flex; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:8px;"><div><strong>${esc(m.name)}</strong> ${m.phone !== 'غير متوفر' ? `<a href="tel:${esc(m.phone)}" style="color:green;">(${esc(m.phone)})</a>` : ''}</div><small>${new Date(m.date).toLocaleString()}</small></div><div style="background:var(--bg-light); padding:10px; border-radius:8px;">${esc(m.text)}</div><div style="background: #f0fdf4; padding:10px; border-radius:8px; margin-top:5px;">${m.reply ? `<p style="font-size:0.9rem; margin-bottom:5px;"><strong>${i18n[state.currentLang].previous_reply}:</strong> ${esc(m.reply)}</p>` : ''}<textarea id="reply-${m.id}" placeholder="${i18n[state.currentLang].reply_placeholder}" style="width:100%; padding:8px; border-radius:6px; border:1px solid #cbd5e1; margin-bottom:5px;"></textarea><div style="display:flex; justify-content:space-between;"><button class="btn-primary" style="padding:6px 12px;" onclick="replyToMessage(${m.id})">${i18n[state.currentLang].send_reply}</button><button class="btn-danger" onclick="deleteMessage(${m.id})" style="padding:6px 12px;">${i18n[state.currentLang].delete}</button></div></div></div>`).join('');
}
window.renderAdminMessages = renderAdminMessages;

async function replyToMessage(msgId) { const text = document.getElementById('reply-' + msgId).value.trim(); if (!text) return toast(i18n[state.currentLang].write_reply_first, 'error'); const msg = state.messages.find(m => m.id === msgId); if (msg) { msg.reply = text; msg.repliedAt = new Date().toISOString(); save(K.messages, state.messages); if (window.supabaseClient) await window.supabaseClient.from('messages').update({ reply: text, repliedAt: msg.repliedAt }).eq('id', msgId); renderAdminMessages(); toast('✅ ' + i18n[state.currentLang].reply_sent_success); } }
window.replyToMessage = replyToMessage;

async function deleteMessage(id) { if (!confirm(i18n[state.currentLang].delete_message_confirm)) return; state.messages = state.messages.filter(m => m.id !== id); save(K.messages, state.messages); if (window.supabaseClient) await window.supabaseClient.from('messages').delete().eq('id', id); renderAdminMessages(); }
window.deleteMessage = deleteMessage;

function renderAdminExpenses() {
    const c = document.getElementById('a-expenses-list'); if (!c) return;
    c.innerHTML = state.expenses.map(e => `<div class="admin-card"><div><strong>${esc(e.title)}</strong><br><small>${e.date}</small></div><div class="admin-card-actions"><span>${fmtMoney(e.amount)}</span><button class="btn-danger" onclick="deleteExpense(${e.id})">${i18n[state.currentLang].delete}</button></div></div>`).join('');
}
window.renderAdminExpenses = renderAdminExpenses;

function openExpenseModal() { document.getElementById('ef-title').value = ''; document.getElementById('ef-amount').value = ''; document.getElementById('ef-date').value = new Date().toISOString().slice(0, 10); openModal('m-expense-form'); }
window.openExpenseModal = openExpenseModal;

async function saveExpense() {
    const t = document.getElementById('ef-title').value.trim(); const a = Number(document.getElementById('ef-amount').value); const d = document.getElementById('ef-date').value;
    if (!t || !a) return toast(i18n[state.currentLang].save_failed, 'error');
    const exp = { id: Date.now(), title: t, amount: a, date: d };
    state.expenses.push(exp); save(K.expenses, state.expenses); if (window.supabaseClient) await window.supabaseClient.from('expenses').insert([exp]);
    closeModal('m-expense-form'); renderAdminExpenses(); renderAdminHome(); toast('✅ ' + i18n[state.currentLang].saved);
}
window.saveExpense = saveExpense;

async function deleteExpense(id) { if (!confirm(i18n[state.currentLang].delete_expense_confirm)) return; state.expenses = state.expenses.filter(e => e.id !== id); save(K.expenses, state.expenses); if (window.supabaseClient) await window.supabaseClient.from('expenses').delete().eq('id', id); renderAdminExpenses(); renderAdminHome(); }
window.deleteExpense = deleteExpense;

function renderAdminReports() {
    const now = new Date(); const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(); const startOfWeek = now.getTime() - (7 * 24 * 60 * 60 * 1000);
    let daily = { sales: 0, profit: 0 }, weekly = { sales: 0, profit: 0 };
    state.orders.filter(o => o.status !== 'cancelled').forEach(o => {
        const orderTime = new Date(o.createdAt).getTime(); let orderProfit = 0;
        (o.items || []).forEach(i => { orderProfit += (Number(i.price) - Number(i.cost || 0)) * Number(i.qty || 0); });
        const totalNum = Number(o.total) || 0;
        if (orderTime >= startOfDay) { daily.sales += totalNum; daily.profit += orderProfit; }
        if (orderTime >= startOfWeek) { weekly.sales += totalNum; weekly.profit += orderProfit; }
    });
    document.getElementById('rep-day-sales').textContent = fmtMoney(daily.sales); document.getElementById('rep-day-profit').textContent = `${i18n[state.currentLang].profit}: ${fmtMoney(daily.profit)}`;
    document.getElementById('rep-week-sales').textContent = fmtMoney(weekly.sales); document.getElementById('rep-week-profit').textContent = `${i18n[state.currentLang].profit}: ${fmtMoney(weekly.profit)}`;
}
window.renderAdminReports = renderAdminReports;

function renderAdminDebts() {
    const c = document.getElementById('a-debts-list'); if (!c) return;
    const debtOrders = state.orders.filter(o => { const paid = o.paidAmount ?? o.total; const customer = state.customers.find(cust => cust.phone === o.customerPhone || cust.id === o.customerId); return (o.total - paid) > 0 && o.status !== 'cancelled' && customer && customer.isVip; });
    if (debtOrders.length === 0) { c.innerHTML = `<div style="text-align:center;padding:20px;">${i18n[state.currentLang].no_debts}</div>`; return; }
    let debtsByCustomer = {};
    debtOrders.forEach(o => { const paid = o.paidAmount ?? o.total; if (!debtsByCustomer[o.customerPhone]) debtsByCustomer[o.customerPhone] = { name: o.customerName, phone: o.customerPhone, total: 0, count: 0 }; debtsByCustomer[o.customerPhone].total += (o.total - paid); debtsByCustomer[o.customerPhone].count++; });
    c.innerHTML = Object.values(debtsByCustomer).map(cust => `<div class="admin-card" style="border-right: 5px solid var(--danger);"><div><strong>⭐ ${esc(cust.name)}</strong><br><a href="tel:${cust.phone}">${cust.phone}</a><br><small>${cust.count} ${i18n[state.currentLang].my_orders}</small></div><div style="color:var(--danger); font-size:1.2rem; font-weight:900;">${fmtMoney(cust.total)}</div></div>`).join('');
}
window.renderAdminDebts = renderAdminDebts;

function renderAdminSettings() {
    document.getElementById('set-shop').value = state.settings.shopName || ''; document.getElementById('set-phone').value = state.settings.shopPhone || ''; const addressInput = document.getElementById('set-address'); if (addressInput) addressInput.value = state.settings.shopAddress || ''; 
    document.getElementById('set-promo-text').value = state.settings.promoText || ''; document.getElementById('set-promo-active').checked = !!state.settings.promoActive;
    document.getElementById('set-ad-active').checked = !!state.settings.adActive; document.getElementById('set-ad-text').value = state.settings.adText || '';
    document.getElementById('set-ad-endtime').value = state.settings.adEndTime || ''; tempAdImages = state.settings.adImages || []; renderAdPreviews();
}
window.renderAdminSettings = renderAdminSettings;
document.addEventListener('input', event => { if (event.target && event.target.id === 'set-ad-text') renderAdPreviews(); });

async function saveSettingsToCloud() {
    state.settings.shopName = document.getElementById('set-shop').value.trim() || 'Thier Décor'; state.settings.shopPhone = document.getElementById('set-phone').value.trim(); const addressInput = document.getElementById('set-address'); if (addressInput) state.settings.shopAddress = addressInput.value.trim();
    state.settings.promoText = document.getElementById('set-promo-text').value; state.settings.promoActive = document.getElementById('set-promo-active').checked;
    state.settings.adActive = document.getElementById('set-ad-active').checked; state.settings.adText = document.getElementById('set-ad-text').value.trim();
    state.settings.adEndTime = document.getElementById('set-ad-endtime').value; state.settings.adImages = [...tempAdImages];
    if (!window.supabaseClient) return toast(i18n[state.currentLang].error_connection, 'error');
    const { error } = await window.supabaseClient.from('settings').update({ shopName: state.settings.shopName, shopPhone: state.settings.shopPhone, shopAddress: state.settings.shopAddress || '', promoText: state.settings.promoText, promoActive: state.settings.promoActive, adActive: state.settings.adActive, adText: state.settings.adText, adEndTime: state.settings.adEndTime, adImages: state.settings.adImages }).eq('id', 1);
    if (error) { console.error('Settings save failed:', error); return toast('❌ ' + error.message, 'error'); }
    save(K.settings, state.settings); updateStoreBranding(); renderPromoBanner(); renderSliderAd(); toast('✅ ' + i18n[state.currentLang].saved); setTimeout(() => { adminGo('dashboard'); }, 1000);
}
window.saveSettingsToCloud = saveSettingsToCloud;

function renderYalidinePricesTab() {
    const tbody = document.getElementById('yalidine-prices-body'); if (!tbody) return;
    const currentPrices = state.settings.customPrices || {};
    tbody.innerHTML = ALGERIA_WILAYAS.map(w => {
        const home = currentPrices[w.code]?.yalidine?.home ?? ''; const desk = currentPrices[w.code]?.yalidine?.desk ?? '';
        return `<tr style="border-bottom:1px solid var(--border);"><td style="padding:8px;font-weight:bold;font-size:.85rem">${esc(w.name)}</td><td style="padding:8px;text-align:center"><input type="number" min="0" data-wilaya="${w.code}" data-type="home" value="${home}" placeholder="${w.yalidineHome}" style="width:90px;padding:6px;border:1px solid var(--border);border-radius:6px;text-align:center"></td><td style="padding:8px;text-align:center"><input type="number" min="0" data-wilaya="${w.code}" data-type="desk" value="${desk}" placeholder="${w.yalidineDesk}" style="width:90px;padding:6px;border:1px solid var(--border);border-radius:6px;text-align:center"></td></tr>`;
    }).join('');
}
window.renderYalidinePricesTab = renderYalidinePricesTab;
async function saveYalidinePrices() {
    const inputs = document.querySelectorAll('#yalidine-prices-body input'); const newPrices = JSON.parse(JSON.stringify(state.settings.customPrices || {}));
    inputs.forEach(input => { const wilaya=input.dataset.wilaya, type=input.dataset.type, val=input.value.trim(); if(!newPrices[wilaya]) newPrices[wilaya]={}; if(!newPrices[wilaya].yalidine) newPrices[wilaya].yalidine={}; if(val!=='') newPrices[wilaya].yalidine[type]=Number(val); else delete newPrices[wilaya].yalidine[type]; if(Object.keys(newPrices[wilaya].yalidine).length===0) delete newPrices[wilaya].yalidine; if(Object.keys(newPrices[wilaya]).length===0) delete newPrices[wilaya]; });
    state.settings.customPrices=newPrices; save(K.settings,state.settings);
    if(window.supabaseClient){ const {error}=await window.supabaseClient.from('settings').update({customPrices:newPrices}).eq('id',1); if(error){toast('❌ '+i18n[state.currentLang].save_failed,'error');return;} }
    toast('✅ '+i18n[state.currentLang].saved);
}
window.saveYalidinePrices = saveYalidinePrices;

function renderNoestPricesTab() {
    const tbody = document.getElementById('noest-prices-body'); if (!tbody) return;
    const currentPrices = state.settings.customPrices || {};
    tbody.innerHTML = ALGERIA_WILAYAS.map(w => {
        const home = currentPrices[w.code]?.noest?.home ?? ''; const desk = currentPrices[w.code]?.noest?.desk ?? '';
        return `<tr style="border-bottom:1px solid var(--border);"><td style="padding:8px; font-weight:bold; font-size:0.85rem;">${esc(w.name)}</td><td style="padding:8px; text-align:center;"><input type="number" data-wilaya="${w.code}" data-type="home" value="${home}" placeholder="${w.noestHome}" style="width:90px; padding:6px; border:1px solid var(--border); border-radius:6px; text-align:center;"></td><td style="padding:8px; text-align:center;"><input type="number" data-wilaya="${w.code}" data-type="desk" value="${desk}" placeholder="${w.noestDesk}" style="width:90px; padding:6px; border:1px solid var(--border); border-radius:6px; text-align:center;"></td></tr>`;
    }).join('');
}
window.renderNoestPricesTab = renderNoestPricesTab;

async function saveNoestPrices() {
    const inputs = document.querySelectorAll('#noest-prices-body input'); const newPrices = JSON.parse(JSON.stringify(state.settings.customPrices || {}));
    inputs.forEach(input => { const wilaya = input.dataset.wilaya; const type = input.dataset.type; const val = input.value.trim(); if (!newPrices[wilaya]) newPrices[wilaya] = {}; if (!newPrices[wilaya].noest) newPrices[wilaya].noest = {}; if (val !== '') newPrices[wilaya].noest[type] = Number(val); else delete newPrices[wilaya].noest[type]; if (Object.keys(newPrices[wilaya].noest).length === 0) delete newPrices[wilaya].noest; if (Object.keys(newPrices[wilaya]).length === 0) delete newPrices[wilaya]; });
    state.settings.customPrices = newPrices; save(K.settings, state.settings); if (window.supabaseClient) { try { await window.supabaseClient.from('settings').update({ customPrices: newPrices }).eq('id', 1); } catch (e) { toast('❌ ' + i18n[state.currentLang].save_failed, 'error'); return; } } toast('✅ ' + i18n[state.currentLang].saved);
}
window.saveNoestPrices = saveNoestPrices;

function handleAdImageUpload(event) {
    const files = event.target.files; if (!files.length) return;
    Array.from(files).forEach(file => { const reader = new FileReader(); reader.onload = function(e) { const img = new Image(); img.onload = function() { const canvas = document.createElement('canvas'); const MAX_WIDTH = 1000; let scale = 1; if (img.width > MAX_WIDTH) scale = MAX_WIDTH / img.width; canvas.width = img.width * scale; canvas.height = img.height * scale; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); tempAdImages.push(canvas.toDataURL('image/jpeg', 0.5)); renderAdPreviews(); }; img.src = e.target.result; }; reader.readAsDataURL(file); });
    event.target.value = '';
}
window.handleAdImageUpload = handleAdImageUpload;

function renderAdPreviews() {
    const grid = document.getElementById('set-ad-preview');
    if (grid) grid.innerHTML = tempAdImages.map((img, index) => `<div class="ad-thumb"><img src="${img}" alt="Ad image ${index + 1}"><button type="button" aria-label="Remove image" onclick="removeAdImage(${index})">×</button></div>`).join('');
    const live = document.getElementById('ad-live-preview');
    if (live) {
        const text = (document.getElementById('set-ad-text')?.value || '').trim();
        live.innerHTML = tempAdImages.length ? `<div class="ad-live-image"><img src="${tempAdImages[0]}" alt="Ad preview"><div class="ad-live-overlay"><strong>${esc(text || (state.currentLang === 'ar' ? 'عنوان الإشهار يظهر هنا' : 'Votre annonce apparaît ici'))}</strong><small>${tempAdImages.length > 1 ? (state.currentLang === 'ar' ? `+ ${tempAdImages.length - 1} صور أخرى` : `+ ${tempAdImages.length - 1} autre(s) image(s)`) : (state.currentLang === 'ar' ? 'معاينة الإشهار' : 'Aperçu de la publicité')}</small></div></div>` : `<div class="ad-empty-preview"><i class="fas fa-images"></i><span>${state.currentLang === 'ar' ? 'أضف صورًا لمعاينة الإشهار' : 'Ajoutez des images pour prévisualiser'}</span></div>`;
    }
}
function removeAdImage(index) { tempAdImages.splice(index, 1); renderAdPreviews(); }
window.removeAdImage = removeAdImage;

function renderSliderAd() {
    const container = document.getElementById('slider-ad-container'); const imagesBox = document.getElementById('slider-ad-images'); const textEl = document.getElementById('slider-ad-text'); const timerEl = document.getElementById('slider-ad-timer');
    if (adSliderInterval) clearInterval(adSliderInterval);
    if (window.adTimerInterval) { clearInterval(window.adTimerInterval); window.adTimerInterval = null; }
    if (!container || !imagesBox || !textEl || !timerEl) return;
    if (!state.settings.adActive || !state.settings.adImages || state.settings.adImages.length === 0) { container.style.display = 'none'; return; }
    if (state.settings.adEndTime) { if (Date.now() >= new Date(state.settings.adEndTime).getTime()) { container.style.display = 'none'; return; } }
    container.style.display = 'block'; textEl.textContent = state.settings.adText || ''; imagesBox.innerHTML = state.settings.adImages.map((img, i) => `<img src="${esc(img)}" alt="" class="ad-slide ${i === 0 ? 'active' : ''}">`).join('');
    currentAdIndex = 0; const slides = imagesBox.querySelectorAll('.ad-slide');
    if (slides.length > 1) { adSliderInterval = setInterval(() => { slides[currentAdIndex].classList.remove('active'); currentAdIndex = (currentAdIndex + 1) % slides.length; slides[currentAdIndex].classList.add('active'); }, 3000); }
    if (state.settings.adEndTime) { const updateTimer = () => { const diff = new Date(state.settings.adEndTime).getTime() - Date.now(); if (diff <= 0) { timerEl.textContent = i18n[state.currentLang].ends_soon; clearInterval(adSliderInterval); return; } timerEl.innerHTML = `<i class="fas fa-clock"></i> ${i18n[state.currentLang].ends_soon} ${Math.floor(diff/(1000*60*60))}`; }; updateTimer(); window.adTimerInterval = setInterval(updateTimer, 60000); }
}
window.renderSliderAd = renderSliderAd;

let editingCouponIndex = -1;
function saveCouponsToSettings() {
    save(K.settings, state.settings);
    if (window.supabaseClient) return window.supabaseClient.from('settings').update({ coupons: state.settings.coupons || [] }).eq('id', 1);
    return Promise.resolve({ error: null });
}
async function addCoupon() {
    const code = document.getElementById('new-coupon-code').value.trim().toUpperCase();
    const phone = document.getElementById('new-coupon-phone').value.trim();
    const disc = Number(document.getElementById('new-coupon-discount').value);
    const maxUses = Number.parseInt(document.getElementById('new-coupon-max-uses').value, 10);
    const expiry = document.getElementById('new-coupon-expiry').value;
    if (!code || !phone || !normalizePromoPhone(phone) || !(disc > 0 && disc <= 100) || !(maxUses >= 1)) return toast('أكمل الكود والهاتف والنسبة وعدد الطلبيات بشكل صحيح', 'error');
    if (!window.supabaseClient) return toast('اتصل بقاعدة البيانات قبل حفظ البرومو', 'error');
    if (!Array.isArray(state.settings.coupons)) state.settings.coupons = [];
    const duplicate = state.settings.coupons.some((x, i) => x.code === code && i !== editingCouponIndex);
    if (duplicate) return toast('هذا الكود موجود مسبقًا', 'error');
    const existing = editingCouponIndex >= 0 ? state.settings.coupons[editingCouponIndex] : null;
    const cp = { code, phone, discount: disc, maxUses, expiresAt: expiry ? new Date(expiry + 'T23:59:59').toISOString() : null, active: existing ? existing.active !== false : true, createdAt: existing?.createdAt || new Date().toISOString() };
    if (existing) state.settings.coupons[editingCouponIndex] = cp; else state.settings.coupons.push(cp);
    const { error } = await saveCouponsToSettings();
    if (error) { if (existing) state.settings.coupons[editingCouponIndex] = existing; else state.settings.coupons.pop(); return toast('تعذر حفظ البرومو في Supabase', 'error'); }
    editingCouponIndex = -1; document.getElementById('coupon-save-btn').textContent = 'إضافة / حفظ البرومو';
    ['new-coupon-code','new-coupon-phone','new-coupon-expiry'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('new-coupon-discount').value = '10'; document.getElementById('new-coupon-max-uses').value = '5';
    await renderCouponsList(); toast('✓ تم حفظ البرومو');
}
window.addCoupon = addCoupon;
async function renderCouponsList() {
    const c = document.getElementById('coupons-list'); if (!c) return;
    let usage = {};
    if (window.supabaseClient) { try { const { data, error } = await window.supabaseClient.rpc('td_promo_usage_stats'); if (!error && data) usage = data; } catch (_) {} }
    c.innerHTML = (state.settings.coupons || []).map((cp, i) => {
        const used = Number(usage[String(cp.code).toUpperCase()] || 0), max = Math.max(1, Number(cp.maxUses || 1)), remaining = Math.max(0, max-used);
        const expired = cp.expiresAt && new Date(cp.expiresAt).getTime() < Date.now();
        const active = cp.active !== false && !expired && remaining > 0;
        return `<div style="display:block;background:var(--bg-light);padding:12px;border-radius:8px;margin-bottom:8px;border:1px solid var(--border);"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><strong>${esc(cp.code)} — ${Number(cp.discount)}%</strong><span style="font-weight:bold;color:${active?'#059669':'#dc2626'}">${active?'نشط':'متوقف / منتهي'}</span></div><div style="font-size:.88rem;margin:6px 0;line-height:1.8">الهاتف: <b>${esc(cp.phone || '—')}</b><br>الطلبيات: ${used} / ${max} — المتبقي: ${remaining}<br>الانتهاء: ${cp.expiresAt ? new Date(cp.expiresAt).toLocaleDateString() : 'بدون تاريخ'}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn-secondary" onclick="editCoupon(${i})" style="padding:5px 9px">تعديل / تجديد</button><button class="btn-secondary" onclick="toggleCoupon(${i})" style="padding:5px 9px">${cp.active === false ? 'تفعيل' : 'إيقاف'}</button><button class="btn-danger" onclick="removeCoupon(${i})" style="padding:5px 9px">${i18n[state.currentLang].delete}</button></div></div>`;
    }).join('') || '<p style="padding:10px">لا توجد أكواد برومو بعد.</p>';
}
window.renderCouponsList = renderCouponsList;
function editCoupon(index) {
    const cp = state.settings.coupons[index]; if (!cp) return;
    editingCouponIndex = index;
    document.getElementById('new-coupon-code').value = cp.code || '';
    document.getElementById('new-coupon-phone').value = cp.phone || '';
    document.getElementById('new-coupon-discount').value = cp.discount || 10;
    document.getElementById('new-coupon-max-uses').value = cp.maxUses || 5;
    document.getElementById('new-coupon-expiry').value = cp.expiresAt ? new Date(cp.expiresAt).toISOString().slice(0,10) : '';
    document.getElementById('coupon-save-btn').textContent = 'حفظ التعديلات / Enregistrer';
    document.getElementById('new-coupon-code').scrollIntoView({ behavior: 'smooth', block: 'center' });
}
window.editCoupon = editCoupon;
async function toggleCoupon(index) { const cp = state.settings.coupons[index]; if (!cp) return; cp.active = cp.active === false; const { error } = await saveCouponsToSettings(); if (error) { cp.active = !cp.active; return toast('تعذر حفظ الحالة', 'error'); } await renderCouponsList(); }
window.toggleCoupon = toggleCoupon;
async function removeCoupon(index) { if (!confirm('هل تريد حذف كود البرومو؟')) return; const old = state.settings.coupons.splice(index, 1)[0]; const { error } = await saveCouponsToSettings(); if (error) { state.settings.coupons.splice(index,0,old); return toast('تعذر حذف الكود', 'error'); } if (editingCouponIndex === index) editingCouponIndex = -1; await renderCouponsList(); }
window.removeCoupon = removeCoupon;

function updateAdminBadges() {
    const newOrders = state.orders.filter(o => normalizeOrderStatus(o.status) === 'new').length; const unreadMsgs = state.messages.filter(m => !m.reply).length; const pendingReqs = state.requests.filter(r => r.status === 'pending').length;
    const debtOrders = state.orders.filter(o => { const paid = o.paidAmount ?? o.total; const customer = state.customers.find(cust => cust.phone === o.customerPhone || cust.id === o.customerId); return (o.total - paid) > 0 && o.status !== 'cancelled' && customer && customer.isVip; });
    const debtCustomers = new Set(debtOrders.map(o => o.customerPhone)).size;
    const setBadge = (id, count) => { const el = document.getElementById(id); if (el) { el.textContent = count; el.style.display = count > 0 ? 'inline-block' : 'none'; } };
    setBadge('badge-orders', newOrders); setBadge('badge-messages', unreadMsgs); setBadge('badge-requests', pendingReqs); setBadge('badge-debts', debtCustomers);
}
window.updateAdminBadges = updateAdminBadges;

window.convertRequestToProduct = function(reqId) {
    const req = state.requests.find(r => r.id === reqId); if (!req) return;
    window.pendingRequestId = reqId; document.getElementById('pf-title').textContent = i18n[state.currentLang].add_product; document.getElementById('pf-id').value = ''; document.getElementById('pf-name').value = req.productName; document.getElementById('pf-desc').value = req.details || ''; document.getElementById('pf-qty').value = req.qty || 1; document.getElementById('pf-price').value = ''; document.getElementById('pf-cost').value = ''; document.getElementById('pf-category').value = ''; tempUploadedImages = []; renderImagePreviews(); openModal('m-product-form');
};

async function rejectRequest(reqId) { if (!confirm(i18n[state.currentLang].reject_request_confirm)) return; const req = state.requests.find(r => r.id === reqId); if (!req) return; req.status = 'rejected'; save(K.requests, state.requests); if (window.supabaseClient) await window.supabaseClient.from('requests').update({ status: 'rejected' }).eq('id', reqId); renderAdminRequests(); toast('✓'); }
window.rejectRequest = rejectRequest;

async function deleteRequest(reqId) { if (!confirm(i18n[state.currentLang].delete_request_confirm)) return; state.requests = state.requests.filter(r => r.id !== reqId); save(K.requests, state.requests); if (window.supabaseClient) await window.supabaseClient.from('requests').delete().eq('id', reqId); renderAdminRequests(); toast('✓'); }
window.deleteRequest = deleteRequest;

async function notifyCustomerProductAvailable(req) {
    const msg = { id: Date.now(), customerId: null, name: req.customerName, phone: req.customerPhone, text: `🎉 ${req.productName}`, date: new Date().toISOString(), reply: null };
    const cust = state.customers.find(c => c.phone === req.customerPhone); if (cust) msg.customerId = cust.id;
    state.messages.unshift(msg); save(K.messages, state.messages); if (window.supabaseClient) await window.supabaseClient.from('messages').insert([msg]);
}
window.notifyCustomerProductAvailable = notifyCustomerProductAvailable;

// Missing HTML handlers restored for product requests and exports.
function openProductRequestModal() {
    if (!state.session || state.session.role !== 'customer') return toast(i18n[state.currentLang].login_first, 'error');
    const cust = state.customers.find(x => String(x.id) === String(state.session.id));
    if (!cust) return toast(i18n[state.currentLang].login_first, 'error');
    document.getElementById('req-name').value = '';
    document.getElementById('req-qty').value = '1';
    document.getElementById('req-desc').value = '';
    openModal('m-product-request');
}
window.openProductRequestModal = openProductRequestModal;

async function submitProductRequest() {
    const cust = state.session && state.customers.find(x => String(x.id) === String(state.session.id));
    if (!cust) return toast(i18n[state.currentLang].login_first, 'error');
    const productName = document.getElementById('req-name').value.trim();
    const qty = Math.max(1, Number(document.getElementById('req-qty').value) || 1);
    const details = document.getElementById('req-desc').value.trim();
    if (!productName) return toast(state.currentLang === 'fr' ? 'Indiquez le nom du produit.' : 'أدخل اسم المنتج المطلوب.', 'error');
    if (!window.supabaseClient) return toast(i18n[state.currentLang].error_connection, 'error');
    const request = { id: Date.now(), customerId: cust.id, customerName: cust.name || '', customerPhone: cust.phone || '', productName, qty, details, date: new Date().toISOString(), status: 'pending', isTopCustomer: cust.isTop === true };
    try {
        const { error } = await window.supabaseClient.from('requests').insert([request]);
        if (error) throw error;
        state.requests.unshift(request); save(K.requests, state.requests);
        closeModal('m-product-request');
        toast(state.currentLang === 'fr' ? 'Demande envoyée.' : 'تم إرسال طلب المنتج بنجاح.');
        renderMyRequests();
    } catch (error) {
        console.error('submitProductRequest failed:', error);
        toast((state.currentLang === 'fr' ? 'Envoi impossible: ' : 'تعذر إرسال الطلب: ') + (error.message || String(error)), 'error');
    }
}
window.submitProductRequest = submitProductRequest;

function csvCell(value) {
    const str = value == null ? '' : String(value);
    return '"' + str.replace(/"/g, '""') + '"';
}
function exportCSV(type) {
    const isOrders = type === 'orders';
    const rows = isOrders ? state.orders : state.customers;
    if (!rows || !rows.length) return toast(state.currentLang === 'fr' ? 'Aucune donnée à exporter.' : 'لا توجد بيانات للتصدير.', 'error');
    const fields = isOrders
        ? [['رقم الطلب','id'],['الزبون','customerName'],['الهاتف','customerPhone'],['الولاية','wilaya'],['البلدية','commune'],['العنوان','address'],['المبلغ','total'],['الحالة','status'],['التاريخ','createdAt']]
        : [['الاسم','name'],['الهاتف','phone'],['نقاط','points'],['VIP','isVip'],['محظور','isBlocked']];
    const csv = '\ufeff' + [fields.map(f => csvCell(f[0])).join(','), ...rows.map(row => fields.map(([,key]) => csvCell(row[key])).join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = isOrders ? 'thier-decor-orders.csv' : 'thier-decor-customers.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.exportCSV = exportCSV;

function openExportModal() {
    const tbody = document.getElementById('export-table-body'); if (!tbody) return;
    const orders = state.orders.filter(o => String(o.courier || '').toLowerCase().includes('noest'));
    tbody.innerHTML = orders.map((o, index) => {
        const productNames = (o.items || []).map(i => `${i.name || ''} x${i.qty || 1}`).join(' / ');
        const weight = o.weight || '';
        const station = o.stationName || '';
        return `<tr data-order-id="${esc(o.id)}"><td>${esc(o.id)}</td><td><input data-field="customerName" value="${esc(o.customerName)}"></td><td><input data-field="customerPhone" value="${esc(o.customerPhone)}"></td><td><input data-field="phone2" value="${esc(o.phone2 || '')}"></td><td><input data-field="address" value="${esc(o.address || '')}"></td><td><input data-field="commune" value="${esc(o.commune || '')}"></td><td><input data-field="total" type="number" value="${Number(o.total)||0}"></td><td><input data-field="wilaya" value="${esc(o.wilaya || '')}"></td><td><input data-field="productNames" value="${esc(productNames)}"></td><td><input data-field="weight" value="${esc(weight)}"></td><td><input data-field="stopDesk" type="checkbox" ${o.deliveryType === 'stopdesk' ? 'checked' : ''}></td><td><input data-field="station" value="${esc(station)}"></td><td><button type="button" onclick="this.closest('tr').remove(); updateExportCount();">✕</button></td></tr>`;
    }).join('');
    const count = document.getElementById('export-count'); if (count) count.textContent = String(tbody.querySelectorAll('tr').length);
    openModal('m-export-orders');
}
window.openExportModal = openExportModal;
window.updateExportCount = function updateExportCount() { const count = document.getElementById('export-count'); const body = document.getElementById('export-table-body'); if (count && body) count.textContent = String(body.querySelectorAll('tr').length); };
function downloadExportFile() {
    const tbody = document.getElementById('export-table-body'); if (!tbody) return;
    const headers = ['Reference','Client','Tél','Tél 2','Adresse','Commune','Montant','Wilaya','Produit','Poids','Stop Desk','Station'];
    const rows = [...tbody.querySelectorAll('tr')].map(tr => {
        const get = key => { const el = tr.querySelector(`[data-field="${key}"]`); return el ? (el.type === 'checkbox' ? (el.checked ? 'Oui' : 'Non') : el.value) : ''; };
        return [tr.cells[0]?.textContent || '', get('customerName'), get('customerPhone'), get('phone2'), get('address'), get('commune'), get('total'), get('wilaya'), get('productNames'), get('weight'), get('stopDesk'), get('station')];
    });
    const csv = '\ufeff' + [headers, ...rows].map(row => row.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'thier-decor-noest-export.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
window.downloadExportFile = downloadExportFile;

function renderAdminRequests() {
    const c = document.getElementById('a-requests-list'); if (!c) return;
    if (state.requests.length === 0) { c.innerHTML = `<div style="text-align:center;padding:20px;">${i18n[state.currentLang].no_requests}</div>`; return; }
    c.innerHTML = state.requests.map(r => {
        const isFulfilled = r.status === 'fulfilled'; const isRejected = r.status === 'rejected';
        const statusBadge = isFulfilled ? `<span style="background:#d1fae5; color:#059669; padding:4px 10px; border-radius:20px; font-size:0.8rem; font-weight:bold;">✅ ${i18n[state.currentLang].status_fulfilled}</span>` : isRejected ? `<span style="background:#fee2e2; color:#dc2626; padding:4px 10px; border-radius:20px; font-size:0.8rem; font-weight:bold;">❌ ${i18n[state.currentLang].status_rejected}</span>` : `<span style="background:#fef3c7; color:#d97706; padding:4px 10px; border-radius:20px; font-size:0.8rem; font-weight:bold;">⏳ ${i18n[state.currentLang].status_pending}</span>`;
        const borderColor = isFulfilled ? 'var(--success)' : (isRejected ? 'var(--danger)' : '#f59e0b'); const crown = r.isTopCustomer ? '<span title="VIP">👑</span>' : '';
        return `<div class="admin-card" style="border-right: 4px solid ${borderColor}; flex-direction: column; align-items: stretch; gap:10px;"><div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;"><div><strong style="color:var(--primary); font-size:1.1rem;">${crown} ${esc(r.productName)} (x${r.qty})</strong> ${statusBadge}<br><small>👤 ${esc(r.customerName)} <a href="tel:${esc(r.customerPhone)}" style="color:green;">(${esc(r.customerPhone)})</a></small> ${r.details ? `<br><small style="color:var(--text-mid);">📝 ${esc(r.details)}</small>` : ''}<br><small style="color:var(--text-mid); font-size:0.7rem;">📅 ${new Date(r.date).toLocaleString(state.currentLang === 'ar' ? 'ar-DZ' : 'fr-FR')}</small></div><div class="admin-card-actions">${!isFulfilled && !isRejected ? `<button onclick="convertRequestToProduct(${r.id})" class="btn-icon" style="background:#d1fae5; color:#059669;" title="Provide"><i class="fas fa-check-circle"></i></button><button onclick="rejectRequest(${r.id})" class="btn-icon" style="background:#fee2e2; color:#dc2626;" title="Reject"><i class="fas fa-times-circle"></i></button>` : `<button onclick="deleteRequest(${r.id})" class="btn-icon" title="Delete"><i class="fas fa-trash"></i></button>`}</div></div></div>`;
    }).join('');
}
window.renderAdminRequests = renderAdminRequests;
// Discard uncommitted order-edit drafts if the editor is closed without saving.
(function(){
 const originalCloseModal=window.closeModal;
 if(typeof originalCloseModal==='function') window.closeModal=function(id,...args){
   if(id==='m-edit-order' && window.pendingStockDelta){window.pendingStockDelta.clear(); if(editingOrderOriginal && window.editingOrderId!=null){const idx=state.orders.findIndex(x=>String(x.id)===String(window.editingOrderId));if(idx>=0)state.orders[idx]=editingOrderOriginal;} editingOrderOriginal=null;}
   return originalCloseModal.call(this,id,...args);
 };
})();
