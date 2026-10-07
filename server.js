// ============================================================
// === ЧАСТЬ 1 из 5 ===
// ============================================================
// SSR сервер для colormsk.ru
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const ROOT = '/var/www/colormsk';
const SITE_URL = 'https://colormsk.ru';

// ------------------------------------------------------------
// Категории
// ------------------------------------------------------------
const CATEGORIES = {
    'antiseptiki': 'Антисептики',
    'kraski-interiernye': 'Краски интерьерные',
    'kraski-fasadnye': 'Краски фасадные',
    'laki': 'Лаки',
    'gruntovki': 'Грунтовки и Шпатлевки',
    'dekorativnye-shtukaturki': 'Декоративные штукатурки',
    'alkidnye-kraski': 'Эмали',
    'rastvoriteli': 'Растворители'
};

// ------------------------------------------------------------
// Транслит
// ------------------------------------------------------------
function translit(str) {
    const map = {
        'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y',
        'к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f',
        'х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
        'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'ZH','З':'Z','И':'I','Й':'Y',
        'К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F',
        'Х':'H','Ц':'TS','Ч':'CH','Ш':'SH','Щ':'SCH','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'YU','Я':'YA'
    };
    let result = '';
    for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        result += map[ch] || (ch.match(/[a-zA-Z0-9]/) ? ch : '-');
    }
    return result.replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

// ------------------------------------------------------------
// escapeHtml
// ------------------------------------------------------------
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ------------------------------------------------------------
// Форматирование цены
// ------------------------------------------------------------
function formatPrice(price) {
    return String(price || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

// ------------------------------------------------------------
// Поиск самой дешёвой опции в товаре
// ------------------------------------------------------------
function findCheapestOption(product) {
    let cheapest = null;
    let sizeIdx = 0;
    if (!product.sizes) return { opt: null, sizeIdx: 0 };
    product.sizes.forEach(function(size, sIdx) {
        if (!size.options) return;
        size.options.forEach(function(opt) {
            if (!cheapest || (parseInt(opt.price) || 0) < (parseInt(cheapest.price) || 0)) {
                cheapest = opt;
                sizeIdx = sIdx;
            }
        });
    });
    return { opt: cheapest, sizeIdx: sizeIdx };
}

// ============================================================
// ОБЩИЕ КОМПОНЕНТЫ КОРЗИНЫ
// ============================================================

function renderCartFab() {
    return `<div class="cart-fab-wrap">
        <button class="cart-fab" id="cart-fab" type="button" aria-label="Открыть корзину">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
            <span>Корзина</span>
            <span class="cart-fab-count" id="cart-fab-count" style="display:none;">0</span>
        </button>
    </div>`;
}

function renderCartModal() {
    return `<div class="cart-modal-bg" id="cart-modal-bg">
        <div class="cart-modal">
            <div class="cart-modal-head">
                <h2>Корзина</h2>
                <button class="cart-modal-close" id="cart-modal-close" type="button" aria-label="Закрыть">×</button>
            </div>
            <div class="cart-modal-body" id="cart-modal-body"></div>
            <div class="cart-modal-foot" id="cart-modal-foot" style="display:none;">
                <div class="cart-total">
                    <span>Итого:</span>
                    <strong id="cart-total-sum">0 ₽</strong>
                </div>
                <div class="cart-actions">
                    <button class="cart-btn-clear" id="cart-btn-clear" type="button">Очистить</button>
                    <button class="cart-btn-checkout" id="cart-btn-checkout" type="button">Оформить заказ</button>
                </div>
            </div>
        </div>
    </div>`;
}

function renderCartScript() {
    return `<script>
    (function() {
        var CART_KEY = 'colormsk_cart';
        function getCart() { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; } }
        function saveCart(cart) { try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) {} }
        function cartTotalQty(cart) { var t = 0; cart.forEach(function(it) { t += parseInt(it.qty) || 1; }); return t; }
        function fmt(n) { return String(n || 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' '); }
        function buildProductUrl(item) {
            if (!item.cat) return null;
            var map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
            var slug = item.name.toLowerCase().replace(/[а-яё]/g, function(ch) { return map[ch] || '-'; }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
            return '/' + item.cat + '/' + slug + '--' + item.sku;
        }

        var cartFab = document.getElementById('cart-fab');
        var cartFabCount = document.getElementById('cart-fab-count');
        var cartModalBg = document.getElementById('cart-modal-bg');
        var cartModalClose = document.getElementById('cart-modal-close');
        var cartModalBody = document.getElementById('cart-modal-body');
        var cartModalFoot = document.getElementById('cart-modal-foot');
        var cartTotalSum = document.getElementById('cart-total-sum');
        var cartBtnClear = document.getElementById('cart-btn-clear');
        var cartBtnCheckout = document.getElementById('cart-btn-checkout');

        function updateFabCount() {
            var cart = getCart();
            var q = cartTotalQty(cart);
            if (!cartFabCount) return;
            if (q > 0) { cartFabCount.textContent = q; cartFabCount.style.display = 'flex'; }
            else { cartFabCount.style.display = 'none'; }
        }

        function renderCart() {
            var cart = getCart();
            if (!cartModalBody) return;
            if (cart.length === 0) {
                cartModalBody.innerHTML = '<div class="cart-empty">Корзина пуста. Добавьте товары из каталога.</div>';
                if (cartModalFoot) cartModalFoot.style.display = 'none';
                return;
            }
            if (cartModalFoot) cartModalFoot.style.display = 'block';
            var html = '';
            var total = 0;
            cart.forEach(function(item, idx) {
                var sum = (parseInt(item.price) || 0) * (parseInt(item.qty) || 1);
                total += sum;
                var url = buildProductUrl(item);
                var nameHtml = url ? '<a href="' + url + '">' + item.brand + ' ' + item.name + '</a>' : (item.brand + ' ' + item.name);
                var meta = [];
                if (item.color) meta.push(item.color);
                if (item.gloss) meta.push(item.gloss);
                if (item.volume) meta.push(item.volume);
                html += '<div class="cart-item">' +
                    '<img class="cart-item-img" src="/' + (item.photo || 'images/logo.png') + '" alt="">' +
                    '<div class="cart-item-info">' +
                        '<div class="cart-item-name">' + nameHtml + '</div>' +
                        '<div class="cart-item-meta">' + meta.join(' · ') + '</div>' +
                    '</div>' +
                    '<div class="cart-item-right">' +
                        '<div class="cart-item-price">' + fmt(sum) + ' ₽</div>' +
                        '<div class="cart-item-qty">' +
                            '<button type="button" data-act="dec" data-idx="' + idx + '">−</button>' +
                            '<span>' + item.qty + '</span>' +
                            '<button type="button" data-act="inc" data-idx="' + idx + '">+</button>' +
                        '</div>' +
                        '<button class="cart-item-remove" type="button" data-act="rm" data-idx="' + idx + '">Удалить</button>' +
                    '</div>' +
                '</div>';
            });
            cartModalBody.innerHTML = html;
            if (cartTotalSum) cartTotalSum.textContent = fmt(total) + ' ₽';
            cartModalBody.querySelectorAll('button[data-act]').forEach(function(b) {
                b.addEventListener('click', function() {
                    var act = b.getAttribute('data-act');
                    var i = parseInt(b.getAttribute('data-idx'));
                    var c = getCart();
                    if (!c[i]) return;
                    if (act === 'inc') c[i].qty = (parseInt(c[i].qty) || 1) + 1;
                    else if (act === 'dec') { c[i].qty = (parseInt(c[i].qty) || 1) - 1; if (c[i].qty <= 0) c.splice(i, 1); }
                    else if (act === 'rm') c.splice(i, 1);
                    saveCart(c); updateFabCount(); renderCart();
                });
            });
        }

        if (cartFab) cartFab.addEventListener('click', function() { renderCart(); cartModalBg.classList.add('open'); });
        if (cartModalClose) cartModalClose.addEventListener('click', function() { cartModalBg.classList.remove('open'); });
        if (cartModalBg) cartModalBg.addEventListener('click', function(e) { if (e.target === cartModalBg) cartModalBg.classList.remove('open'); });
        if (cartBtnClear) cartBtnClear.addEventListener('click', function() { saveCart([]); updateFabCount(); renderCart(); });
        if (cartBtnCheckout) cartBtnCheckout.addEventListener('click', function() { alert('Оформление заказа — следующий этап разработки.'); });

        window.CMSK_CART = { getCart: getCart, saveCart: saveCart, updateFabCount: updateFabCount, renderCart: renderCart, cartTotalQty: cartTotalQty, fmt: fmt, buildProductUrl: buildProductUrl };
        updateFabCount();
    })();
    </script>`;
}

function renderHitsScript() {
    return `<script>
    (function() {
        try {
            var raw = localStorage.getItem('t_hits_cache');
            if (!raw) return;
            var hits = JSON.parse(raw);
            if (!hits || !hits.hits || hits.hits.length === 0) return;
            var block = document.getElementById('hits-block');
            var grid = document.getElementById('hits-grid');
            if (!block || !grid) return;
            var map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
            function fmt(n) { return String(n || 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' '); }
            function slug(name) { return name.toLowerCase().replace(/[а-яё]/g, function(ch) { return map[ch] || '-'; }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
            block.style.display = 'block';
            var html = '';
            hits.hits.forEach(function(h) {
                if (!h.product || !h.product.sizes || !h.product.sizes[0]) return;
                var opt = h.product.sizes[0].options && h.product.sizes[0].options[0];
                if (!opt) return;
                var url = '/' + h.cat + '/' + slug(h.product.name) + '--' + opt.sku;
                html += '<a class="hit-card" href="' + url + '">' +
                    '<img class="hit-card-img" src="/' + h.product.photo + '" alt="">' +
                    '<div class="hit-card-brand">' + (h.product.brand || '') + '</div>' +
                    '<div class="hit-card-name">' + (h.product.name || '') + '</div>' +
                    '<div class="hit-card-price">' + fmt(opt.price) + ' ₽</div>' +
                '</a>';
            });
            grid.innerHTML = html;
        } catch (e) {}
    })();
    </script>`;
}

function renderHitsBlock() {
    return `<div class="hits-block" id="hits-block" style="display:none;">
        <h2 class="hits-title">Хиты продаж</h2>
        <div class="hits-grid" id="hits-grid"></div>
    </div>`;
}
// ============================================================
// === ЧАСТЬ 2 из 5 ===
// ============================================================
// Компоненты: шапка, сайдбары, футер + renderStyles
// ============================================================

function renderHeader() {
    return `<header class="t-header">
        <div class="t-logo">
            <img class="t-logo-img" src="/images/logo.png" alt="КолорМСК">
            <div>
                <a href="/">КолорМСК</a>
                <div class="t-slogan">Лакокрасочные материалы</div>
            </div>
        </div>
        <div class="t-search-wrapper">
            <input type="text" class="t-search-input" id="t-search-input" placeholder="Поиск товаров..." autocomplete="off">
            <div class="t-search-results" id="t-search-results"></div>
        </div>
        <div class="t-contacts">
            <a href="mailto:info@colormsk.ru">info@colormsk.ru</a>
            <a href="tel:+79036692534">+7 (903) 669-25-34</a>
        </div>
    </header>`;
}

function renderSidebar(activeCat) {
    let items = '';
    for (const [slug, name] of Object.entries(CATEGORIES)) {
        const active = slug === activeCat ? ' active' : '';
        items += `<a href="/${slug}" class="t-nav-link${active}">${name}</a>`;
    }
    return `<aside class="t-sidebar">
        <nav class="t-sidebar-nav">
            <a href="/" class="t-nav-link">Главная</a>
            ${items}
            <div class="t-nav-divider"></div>
            <div class="t-nav-section-title">Бренды</div>
            <a href="/brands/symphony" class="t-nav-link t-nav-external">SYMPHONY</a>
            <a href="/brands/decotech" class="t-nav-link t-nav-external">DecoTech</a>
            <a href="/brands/artigiano" class="t-nav-link t-nav-external">ARTIGIANO</a>
        </nav>
    </aside>`;
}

function renderSidebarRight() {
    return `<aside class="t-sidebar-right">
        <div class="t-sidebar-card">
            <h3>Доставка и оплата</h3>
            <p>По Москве и МО — <strong>800 ₽</strong>. Бесплатно от <strong>15 000 ₽</strong>. В регионы — ТК.</p>
            <a href="/dostavka.html" class="t-sidebar-card-btn">Подробнее о доставке</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Каталоги цветов</h3>
            <p>Более 15 000 оттенков по RAL, NCS, Monicolor.</p>
            <a href="/catalog-colors.html" class="t-sidebar-card-btn">Перейти в каталог</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Полезная информация</h3>
            <p>Основные сведения о ЛКМ, технологии окраски.</p>
            <a href="/info.html" class="t-sidebar-card-btn">Читать подробнее</a>
        </div>
    </aside>`;
}

function renderFooter() {
    return `<footer class="t-seo-footer">
        <div style="max-width:1200px;margin:0 auto;">
            <h3>Лакокрасочные материалы в Москве — ColorMSK / Колор МСК</h3>
            <p>Магазин лакокрасочных материалов «Колор МСК» предлагает <strong>купить краску, эмаль, лак, грунтовку, антисептик</strong> и декоративные штукатурки в Москве с доставкой. Работаем с розничными и оптовыми покупателями. <strong>Промышленные лакокрасочные материалы — поставщик Москва</strong> — от ведущих производителей: <a href="/symphony.html">SYMPHONY (Симфония)</a>, <a href="/decotech.html">DecoTech (Декотек)</a>.</p>
            <p><strong>Купить лакокрасочные материалы оптом в Москве</strong> можно по телефону <a href="tel:+79036692534">+7 (903) 669-25-34</a> или на сайте colormsk.ru. <a href="/opt.html">Оптовые поставки ЛКМ</a> — для строительных организаций. <a href="/dostavka.html">Доставка и оплата</a> — по Москве, МО и РФ.</p>
        </div>
    </footer>`;
}

function renderStyles() {
    return `<style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; background-color: #f5f5f5; color: #1a2a3a; min-height: 100vh; }

        .t-header { background: rgba(26,42,58,.85); padding: 10px 30px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 1000; backdrop-filter: blur(10px); }
        .t-header .t-logo { display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-right: auto; }
        .t-header .t-logo .t-logo-img { height: 40px; width: auto; border-radius: 4px; }
        .t-header .t-logo a { font-size: 26px; font-weight: 700; color: #fff; text-decoration: none; display: block; line-height: 1.1; }
        .t-header .t-logo .t-slogan { font-size: 11px; color: rgba(255,255,255,.6); }
        .t-header .t-contacts { display: flex; align-items: center; gap: 18px; }
        .t-header .t-contacts a { color: rgba(255,255,255,.85); text-decoration: none; font-size: 13px; }
        .t-header .t-contacts a:hover { color: #ffd166; }

        .t-search-wrapper { position: relative; width: 252px; min-width: 180px; margin: 0 2px 0 0; flex-shrink: 0; }
        .t-search-input { width: 100%; padding: 10px 16px; border: 2px solid rgba(255,255,255,.25); border-radius: 10px; background: rgba(255,255,255,.12); color: #fff; font-size: 13px; font-family: inherit; outline: 0; }
        .t-search-input::placeholder { color: rgba(255,255,255,.5); }
        .t-search-input:focus { border-color: rgba(255,255,255,.5); background: rgba(255,255,255,.18); }

        .t-layout { display: flex; max-width: 100%; min-height: 100vh; width: 100%; align-items: stretch; }
        .t-sidebar { width: 280px; min-width: 280px; background: rgba(26,42,58,.85); padding: 20px 0 0; position: sticky; top: 0; align-self: stretch; min-height: 100vh; overflow-y: auto; z-index: 100; backdrop-filter: blur(10px); }
        .t-sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 10px; }
        .t-nav-link { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 10px; color: rgba(255,255,255,.65); text-decoration: none; font-size: 13px; font-weight: 500; transition: all .2s; }
        .t-nav-link:hover { background: rgba(255,255,255,.08); color: #fff; }
        .t-nav-link.active { background: rgba(255,209,102,.15); color: #ffd166; }
        .t-nav-divider { height: 1px; background: rgba(255,255,255,.08); margin: 12px 14px 8px; }
        .t-nav-section-title { font-size: 10px; font-weight: 700; color: rgba(255,255,255,.4); text-transform: uppercase; letter-spacing: 1.2px; padding: 0 14px 8px; }
        .t-nav-external { color: #ffd166 !important; font-weight: 600 !important; }

        .t-main-wrap { flex: 1; display: flex; min-width: 0; width: 100%; }
        .t-main { flex: 1; padding: 20px 24px 30px; min-width: 0; }

        .t-sidebar-right { width: 280px; min-width: 280px; background: rgba(26,42,58,.85); padding: 20px 16px 0; position: sticky; top: 0; align-self: stretch; min-height: 100vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; backdrop-filter: blur(10px); }
        .t-sidebar-card { background: rgba(255,255,255,.05); border-radius: 12px; padding: 12px; border: 1px solid rgba(255,255,255,.06); }
        .t-sidebar-card h3 { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .t-sidebar-card p { font-size: 11px; color: rgba(255,255,255,.6); line-height: 1.4; margin-bottom: 8px; }
        .t-sidebar-card-btn { display: block; background: rgba(255,209,102,.15); color: #ffd166; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 11px; text-align: center; transition: background .2s; }
        .t-sidebar-card-btn:hover { background: rgba(255,209,102,.25); }

        .page-title { font-size: 26px; font-weight: 700; color: #1a2a3a; margin-bottom: 20px; text-align: center; text-shadow: 0 1px 4px rgba(255,255,255,.7); }
        .breadcrumbs { font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 20px; text-shadow: 0 1px 4px rgba(0,0,0,.55); }
        .breadcrumbs a { color: #fff; text-decoration: none; font-weight: 600; opacity: .9; }
        .breadcrumbs a:hover { color: #ffd166; opacity: 1; }

        .product-page { background: rgba(255,255,255,.97); border-radius: 14px; padding: 30px; box-shadow: 0 2px 12px rgba(0,0,0,.06); max-width: 1000px; margin: 0 auto; }
        .product-grid { display: grid; grid-template-columns: 340px 1fr; gap: 30px; margin-bottom: 20px; }
        .product-photo-block { text-align: center; }
        .product-photo { width: 100%; max-width: 340px; border-radius: 12px; background: #f8faff; border: 1px solid #eef1f5; }

        .product-info-block { min-width: 0; }
        .brand { font-size: 14px; color: #6a7a8a; margin-bottom: 4px; }
        .product-title { font-size: 26px; font-weight: 700; color: #1a2a3a; line-height: 1.25; margin-bottom: 8px; }
        .sku-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .sku { font-size: 13px; color: #9aaabb; }
        .btn-share { padding: 6px 14px; background: #f1f5f9; color: #4a5a6a; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; display: inline-flex; align-items: center; gap: 6px; transition: all .2s; }
        .btn-share:hover { background: #e2e8f0; color: #1a2a3a; }

        .stock { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; margin-bottom: 16px; }
        .stock.in-stock { color: #3d7a4a; background: rgba(61,122,74,.12); }
        .stock.on-order { color: #d4880f; background: rgba(212,136,15,.12); }

        .selectors { display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px; }
        .select-group { display: flex; flex-direction: column; gap: 4px; }
        .select-group label { font-size: 12px; font-weight: 600; color: #6a7a8a; text-transform: uppercase; letter-spacing: .5px; }
        .select-group select { padding: 10px 14px; border: 2px solid #dce3ec; border-radius: 10px; font-size: 14px; background: #fff; color: #1a2a3a; cursor: pointer; font-family: inherit; outline: none; transition: border-color .2s; }
        .select-group select:focus { border-color: #1a2a3a; }

        .price-row { display: flex; align-items: center; gap: 20px; margin: 20px 0; }
        .price { font-size: 34px; font-weight: 700; color: #1a2a3a; line-height: 1; }
        .price .currency { font-size: 20px; font-weight: 400; color: #6a7a8a; margin-left: 4px; }

        .btn-cart { padding: 14px 32px; background: #1a2a3a; color: #fff; border: 1px solid #1a2a3a; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .2s; }
        .btn-cart:hover { background: #2c3e50; }
        .btn-cart:active { transform: scale(.97); }

        .product-desc { line-height: 1.65; margin: 20px 0; color: #2c3e50; font-size: 14px; }
        .product-desc strong { color: #1a2a3a; }

        .tech { background: #f8faff; border-radius: 10px; padding: 16px 20px; margin: 16px 0; line-height: 1.7; font-size: 14px; color: #3d5166; border: 1px solid #eef1f5; }
        .tech > strong { color: #1a2a3a; display: block; margin-bottom: 8px; }
        .specs-list { margin-top: 8px; }
        .specs-list div { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #eaeef3; }
        .specs-list div:last-child { border-bottom: none; }
        .specs-list .label { font-weight: 600; color: #1a2a3a; }
        .specs-list .value { color: #4a5a6a; text-align: right; }

        .btn-back { display: inline-block; margin-top: 20px; padding: 10px 22px; background: transparent; color: #6a7a8a; text-decoration: none; border: 1px solid #dce3ec; border-radius: 10px; font-weight: 500; font-size: 14px; transition: all .2s; }
        .btn-back:hover { background: #f8faff; color: #1a2a3a; border-color: #1a2a3a; }

        .cat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
        .cat-card { background: rgba(255,255,255,.97); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; transition: transform .2s, box-shadow .2s; box-shadow: 0 2px 10px rgba(0,0,0,.05); }
        .cat-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
        .cat-card-img { width: 100%; height: 150px; object-fit: contain; border-radius: 10px; background: #f8faff; border: 1px solid #eef1f5; margin-bottom: 10px; }
        .cat-card-brand { font-size: 10px; color: #6a7a8a; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .5px; }
        .cat-card-name { font-size: 13px; font-weight: 600; color: #1a2a3a; line-height: 1.3; margin-bottom: 4px; text-decoration: none; }
        .cat-card-name:hover { color: #ff8f2e; }
        .cat-card-sku { font-size: 11px; color: #9aaabb; margin-bottom: 8px; }
        .cat-card-selectors { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
        .cat-card-selectors select { padding: 6px 10px; border: 1px solid #dce3ec; border-radius: 6px; font-size: 12px; background: #fff; color: #1a2a3a; cursor: pointer; font-family: inherit; outline: none; }
        .cat-card-desc { font-size: 12px; color: #6a7a8a; line-height: 1.5; margin-bottom: 12px; flex: 1; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
        .cat-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; padding-top: 10px; border-top: 1px solid #eef1f5; }
        .cat-card-price { font-size: 16px; font-weight: 700; color: #1a2a3a; }
        .cat-card-price .currency { font-size: 12px; font-weight: 400; color: #6a7a8a; margin-left: 2px; }
        .cat-card-buy { padding: 8px 16px; background: #1a2a3a; color: #fff; border: 1px solid #1a2a3a; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .2s; }
        .cat-card-buy:hover { background: #2c3e50; }

        .toast { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%) translateY(20px); background: rgba(26,42,58,.95); color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; transition: all .3s; z-index: 5000; box-shadow: 0 8px 30px rgba(0,0,0,.3); pointer-events: none; }
        .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        .t-seo-footer { background: rgba(26,42,58,.95); color: rgba(255,255,255,.7); padding: 30px; margin-top: 30px; font-size: 12px; line-height: 1.6; }
        .t-seo-footer h3 { color: #fff; font-size: 16px; margin-bottom: 10px; }
        .t-seo-footer a { color: #ffd166; text-decoration: none; }
        .t-seo-footer a:hover { text-decoration: underline; }

        .cart-fab-wrap { position: fixed; bottom: 20px; right: 20px; z-index: 4000; }
        .cart-fab { display: flex; align-items: center; gap: 10px; padding: 14px 22px; background: #1a2a3a; color: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.35); cursor: pointer; font-size: 14px; font-weight: 600; transition: transform .2s, box-shadow .2s; border: none; font-family: inherit; position: relative; }
        .cart-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(0,0,0,.45); }
        .cart-fab svg { width: 20px; height: 20px; }
        .cart-fab-count { position: absolute; top: -6px; right: -6px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: #ff5c5c; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

        .cart-modal-bg { position: fixed; top: 0; right: 0; bottom: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,.55); z-index: 4500; display: none; align-items: center; justify-content: center; padding: 20px; }
        .cart-modal-bg.open { display: flex; }
        .cart-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 560px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; }
        .cart-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #eef1f5; }
        .cart-modal-head h2 { font-size: 18px; font-weight: 700; color: #1a2a3a; }
        .cart-modal-close { background: none; border: none; font-size: 24px; color: #9aaabb; cursor: pointer; padding: 0 6px; line-height: 1; }
        .cart-modal-close:hover { color: #1a2a3a; }
        .cart-modal-body { padding: 12px 24px; overflow-y: auto; flex: 1; }
        .cart-empty { text-align: center; padding: 40px 20px; color: #9aaabb; font-size: 14px; }
        .cart-item { display: flex; gap: 14px; padding: 14px 0; border-bottom: 1px solid #f4f6f9; align-items: center; }
        .cart-item:last-child { border-bottom: none; }
        .cart-item-img { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; background: #f8faff; border: 1px solid #eef1f5; flex-shrink: 0; }
        .cart-item-info { flex: 1; min-width: 0; }
        .cart-item-name { font-size: 13px; font-weight: 600; color: #1a2a3a; line-height: 1.3; margin-bottom: 2px; }
        .cart-item-name a { color: #1a2a3a; text-decoration: none; }
        .cart-item-name a:hover { color: #ff8f2e; }
        .cart-item-meta { font-size: 11px; color: #9aaabb; }
        .cart-item-right { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .cart-item-price { font-size: 14px; font-weight: 700; color: #1a2a3a; white-space: nowrap; }
        .cart-item-qty { display: flex; align-items: center; gap: 6px; }
        .cart-item-qty button { width: 26px; height: 26px; border: 1px solid #dce3ec; background: #f8faff; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 700; color: #1a2a3a; padding: 0; line-height: 1; font-family: inherit; }
        .cart-item-qty button:hover { background: #e2e8f0; }
        .cart-item-qty span { min-width: 24px; text-align: center; font-size: 13px; font-weight: 600; }
        .cart-item-remove { background: none; border: none; font-size: 11px; color: #d9534f; cursor: pointer; padding: 0; text-decoration: underline; font-family: inherit; }
        .cart-modal-foot { padding: 16px 24px; border-top: 1px solid #eef1f5; background: #fafbfc; }
        .cart-total { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; font-size: 14px; color: #6a7a8a; }
        .cart-total strong { font-size: 22px; font-weight: 700; color: #1a2a3a; }
        .cart-actions { display: flex; gap: 10px; }
        .cart-actions button { flex: 1; padding: 12px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .2s; border: none; }
        .cart-btn-clear { background: #fff; color: #d9534f; border: 1px solid #f0d0d0; }
        .cart-btn-clear:hover { background: #fff5f5; }
        .cart-btn-checkout { background: #1a2a3a; color: #fff; }
        .cart-btn-checkout:hover { background: #2c3e50; }

        .share-modal-bg { position: fixed; top: 0; right: 0; bottom: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,.55); z-index: 4600; display: none; align-items: center; justify-content: center; padding: 20px; }
        .share-modal-bg.open { display: flex; }
        .share-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 420px; box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; }
        .share-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #eef1f5; }
        .share-modal-head h2 { font-size: 18px; font-weight: 700; color: #1a2a3a; }
        .share-modal-close { background: none; border: none; font-size: 24px; color: #9aaabb; cursor: pointer; padding: 0 6px; line-height: 1; }
        .share-modal-close:hover { color: #1a2a3a; }
        .share-modal-body { padding: 20px 24px 24px; }
        .share-url-row { display: flex; gap: 8px; margin-bottom: 16px; }
        .share-url-input { flex: 1; padding: 10px 14px; border: 2px solid #dce3ec; border-radius: 10px; font-size: 13px; font-family: inherit; outline: none; background: #f8faff; color: #4a5a6a; }
        .share-url-input:focus { border-color: #1a2a3a; }
        .share-copy-btn { padding: 10px 20px; background: #1a2a3a; color: #fff; border: none; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .2s; }
        .share-copy-btn:hover { background: #2c3e50; }
        .share-copy-btn.copied { background: #3d7a4a; }
        .share-socials { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
        .share-social { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 14px 8px; border-radius: 12px; text-decoration: none; color: #1a2a3a; font-size: 11px; font-weight: 600; transition: transform .2s; border: 1px solid #eef1f5; }
        .share-social:hover { transform: translateY(-2px); }
        .share-social svg { width: 28px; height: 28px; }
        .share-social.tg { background: rgba(41,171,226,.1); color: #29abe2; }
        .share-social.wa { background: rgba(37,211,102,.1); color: #25d366; }
        .share-social.vk { background: rgba(0,119,255,.1); color: #0077ff; }
        .share-social.ok { background: rgba(237,129,46,.1); color: #ed812e; }
        .share-social.em { background: rgba(107,114,128,.1); color: #4b5563; }

        .hits-block { margin-top: 30px; }
        .hits-title { font-size: 20px; font-weight: 700; color: #1a2a3a; margin-bottom: 16px; padding-left: 4px; text-shadow: 0 1px 4px rgba(255,255,255,.7); }
        .hits-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
        .hit-card { background: rgba(255,255,255,.97); border-radius: 14px; padding: 14px; text-decoration: none; color: #1a2a3a; display: flex; flex-direction: column; transition: transform .2s, box-shadow .2s; box-shadow: 0 2px 10px rgba(0,0,0,.05); }
        .hit-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
        .hit-card-img { width: 100%; height: 140px; object-fit: contain; border-radius: 10px; background: #f8faff; border: 1px solid #eef1f5; margin-bottom: 10px; }
        .hit-card-brand { font-size: 11px; color: #6a7a8a; margin-bottom: 2px; }
        .hit-card-name { font-size: 13px; font-weight: 600; line-height: 1.3; margin-bottom: 6px; flex: 1; }
        .hit-card-price { font-size: 16px; font-weight: 700; color: #1a2a3a; }

        @media (max-width: 1300px) { .cat-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 1100px) {
            .t-sidebar-right { display: none; }
            .hits-grid { grid-template-columns: repeat(2, 1fr); }
            .cat-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 800px) {
            .t-sidebar { display: none; }
            .t-header { padding: 10px 15px; flex-wrap: wrap; }
            .t-search-wrapper { width: 100%; order: 3; margin-top: 8px; }
            .product-grid { grid-template-columns: 1fr; }
            .product-title { font-size: 20px; }
            .price { font-size: 26px; }
        }
        @media (max-width: 600px) {
            .hits-grid { grid-template-columns: 1fr; }
            .cat-grid { grid-template-columns: 1fr; }
            .cart-fab-wrap { bottom: 12px; right: 12px; }
        }
    </style>`;
}
// ============================================================
// === ЧАСТЬ 3 из 5 ===
// ============================================================
// renderShareModal + renderProductPage + renderProductScript
// ============================================================

function renderShareModal() {
    return `<div class="share-modal-bg" id="share-modal-bg">
        <div class="share-modal">
            <div class="share-modal-head">
                <h2>Поделиться</h2>
                <button class="share-modal-close" id="share-modal-close" type="button" aria-label="Закрыть">×</button>
            </div>
            <div class="share-modal-body">
                <div class="share-url-row">
                    <input type="text" class="share-url-input" id="share-url-input" readonly>
                    <button class="share-copy-btn" id="share-copy-btn" type="button">Копировать</button>
                </div>
                <div class="share-socials">
                    <a class="share-social tg" id="share-tg" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>
                        <span>Telegram</span>
                    </a>
                    <a class="share-social wa" id="share-wa" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.47-2.4-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.47.13-.62.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.65-1.58-.89-2.16-.23-.57-.47-.49-.65-.5-.17-.01-.37-.01-.57-.01-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.07 2.88 1.22 3.08.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.05 2C6.55 2 2.05 6.5 2.05 12c0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38c1.4.77 3 .22 4.8.22 5.5 0 10-4.5 10-10S17.55 2 12.05 2zm0 18.2c-1.63 0-3.14-.44-4.45-1.2l-.32-.19-3.11.82.83-3.03-.2-.33c-.83-1.35-1.31-2.92-1.31-4.6 0-4.7 3.83-8.53 8.53-8.53 4.7 0 8.53 3.83 8.53 8.53 0 4.7-3.83 8.53-8.53 8.53z"/></svg>
                        <span>WhatsApp</span>
                    </a>
                    <a class="share-social vk" id="share-vk" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.16 17.7c-6.16 0-9.68-4.22-9.82-11.24h3.09c.1 5.15 2.37 7.33 4.16 7.78V6.46h2.91v4.44c1.77-.19 3.62-2.2 4.25-4.44h2.91c-.48 2.75-2.49 4.76-3.92 5.59 1.43.67 3.71 2.42 4.58 5.65h-3.2c-.68-2.11-2.37-3.75-4.62-3.97v3.97h-.34z"/></svg>
                        <span>ВКонтакте</span>
                    </a>
                    <a class="share-social ok" id="share-ok" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 7.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5zm3.4 5.34a1.25 1.25 0 0 0-1.65-1.88 2.64 2.64 0 0 1-3.5 0 1.25 1.25 0 0 0-1.65 1.88 5.14 5.14 0 0 0 2.15 1.13L9.4 17.4a1.25 1.25 0 0 0 1.77 1.77l.83-.83.83.83a1.25 1.25 0 0 0 1.77-1.77l-1.35-1.34a5.14 5.14 0 0 0 2.15-1.22z"/></svg>
                        <span>OK</span>
                    </a>
                    <a class="share-social em" id="share-em" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        <span>Email</span>
                    </a>
                </div>
            </div>
        </div>
    </div>`;
}

// ------------------------------------------------------------
// СТРАНИЦА ТОВАРА (с правильным порядком: breadcrumbs → product-page)
// ------------------------------------------------------------
function renderProductPage(category, product, firstOption) {
    const categoryName = CATEGORIES[category] || category;
    const productUrl = SITE_URL + '/' + category + '/' + translit(product.name) + '--' + firstOption.sku;

    const title = product.brand + ' ' + product.name + ' — купить в Москве | КолорМСК';
    const description = 'Купить ' + product.brand + ' ' + product.name + ' по цене от ' + formatPrice(firstOption.price) + ' ₽. ' + categoryName + ' с доставкой по Москве и РФ. Артикул: ' + firstOption.sku + '.';

    const photoUrl = SITE_URL + '/' + (product.photo || 'images/logo.png');

    const cheapest = findCheapestOption(product);
    const cheapestOpt = cheapest.opt || firstOption;
    const cheapestSizeIdx = cheapest.sizeIdx || 0;

    let sizesHtml = '';
    if (product.sizes && product.sizes.length > 0) {
        sizesHtml += '<div class="select-group"><label>Фасовка</label><select id="size-select">';
        product.sizes.forEach(function(size, idx) {
            const opt = size.options && size.options[0] || {};
            const selected = idx === cheapestSizeIdx ? ' selected' : '';
            sizesHtml += '<option value="' + idx + '"' + selected + '>' + size.volume + ' (' + size.fill + ') — ' + formatPrice(opt.price) + ' ₽</option>';
        });
        sizesHtml += '</select></div>';
    }

    let colorHtml = '';
    if (product.selectorLabel && product.colors && product.colors.length > 0) {
        colorHtml += '<div class="select-group"><label>' + escapeHtml(product.selectorLabel) + '</label><select id="color-select">';
        product.colors.forEach(function(color) {
            const selected = (color === cheapestOpt.color) ? ' selected' : '';
            colorHtml += '<option value="' + escapeHtml(color) + '"' + selected + '>' + escapeHtml(color) + '</option>';
        });
        colorHtml += '</select></div>';
    }

    let glossHtml = '';
    if (product.gloss && product.gloss.length > 0) {
        glossHtml += '<div class="select-group"><label>Блеск</label><select id="gloss-select">';
        product.gloss.forEach(function(g) {
            const selected = (g === cheapestOpt.gloss) ? ' selected' : '';
            glossHtml += '<option value="' + escapeHtml(g) + '"' + selected + '>' + escapeHtml(g) + '</option>';
        });
        glossHtml += '</select></div>';
    }

    let specsHtml = '';
    if (product.tech) {
        specsHtml += '<div class="tech"><strong>Характеристики:</strong><div class="specs-list">';
        product.tech.split('.').filter(function(s) { return s.trim(); }).forEach(function(item) {
            const parts = item.split(':');
            if (parts.length === 2) {
                specsHtml += '<div><span class="label">' + escapeHtml(parts[0].trim()) + '</span><span class="value">' + escapeHtml(parts[1].trim()) + '</span></div>';
            } else {
                specsHtml += '<div><span class="value" style="text-align:left;">' + escapeHtml(item.trim()) + '</span></div>';
            }
        });
        specsHtml += '</div></div>';
    }

    const schemaProduct = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.brand + ' ' + product.name,
        "image": photoUrl,
        "description": product.desc,
        "sku": firstOption.sku,
        "brand": { "@type": "Brand", "name": product.brand },
        "offers": {
            "@type": "Offer",
            "url": productUrl,
            "priceCurrency": "RUB",
            "price": firstOption.price,
            "availability": firstOption.stock === 'Под заказ' ? "https://schema.org/PreOrder" : "https://schema.org/InStock"
        }
    };

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": categoryName, "item": SITE_URL + "/" + category },
            { "@type": "ListItem", "position": 3, "name": product.name, "item": productUrl }
        ]
    };

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + productUrl + '">\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaProduct) + '</script>\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar(category) + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › <a href="/' + category + '">' + categoryName + '</a> › ' + escapeHtml(product.name) + '</div>\n' +
        '<div class="product-page">\n' +
        '<div class="product-grid">\n' +
        '<div class="product-photo-block">\n' +
        '<img class="product-photo" src="' + photoUrl + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '">\n' +
        '</div>\n' +
        '<div class="product-info-block">\n' +
        '<div class="brand">' + escapeHtml(product.brand) + '</div>\n' +
        '<h1 class="product-title">' + escapeHtml(product.name) + '</h1>\n' +
        '<div class="sku-row">\n' +
        '<div class="sku">Артикул: <span id="sku-value">' + cheapestOpt.sku + '</span></div>\n' +
        '<button class="btn-share" id="btn-share" type="button">\n' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>\n' +
        'Поделиться</button>\n' +
        '</div>\n' +
        '<div class="stock in-stock" id="stock-value">' + escapeHtml(cheapestOpt.stock || 'В наличии') + '</div>\n' +
        '<div class="selectors">' + sizesHtml + colorHtml + glossHtml + '</div>\n' +
        '<div class="price-row">\n' +
        '<div class="price"><span id="price-value">' + formatPrice(cheapestOpt.price) + '</span><span class="currency">₽</span></div>\n' +
        '<button class="btn-cart" id="btn-cart" type="button">В корзину</button>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +
        '<div class="product-desc"><strong>Описание:</strong><br>' + escapeHtml(product.desc) + '</div>\n' +
        specsHtml +
        '<a href="/' + category + '" class="btn-back">← Вернуться в каталог</a>\n' +
        '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderShareModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderProductScript(product, category) + '\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        '</body>\n</html>';
}

// ------------------------------------------------------------
// СКРИПТ страницы товара
// ------------------------------------------------------------
function renderProductScript(product, category) {
    const sizesJson = JSON.stringify(product.sizes || []);
    const productMeta = JSON.stringify({
        brand: product.brand || '',
        name: product.name || '',
        photo: product.photo || ''
    });
    const slug = translit(product.name);

    return `<script>
    (function() {
        var SIZES = ${sizesJson};
        var META = ${productMeta};
        var CATEGORY = ${JSON.stringify(category)};
        var SLUG = ${JSON.stringify(slug)};
        var SITE_URL = ${JSON.stringify(SITE_URL)};

        var sizeSelect = document.getElementById('size-select');
        var colorSelect = document.getElementById('color-select');
        var glossSelect = document.getElementById('gloss-select');
        var priceEl = document.getElementById('price-value');
        var skuEl = document.getElementById('sku-value');
        var stockEl = document.getElementById('stock-value');
        var btnCart = document.getElementById('btn-cart');
        var toast = document.getElementById('toast');

        function fmt(p) { return String(p || 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' '); }

        function findCurrentOption() {
            if (!sizeSelect) return null;
            var si = parseInt(sizeSelect.value) || 0;
            var size = SIZES[si];
            if (!size || !size.options) return null;
            var colorText = colorSelect ? colorSelect.options[colorSelect.selectedIndex].textContent : '';
            var glossText = glossSelect ? glossSelect.options[glossSelect.selectedIndex].textContent : '';
            var found = null;
            for (var i = 0; i < size.options.length; i++) {
                var o = size.options[i];
                var okColor = !o.color || !colorText || o.color === colorText;
                var okGloss = !o.gloss || !glossText || o.gloss === glossText;
                if (okColor && okGloss) { found = o; break; }
            }
            if (!found && size.options.length > 0) found = size.options[0];
            return found;
        }

        function updatePrice() {
            var opt = findCurrentOption();
            if (!opt) return;
            if (priceEl) priceEl.textContent = fmt(opt.price);
            if (skuEl) skuEl.textContent = opt.sku;
            if (stockEl) {
                stockEl.textContent = opt.stock || 'В наличии';
                stockEl.className = 'stock ' + (opt.stock === 'Под заказ' ? 'on-order' : 'in-stock');
            }
            btnCart.dataset.sku = opt.sku;
            btnCart.dataset.price = opt.price;
            btnCart.dataset.color = opt.color || '';
            btnCart.dataset.gloss = opt.gloss || '';
            if (sizeSelect) {
                var sz = SIZES[parseInt(sizeSelect.value)];
                btnCart.dataset.volume = sz ? sz.volume : '';
                btnCart.dataset.fill = sz ? sz.fill : '';
            }

            try {
                var newUrl = '/' + CATEGORY + '/' + SLUG + '--' + opt.sku;
                if (window.location.pathname !== newUrl) {
                    history.pushState({ sku: opt.sku }, '', newUrl);
                }
            } catch (e) {}
        }

        function updateColorOptions() {
            if (!sizeSelect) return;
            var si = parseInt(sizeSelect.value) || 0;
            var size = SIZES[si];
            if (!size || !size.options) return;
            if (colorSelect) {
                var colors = [], seen = {};
                size.options.forEach(function(o) { if (o.color && !seen[o.color]) { seen[o.color] = 1; colors.push(o.color); } });
                if (colors.length > 0) {
                    var prev = colorSelect.value;
                    colorSelect.innerHTML = '';
                    colors.forEach(function(c) { var op = document.createElement('option'); op.textContent = c; colorSelect.appendChild(op); });
                    if (prev && prev < colorSelect.options.length) colorSelect.value = prev;
                }
            }
            if (glossSelect) {
                var glosses = [], seen2 = {};
                size.options.forEach(function(o) { if (o.gloss && !seen2[o.gloss]) { seen2[o.gloss] = 1; glosses.push(o.gloss); } });
                if (glosses.length > 0) {
                    var prev2 = glossSelect.value;
                    glossSelect.innerHTML = '';
                    glosses.forEach(function(g) { var op = document.createElement('option'); op.textContent = g; glossSelect.appendChild(op); });
                    if (prev2 && prev2 < glossSelect.options.length) glossSelect.value = prev2;
                }
            }
        }

        updatePrice();
        if (sizeSelect) sizeSelect.addEventListener('change', function() { updateColorOptions(); updatePrice(); });
        if (colorSelect) colorSelect.addEventListener('change', updatePrice);
        if (glossSelect) glossSelect.addEventListener('change', updatePrice);

        function showToast(msg) {
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 2000);
        }

        if (btnCart) {
            btnCart.addEventListener('click', function() {
                var sku = btnCart.dataset.sku;
                if (!sku) return;
                var cart = window.CMSK_CART.getCart();
                var newItem = {
                    key: sku,
                    brand: META.brand,
                    name: META.name,
                    sku: sku,
                    price: parseInt(btnCart.dataset.price) || 0,
                    color: btnCart.dataset.color || '',
                    gloss: btnCart.dataset.gloss || '',
                    volume: btnCart.dataset.volume || '',
                    fill: btnCart.dataset.fill || '',
                    photo: META.photo,
                    qty: 1,
                    cat: CATEGORY
                };
                var found = null;
                for (var i = 0; i < cart.length; i++) {
                    if (cart[i].key === sku && (cart[i].color || '') === newItem.color && (cart[i].gloss || '') === newItem.gloss) { found = cart[i]; break; }
                }
                if (found) found.qty = (parseInt(found.qty) || 1) + 1;
                else cart.push(newItem);
                window.CMSK_CART.saveCart(cart);
                window.CMSK_CART.updateFabCount();
                window.CMSK_CART.renderCart();
                showToast('Товар добавлен в корзину');
            });
        }

        var shareBtn = document.getElementById('btn-share');
        var shareModalBg = document.getElementById('share-modal-bg');
        var shareModalClose = document.getElementById('share-modal-close');
        var shareUrlInput = document.getElementById('share-url-input');
        var shareCopyBtn = document.getElementById('share-copy-btn');
        var shareTg = document.getElementById('share-tg');
        var shareWa = document.getElementById('share-wa');
        var shareVk = document.getElementById('share-vk');
        var shareOk = document.getElementById('share-ok');
        var shareEm = document.getElementById('share-em');

        function getFullUrl() {
            return SITE_URL.replace(/\\/$/, '') + window.location.pathname;
        }

        function updateShareLinks() {
            var url = getFullUrl();
            var title = META.brand + ' ' + META.name;
            if (shareUrlInput) shareUrlInput.value = url;
            if (shareTg) shareTg.href = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(title);
            if (shareWa) shareWa.href = 'https://wa.me/?text=' + encodeURIComponent(title + ' ' + url);
            if (shareVk) shareVk.href = 'https://vk.com/share.php?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title);
            if (shareOk) shareOk.href = 'https://connect.ok.ru/offer?url=' + encodeURIComponent(url) + '&title=' + encodeURIComponent(title);
            if (shareEm) shareEm.href = 'mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(title + '\\n' + url);
        }

        if (shareBtn) {
            shareBtn.addEventListener('click', function() {
                updateShareLinks();
                shareModalBg.classList.add('open');
            });
        }
        if (shareModalClose) shareModalClose.addEventListener('click', function() { shareModalBg.classList.remove('open'); });
        if (shareModalBg) shareModalBg.addEventListener('click', function(e) { if (e.target === shareModalBg) shareModalBg.classList.remove('open'); });
        if (shareCopyBtn) {
            shareCopyBtn.addEventListener('click', function() {
                var url = getFullUrl();
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(url).then(function() {
                            shareCopyBtn.textContent = 'Скопировано';
                            shareCopyBtn.classList.add('copied');
                            setTimeout(function() {
                                shareCopyBtn.textContent = 'Копировать';
                                shareCopyBtn.classList.remove('copied');
                            }, 1800);
                        });
                    } else {
                        if (shareUrlInput) { shareUrlInput.select(); document.execCommand('copy'); }
                        shareCopyBtn.textContent = 'Скопировано';
                        shareCopyBtn.classList.add('copied');
                        setTimeout(function() {
                            shareCopyBtn.textContent = 'Копировать';
                            shareCopyBtn.classList.remove('copied');
                        }, 1800);
                    }
                } catch (e) {}
            });
        }
    })();
    </script>`;
}
// ============================================================
// === ЧАСТЬ 4 из 5 ===
// ============================================================
// renderCategoryPage + renderCategoryScript
// ============================================================

function renderCategoryPage(category, products) {
    const categoryName = CATEGORIES[category] || category;
    const categoryUrl = SITE_URL + '/' + category;

    const title = categoryName + ' — купить в Москве | КолорМСК';
    const description = 'Купить ' + categoryName.toLowerCase() + ' в Москве с доставкой. Каталог ' + categoryName.toLowerCase() + ' по низким ценам. Оптом и в розницу.';

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": categoryName, "item": categoryUrl }
        ]
    };

    const schemaCollection = {
        "@context": "https://schema.org/",
        "@type": "CollectionPage",
        "name": categoryName,
        "url": categoryUrl,
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": products.length,
            "itemListElement": products.slice(0, 20).map(function(p, idx) {
                const opt = p.sizes && p.sizes[0] && p.sizes[0].options && p.sizes[0].options[0];
                if (!opt) return null;
                const url = SITE_URL + '/' + category + '/' + translit(p.name) + '--' + opt.sku;
                return { "@type": "ListItem", "position": idx + 1, "url": url, "name": p.brand + ' ' + p.name };
            }).filter(Boolean)
        }
    };

    let cardsHtml = '';
    products.forEach(function(product) {
        if (!product.sizes || product.sizes.length === 0) return;

        const cheapest = findCheapestOption(product);
        const cheapestOpt = cheapest.opt;
        const cheapestSizeIdx = cheapest.sizeIdx;
        if (!cheapestOpt) return;

        const productUrl = '/' + category + '/' + translit(product.name) + '--' + cheapestOpt.sku;
        const photoUrl = '/' + (product.photo || 'images/logo.png');

        let sizesOptions = '';
        product.sizes.forEach(function(size, idx) {
            const opt = size.options && size.options[0] || {};
            const selected = idx === cheapestSizeIdx ? ' selected' : '';
            sizesOptions += '<option value="' + idx + '"' + selected + '>' + size.volume + ' — ' + formatPrice(opt.price) + ' ₽</option>';
        });

        let colorOptions = '';
        let colorLabel = '';
        if (product.selectorLabel && product.colors && product.colors.length > 0) {
            colorLabel = product.selectorLabel;
            product.colors.forEach(function(color) {
                const selected = (color === cheapestOpt.color) ? ' selected' : '';
                colorOptions += '<option value="' + escapeHtml(color) + '"' + selected + '>' + escapeHtml(color) + '</option>';
            });
        }

        const shortDesc = (product.desc || '').slice(0, 160) + '...';
        const sizesJson = escapeHtml(JSON.stringify(product.sizes || []));

        cardsHtml += '<div class="cat-card" data-category="' + category + '" data-name="' + escapeHtml(product.name) + '" data-brand="' + escapeHtml(product.brand) + '" data-photo="' + escapeHtml(product.photo) + '" data-sizes="' + sizesJson + '">' +
            '<a href="' + productUrl + '"><img class="cat-card-img" src="' + photoUrl + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '"></a>' +
            '<div class="cat-card-brand">' + escapeHtml(product.brand) + '</div>' +
            '<a class="cat-card-name" href="' + productUrl + '">' + escapeHtml(product.name) + '</a>' +
            '<div class="cat-card-sku">Арт. <span class="cat-card-sku-value">' + cheapestOpt.sku + '</span></div>' +
            '<div class="cat-card-selectors">' +
                '<select class="cat-card-size-select">' + sizesOptions + '</select>' +
                (colorOptions ? '<select class="cat-card-color-select" data-label="' + escapeHtml(colorLabel) + '">' + colorOptions + '</select>' : '') +
            '</div>' +
            '<div class="cat-card-desc">' + escapeHtml(shortDesc) + '</div>' +
            '<div class="cat-card-foot">' +
                '<div class="cat-card-price"><span class="cat-card-price-value">' + formatPrice(cheapestOpt.price) + '</span><span class="currency">₽</span></div>' +
                '<button class="cat-card-buy" type="button" data-sku="' + cheapestOpt.sku + '">В корзину</button>' +
            '</div>' +
        '</div>';
    });

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + categoryUrl + '">\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaCollection) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar(category) + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › ' + escapeHtml(categoryName) + '</div>\n' +
        '<h1 class="page-title">' + escapeHtml(categoryName) + '</h1>\n' +
        '<div class="cat-grid" id="cat-grid">' + cardsHtml + '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCategoryScript(category) + '\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        '</body>\n</html>';
}

function renderCategoryScript(category) {
    return `<script>
    (function() {
        var category = ${JSON.stringify(category)};
        var toast = document.getElementById('toast');

        function fmt(p) { return String(p || 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' '); }
        function showToast(msg) {
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 2000);
        }

        document.querySelectorAll('.cat-card').forEach(function(card) {
            var sizeSel = card.querySelector('.cat-card-size-select');
            var colorSel = card.querySelector('.cat-card-color-select');
            var priceEl = card.querySelector('.cat-card-price-value');
            var skuEl = card.querySelector('.cat-card-sku-value');
            var buyBtn = card.querySelector('.cat-card-buy');

            var SIZES = [];
            try { SIZES = JSON.parse(card.getAttribute('data-sizes') || '[]'); } catch (e) {}

            if (!sizeSel || !buyBtn || SIZES.length === 0) return;

            function findCurrentOption() {
                var si = parseInt(sizeSel.value) || 0;
                var size = SIZES[si];
                if (!size || !size.options) return null;
                var colorText = colorSel ? colorSel.options[colorSel.selectedIndex].textContent : '';
                var found = null;
                for (var i = 0; i < size.options.length; i++) {
                    var o = size.options[i];
                    var okColor = !o.color || !colorText || o.color === colorText;
                    if (okColor) { found = o; break; }
                }
                if (!found && size.options.length > 0) found = size.options[0];
                return found;
            }

            function updateCard() {
                var opt = findCurrentOption();
                if (!opt) return;
                if (priceEl) priceEl.textContent = fmt(opt.price);
                if (skuEl) skuEl.textContent = opt.sku;
                buyBtn.dataset.sku = opt.sku;
                buyBtn.dataset.price = opt.price;
                buyBtn.dataset.color = opt.color || '';
                buyBtn.dataset.volume = (SIZES[parseInt(sizeSel.value)] || {}).volume || '';
                buyBtn.dataset.fill = (SIZES[parseInt(sizeSel.value)] || {}).fill || '';
            }

            function updateColorOptions() {
                var si = parseInt(sizeSel.value) || 0;
                var size = SIZES[si];
                if (!size || !size.options || !colorSel) return;
                var colors = [], seen = {};
                size.options.forEach(function(o) { if (o.color && !seen[o.color]) { seen[o.color] = 1; colors.push(o.color); } });
                if (colors.length > 0) {
                    var prev = colorSel.value;
                    colorSel.innerHTML = '';
                    colors.forEach(function(c) {
                        var op = document.createElement('option');
                        op.value = c;
                        op.textContent = c;
                        colorSel.appendChild(op);
                    });
                    if (prev) colorSel.value = prev;
                }
            }

            sizeSel.addEventListener('change', function() { updateColorOptions(); updateCard(); });
            if (colorSel) colorSel.addEventListener('change', updateCard);

            buyBtn.addEventListener('click', function() {
                var sku = buyBtn.dataset.sku;
                if (!sku) return;
                var price = parseInt(buyBtn.dataset.price) || 0;

                var brandEl = card.querySelector('.cat-card-brand');
                var cart = window.CMSK_CART.getCart();
                var newItem = {
                    key: sku,
                    brand: brandEl ? brandEl.textContent : '',
                    name: card.getAttribute('data-name') || '',
                    sku: sku,
                    price: price,
                    color: buyBtn.dataset.color || '',
                    gloss: '',
                    volume: buyBtn.dataset.volume || '',
                    fill: buyBtn.dataset.fill || '',
                    photo: card.getAttribute('data-photo') || '',
                    qty: 1,
                    cat: category
                };
                var found = null;
                for (var i = 0; i < cart.length; i++) {
                    if (cart[i].key === newItem.key && (cart[i].color || '') === newItem.color) { found = cart[i]; break; }
                }
                if (found) found.qty = (parseInt(found.qty) || 1) + 1;
                else cart.push(newItem);
                window.CMSK_CART.saveCart(cart);
                window.CMSK_CART.updateFabCount();
                window.CMSK_CART.renderCart();
                showToast('Товар добавлен в корзину');
            });
        });
    })();
    </script>`;
}
// ============================================================
// === ЧАСТЬ 5 из 5 ===
// ============================================================
// Роуты + app.listen
// ============================================================

function loadCategory(category) {
    const jsonPath = path.join(ROOT, 'products', category + '.json');
    if (!fs.existsSync(jsonPath)) return null;
    try {
        let content = fs.readFileSync(jsonPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        return JSON.parse(content);
    } catch (e) {
        console.error('Ошибка чтения JSON:', e);
        return null;
    }
}

app.get('/:category/:slug--:sku', (req, res) => {
    const category = req.params.category;
    const sku = req.params.sku;

    if (!CATEGORIES[category]) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }

    const products = loadCategory(category);
    if (!products) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }

    let foundProduct = null, foundOption = null;
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        if (!p.sizes) continue;
        for (let j = 0; j < p.sizes.length; j++) {
            const s = p.sizes[j];
            if (!s.options) continue;
            for (let k = 0; k < s.options.length; k++) {
                if (s.options[k].sku === sku) {
                    foundProduct = p;
                    foundOption = s.options[k];
                    break;
                }
            }
            if (foundOption) break;
        }
        if (foundOption) break;
    }

    if (!foundProduct) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }

    res.send(renderProductPage(category, foundProduct, foundOption));
});

app.get('/:category', (req, res) => {
    const category = req.params.category;
    if (!CATEGORIES[category]) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }
    const products = loadCategory(category);
    if (!products) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }
    res.send(renderCategoryPage(category, products));
});

app.use(express.static(ROOT));

app.use((req, res) => {
    res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
    console.log('SSR-сервер запущен на порту ' + PORT);
});
