/* Thier Décor analytics + in-app notifications. This module does not replace database security policies. */
(function () {
  'use strict';
  const READ_KEY = 'td_notification_reads_v1';
  const VISIT_KEY = 'td_visit_session_v1';
  const $ = id => document.getElementById(id);
  const lang = () => (window.state && state.currentLang === 'fr') ? 'fr' : 'ar';
  const tr = (ar, fr) => lang() === 'fr' ? fr : ar;
  const getReads = () => { try { return JSON.parse(localStorage.getItem(READ_KEY) || '{}'); } catch { return {}; } };
  const setReads = v => { try { localStorage.setItem(READ_KEY, JSON.stringify(v)); } catch {} };
  function customerNotifications() {
    if (!window.state || !state.session || state.session.role !== 'customer') return [];
    const customer = (state.customers || []).find(c => String(c.id) === String(state.session.id));
    if (!customer) return [];
    const phone = String(customer.phone || '').trim();
    const orders = (state.orders || []).filter(o => String(o.customerId) === String(customer.id) || String(o.customerPhone || '').trim() === phone);
    const messages = (state.messages || []).filter(m => String(m.customerId) === String(customer.id) || String(m.phone || '').trim() === phone);
    const notes = [];
    orders.forEach(o => notes.push({ id: `order-${o.id}-${o.status}`, date: o.updatedAt || o.createdAt, title: tr('تحديث حالة الطلبية', 'Mise à jour de commande'), body: `${tr('الطلبية', 'Commande')} #${String(o.id).slice(-6)} — ${statusName(o.status)}`, kind: 'order', orderId: o.id }));
    messages.filter(m => m.reply).forEach(m => notes.push({ id: `reply-${m.id}`, date: m.replyDate || m.date, title: tr('رد جديد من المتجر', 'Nouvelle réponse de la boutique'), body: String(m.reply), kind: 'message' }));
    return notes.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));
  }
  function statusName(status) {
    const map = { new: ['جديدة','Nouvelle'], confirmed:['مؤكدة','Confirmée'], on_the_way:['في الطريق','En route'], out_for_delivery:['خرجت للتوصيل','En livraison'], delivered:['تم التسليم','Livrée'], cancelled:['ملغاة','Annulée'] };
    const item = map[status] || [status || '—', status || '—']; return item[lang() === 'fr' ? 1 : 0];
  }
  window.renderCustomerNotifications = function () {
    const container = $('s-customer-notifications-list'); if (!container) return;
    if (!state.session || state.session.role !== 'customer') { container.innerHTML = `<div class="admin-card">${tr('سجّل الدخول لرؤية إشعاراتك.','Connectez-vous pour voir vos notifications.')}</div>`; updateCustomerBadge(0); return; }
    const all = customerNotifications(), reads = getReads();
    const unread = all.filter(n => !reads[n.id]).length; updateCustomerBadge(unread);
    if (!all.length) { container.innerHTML = `<div class="admin-card">${tr('لا توجد إشعارات حاليًا.','Aucune notification pour le moment.')}</div>`; return; }
    container.innerHTML = all.map(n => `<article class="admin-card" style="display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;opacity:${reads[n.id] ? '.72' : '1'};border-inline-start:4px solid ${reads[n.id] ? 'var(--border)' : 'var(--primary)'}"><i class="fas ${n.kind === 'order' ? 'fa-box' : 'fa-reply'}" style="font-size:1.2rem;color:var(--primary);margin-top:4px"></i><div style="flex:1"><strong>${esc(n.title)}</strong><p style="margin:5px 0">${esc(n.body)}</p><small>${n.date ? new Date(n.date).toLocaleString(lang()==='ar'?'ar-DZ':'fr-FR') : ''}</small>${n.orderId ? `<div><button class="btn-secondary" style="width:auto;margin-top:8px" onclick="shopGo('orders');markOneCustomerNotification('${n.id}')">${tr('عرض الطلبية','Voir la commande')}</button></div>` : ''}</div>${!reads[n.id] ? `<span class="nav-badge">${tr('جديد','Nouveau')}</span>` : ''}</article>`).join('');
  };
  function updateCustomerBadge(count) { const b=$('customer-notification-badge'); if(b){b.textContent=count;b.style.display=count?'inline-block':'none';} }
  window.markOneCustomerNotification = function(id) { const r=getReads(); r[id]=true; setReads(r); window.renderCustomerNotifications(); };
  window.markCustomerNotificationsRead = function() { const r=getReads(); customerNotifications().forEach(n=>r[n.id]=true); setReads(r); window.renderCustomerNotifications(); };
  window.openAdminNotifications = function () {
    const notes=[];
    (state.orders||[]).filter(o=>o.status==='new').slice(0,12).forEach(o=>notes.push({icon:'fa-box',title:tr('طلبية جديدة','Nouvelle commande'),body:`#${String(o.id).slice(-6)} — ${o.customerName||''}`,go:'orders'}));
    (state.messages||[]).filter(m=>!m.reply).slice(0,12).forEach(m=>notes.push({icon:'fa-envelope',title:tr('رسالة جديدة','Nouveau message'),body:`${m.name||m.phone||''}: ${m.text||''}`,go:'messages'}));
    const html=notes.length?notes.slice(0,20).map(n=>`<button class="admin-card" style="width:100%;text-align:start;margin-bottom:8px;display:flex;gap:10px;align-items:center" onclick="adminGo('${n.go}');closeModal('m-td-notifications')"><i class="fas ${n.icon}"></i><span><strong>${esc(n.title)}</strong><br>${esc(n.body)}</span></button>`).join(''):`<div class="admin-card">${tr('لا توجد إشعارات جديدة.','Aucune nouvelle notification.')}</div>`;
    let modal=$('m-td-notifications'); if(!modal){modal=document.createElement('div');modal.id='m-td-notifications';modal.className='modal-overlay';modal.innerHTML='<div class="modal-content"><div class="modal-header"><h3 id="td-notice-title"></h3><button class="close-modal" onclick="closeModal(\'m-td-notifications\')">✕</button></div><div class="modal-body" id="td-notice-body"></div></div>';document.body.appendChild(modal);}
    $('td-notice-title').textContent=tr('الإشعارات','Notifications'); $('td-notice-body').innerHTML=html; if(window.openModal)openModal('m-td-notifications'); else modal.classList.add('active');
  };
  function fillAnalytics(visits) {
    const orders=state.orders||[], customers=state.customers||[], messages=state.messages||[];
    const today=new Date();today.setHours(0,0,0,0);
    const todayOrders=orders.filter(o=>o.createdAt&&new Date(o.createdAt)>=today);
    const metrics={
      'td-stat-customers':customers.length,'td-stat-orders':orders.length,'td-stat-new-orders':orders.filter(o=>o.status==='new').length,
      'td-stat-messages':messages.length,'td-stat-visits-today':visits.today ?? '—','td-stat-visits-total':visits.total ?? '—'
    };
    Object.entries(metrics).forEach(([id,v])=>{const el=$(id);if(el)el.textContent=Number.isFinite(v)?v.toLocaleString(lang()==='ar'?'ar-DZ':'fr-FR'):v;});
    const details=$('td-analytics-detail');if(details)details.innerHTML=[
      [tr('الزبائن المسجلون','Clients inscrits'),customers.length],[tr('إجمالي الطلبيات','Total commandes'),orders.length],[tr('طلبيات اليوم','Commandes aujourd’hui'),todayOrders.length],
      [tr('الطلبيات الجديدة','Nouvelles commandes'),orders.filter(o=>o.status==='new').length],[tr('الرسائل غير المجاب عنها','Messages sans réponse'),messages.filter(m=>!m.reply).length],
      [tr('المنتجات','Produits'),(state.products||[]).length],[tr('زيارات اليوم','Visites aujourd’hui'),visits.today ?? '—'],[tr('إجمالي الزيارات','Total visites'),visits.total ?? '—']
    ].map(([label,value])=>`<div class="stat-card"><span>${esc(label)}</span><h3>${typeof value==='number'?value.toLocaleString(lang()==='ar'?'ar-DZ':'fr-FR'):esc(value)}</h3></div>`).join('');
    const note=$('td-analytics-note');if(note)note.textContent=tr('الزيارات تُحسب حسب الجلسات المسجلة. قد لا تتوفر الإحصائيات قبل تشغيل ملف SQL المرفق في Supabase.','Les visites sont comptées par session enregistrée. Les statistiques de visites nécessitent l’exécution du fichier SQL fourni dans Supabase.');
  }
  window.refreshStoreAnalytics=async function(){
    let visits={today:null,total:null};
    if(window.callAdminWorker){
      try {
        const result=await window.callAdminWorker('adminVisitStats');
        const data=result.visits||{};
        visits={today:Number(data.today_visits||0),total:Number(data.total_visits||0)};
      } catch(e){console.warn('Admin visit statistics unavailable:',e.message||e);}
    }
    fillAnalytics(visits);
  };
  const originalAdminGo=window.adminGo;
  window.adminGo=function(sec,btn){if(sec==='analytics'){document.querySelectorAll('.admin-section').forEach(s=>s.style.display='none');const el=$('sec-analytics');if(el)el.style.display='block';document.querySelectorAll('.admin-nav a').forEach(a=>a.classList.remove('active'));if(btn)btn.classList.add('active');const title=$('admin-page-title');if(title)title.textContent=tr('إحصائيات المتجر','Statistiques du magasin');window.refreshStoreAnalytics();return;} if(originalAdminGo)originalAdminGo(sec,btn);};
  const originalRenderAdminHome=window.renderAdminHome;
  window.renderAdminHome=function(){if(originalRenderAdminHome)originalRenderAdminHome();window.refreshStoreAnalytics();};
  const originalUpdateBadges=window.updateAdminBadges;
  window.updateAdminBadges=function(){if(originalUpdateBadges)originalUpdateBadges();const count=(state.orders||[]).filter(o=>o.status==='new').length+(state.messages||[]).filter(m=>!m.reply).length;const b=$('admin-notification-badge');if(b){b.textContent=count;b.style.display=count?'inline-block':'none';}if(window.renderCustomerNotifications)window.renderCustomerNotifications();};
  function trackVisit(){
    try {
      if(sessionStorage.getItem(VISIT_KEY)) return;
      const sessionKeyName='td_visit_session_key_v1';
      let sessionKey=sessionStorage.getItem(sessionKeyName);
      if(!sessionKey){
        const bytes=new Uint8Array(16);
        if(window.crypto&&crypto.getRandomValues) crypto.getRandomValues(bytes);
        else for(let i=0;i<bytes.length;i++) bytes[i]=Math.floor(Math.random()*256);
        sessionKey=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
        sessionStorage.setItem(sessionKeyName,sessionKey);
      }
      fetch(window.TD_API_URL || 'https://thier-decor-api.amindrody.workers.dev/',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'recordVisit',path:location.pathname,sessionKey}),
        cache:'no-store'
      }).then(async response=>{
        const result=await response.json().catch(()=>null);
        if(response.ok&&result?.success) sessionStorage.setItem(VISIT_KEY,'1');
      }).catch(error=>console.warn('Visit tracking failed:',error));
    } catch(e) {}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    trackVisit();
    if(window.state){setTimeout(()=>{if(window.updateAdminBadges)window.updateAdminBadges();if(window.renderCustomerNotifications)window.renderCustomerNotifications();},600);}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&window.state){if(window.updateAdminBadges)window.updateAdminBadges();if(window.renderCustomerNotifications)window.renderCustomerNotifications();}});
  // Re-render when the customer navigates to the notifications page.
  const oldShopGo=window.shopGo;
  if(oldShopGo)window.shopGo=function(page,...args){const r=oldShopGo.call(this,page,...args);if(page==='notifications')setTimeout(()=>window.renderCustomerNotifications(),50);return r;};
})();
