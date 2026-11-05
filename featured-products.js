/* Thier Décor — featured products management (no Worker changes) */
(() => {
  'use strict';

  const META_KEY = '__featuredProductIds';
  let draftIds = [];
  let draftDirty = false;
  let saving = false;

  const getState = () => window.state || {};
  const isFrench = () => getState().currentLang === 'fr';
  const tr = (ar, fr) => isFrench() ? fr : ar;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const getProducts = () => Array.isArray(getState().products) ? getState().products : [];
  const getCustomPrices = () => getState().settings?.customPrices && typeof getState().settings.customPrices === 'object'
    ? getState().settings.customPrices : {};
  const getStoredIds = () => Array.isArray(getCustomPrices()[META_KEY])
    ? getCustomPrices()[META_KEY].map(id => String(id)) : [];
  const money = amount => (Number(amount) || 0).toLocaleString('fr-FR') + (isFrench() ? ' DA' : ' دج');
  const productImage = product => Array.isArray(product.images) && typeof product.images[0] === 'string' && product.images[0].length > 10
    ? product.images[0] : '';

  function renderFeaturedStorefront() {
    const section = document.getElementById('featured-products-section');
    const grid = document.getElementById('featured-products-grid');
    if (!section || !grid) return;
    const productsById = new Map(getProducts().map(product => [String(product.id), product]));
    const selected = getStoredIds().map(id => productsById.get(id)).filter(product => product && Number(product.qty) > 0);
    const seen = new Set();
    const featured = selected.filter(product => {
      const key = product.isPack ? 'pack:' + String(product.id) : JSON.stringify([
        String(product.name || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
        String(product.category || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase(),
        Number(typeof window.effectiveProductPrice === 'function' ? window.effectiveProductPrice(product) : product.price) || 0
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!featured.length) {
      section.style.display = 'none';
      grid.innerHTML = '';
      return;
    }
    section.style.display = 'block';
    document.getElementById('featured-products-title').textContent = tr('منتجات مختارة', 'Notre sélection');
    document.getElementById('featured-products-description').textContent = tr('اختيارات مميزة اخترناها لكم', 'Une sélection de produits à découvrir');
    grid.innerHTML = featured.map(product => {
      const id = Number(product.id);
      const image = productImage(product);
      const safeImage = image ? escapeHtml(image) : '';
      const price = typeof window.effectiveProductPrice === 'function' ? window.effectiveProductPrice(product) : Number(product.price) || 0;
      const original = Number(product.price) || 0;
      const isPromo = price < original;
      const isWish = Array.isArray(getState().wishlist) && getState().wishlist.includes(product.id);
      const variants = typeof window.getProductVariants === 'function' ? window.getProductVariants(id) : [product];
      const name = escapeHtml(product.name || '');
      const variantBadge = variants.length > 1 ? `<span class="product-variant-count">${tr(variants.length + ' أشكال', variants.length + ' modèles')}</span>` : '';
      return `<div class="product-card featured-product-card" onclick="showProductView(${id})">
        <span class="featured-product-badge">${tr('مميز', 'Sélection')}</span>
        <div class="product-img">${safeImage ? `<img src="${safeImage}" loading="lazy" alt="${name}" onerror="this.onerror=null;this.parentElement.innerHTML='<i class=\\'fas fa-image\\' style=\\'color:#cbd5e1;font-size:2rem;\\'></i>';">` : '<i class="fas fa-image" style="color:#cbd5e1;font-size:2rem;"></i>'}${variantBadge}</div>
        <div class="product-actions-under-image">
          <button type="button" class="product-mini-action ${isWish ? 'is-favorite' : ''}" title="${tr('أضف إلى المفضلة', 'Ajouter aux favoris')}" aria-label="${tr('أضف إلى المفضلة', 'Ajouter aux favoris')}" onclick="event.stopPropagation();toggleWishlist(${id})"><i class="fas fa-heart"></i></button>
          <button type="button" class="product-mini-action product-mini-cart" title="${tr('اختر الشكل', 'Choisir le modèle')}" aria-label="${tr('اختر الشكل', 'Choisir le modèle')}" onclick="event.stopPropagation();addProductFromCard(${id})"><i class="fas fa-shopping-basket"></i></button>
        </div>
        <div class="product-info"><h3>${name}</h3><div class="product-price-box">${isPromo ? `<del>${money(original)}</del>` : ''}<span>${money(price)}</span></div></div>
      </div>`;
    }).join('');
  }

  function renderAdminSelector() {
    const list = document.getElementById('featured-products-admin-list');
    if (!list) return;
    if (!draftDirty) draftIds = getStoredIds();
    const products = getProducts();
    const count = document.getElementById('featured-products-admin-count');
    const title = document.getElementById('featured-admin-title');
    const description = document.getElementById('featured-admin-description');
    const saveLabel = document.getElementById('featured-admin-save-label');
    if (title) title.textContent = tr('المنتجات المميزة', 'Produits à la une');
    if (description) description.textContent = tr('اختر المنتجات التي تريد عرضها أولاً ورتب ظهورها للزبائن.', 'Choisissez les produits à afficher en premier et définissez leur ordre.');
    if (saveLabel) saveLabel.textContent = tr('حفظ ترتيب المنتجات', 'Enregistrer la sélection');
    if (!products.length) {
      if (count) count.textContent = tr('لا توجد منتجات متاحة حالياً.', 'Aucun produit disponible pour le moment.');
      list.innerHTML = '';
      return;
    }
    const selected = products.filter(product => draftIds.includes(String(product.id)))
      .sort((a, b) => draftIds.indexOf(String(a.id)) - draftIds.indexOf(String(b.id)));
    const others = products.filter(product => !draftIds.includes(String(product.id)))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), isFrench() ? 'fr' : 'ar'));
    const ordered = [...selected, ...others];
    if (count) count.textContent = tr(
      `تم اختيار ${selected.length} منتج. استعمل الأسهم لتغيير ترتيب الظهور.`,
      `${selected.length} produit(s) sélectionné(s). Utilisez les flèches pour modifier l’ordre d’affichage.`
    );
    list.innerHTML = ordered.map(product => {
      const id = String(product.id);
      const index = draftIds.indexOf(id);
      const selectedNow = index >= 0;
      const image = productImage(product);
      const thumb = image
        ? `<img class="featured-admin-thumb" src="${escapeHtml(image)}" alt="">`
        : '<span class="featured-admin-thumb" aria-hidden="true" style="display:grid;place-items:center;color:#9aabba;"><i class="fas fa-image"></i></span>';
      const stock = Number(product.qty) > 0 ? tr('متوفر', 'En stock') : tr('غير متوفر حالياً', 'Indisponible');
      const orderControls = selectedNow ? `<div class="featured-admin-order">
        <span class="featured-admin-order-number">${index + 1}</span>
        <button type="button" class="btn-icon" data-featured-move="up" data-product-id="${escapeHtml(id)}" title="${tr('تقديم', 'Monter')}" aria-label="${tr('تقديم', 'Monter')}" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
        <button type="button" class="btn-icon" data-featured-move="down" data-product-id="${escapeHtml(id)}" title="${tr('تأخير', 'Descendre')}" aria-label="${tr('تأخير', 'Descendre')}" ${index === draftIds.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
      </div>` : '';
      return `<div class="featured-admin-row">
        <label class="featured-admin-product">
          <input type="checkbox" data-featured-select value="${escapeHtml(id)}" ${selectedNow ? 'checked' : ''}>
          ${thumb}
          <span class="featured-admin-product-info"><strong>${escapeHtml(product.name || tr('منتج بدون اسم', 'Produit sans nom'))}</strong><small>${money(product.price)} · ${stock}</small></span>
        </label>
        ${orderControls}
      </div>`;
    }).join('');
  }

  async function saveFeaturedProducts() {
    if (saving) return;
    const state = getState();
    if (typeof window.callAdminWorker !== 'function') {
      window.toast?.(tr('خدمة الإدارة غير متاحة حالياً.', 'Service administrateur indisponible.'), 'error');
      return;
    }
    const existingProducts = new Set(getProducts().map(product => String(product.id)));
    const cleanIds = [...new Set(draftIds.map(String))].filter(id => existingProducts.has(id));
    const customPrices = JSON.parse(JSON.stringify(getCustomPrices()));
    customPrices[META_KEY] = cleanIds;
    const button = document.querySelector('#featured-products-admin-panel .featured-admin-save');
    saving = true;
    if (button) button.disabled = true;
    try {
      await window.callAdminWorker('adminUpdateSettings', { settings: { customPrices } });
      state.settings = state.settings || {};
      state.settings.customPrices = customPrices;
      try { localStorage.setItem('td_set', JSON.stringify(state.settings)); } catch (_) {}
      draftIds = cleanIds;
      draftDirty = false;
      renderAdminSelector();
      renderFeaturedStorefront();
      window.toast?.('✓ ' + tr('تم حفظ المنتجات المميزة بنجاح', 'Sélection enregistrée avec succès'));
    } catch (error) {
      window.toast?.('✕ ' + (error?.message || tr('تعذر حفظ الاختيار.', 'Impossible d’enregistrer la sélection.')), 'error');
    } finally {
      saving = false;
      if (button) button.disabled = false;
    }
  }
  window.saveFeaturedProducts = saveFeaturedProducts;

  document.addEventListener('change', event => {
    const checkbox = event.target.closest?.('[data-featured-select]');
    if (!checkbox) return;
    const id = String(checkbox.value);
    if (checkbox.checked && !draftIds.includes(id)) draftIds.push(id);
    if (!checkbox.checked) draftIds = draftIds.filter(item => item !== id);
    draftDirty = true;
    renderAdminSelector();
  });

  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-featured-move]');
    if (!button) return;
    const id = String(button.dataset.productId || '');
    const index = draftIds.indexOf(id);
    if (index < 0) return;
    const next = button.dataset.featuredMove === 'up' ? index - 1 : index + 1;
    if (next < 0 || next >= draftIds.length) return;
    [draftIds[index], draftIds[next]] = [draftIds[next], draftIds[index]];
    draftDirty = true;
    renderAdminSelector();
  });


  const CATEGORY_ORDER_KEY = '__categoryOrder';
  let draftCategoryOrder = [];
  let categoryOrderDirty = false;
  const normalizeCategory = value => typeof window.normalizeStoreCategory === 'function'
    ? window.normalizeStoreCategory(value)
    : String(value || '').normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  const getCategoryNames = () => {
    const names = [];
    const seen = new Set();
    getProducts().forEach(product => {
      const name = String(product.category || '').trim();
      const key = normalizeCategory(name);
      if (key && !seen.has(key)) { seen.add(key); names.push(name); }
    });
    return names;
  };
  const getStoredCategoryOrder = () => Array.isArray(getCustomPrices()[CATEGORY_ORDER_KEY])
    ? getCustomPrices()[CATEGORY_ORDER_KEY].map(String) : [];
  function getEffectiveCategoryOrder() {
    const names = getCategoryNames();
    const byKey = new Map(names.map(name => [normalizeCategory(name), name]));
    const saved = getStoredCategoryOrder().map(normalizeCategory);
    const ordered = saved.map(key => byKey.get(key)).filter(Boolean);
    names.forEach(name => { if (!ordered.some(item => normalizeCategory(item) === normalizeCategory(name))) ordered.push(name); });
    return ordered;
  }
  function renderCategoryOrderSelector() {
    const list = document.getElementById('category-order-admin-list');
    if (!list) return;
    if (!categoryOrderDirty) draftCategoryOrder = getEffectiveCategoryOrder();
    const count = document.getElementById('category-order-admin-count');
    const title = document.getElementById('category-order-admin-title');
    const description = document.getElementById('category-order-admin-description');
    const saveLabel = document.getElementById('category-order-admin-save-label');
    if (title) title.textContent = tr('ترتيب الأصناف', 'Ordre des catégories');
    if (description) description.textContent = tr('غيّر ترتيب ظهور الأصناف في واجهة الزائر والزبون.', 'Changez l’ordre d’affichage des catégories dans la boutique.');
    if (saveLabel) saveLabel.textContent = tr('حفظ ترتيب الأصناف', 'Enregistrer l’ordre');
    if (count) count.textContent = tr(draftCategoryOrder.length + ' صنفاً · استعمل الأسهم لتغيير الترتيب.', draftCategoryOrder.length + ' catégorie(s) · Utilisez les flèches pour réorganiser.');
    if (!draftCategoryOrder.length) {
      list.innerHTML = '<div class="featured-empty-state"><strong>' + tr('لا توجد أصناف بعد. أضف منتجات مع تحديد الصنف أولاً.', 'Aucune catégorie. Ajoutez d’abord des produits avec une catégorie.') + '</strong></div>';
      return;
    }
    list.innerHTML = draftCategoryOrder.map((name, index) => `<div class="featured-admin-row category-order-row">
      <div class="featured-admin-product"><span class="category-order-number">${index + 1}</span><span class="featured-admin-product-info"><strong>${escapeHtml(name)}</strong><small>${tr('ترتيب الظهور في المتجر', 'Ordre dans la boutique')}</small></span></div>
      <div class="featured-admin-order">
        <button type="button" class="btn-icon" data-category-move="up" data-category-index="${index}" title="${tr('تقديم', 'Monter')}" aria-label="${tr('تقديم', 'Monter')}" ${index === 0 ? 'disabled' : ''}><i class="fas fa-arrow-up"></i></button>
        <button type="button" class="btn-icon" data-category-move="down" data-category-index="${index}" title="${tr('تأخير', 'Descendre')}" aria-label="${tr('تأخير', 'Descendre')}" ${index === draftCategoryOrder.length - 1 ? 'disabled' : ''}><i class="fas fa-arrow-down"></i></button>
      </div>
    </div>`).join('');
  }
  async function saveCategoryOrder() {
    if (saving) return;
    const state = getState();
    if (typeof window.callAdminWorker !== 'function') {
      window.toast?.(tr('خدمة الإدارة غير متاحة حالياً.', 'Service administrateur indisponible.'), 'error');
      return;
    }
    const customPrices = JSON.parse(JSON.stringify(getCustomPrices()));
    const currentKeys = new Set(getCategoryNames().map(normalizeCategory));
    customPrices[CATEGORY_ORDER_KEY] = [...new Set(draftCategoryOrder.map(normalizeCategory))].filter(key => currentKeys.has(key));
    const button = document.querySelector('#category-order-admin-panel .featured-admin-save');
    saving = true;
    if (button) button.disabled = true;
    try {
      await window.callAdminWorker('adminUpdateSettings', { settings: { customPrices } });
      state.settings = state.settings || {};
      state.settings.customPrices = customPrices;
      try { localStorage.setItem('td_set', JSON.stringify(state.settings)); } catch (_) {}
      categoryOrderDirty = false;
      draftCategoryOrder = getEffectiveCategoryOrder();
      window.renderCategories?.();
      renderCategoryOrderSelector();
      window.toast?.('✓ ' + tr('تم حفظ ترتيب الأصناف بنجاح', 'Ordre des catégories enregistré'));
    } catch (error) {
      window.toast?.('✕ ' + (error?.message || tr('تعذر حفظ الترتيب.', 'Impossible d’enregistrer l’ordre.')), 'error');
    } finally {
      saving = false;
      if (button) button.disabled = false;
    }
  }
  window.saveCategoryOrder = saveCategoryOrder;
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-category-move]');
    if (!button) return;
    const index = Number(button.dataset.categoryIndex);
    const next = button.dataset.categoryMove === 'up' ? index - 1 : index + 1;
    if (!Number.isInteger(index) || next < 0 || next >= draftCategoryOrder.length) return;
    [draftCategoryOrder[index], draftCategoryOrder[next]] = [draftCategoryOrder[next], draftCategoryOrder[index]];
    categoryOrderDirty = true;
    renderCategoryOrderSelector();
  });

  document.addEventListener('DOMContentLoaded', () => {
    renderAdminSelector();
    renderCategoryOrderSelector();
    renderFeaturedStorefront();
    const shopProducts = document.getElementById('s-products');
    if (shopProducts && 'MutationObserver' in window) {
      new MutationObserver(() => {
        renderFeaturedStorefront();
        renderAdminSelector();
        renderCategoryOrderSelector();
      }).observe(shopProducts, { childList: true, subtree: true });
    }
    const languageButtons = ['lang-btn', 'mobile-lang-btn'];
    languageButtons.forEach(id => {
      const button = document.getElementById(id);
      if (button) button.addEventListener('click', () => setTimeout(() => {
        renderAdminSelector();
        renderCategoryOrderSelector();
        renderFeaturedStorefront();
      }, 0));
    });
    const settings = document.getElementById('sec-settings');
    if (settings && 'MutationObserver' in window) {
      new MutationObserver(() => { renderAdminSelector(); renderCategoryOrderSelector(); }).observe(settings, { attributes: true, attributeFilter: ['style'] });
    }
  });
})();
