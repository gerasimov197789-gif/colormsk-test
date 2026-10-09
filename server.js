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

const BRANDS = {
    'symphony': { name: 'SYMPHONY', match: ['SYMPHONY'] },
    'decotech': { name: 'DecoTech', match: ['DecoTech', 'DecoTech Eco'] },
    'artigiano': { name: 'ARTIGIANO', match: ['ARTIGIANO'] }
};

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

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPrice(price) {
    return String(price || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

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
// ОБЩИЕ КОМПОНЕНТЫ
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

function renderAccountModal() {
    return `<div class="account-modal-bg" id="account-modal-bg">
        <div class="account-modal">
            <div class="account-modal-head">
                <h2 id="account-modal-title">Вход</h2>
                <button class="account-modal-close" id="account-modal-close" type="button" aria-label="Закрыть">×</button>
            </div>
            <div class="account-modal-body">
                <div class="account-tabs">
                    <button type="button" class="account-tab active" data-tab="login">Вход</button>
                    <button type="button" class="account-tab" data-tab="register">Регистрация</button>
                </div>
                <form class="account-form" id="account-form-login">
                    <label class="account-label">Email
                        <input type="email" class="account-input" placeholder="ivan@example.com">
                    </label>
                    <label class="account-label">Пароль
                        <input type="password" class="account-input" placeholder="••••••">
                    </label>
                    <button type="submit" class="account-submit">Войти</button>
                </form>
                <form class="account-form" id="account-form-register" style="display:none;">
                    <label class="account-label">Имя
                        <input type="text" class="account-input" placeholder="Иван Иванов">
                    </label>
                    <label class="account-label">Email
                        <input type="email" class="account-input" placeholder="ivan@example.com">
                    </label>
                    <label class="account-label">Телефон
                        <input type="tel" class="account-input" placeholder="+7 (999) 123-45-67">
                    </label>
                    <label class="account-label">Пароль (минимум 6 символов)
                        <input type="password" class="account-input" placeholder="••••••">
                    </label>
                    <label class="account-label">Повторите пароль
                        <input type="password" class="account-input" placeholder="••••••">
                    </label>
                    <button type="submit" class="account-submit">Зарегистрироваться</button>
                </form>
            </div>
        </div>
    </div>`;
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
// Шапка, сайдбары, футер, стили, счётчики
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
            <div class="t-nav-divider"></div>
            <div class="t-nav-section-title">Хиты продаж</div>
            <div class="hits-sidebar" id="hits-sidebar-grid"></div>
        </nav>
    </aside>`;
}

function renderSidebarRight() {
    return `<aside class="t-sidebar-right">
        <div class="t-sidebar-card">
            <h3>Личный кабинет</h3>
            <div style="display:flex;gap:8px;margin-top:8px;">
                <button type="button" class="t-sidebar-card-btn t-account-open" data-mode="login" style="flex:1;border:none;cursor:pointer;font-family:inherit;">Войти</button>
                <button type="button" class="t-sidebar-card-btn t-account-open" data-mode="register" style="flex:1;border:none;cursor:pointer;font-family:inherit;">Регистрация</button>
            </div>
        </div>
        <div class="t-sidebar-card">
            <h3>Доставка и оплата</h3>
            <p>По Москве и МО — <strong>800 ₽</strong>. Бесплатно от <strong>15 000 ₽</strong>. В регионы — ТК.</p>
            <a href="/dostavka" class="t-sidebar-card-btn">Подробнее о доставке</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Каталоги цветов</h3>
            <p>Более 15 000 оттенков по RAL, NCS, Monicolor.</p>
            <a href="/catalog-colors" class="t-sidebar-card-btn">Перейти в каталог</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Полезная информация</h3>
            <p>Основные сведения о ЛКМ, технологии окраски.</p>
            <a href="/info" class="t-sidebar-card-btn">Читать подробнее</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Оптовые поставки</h3>
            <p>Для строительных организаций и магазинов.</p>
            <a href="/opt" class="t-sidebar-card-btn">Условия опта</a>
        </div>
    </aside>`;
}

function renderFooter() {
    return `<footer class="t-seo-footer">
        <div style="max-width:1200px;margin:0 auto;">
            <h3>Лакокрасочные материалы в Москве — ColorMSK / Колор МСК</h3>
            <p>Магазин лакокрасочных материалов «Колор МСК» предлагает <strong>купить краску, эмаль, лак, грунтовку, антисептик</strong> и декоративные штукатурки в Москве с доставкой. Работаем с розничными и оптовыми покупателями. <strong>Промышленные лакокрасочные материалы — поставщик Москва</strong> — от ведущих производителей: <a href="/brands/symphony">SYMPHONY (Симфония)</a>, <a href="/brands/decotech">DecoTech (Декотек)</a>.</p>
            <p><strong>Купить лакокрасочные материалы оптом в Москве</strong> можно по телефону <a href="tel:+79036692534">+7 (903) 669-25-34</a> или на сайте colormsk.ru. <a href="/opt">Оптовые поставки ЛКМ</a> — для строительных организаций. <a href="/dostavka">Доставка и оплата</a> — по Москве, МО и РФ.</p>
        </div>
    </footer>`;
}

function renderAnalytics() {
    return `<!-- Google Analytics (GA4) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-FLXC5MCL6Q"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-FLXC5MCL6Q');
    </script>
    <!-- Yandex.Metrika counter -->
    <script type="text/javascript">
       (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
       m[i].l=1*new Date();
       for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
       k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
       (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
       ym(111929960, "init", {
            clickmap:true,
            trackLinks:true,
            accurateTrackBounce:true,
            webvisor:true
       });
    </script>
    <noscript><div><img src="https://mc.yandex.ru/watch/111929960" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
    <!-- /Yandex.Metrika counter -->`;
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

        .hits-sidebar { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; padding: 0 10px 10px; }
        .hit-card-mini { display: flex; flex-direction: column; background: #fff; border-radius: 10px; padding: 8px; text-decoration: none; color: #1a2a3a; transition: transform .2s; }
        .hit-card-mini:hover { transform: translateY(-2px); }
        .hit-card-mini img { width: 100%; height: 70px; object-fit: contain; background: #f8faff; border-radius: 6px; margin-bottom: 6px; }
        .hit-card-mini-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        .hit-card-mini-name { font-size: 11px; font-weight: 500; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; color: #1a2a3a; }
        .hit-card-mini-price { font-size: 13px; font-weight: 700; color: #1a2a3a; }

        .account-modal-bg { position: fixed; top: 0; right: 0; bottom: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,.55); z-index: 4700; display: none; align-items: center; justify-content: center; padding: 20px; }
        .account-modal-bg.open { display: flex; }
        .account-modal { background: #fff; border-radius: 16px; width: 100%; max-width: 460px; max-height: 90vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,.3); overflow: hidden; }
        .account-modal-head { display: flex; justify-content: space-between; align-items: center; padding: 18px 24px; border-bottom: 1px solid #eef1f5; }
        .account-modal-head h2 { font-size: 18px; font-weight: 700; color: #1a2a3a; }
        .account-modal-close { background: none; border: none; font-size: 24px; color: #9aaabb; cursor: pointer; padding: 0 6px; line-height: 1; }
        .account-modal-close:hover { color: #1a2a3a; }
        .account-modal-body { padding: 20px 24px 24px; overflow-y: auto; }
        .account-tabs { display: flex; gap: 4px; margin-bottom: 20px; background: #f1f5f9; padding: 4px; border-radius: 10px; }
        .account-tab { flex: 1; padding: 10px; background: transparent; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; color: #6a7a8a; cursor: pointer; font-family: inherit; transition: all .2s; }
        .account-tab.active { background: #fff; color: #1a2a3a; box-shadow: 0 1px 4px rgba(0,0,0,.06); }
        .account-form { display: flex; flex-direction: column; gap: 14px; }
        .account-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #6a7a8a; text-transform: uppercase; letter-spacing: .5px; }
        .account-input { padding: 10px 14px; border: 2px solid #dce3ec; border-radius: 10px; font-size: 14px; background: #fff; color: #1a2a3a; font-family: inherit; outline: none; transition: border-color .2s; }
        .account-input:focus { border-color: #1a2a3a; }
        .account-submit { padding: 12px 24px; background: #1a2a3a; color: #fff; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background .2s; margin-top: 6px; }
        .account-submit:hover { background: #2c3e50; }

        .t-home-title-main { font-size: 28px; font-weight: 700; color: #1a2a3a; margin-bottom: 24px; text-align: center; text-shadow: 0 2px 8px rgba(255,255,255,.8); }
        .t-home-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 30px; }
        .t-home-card { background: rgba(255,255,255,.97); border-radius: 16px; padding: 20px; text-align: center; text-decoration: none; color: #1a2a3a; transition: transform .2s, box-shadow .2s; box-shadow: 0 2px 10px rgba(0,0,0,.05); display: block; }
        .t-home-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,.12); }
        .t-home-image { width: 100%; height: 200px; object-fit: cover; border-radius: 12px; margin-bottom: 12px; display: block; }
        .t-home-title { font-size: 18px; font-weight: 600; color: #1a2a3a; margin-bottom: 4px; display: block; }
        .t-home-desc { font-size: 13px; color: #6a7a8a; display: block; }

        @media (max-width: 1300px) { .cat-grid, .t-home-grid { grid-template-columns: repeat(3, 1fr); } }
        @media (max-width: 1100px) {
            .t-sidebar-right { display: none; }
            .hits-grid { grid-template-columns: repeat(2, 1fr); }
            .cat-grid, .t-home-grid { grid-template-columns: repeat(2, 1fr); }
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
            .cat-grid, .t-home-grid { grid-template-columns: 1fr; }
            .cart-fab-wrap { bottom: 12px; right: 12px; }
        }

        /* --- Информационные страницы (Доставка, Инфо, Каталог цветов, Опт) --- */
        .info-page { background: rgba(255,255,255,.97); border-radius: 14px; padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,.06); max-width: 1000px; margin: 0 auto; }
        .info-page h1 { font-size: 30px; font-weight: 700; color: #1a2a3a; margin-bottom: 8px; }
        .info-page .info-intro { font-size: 15px; color: #6a7a8a; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 2px solid #f0f2f5; }
        .info-page h2 { font-size: 22px; font-weight: 700; color: #1a2a3a; margin: 28px 0 14px; padding-left: 14px; position: relative; }
        .info-page h2::before { content: ''; position: absolute; left: 0; top: 4px; bottom: 4px; width: 4px; background: #2c7a3e; border-radius: 2px; }
        .info-page p { font-size: 15px; color: #4a5a6a; margin: 10px 0; line-height: 1.7; }
        .info-page ul, .info-page ol { margin: 12px 0 12px 22px; font-size: 15px; color: #4a5a6a; }
        .info-page li { margin: 8px 0; line-height: 1.6; }
        .info-page strong { color: #1a2a3a; font-weight: 700; }
        .info-page a { color: #2c6b9e; text-decoration: none; }
        .info-page a:hover { text-decoration: underline; }

        .info-card { background: #f8faff; border-radius: 12px; padding: 20px 24px; margin: 14px 0; border-left: 4px solid #2c6b9e; }
        .info-card h3 { font-size: 17px; font-weight: 700; color: #1a2a3a; margin-bottom: 8px; }
        .info-card p { font-size: 14px; color: #4a5a6a; margin: 6px 0; }

        .info-highlight { background: #eaf4ec; border-radius: 12px; padding: 16px 20px; margin: 14px 0; border-left: 4px solid #2c7a3e; font-size: 14px; color: #1a2a3a; line-height: 1.7; }
        .info-note { background: #fff8e8; border-radius: 12px; padding: 16px 20px; margin: 14px 0; border-left: 4px solid #d4880f; font-size: 14px; color: #1a2a3a; line-height: 1.7; }

        .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
        .info-table th { background: #1a2a3a; color: #fff; padding: 12px 14px; text-align: left; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: .4px; }
        .info-table td { padding: 12px 14px; border-bottom: 1px solid #eef1f5; color: #4a5a6a; background: #fff; }
        .info-table tr:last-child td { border-bottom: none; }
        .info-table tr:hover td { background: #fafbfc; }
        .info-table .info-price { font-weight: 700; color: #1a2a3a; white-space: nowrap; }

        .info-faq { background: #f8faff; border-radius: 16px; padding: 24px 28px; margin: 30px 0 20px; border: 1px solid #eaeef3; }
        .info-faq details { border: 1px solid #eef1f5; border-radius: 10px; padding: 14px 18px; margin-bottom: 10px; background: #fff; }
        .info-faq details summary { font-weight: 600; cursor: pointer; color: #1a2a3a; font-size: 15px; list-style: none; position: relative; padding-right: 24px; }
        .info-faq details summary::after { content: '+'; position: absolute; right: 0; top: 0; font-size: 20px; color: #2c6b9e; font-weight: 400; line-height: 1; }
        .info-faq details[open] summary::after { content: '−'; }
        .info-faq details p { margin-top: 12px; font-size: 14px; color: #4a5a6a; line-height: 1.7; }

        .info-contact { background: linear-gradient(135deg, #f0f8ff, #e8f4f8); border-radius: 14px; padding: 24px 28px; margin: 30px 0; border: 1px solid #d0e4ed; text-align: center; }
        .info-contact h3 { font-size: 20px; font-weight: 700; color: #1a2a3a; margin-bottom: 8px; }
        .info-contact p { font-size: 15px; color: #4a5a6a; margin-bottom: 6px; }
        .info-contact a { color: #2c6b9e; text-decoration: none; font-weight: 600; font-size: 16px; }

        /* --- Каталог цветов --- */
        .color-catalog-page { background: rgba(255,255,255,.97); border-radius: 14px; padding: 32px 40px; box-shadow: 0 2px 12px rgba(0,0,0,.06); max-width: 1200px; margin: 0 auto; }
        .color-catalog-page h1 { font-size: 30px; font-weight: 700; color: #1a2a3a; margin-bottom: 6px; }
        .color-catalog-page .color-subtitle { font-size: 15px; color: #6a7a8a; margin-bottom: 28px; }
        .color-section { background: #fff; border-radius: 16px; padding: 24px 28px; margin-bottom: 30px; border: 1px solid #eaeef3; }
        .color-section h2 { font-size: 22px; color: #1a2a3a; margin-bottom: 6px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .color-section h2 span { font-weight: 400; color: #6a7a8a; font-size: 15px; }
        .color-section .color-subtitle { font-size: 14px; color: #6a7a8a; margin-bottom: 16px; }
        .color-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0 18px; }
        .color-tab { padding: 6px 16px; border-radius: 20px; border: 2px solid #dce3ec; background: transparent; font-size: 13px; font-weight: 600; color: #4a5a6a; cursor: pointer; transition: all .2s; font-family: inherit; }
        .color-tab:hover { border-color: #8a9aaa; background: #f0f4f8; }
        .color-tab.active { border-color: #8d47a1; background: #8d47a1; color: #fff; }
        .color-group { display: none; }
        .color-group.active { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
        .color-item { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-radius: 10px; border: 1px solid #eaedf2; background: #fafcff; transition: transform .2s, box-shadow .2s; cursor: default; }
        .color-item:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,.06); }
        .color-swatch { width: 40px; height: 40px; border-radius: 8px; flex-shrink: 0; border: 1px solid rgba(0,0,0,.08); }
        .color-info { display: flex; flex-direction: column; }
        .color-code { font-weight: 700; font-size: 13px; color: #1a2a3a; }
        .color-name { font-size: 12px; color: #6a7a8a; line-height: 1.3; }
        .color-base { font-size: 11px; background: #e8ecf2; padding: 1px 8px; border-radius: 10px; display: inline-block; margin-top: 2px; color: #4a5a6a; }
        .color-note { font-size: 13px; color: #6a7a8a; background: #f8faff; padding: 12px 16px; border-radius: 10px; border-left: 4px solid #8d47a1; margin: 12px 0 0; }

        @media (max-width: 768px) {
            .color-catalog-page { padding: 20px; }
            .color-section { padding: 16px; }
            .color-group.active { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
            .color-item { padding: 6px 10px; }
            .color-swatch { width: 32px; height: 32px; }
        }
        @media (max-width: 480px) {
            .color-group.active { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
            .color-item { flex-direction: column; align-items: center; text-align: center; padding: 10px; }
            .color-swatch { width: 50px; height: 50px; }
        }

        /* --- Дополнения для страницы "Полезная информация" --- */
        .info-page .info-contents { background: #f8faff; border-radius: 12px; padding: 20px 24px; margin-bottom: 30px; border: 1px solid #eaeef3; }
        .info-page .info-contents h3 { font-size: 18px; font-weight: 700; color: #1a2a3a; margin-bottom: 12px; padding-left: 0; }
        .info-page .info-contents h3::before { display: none; }
        .info-page .info-contents ul { list-style: none; padding: 0; margin: 0; }
        .info-page .info-contents li { padding: 6px 0; border-bottom: 1px solid #f0f2f5; }
        .info-page .info-contents li:last-child { border-bottom: none; }
        .info-page .info-contents a { color: #2c6b9e; text-decoration: none; font-size: 14px; }
        .info-page .info-contents a:hover { color: #1a2a3a; text-decoration: underline; }
        .info-page .info-article { margin-bottom: 36px; padding-bottom: 30px; border-bottom: 2px solid #f0f2f5; }
        .info-page .info-article:last-child { border-bottom: none; }
        .info-page .info-article h3 { font-size: 19px; font-weight: 600; color: #2c3e50; margin: 20px 0 10px; padding-left: 0; }
        .info-page .info-article h3::before { display: none; }
        .info-page .info-article h4 { font-size: 16px; font-weight: 600; color: #2c3e50; margin: 14px 0 8px; }
        .info-page .info-scheme { display: flex; flex-wrap: wrap; gap: 12px; background: #f8faff; border-radius: 12px; padding: 16px; margin: 12px 0; align-items: center; justify-content: center; border-left: 4px solid #2c7a3e; }
        .info-page .info-scheme-item { text-align: center; padding: 8px 12px; font-size: 14px; }
        .info-page .info-scheme-item strong { display: block; font-size: 16px; color: #1a2a3a; margin-bottom: 2px; }
        .info-page .t-product-link { color: #2c6b9e; font-weight: 600; text-decoration: none; border-bottom: 1px dashed #2c6b9e; transition: all .2s; cursor: pointer; }
        .info-page .t-product-link:hover { color: #1a4a6e; border-bottom-style: solid; }
        .info-page .info-shop-link { display: flex; align-items: flex-start; gap: 16px; background: linear-gradient(135deg,#f0f8ff,#e8f4f8); border-radius: 12px; padding: 16px 20px; margin: 20px 0 10px; border: 1px solid #d0e4ed; }
        .info-page .info-shop-icon { font-size: 32px; flex-shrink: 0; }
        .info-page .info-shop-link strong { font-size: 15px; color: #1a2a3a; display: block; margin-bottom: 2px; }
        .info-page .info-shop-link p { font-size: 13px; color: #4a5a6a; margin: 2px 0 10px; }
        .info-page .info-shop-btn { display: inline-block; background: #2c6b9e; color: #fff; padding: 8px 18px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 13px; }
        .info-page .info-shop-btn:hover { background: #1a4a6e; }
        .info-page .info-related { background: #f8faff; border-radius: 16px; padding: 20px 24px; margin: 30px 0 20px; border: 1px solid #eaeef3; }
        .info-page .info-related h3 { font-size: 18px; font-weight: 700; color: #1a2a3a; margin-bottom: 12px; padding-left: 0; }
        .info-page .info-related h3::before { display: none; }
        .info-page .info-related-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .info-page .info-related-link { background: #fff; padding: 6px 14px; border-radius: 20px; font-size: 14px; color: #2c6b9e; text-decoration: none; border: 1px solid #dce3ec; transition: all .2s; }
        .info-page .info-related-link:hover { background: #2c6b9e; color: #fff; border-color: #2c6b9e; }
        .info-page .info-faq-title { font-size: 20px; font-weight: 700; color: #1a2a3a; margin-bottom: 16px; padding-left: 0; }
        .info-page .info-faq-title::before { display: none; }
        .info-page .info-faq-item { border-bottom: 1px solid #eaeef3; padding: 14px 0; }
        .info-page .info-faq-item:last-child { border-bottom: none; }
        .info-page .info-faq-q { font-size: 15px; font-weight: 600; color: #1a2a3a; display: block; margin-bottom: 6px; }
        .info-page .info-faq-a { font-size: 14px; color: #4a5a6a; margin: 0; line-height: 1.7; }

        /* --- Оптовые поставки: карточки и шаги --- */
        .info-page .t-opt-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin: 16px 0; }
        .info-page .t-opt-card { background: #f8faff; border-radius: 12px; padding: 18px 20px; border-left: 4px solid #2c6b9e; }
        .info-page .t-opt-card h3 { font-size: 16px; font-weight: 700; color: #1a2a3a; margin: 0 0 6px; padding: 0; }
        .info-page .t-opt-card h3::before { display: none; }
        .info-page .t-opt-card p { font-size: 14px; color: #4a5a6a; margin: 0; line-height: 1.5; }
        .info-page .t-steps { counter-reset: step; list-style: none; margin: 16px 0; padding: 0; }
        .info-page .t-steps li { counter-increment: step; position: relative; padding: 14px 20px 14px 60px; margin-bottom: 12px; background: #f8faff; border-radius: 12px; border: 1px solid #eaeef3; font-size: 14px; color: #4a5a6a; line-height: 1.6; }
        .info-page .t-steps li::before { content: counter(step); position: absolute; left: 16px; top: 50%; transform: translateY(-50%); width: 32px; height: 32px; border-radius: 50%; background: #2c6b9e; color: #fff; font-weight: 700; font-size: 15px; display: flex; align-items: center; justify-content: center; }
        .info-page .t-steps li strong { color: #1a2a3a; display: block; margin-bottom: 4px; }
        @media (max-width: 700px) {
            .info-page .t-opt-grid { grid-template-columns: 1fr; }
        }

        /* --- Модальное окно товара (для страницы /info) --- */
        .info-product-modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(26,42,58,.65); z-index: 999999; justify-content: center; align-items: center; padding: 20px; overflow-y: auto; }
        .info-product-modal.active { display: flex; }
        .info-product-modal-content { background: #fff; border-radius: 16px; max-width: 760px; width: 100%; max-height: 95vh; overflow-y: auto; padding: 32px; position: relative; box-shadow: 0 24px 64px rgba(0,0,0,.3); }
        .info-product-modal-close { position: absolute; top: 16px; right: 20px; background: transparent; border: none; font-size: 28px; cursor: pointer; color: #9aaabb; line-height: 1; padding: 4px 8px; }
        .info-product-modal-close:hover { color: #1a2a3a; }
        .info-product-modal-brand { font-size: 13px; font-weight: 700; color: #9aaabb; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
        .info-product-modal-name { font-size: 24px; font-weight: 700; color: #1a2a3a; margin: 4px 0 2px; line-height: 1.2; }
        .info-product-modal-sku { font-size: 13px; color: #9aaabb; margin-bottom: 16px; }
        .info-product-modal-grid { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 16px; }
        .info-product-modal-image { flex: 0 0 220px; min-width: 160px; background: #f8faff; border-radius: 12px; border: 1px solid #eaedf2; display: flex; align-items: center; justify-content: center; height: 220px; overflow: hidden; }
        .info-product-modal-image img { width: 100%; height: 100%; object-fit: contain; }
        .info-product-modal-info { flex: 1; min-width: 180px; }
        .info-product-modal-price { font-size: 30px; font-weight: 700; color: #1a2a3a; margin-bottom: 6px; }
        .info-product-modal-stock { font-size: 13px; font-weight: 600; padding: 4px 12px; border-radius: 20px; display: inline-block; margin: 2px 0 12px; }
        .info-product-modal-stock.in-stock { color: #3d7a4a; background: rgba(61,122,74,.12); }
        .info-product-modal-stock.on-order { color: #d4880f; background: rgba(212,136,15,.12); }
        .info-product-modal-description { padding: 14px 18px; background: #fafbfc; border-radius: 12px; border-left: 4px solid #2c7a3e; margin: 12px 0; font-size: 14px; line-height: 1.6; color: #4a5a6a; max-height: 220px; overflow-y: auto; }
        .info-product-modal-tech { padding: 14px 18px; background: #fafbfc; border-radius: 12px; border: 1px solid #eaedf2; margin: 8px 0; font-size: 13px; color: #4a5a6a; line-height: 1.6; }
        .info-product-modal-buy { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding-top: 16px; border-top: 2px solid #eef1f5; margin-top: 12px; }
        .info-product-modal-price-large { font-size: 26px; font-weight: 700; color: #1a2a3a; }
        .info-product-modal-btn { padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; border: none; transition: all .2s; text-decoration: none; display: inline-block; }
        .info-product-modal-btn.buy { background: #1a2a3a; color: #fff; }
        .info-product-modal-btn.buy:hover { background: #2c3e50; }
        .info-product-modal-btn.buy:disabled { background: #9aaabb; cursor: default; }
        .info-product-modal-btn.page { background: #fff; color: #1a2a3a; border: 2px solid #1a2a3a; margin-left: 8px; }
        .info-product-modal-btn.page:hover { background: #f0f4f8; }
        .info-product-modal-loading { text-align: center; padding: 60px; color: #6a7a8a; font-size: 14px; }
        .info-toast { position: fixed; bottom: 30px; right: 30px; background: #1a6a2a; color: #fff; padding: 14px 24px; font-size: 14px; font-weight: 500; border-radius: 10px; z-index: 9999999; box-shadow: 0 8px 24px rgba(0,0,0,.2); transition: opacity .3s; }
        @media (max-width: 700px) {
            .info-page { padding: 20px; }
            .info-page h1 { font-size: 22px; }
            .info-page h2 { font-size: 19px; }
            .info-table th, .info-table td { padding: 8px 10px; font-size: 13px; }
            .info-product-modal-content { padding: 20px; }
            .info-product-modal-grid { flex-direction: column; }
            .info-product-modal-image { flex: none; width: 100%; height: 200px; }
        }
    </style>`;
}


// ============================================================
// === ЧАСТЬ 3 из 5 ===
// ============================================================
// Скрипты клиентские: корзина, хиты, поиск
// ============================================================

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
                if (cartBtnCheckout) cartBtnCheckout.addEventListener('click', function() {
            var t = document.createElement('div');
            t.textContent = 'Оформление заказа — скоро. Позвоните: +7 (903) 669-25-34';
            t.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#1a2a3a;color:#fff;padding:14px 24px;border-radius:10px;font-size:14px;font-weight:600;z-index:999999;box-shadow:0 8px 24px rgba(0,0,0,.3);';
            document.body.appendChild(t);
            setTimeout(function() { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(function(){ t.remove(); }, 300); }, 2500);
        });

        window.CMSK_CART = { getCart: getCart, saveCart: saveCart, updateFabCount: updateFabCount, renderCart: renderCart, cartTotalQty: cartTotalQty, fmt: fmt, buildProductUrl: buildProductUrl };
        updateFabCount();

        // --- Модальное окно личного кабинета ---
        var accModalBg = document.getElementById('account-modal-bg');
        var accModalClose = document.getElementById('account-modal-close');
        var accModalTitle = document.getElementById('account-modal-title');
        var accOpenBtns = document.querySelectorAll('.t-account-open');
        var accTabs = document.querySelectorAll('.account-tab');
        var accFormLogin = document.getElementById('account-form-login');
        var accFormRegister = document.getElementById('account-form-register');

        function accSetTab(mode) {
            if (accModalTitle) accModalTitle.textContent = (mode === 'register') ? 'Регистрация' : 'Вход';
            accTabs.forEach(function(t) {
                if (t.getAttribute('data-tab') === mode) t.classList.add('active');
                else t.classList.remove('active');
            });
            if (accFormLogin) accFormLogin.style.display = (mode === 'register') ? 'none' : 'flex';
            if (accFormRegister) accFormRegister.style.display = (mode === 'register') ? 'flex' : 'none';
        }

        accOpenBtns.forEach(function(b) {
            b.addEventListener('click', function() {
                var mode = b.getAttribute('data-mode') || 'login';
                accSetTab(mode);
                if (accModalBg) accModalBg.classList.add('open');
            });
        });
        accTabs.forEach(function(t) {
            t.addEventListener('click', function() { accSetTab(t.getAttribute('data-tab')); });
        });
        if (accModalClose) accModalClose.addEventListener('click', function() { accModalBg.classList.remove('open'); });
        if (accModalBg) accModalBg.addEventListener('click', function(e) { if (e.target === accModalBg) accModalBg.classList.remove('open'); });
        if (accFormLogin) accFormLogin.addEventListener('submit', function(e) { e.preventDefault(); alert('Вход — функция в разработке.'); });
        if (accFormRegister) accFormRegister.addEventListener('submit', function(e) { e.preventDefault(); alert('Регистрация — функция в разработке.'); });
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

            var sidebarGrid = document.getElementById('hits-sidebar-grid');
            if (sidebarGrid) {
                var htmlMini = '';
                hits.hits.forEach(function(h) {
                    if (!h.product || !h.product.sizes || !h.product.sizes[0]) return;
                    var opt2 = h.product.sizes[0].options && h.product.sizes[0].options[0];
                    if (!opt2) return;
                    var url2 = '/' + h.cat + '/' + slug(h.product.name) + '--' + opt2.sku;
                    htmlMini += '<a class="hit-card-mini" href="' + url2 + '">' +
                        '<img src="/' + h.product.photo + '" alt="">' +
                        '<div class="hit-card-mini-info">' +
                            '<div class="hit-card-mini-name">' + (h.product.name || '') + '</div>' +
                            '<div class="hit-card-mini-price">' + fmt(opt2.price) + ' ₽</div>' +
                        '</div>' +
                    '</a>';
                });
                sidebarGrid.innerHTML = htmlMini;
            }
        } catch (e) {}
    })();
    </script>`;
}

function renderSearchScript() {
    return `<script>
    (function() {
        var input = document.getElementById('t-search-input');
        if (!input) return;
        var results = document.getElementById('t-search-results');
        if (!results) return;
        results.style.cssText = 'position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.25);max-height:480px;overflow-y:auto;z-index:2000;display:none;';

        var searchIndex = null;
        var searchLoading = false;
        var SEARCH_MIN = 2;
        var SEARCH_MAX = 20;

        function translitLocal(str) {
            var map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
            var result = '';
            for (var i = 0; i < str.length; i++) {
                var ch = str[i];
                result += map[ch] || (ch.match(/[a-zA-Z0-9]/) ? ch : '-');
            }
            return result.replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
        }

        async function buildIndex() {
            if (searchIndex) return searchIndex;
            if (searchLoading) { while (searchLoading) await new Promise(function(r){setTimeout(r,100);}); return searchIndex; }
            searchLoading = true;
            var products = [];
            var cats = ['antiseptiki','kraski-interiernye','kraski-fasadnye','laki','gruntovki','dekorativnye-shtukaturki','alkidnye-kraski','rastvoriteli'];
            for (var c = 0; c < cats.length; c++) {
                try {
                    var res = await fetch('/products/' + cats[c] + '.json');
                    if (!res.ok) continue;
                    var data = await res.json();
                    data.forEach(function(p) {
                        if (!p.sizes || !p.sizes[0] || !p.sizes[0].options) return;
                        var opt = p.sizes[0].options[0];
                        products.push({
                            cat: cats[c],
                            name: p.name || '',
                            brand: p.brand || '',
                            sku: opt.sku || '',
                            price: opt.price || 0,
                            photo: p.photo || '',
                            text: ((p.brand || '') + ' ' + (p.name || '') + ' ' + (p.desc || '')).toLowerCase()
                        });
                    });
                } catch (e) {}
            }
            searchIndex = products;
            searchLoading = false;
            return products;
        }

        var timer = null;
        input.addEventListener('input', function() {
            clearTimeout(timer);
            var val = this.value.trim();
            timer = setTimeout(async function() {
                if (val.length < SEARCH_MIN) { results.style.display = 'none'; results.innerHTML = ''; return; }
                results.style.display = 'block';
                results.innerHTML = '<div style="padding:12px;color:#6a7a8a;">Поиск...</div>';
                var index = await buildIndex();
                var q = val.toLowerCase();
                var matches = index.filter(function(p) {
                    return p.name.toLowerCase().indexOf(q) !== -1 || p.brand.toLowerCase().indexOf(q) !== -1 || p.sku.toLowerCase().indexOf(q) !== -1 || p.text.indexOf(q) !== -1;
                }).slice(0, SEARCH_MAX);
                if (matches.length === 0) {
                    results.innerHTML = '<div style="padding:12px;color:#6a7a8a;">Ничего не найдено</div>';
                    return;
                }
                var html = '<div style="padding:8px 12px;font-size:11px;color:#9aaabb;background:#fafbfc;border-bottom:1px solid #f0f4f8;">Найдено: ' + matches.length + '</div>';
                matches.forEach(function(p) {
                    var url = '/' + p.cat + '/' + translitLocal(p.name) + '--' + p.sku;
                    html += '<a href="' + url + '" style="display:flex;gap:12px;padding:12px 16px;text-decoration:none;color:#1a2a3a;border-bottom:1px solid #f4f6f9;align-items:center;">' +
                        '<img src="/' + (p.photo || 'images/logo.png') + '" style="width:52px;height:52px;object-fit:contain;border-radius:8px;background:#f8faff;border:1px solid #eef1f5;">' +
                        '<div style="flex:1;min-width:0;">' +
                        '<div style="font-size:13px;font-weight:600;">' + p.brand + ' ' + p.name + '</div>' +
                        '<div style="font-size:11px;color:#9aaabb;">Арт. ' + p.sku + '</div>' +
                        '</div>' +
                        '<div style="font-size:14px;font-weight:700;">' + p.price.toLocaleString('ru-RU') + ' ₽</div>' +
                        '</a>';
                });
                results.innerHTML = html;
            }, 250);
        });

        document.addEventListener('click', function(e) {
            if (!input.parentElement.contains(e.target)) results.style.display = 'none';
        });
    })();
    </script>`;
}


// ============================================================
// === ЧАСТЬ 4 из 5 ===
// ============================================================
// renderShareModal, renderHomePage, renderProductPage, renderProductScript
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

function renderHomePage() {
    const homeUrl = SITE_URL + '/';
    const title = 'Лакокрасочные материалы для дома и бизнеса — купить в Москве | КолорМСК';
    const description = 'Магазин лакокрасочных материалов в Москве. Купить краску, эмаль, лак, грунтовку с доставкой. Оптом и в розницу. SYMPHONY (Симфония), DecoTech (Декотек). ColorMSK / Колор МСК.';

    const schemaOrganization = {
        "@context": "https://schema.org/",
        "@type": "Organization",
        "name": "КолорМСК",
        "url": SITE_URL,
        "logo": SITE_URL + "/images/logo.png",
        "description": description
    };

    const homeCards = [
        { slug: 'antiseptiki', title: 'Антисептики', desc: 'Защита древесины', img: 'cat-antiseptiki.jpg' },
        { slug: 'kraski-interiernye', title: 'Краски интерьерные', desc: 'Для стен и потолков', img: 'cat-kraski-interiernye.jpg' },
        { slug: 'kraski-fasadnye', title: 'Краски фасадные', desc: 'Для наружных работ', img: 'cat-kraski-fasadnye.jpg' },
        { slug: 'laki', title: 'Лаки', desc: 'Защита и блеск', img: 'cat-laki.jpg' },
        { slug: 'gruntovki', title: 'Грунтовки и Шпатлевки', desc: 'Подготовка поверхности', img: 'cat-gruntovki.jpg' },
        { slug: 'dekorativnye-shtukaturki', title: 'Декоративные штукатурки', desc: 'Для создания фактур', img: 'cat-dekorativnye.jpg' },
        { slug: 'alkidnye-kraski', title: 'Эмали', desc: 'Для металла и дерева', img: 'cat-emali.jpg' },
        { slug: 'rastvoriteli', title: 'Растворители', desc: 'Для красок и лаков', img: 'cat-rastvoriteli.jpg' }
    ];

    let cardsHtml = '';
    homeCards.forEach(function(c) {
        cardsHtml += '<a class="t-home-card" href="/' + c.slug + '">' +
            '<img class="t-home-image" src="/images/' + c.img + '" alt="' + escapeHtml(c.title) + '" loading="lazy" onerror="this.src=\'/images/logo.png\'">' +
            '<span class="t-home-title">' + escapeHtml(c.title) + '</span>' +
            '<span class="t-home-desc">' + escapeHtml(c.desc) + '</span>' +
        '</a>';
    });

    const schemaItemList = {
        "@context": "https://schema.org/",
        "@type": "ItemList",
        "itemListElement": homeCards.map(function(c, idx) {
            return { "@type": "ListItem", "position": idx + 1, "url": SITE_URL + '/' + c.slug, "name": c.title };
        })
    };

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + homeUrl + '">\n' +
        renderAnalytics() + '\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaOrganization) + '</script>\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaItemList) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar('') + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<h1 class="t-home-title-main">Лакокрасочные материалы для дома и бизнеса — купить в Москве</h1>\n' +
        '<div class="t-home-grid">\n' + cardsHtml + '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        '</body>\n</html>';
}

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
        renderAnalytics() + '\n' +
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
        renderAccountModal() + '\n' +
        renderShareModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderProductScript(product, category) + '\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        '</body>\n</html>';
}

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
// === ЧАСТЬ 5 из 5 ===
// ============================================================
// renderCatalogColorsPage, renderCatalogScript, renderDeliveryPage,
// renderInfoPage, renderOptPage, renderInfoProductModalScript,
// renderCategoryPage, renderCategoryScript, renderBrandPage, роуты
// ============================================================

// ============================================================
// СТРАНИЦА: КАТАЛОГ ЦВЕТОВ
// ============================================================
function renderCatalogColorsPage() {
    const pageUrl = SITE_URL + '/catalog-colors';
    const title = 'Каталоги цветов RAL, NCS, Symphony — КолорМСК';
    const description = 'Каталоги цветов для колеровки краски: RAL Classic, Tikkurila Symphony (OPUS I-II), NCS, Monicolor. Более 15 000 оттенков.';

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": "Каталог цветов", "item": pageUrl }
        ]
    };

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + pageUrl + '">\n' +
        renderAnalytics() + '\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar('') + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › Каталог цветов</div>\n' +
        '<div class="color-catalog-page">\n' +
        '<h1>Каталог цветов</h1>\n' +
        '<p class="color-subtitle">Более 15 000 оттенков по каталогам RAL, Tikkurila Symphony (OPUS I-II), NCS, Monicolor и другим</p>\n' +

        '<div class="color-section">\n' +
        '<h2>RAL <span>— Классический каталог цветов</span></h2>\n' +
        '<p class="color-subtitle">Более 200 стандартизированных цветов. <strong>База A</strong> — для пастельных, <strong>База C</strong> — для ярких.</p>\n' +
        '<div class="color-tabs">\n' +
        '<button class="color-tab active" data-group="ral-all" onclick="switchGroup(\'ral-all\', this)">Все</button>\n' +
        '<button class="color-tab" data-group="ral-yellow" onclick="switchGroup(\'ral-yellow\', this)">Жёлтые</button>\n' +
        '<button class="color-tab" data-group="ral-orange" onclick="switchGroup(\'ral-orange\', this)">Оранжевые</button>\n' +
        '<button class="color-tab" data-group="ral-red" onclick="switchGroup(\'ral-red\', this)">Красные</button>\n' +
        '<button class="color-tab" data-group="ral-violet" onclick="switchGroup(\'ral-violet\', this)">Фиолетовые</button>\n' +
        '<button class="color-tab" data-group="ral-blue" onclick="switchGroup(\'ral-blue\', this)">Синие</button>\n' +
        '<button class="color-tab" data-group="ral-green" onclick="switchGroup(\'ral-green\', this)">Зелёные</button>\n' +
        '<button class="color-tab" data-group="ral-grey" onclick="switchGroup(\'ral-grey\', this)">Серые</button>\n' +
        '<button class="color-tab" data-group="ral-brown" onclick="switchGroup(\'ral-brown\', this)">Коричневые</button>\n' +
        '<button class="color-tab" data-group="ral-white" onclick="switchGroup(\'ral-white\', this)">Белые</button>\n' +
        '<button class="color-tab" data-group="ral-black" onclick="switchGroup(\'ral-black\', this)">Чёрные</button>\n' +
        '</div>\n' +
        '<div id="ral-all" class="color-group active"></div>\n' +
        '<div id="ral-yellow" class="color-group"></div>\n' +
        '<div id="ral-orange" class="color-group"></div>\n' +
        '<div id="ral-red" class="color-group"></div>\n' +
        '<div id="ral-violet" class="color-group"></div>\n' +
        '<div id="ral-blue" class="color-group"></div>\n' +
        '<div id="ral-green" class="color-group"></div>\n' +
        '<div id="ral-grey" class="color-group"></div>\n' +
        '<div id="ral-brown" class="color-group"></div>\n' +
        '<div id="ral-white" class="color-group"></div>\n' +
        '<div id="ral-black" class="color-group"></div>\n' +
        '<div class="color-note">Цветопередача монитора может искажать оттенки.</div>\n' +
        '</div>\n' +

        '<div class="color-section">\n' +
        '<h2>Tikkurila Symphony <span>— OPUS I-II (2 436 оттенков)</span></h2>\n' +
        '<p class="color-subtitle"><strong>База A</strong> — для пастельных, <strong>База C</strong> — для ярких цветов.</p>\n' +
        '<div class="color-tabs">\n' +
        '<button class="color-tab active" data-group="sym-all" onclick="switchGroup(\'sym-all\', this)">Все</button>\n' +
        '<button class="color-tab" data-group="sym-yellow" onclick="switchGroup(\'sym-yellow\', this)">Жёлтые</button>\n' +
        '<button class="color-tab" data-group="sym-beige" onclick="switchGroup(\'sym-beige\', this)">Бежевые</button>\n' +
        '<button class="color-tab" data-group="sym-brown" onclick="switchGroup(\'sym-brown\', this)">Коричневые</button>\n' +
        '<button class="color-tab" data-group="sym-red" onclick="switchGroup(\'sym-red\', this)">Красные</button>\n' +
        '<button class="color-tab" data-group="sym-pink" onclick="switchGroup(\'sym-pink\', this)">Розовые</button>\n' +
        '<button class="color-tab" data-group="sym-violet" onclick="switchGroup(\'sym-violet\', this)">Фиолетовые</button>\n' +
        '<button class="color-tab" data-group="sym-blue" onclick="switchGroup(\'sym-blue\', this)">Синие</button>\n' +
        '<button class="color-tab" data-group="sym-green" onclick="switchGroup(\'sym-green\', this)">Зелёные</button>\n' +
        '<button class="color-tab" data-group="sym-warm" onclick="switchGroup(\'sym-warm\', this)">Тёплые</button>\n' +
        '<button class="color-tab" data-group="sym-cold" onclick="switchGroup(\'sym-cold\', this)">Холодные</button>\n' +
        '</div>\n' +
        '<div id="sym-all" class="color-group active"></div>\n' +
        '<div id="sym-yellow" class="color-group"></div>\n' +
        '<div id="sym-beige" class="color-group"></div>\n' +
        '<div id="sym-brown" class="color-group"></div>\n' +
        '<div id="sym-red" class="color-group"></div>\n' +
        '<div id="sym-pink" class="color-group"></div>\n' +
        '<div id="sym-violet" class="color-group"></div>\n' +
        '<div id="sym-blue" class="color-group"></div>\n' +
        '<div id="sym-green" class="color-group"></div>\n' +
        '<div id="sym-warm" class="color-group"></div>\n' +
        '<div id="sym-cold" class="color-group"></div>\n' +
        '<div class="color-note">Цветопередача монитора может искажать оттенки.</div>\n' +
        '</div>\n' +

        '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCatalogScript() + '\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        '</body>\n</html>';
}

// ============================================================
// КЛИЕНТСКИЙ СКРИПТ КАТАЛОГА ЦВЕТОВ
// ============================================================
function renderCatalogScript() {
    return `<script>
    function switchGroup(groupId, btn) {
        var section = btn.closest('.color-section');
        var groups = section.querySelectorAll('.color-group');
        for (var i = 0; i < groups.length; i++) groups[i].classList.remove('active');
        var target = document.getElementById(groupId);
        if (target) target.classList.add('active');
        var tabs = section.querySelectorAll('.color-tab');
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        if (btn) btn.classList.add('active');
    }

    var ralColors = [
        {code:'RAL 1000',name:'Зеленовато-бежевый',group:'ral-yellow'},{code:'RAL 1001',name:'Бежевый',group:'ral-yellow'},
        {code:'RAL 1002',name:'Песочно-жёлтый',group:'ral-yellow'},{code:'RAL 1003',name:'Сигнальный жёлтый',group:'ral-yellow'},
        {code:'RAL 1004',name:'Золотисто-жёлтый',group:'ral-yellow'},{code:'RAL 1005',name:'Медово-жёлтый',group:'ral-yellow'},
        {code:'RAL 1006',name:'Кукурузно-жёлтый',group:'ral-yellow'},{code:'RAL 1007',name:'Нарцисс',group:'ral-yellow'},
        {code:'RAL 1011',name:'Коричнево-бежевый',group:'ral-yellow'},{code:'RAL 1012',name:'Лимонно-жёлтый',group:'ral-yellow'},
        {code:'RAL 1013',name:'Белая устрица',group:'ral-yellow'},{code:'RAL 1014',name:'Слоновая кость',group:'ral-yellow'},
        {code:'RAL 1015',name:'Светлая слоновая кость',group:'ral-yellow'},{code:'RAL 1016',name:'Зеленовато-жёлтый',group:'ral-yellow'},
        {code:'RAL 1017',name:'Шафрановый',group:'ral-yellow'},{code:'RAL 1018',name:'Цинковый жёлтый',group:'ral-yellow'},
        {code:'RAL 1019',name:'Серо-бежевый',group:'ral-yellow'},{code:'RAL 1020',name:'Оливково-жёлтый',group:'ral-yellow'},
        {code:'RAL 1021',name:'Грязно-жёлтый',group:'ral-yellow'},{code:'RAL 1023',name:'Транспортный жёлтый',group:'ral-yellow'},
        {code:'RAL 1024',name:'Жёлтая охра',group:'ral-yellow'},{code:'RAL 1026',name:'Лимонно-жёлтый',group:'ral-yellow'},
        {code:'RAL 1027',name:'Карри',group:'ral-yellow'},{code:'RAL 1028',name:'Дынно-жёлтый',group:'ral-yellow'},
        {code:'RAL 1032',name:'Щёточно-жёлтый',group:'ral-yellow'},{code:'RAL 1033',name:'Жёлтый георгин',group:'ral-yellow'},
        {code:'RAL 1034',name:'Пастельный жёлтый',group:'ral-yellow'},
        {code:'RAL 2000',name:'Жёлто-оранжевый',group:'ral-orange'},{code:'RAL 2001',name:'Красно-оранжевый',group:'ral-orange'},
        {code:'RAL 2002',name:'Ярко-красный',group:'ral-orange'},{code:'RAL 2003',name:'Пастельный оранжевый',group:'ral-orange'},
        {code:'RAL 2004',name:'Чистый оранжевый',group:'ral-orange'},{code:'RAL 2005',name:'Светящийся оранжевый',group:'ral-orange'},
        {code:'RAL 2007',name:'Светящийся светлый',group:'ral-orange'},{code:'RAL 2008',name:'Ярко-красно-оранжевый',group:'ral-orange'},
        {code:'RAL 2009',name:'Транспортный оранжевый',group:'ral-orange'},{code:'RAL 2010',name:'Сигнальный оранжевый',group:'ral-orange'},
        {code:'RAL 2011',name:'Глубокий оранжевый',group:'ral-orange'},{code:'RAL 2012',name:'Оранжево-розовый',group:'ral-orange'},
        {code:'RAL 3000',name:'Огненно-красный',group:'ral-red'},{code:'RAL 3001',name:'Сигнальный красный',group:'ral-red'},
        {code:'RAL 3002',name:'Красный кармин',group:'ral-red'},{code:'RAL 3003',name:'Рубиновый',group:'ral-red'},
        {code:'RAL 3004',name:'Пурпурный',group:'ral-red'},{code:'RAL 3005',name:'Красное вино',group:'ral-red'},
        {code:'RAL 3007',name:'Тёмно-красный',group:'ral-red'},{code:'RAL 3009',name:'Оксидно-красный',group:'ral-red'},
        {code:'RAL 3011',name:'Красно-коричневый',group:'ral-red'},{code:'RAL 3012',name:'Бежево-красный',group:'ral-red'},
        {code:'RAL 3013',name:'Томатно-красный',group:'ral-red'},{code:'RAL 3014',name:'Антично-розовый',group:'ral-red'},
        {code:'RAL 3015',name:'Светло-розовый',group:'ral-red'},{code:'RAL 3016',name:'Кораллово-красный',group:'ral-red'},
        {code:'RAL 3017',name:'Розовый',group:'ral-red'},{code:'RAL 3018',name:'Клубнично-красный',group:'ral-red'},
        {code:'RAL 3020',name:'Транспортный красный',group:'ral-red'},{code:'RAL 3022',name:'Розово-оранжевый',group:'ral-red'},
        {code:'RAL 3024',name:'Светящийся красный',group:'ral-red'},{code:'RAL 3026',name:'Светящийся светло-красный',group:'ral-red'},
        {code:'RAL 3027',name:'Малиновый',group:'ral-red'},{code:'RAL 3031',name:'Красный',group:'ral-red'},
        {code:'RAL 4001',name:'Красно-сиреневый',group:'ral-violet'},{code:'RAL 4002',name:'Красно-лиловый',group:'ral-violet'},
        {code:'RAL 4003',name:'Лиловый вереск',group:'ral-violet'},{code:'RAL 4004',name:'Лилово-бордовый',group:'ral-violet'},
        {code:'RAL 4005',name:'Сине-сиреневый',group:'ral-violet'},{code:'RAL 4006',name:'Транспортный пурпурный',group:'ral-violet'},
        {code:'RAL 4007',name:'Лилово-бордовый',group:'ral-violet'},{code:'RAL 4008',name:'Сигнальный фиолетовый',group:'ral-violet'},
        {code:'RAL 4009',name:'Пастельный фиолетовый',group:'ral-violet'},{code:'RAL 4010',name:'Telemagenta',group:'ral-violet'},
        {code:'RAL 5000',name:'Лилово-синий',group:'ral-blue'},{code:'RAL 5001',name:'Зеленовато-синий',group:'ral-blue'},
        {code:'RAL 5002',name:'Ультрамариново-синий',group:'ral-blue'},{code:'RAL 5003',name:'Сапфирово-синий',group:'ral-blue'},
        {code:'RAL 5004',name:'Чёрно-синий',group:'ral-blue'},{code:'RAL 5005',name:'Сигнальный синий',group:'ral-blue'},
        {code:'RAL 5007',name:'Бриллиантово-синий',group:'ral-blue'},{code:'RAL 5008',name:'Серо-синий',group:'ral-blue'},
        {code:'RAL 5009',name:'Азурово-синий',group:'ral-blue'},{code:'RAL 5010',name:'Генцианово-синий',group:'ral-blue'},
        {code:'RAL 5011',name:'Синий стальной',group:'ral-blue'},{code:'RAL 5012',name:'Голубой',group:'ral-blue'},
        {code:'RAL 5013',name:'Кобальтово-синий',group:'ral-blue'},{code:'RAL 5014',name:'Голубинно-синий',group:'ral-blue'},
        {code:'RAL 5015',name:'Небесно-голубой',group:'ral-blue'},{code:'RAL 5017',name:'Синий транспортный',group:'ral-blue'},
        {code:'RAL 5018',name:'Сине-бирюзовый',group:'ral-blue'},{code:'RAL 5019',name:'Причудливо-синий',group:'ral-blue'},
        {code:'RAL 5020',name:'Океаново-синий',group:'ral-blue'},{code:'RAL 5021',name:'Водянисто-синий',group:'ral-blue'},
        {code:'RAL 5022',name:'Синий ночной',group:'ral-blue'},{code:'RAL 5023',name:'Слабовато-синий',group:'ral-blue'},
        {code:'RAL 5024',name:'Синий пастельный',group:'ral-blue'},
        {code:'RAL 6000',name:'Патиново-зелёный',group:'ral-green'},{code:'RAL 6001',name:'Изумрудная зелень',group:'ral-green'},
        {code:'RAL 6002',name:'Зелёный лист',group:'ral-green'},{code:'RAL 6003',name:'Оливково-зелёный',group:'ral-green'},
        {code:'RAL 6004',name:'Сине-зелёный',group:'ral-green'},{code:'RAL 6005',name:'Зелёный плетёный',group:'ral-green'},
        {code:'RAL 6006',name:'Синяя оливка',group:'ral-green'},{code:'RAL 6007',name:'Зелёный бутылочный',group:'ral-green'},
        {code:'RAL 6008',name:'Коричнево-зелёный',group:'ral-green'},{code:'RAL 6009',name:'Зелёная ель',group:'ral-green'},
        {code:'RAL 6010',name:'Зелёный травянистый',group:'ral-green'},{code:'RAL 6011',name:'Резеда',group:'ral-green'},
        {code:'RAL 6012',name:'Чёрно-зелёный',group:'ral-green'},{code:'RAL 6013',name:'Зелёное бердо',group:'ral-green'},
        {code:'RAL 6014',name:'Жёлто-оливковый',group:'ral-green'},{code:'RAL 6015',name:'Чёрно-оливковый',group:'ral-green'},
        {code:'RAL 6016',name:'Черепаший зелёный',group:'ral-green'},{code:'RAL 6017',name:'Жёлто-зелёный',group:'ral-green'},
        {code:'RAL 6018',name:'Майская зелень',group:'ral-green'},{code:'RAL 6019',name:'Пастельный зелёный',group:'ral-green'},
        {code:'RAL 6020',name:'Хромовый зелёный',group:'ral-green'},{code:'RAL 6021',name:'Бледно-зелёный',group:'ral-green'},
        {code:'RAL 6022',name:'Olive drab',group:'ral-green'},{code:'RAL 6024',name:'Транспортный зелёный',group:'ral-green'},
        {code:'RAL 6025',name:'Fern green',group:'ral-green'},{code:'RAL 6026',name:'Опалово-зелёный',group:'ral-green'},
        {code:'RAL 6027',name:'Светло-зелёный',group:'ral-green'},{code:'RAL 6028',name:'Зелёная хвоя',group:'ral-green'},
        {code:'RAL 6029',name:'Мятно-зелёный',group:'ral-green'},{code:'RAL 6032',name:'Сигнальный зелёный',group:'ral-green'},
        {code:'RAL 6033',name:'Мятный черепаший',group:'ral-green'},{code:'RAL 6034',name:'Пастельно-черепаший',group:'ral-green'},
        {code:'RAL 7000',name:'Серая белка',group:'ral-grey'},{code:'RAL 7001',name:'Серебристо-серый',group:'ral-grey'},
        {code:'RAL 7002',name:'Оливково-серый',group:'ral-grey'},{code:'RAL 7003',name:'Плетёный серый',group:'ral-grey'},
        {code:'RAL 7004',name:'Сигнальный серый',group:'ral-grey'},{code:'RAL 7005',name:'Мышиный серый',group:'ral-grey'},
        {code:'RAL 7006',name:'Бежево-серый',group:'ral-grey'},{code:'RAL 7008',name:'Защитно-серый',group:'ral-grey'},
        {code:'RAL 7009',name:'Зеленовато-серый',group:'ral-grey'},{code:'RAL 7010',name:'Брезентовый серый',group:'ral-grey'},
        {code:'RAL 7011',name:'Железный серый',group:'ral-grey'},{code:'RAL 7012',name:'Базальтовый серый',group:'ral-grey'},
        {code:'RAL 7013',name:'Коричнево-серый',group:'ral-grey'},{code:'RAL 7015',name:'Шиферный серый',group:'ral-grey'},
        {code:'RAL 7016',name:'Антрацитовый серый',group:'ral-grey'},{code:'RAL 7021',name:'Чёрно-серый',group:'ral-grey'},
        {code:'RAL 7022',name:'Серый с тенью',group:'ral-grey'},{code:'RAL 7023',name:'Ярко-серый',group:'ral-grey'},
        {code:'RAL 7024',name:'Графитовый серый',group:'ral-grey'},{code:'RAL 7026',name:'Гранитовый серый',group:'ral-grey'},
        {code:'RAL 7030',name:'Каменный серый',group:'ral-grey'},{code:'RAL 7031',name:'Голубовато-серый',group:'ral-grey'},
        {code:'RAL 7032',name:'Галечный серый',group:'ral-grey'},{code:'RAL 7033',name:'Цементный серый',group:'ral-grey'},
        {code:'RAL 7034',name:'Желтовато-серый',group:'ral-grey'},{code:'RAL 7035',name:'Светло-серый',group:'ral-grey'},
        {code:'RAL 7036',name:'Платиновый серый',group:'ral-grey'},{code:'RAL 7037',name:'Пыльный серый',group:'ral-grey'},
        {code:'RAL 7038',name:'Серый шрифт',group:'ral-grey'},{code:'RAL 7039',name:'Кварцевый серый',group:'ral-grey'},
        {code:'RAL 7040',name:'Оконный серый',group:'ral-grey'},{code:'RAL 7042',name:'Транспортный серый A',group:'ral-grey'},
        {code:'RAL 7043',name:'Транспортный серый B',group:'ral-grey'},{code:'RAL 7044',name:'Шелковый серый',group:'ral-grey'},
        {code:'RAL 7045',name:'Telegrey 1',group:'ral-grey'},{code:'RAL 7046',name:'Telegrey 2',group:'ral-grey'},
        {code:'RAL 7047',name:'Telegrey 4',group:'ral-grey'},
        {code:'RAL 8000',name:'Зеленовато-коричневый',group:'ral-brown'},{code:'RAL 8001',name:'Коричневая охра',group:'ral-brown'},
        {code:'RAL 8002',name:'Сигнальный коричневый',group:'ral-brown'},{code:'RAL 8003',name:'Глиняный коричневый',group:'ral-brown'},
        {code:'RAL 8004',name:'Медно-коричневый',group:'ral-brown'},{code:'RAL 8007',name:'Коричневый',group:'ral-brown'},
        {code:'RAL 8008',name:'Оливково-коричневый',group:'ral-brown'},{code:'RAL 8011',name:'Орехово-коричневый',group:'ral-brown'},
        {code:'RAL 8012',name:'Красно-коричневый',group:'ral-brown'},{code:'RAL 8014',name:'Коричневая сепия',group:'ral-brown'},
        {code:'RAL 8015',name:'Коричневая скорлупа',group:'ral-brown'},{code:'RAL 8016',name:'Махагон',group:'ral-brown'},
        {code:'RAL 8017',name:'Шоколадно-коричневый',group:'ral-brown'},{code:'RAL 8019',name:'Серо-коричневый',group:'ral-brown'},
        {code:'RAL 8022',name:'Чёрно-коричневый',group:'ral-brown'},{code:'RAL 8023',name:'Оранжево-коричневый',group:'ral-brown'},
        {code:'RAL 8024',name:'Бежево-коричневый',group:'ral-brown'},{code:'RAL 8025',name:'Бледно-коричневый',group:'ral-brown'},
        {code:'RAL 8028',name:'Земельно-коричневый',group:'ral-brown'},
        {code:'RAL 9001',name:'Кремовый',group:'ral-white'},{code:'RAL 9002',name:'Серо-белый',group:'ral-white'},
        {code:'RAL 9003',name:'Сигнальный белый',group:'ral-white'},{code:'RAL 9010',name:'Чистый белый',group:'ral-white'},
        {code:'RAL 9016',name:'Транспортный белый',group:'ral-white'},{code:'RAL 9018',name:'Папирусно-белый',group:'ral-white'},
        {code:'RAL 9004',name:'Сигнальный чёрный',group:'ral-black'},{code:'RAL 9005',name:'Чёрный реактивный',group:'ral-black'},
        {code:'RAL 9006',name:'Алюминиево-белый',group:'ral-black'},{code:'RAL 9007',name:'Алюминиево-серый',group:'ral-black'},
        {code:'RAL 9011',name:'Графитовый чёрный',group:'ral-black'},{code:'RAL 9017',name:'Транспортный чёрный',group:'ral-black'}
    ];

    var symphonyColors = [
        {code:'S0101-A',name:'Бледно-жёлтый',group:'sym-yellow',base:'A'},{code:'S0102-A',name:'Соломенный',group:'sym-yellow',base:'A'},
        {code:'S0103-A',name:'Светлый соломенный',group:'sym-yellow',base:'A'},{code:'S0104-A',name:'Золотистый соломенный',group:'sym-yellow',base:'A'},
        {code:'S0105-A',name:'Тёплый жёлтый',group:'sym-yellow',base:'A'},{code:'S0106-A',name:'Медовый',group:'sym-yellow',base:'A'},
        {code:'S0107-A',name:'Янтарный',group:'sym-yellow',base:'A'},{code:'S0108-C',name:'Яркий янтарный',group:'sym-yellow',base:'C'},
        {code:'S0201-A',name:'Светлый лимон',group:'sym-yellow',base:'A'},{code:'S0202-A',name:'Лимонный',group:'sym-yellow',base:'A'},
        {code:'S0203-C',name:'Яркий лимон',group:'sym-yellow',base:'C'},{code:'S0204-C',name:'Насыщенный лимон',group:'sym-yellow',base:'C'},
        {code:'S0301-A',name:'Светлая кукуруза',group:'sym-yellow',base:'A'},{code:'S0302-A',name:'Кукурузный',group:'sym-yellow',base:'A'},
        {code:'S0303-C',name:'Яркий кукурузный',group:'sym-yellow',base:'C'},{code:'S0304-C',name:'Золотой кукурузный',group:'sym-yellow',base:'C'},
        {code:'S0401-A',name:'Светлое золото',group:'sym-yellow',base:'A'},{code:'S0402-A',name:'Золотистый',group:'sym-yellow',base:'A'},
        {code:'S0403-C',name:'Яркое золото',group:'sym-yellow',base:'C'},{code:'S0404-C',name:'Насыщенное золото',group:'sym-yellow',base:'C'},
        {code:'S0501-A',name:'Светлый оранжевый',group:'sym-yellow',base:'A'},{code:'S0502-A',name:'Оранжевый',group:'sym-yellow',base:'A'},
        {code:'S0503-C',name:'Яркий оранжевый',group:'sym-yellow',base:'C'},{code:'S0504-C',name:'Насыщенный оранжевый',group:'sym-yellow',base:'C'},
        {code:'S0601-A',name:'Морковный',group:'sym-yellow',base:'A'},{code:'S0602-A',name:'Тёплый морковный',group:'sym-yellow',base:'A'},
        {code:'S0603-C',name:'Яркий морковный',group:'sym-yellow',base:'C'},{code:'S0604-C',name:'Насыщенный морковный',group:'sym-yellow',base:'C'},
        {code:'S1001-A',name:'Нежный бежевый',group:'sym-beige',base:'A'},{code:'S1002-A',name:'Светлый бежевый',group:'sym-beige',base:'A'},
        {code:'S1003-A',name:'Бежевый',group:'sym-beige',base:'A'},{code:'S1004-A',name:'Тёплый бежевый',group:'sym-beige',base:'A'},
        {code:'S1005-A',name:'Насыщенный бежевый',group:'sym-beige',base:'A'},{code:'S1006-A',name:'Кремовый',group:'sym-beige',base:'A'},
        {code:'S1007-A',name:'Светлый кремовый',group:'sym-beige',base:'A'},{code:'S1101-A',name:'Песочный',group:'sym-beige',base:'A'},
        {code:'S1102-A',name:'Светлый песочный',group:'sym-beige',base:'A'},{code:'S1103-A',name:'Тёплый песочный',group:'sym-beige',base:'A'},
        {code:'S1104-A',name:'Насыщенный песочный',group:'sym-beige',base:'A'},{code:'S1201-A',name:'Светлая охра',group:'sym-beige',base:'A'},
        {code:'S1202-A',name:'Охра',group:'sym-beige',base:'A'},{code:'S1203-A',name:'Тёплая охра',group:'sym-beige',base:'A'},
        {code:'S1204-A',name:'Насыщенная охра',group:'sym-beige',base:'A'},{code:'S1301-A',name:'Слоновая кость',group:'sym-beige',base:'A'},
        {code:'S1302-A',name:'Тёплая слоновая кость',group:'sym-beige',base:'A'},{code:'S1303-A',name:'Насыщенная слоновая кость',group:'sym-beige',base:'A'},
        {code:'S2001-A',name:'Светлый какао',group:'sym-brown',base:'A'},{code:'S2002-A',name:'Какао',group:'sym-brown',base:'A'},
        {code:'S2003-A',name:'Тёплый какао',group:'sym-brown',base:'A'},{code:'S2004-A',name:'Насыщенный какао',group:'sym-brown',base:'A'},
        {code:'S2005-A',name:'Коричневый',group:'sym-brown',base:'A'},{code:'S2006-A',name:'Светлый коричневый',group:'sym-brown',base:'A'},
        {code:'S2007-C',name:'Насыщенный коричневый',group:'sym-brown',base:'C'},{code:'S2101-A',name:'Каштановый',group:'sym-brown',base:'A'},
        {code:'S2102-A',name:'Светлый каштановый',group:'sym-brown',base:'A'},{code:'S2103-C',name:'Насыщенный каштановый',group:'sym-brown',base:'C'},
        {code:'S2201-A',name:'Шоколадный',group:'sym-brown',base:'A'},{code:'S2202-A',name:'Светлый шоколадный',group:'sym-brown',base:'A'},
        {code:'S2203-C',name:'Насыщенный шоколадный',group:'sym-brown',base:'C'},{code:'S2301-C',name:'Венге',group:'sym-brown',base:'C'},
        {code:'S2302-C',name:'Тёмный венге',group:'sym-brown',base:'C'},{code:'S2303-C',name:'Насыщенный венге',group:'sym-brown',base:'C'},
        {code:'S3001-A',name:'Нежно-розовый',group:'sym-red',base:'A'},{code:'S3002-A',name:'Светло-розовый',group:'sym-red',base:'A'},
        {code:'S3003-A',name:'Розовый',group:'sym-red',base:'A'},{code:'S3004-A',name:'Тёплый розовый',group:'sym-red',base:'A'},
        {code:'S3005-A',name:'Насыщенный розовый',group:'sym-red',base:'A'},{code:'S3006-A',name:'Светло-красный',group:'sym-red',base:'A'},
        {code:'S3007-A',name:'Красный',group:'sym-red',base:'A'},{code:'S3008-C',name:'Ярко-красный',group:'sym-red',base:'C'},
        {code:'S3101-A',name:'Томатный',group:'sym-red',base:'A'},{code:'S3102-A',name:'Светлый томатный',group:'sym-red',base:'A'},
        {code:'S3103-C',name:'Насыщенный томатный',group:'sym-red',base:'C'},{code:'S3201-A',name:'Бордовый',group:'sym-red',base:'A'},
        {code:'S3202-A',name:'Светлый бордовый',group:'sym-red',base:'A'},{code:'S3203-C',name:'Насыщенный бордовый',group:'sym-red',base:'C'},
        {code:'S3301-A',name:'Винный',group:'sym-red',base:'A'},{code:'S3302-A',name:'Светлый винный',group:'sym-red',base:'A'},
        {code:'S3303-C',name:'Насыщенный винный',group:'sym-red',base:'C'},{code:'S3401-C',name:'Кармин',group:'sym-red',base:'C'},
        {code:'S3402-C',name:'Насыщенный кармин',group:'sym-red',base:'C'},
        {code:'S4001-A',name:'Нежно-розовый',group:'sym-pink',base:'A'},{code:'S4002-A',name:'Светло-розовый',group:'sym-pink',base:'A'},
        {code:'S4003-A',name:'Розовый',group:'sym-pink',base:'A'},{code:'S4004-A',name:'Тёплый розовый',group:'sym-pink',base:'A'},
        {code:'S4005-A',name:'Насыщенный розовый',group:'sym-pink',base:'A'},{code:'S4101-A',name:'Лососевый',group:'sym-pink',base:'A'},
        {code:'S4102-A',name:'Светлый лососевый',group:'sym-pink',base:'A'},{code:'S4103-C',name:'Яркий лососевый',group:'sym-pink',base:'C'},
        {code:'S4201-A',name:'Фуксия',group:'sym-pink',base:'A'},{code:'S4202-C',name:'Яркая фуксия',group:'sym-pink',base:'C'},
        {code:'S4203-C',name:'Насыщенная фуксия',group:'sym-pink',base:'C'},
        {code:'S5001-A',name:'Светло-фиолетовый',group:'sym-violet',base:'A'},{code:'S5002-A',name:'Фиолетовый',group:'sym-violet',base:'A'},
        {code:'S5003-A',name:'Тёплый фиолетовый',group:'sym-violet',base:'A'},{code:'S5004-A',name:'Насыщенный фиолетовый',group:'sym-violet',base:'A'},
        {code:'S5101-A',name:'Лавандовый',group:'sym-violet',base:'A'},{code:'S5102-A',name:'Светлый лавандовый',group:'sym-violet',base:'A'},
        {code:'S5103-C',name:'Насыщенный лавандовый',group:'sym-violet',base:'C'},{code:'S5201-A',name:'Пурпурный',group:'sym-violet',base:'A'},
        {code:'S5202-C',name:'Яркий пурпурный',group:'sym-violet',base:'C'},{code:'S5203-C',name:'Насыщенный пурпурный',group:'sym-violet',base:'C'},
        {code:'S6001-A',name:'Небесно-голубой',group:'sym-blue',base:'A'},{code:'S6002-A',name:'Голубой',group:'sym-blue',base:'A'},
        {code:'S6003-A',name:'Светло-голубой',group:'sym-blue',base:'A'},{code:'S6004-A',name:'Насыщенный голубой',group:'sym-blue',base:'A'},
        {code:'S6005-A',name:'Светло-синий',group:'sym-blue',base:'A'},{code:'S6006-A',name:'Синий',group:'sym-blue',base:'A'},
        {code:'S6007-C',name:'Ярко-синий',group:'sym-blue',base:'C'},{code:'S6101-A',name:'Кобальтовый',group:'sym-blue',base:'A'},
        {code:'S6102-A',name:'Светлый кобальтовый',group:'sym-blue',base:'A'},{code:'S6103-C',name:'Насыщенный кобальтовый',group:'sym-blue',base:'C'},
        {code:'S6201-A',name:'Тёмно-синий',group:'sym-blue',base:'A'},{code:'S6202-C',name:'Насыщенный тёмно-синий',group:'sym-blue',base:'C'},
        {code:'S6301-A',name:'Морской',group:'sym-blue',base:'A'},{code:'S6302-A',name:'Светлый морской',group:'sym-blue',base:'A'},
        {code:'S6303-C',name:'Насыщенный морской',group:'sym-blue',base:'C'},
        {code:'S7001-A',name:'Светло-зелёный',group:'sym-green',base:'A'},{code:'S7002-A',name:'Зелёный',group:'sym-green',base:'A'},
        {code:'S7003-A',name:'Тёплый зелёный',group:'sym-green',base:'A'},{code:'S7004-A',name:'Насыщенный зелёный',group:'sym-green',base:'A'},
        {code:'S7101-A',name:'Мятный',group:'sym-green',base:'A'},{code:'S7102-A',name:'Светлый мятный',group:'sym-green',base:'A'},
        {code:'S7103-C',name:'Насыщенный мятный',group:'sym-green',base:'C'},{code:'S7201-A',name:'Изумрудный',group:'sym-green',base:'A'},
        {code:'S7202-A',name:'Светлый изумрудный',group:'sym-green',base:'A'},{code:'S7203-C',name:'Насыщенный изумрудный',group:'sym-green',base:'C'},
        {code:'S7301-A',name:'Тёмно-зелёный',group:'sym-green',base:'A'},{code:'S7302-C',name:'Насыщенный тёмно-зелёный',group:'sym-green',base:'C'},
        {code:'S7303-C',name:'Хвойный',group:'sym-green',base:'C'},
        {code:'N1001-A',name:'Песок пустыни',group:'sym-warm',base:'A'},{code:'N1002-A',name:'Светлый песок',group:'sym-warm',base:'A'},
        {code:'N1003-A',name:'Тёплый песок',group:'sym-warm',base:'A'},{code:'N1004-A',name:'Насыщенный песок',group:'sym-warm',base:'A'},
        {code:'N1005-A',name:'Глина',group:'sym-warm',base:'A'},{code:'N1006-A',name:'Светлая глина',group:'sym-warm',base:'A'},
        {code:'N1007-C',name:'Насыщенная глина',group:'sym-warm',base:'C'},{code:'N1008-C',name:'Терракот',group:'sym-warm',base:'C'},
        {code:'N1009-C',name:'Светлый терракот',group:'sym-warm',base:'C'},{code:'N1010-C',name:'Насыщенный терракот',group:'sym-warm',base:'C'},
        {code:'N1011-A',name:'Охра',group:'sym-warm',base:'A'},{code:'N1012-A',name:'Светлая охра',group:'sym-warm',base:'A'},
        {code:'N1013-C',name:'Насыщенная охра',group:'sym-warm',base:'C'},{code:'N1014-A',name:'Кирпич',group:'sym-warm',base:'A'},
        {code:'N1015-C',name:'Насыщенный кирпич',group:'sym-warm',base:'C'},{code:'N1016-A',name:'Кора',group:'sym-warm',base:'A'},
        {code:'N1017-C',name:'Насыщенная кора',group:'sym-warm',base:'C'},{code:'N1018-A',name:'Земля',group:'sym-warm',base:'A'},
        {code:'N1019-C',name:'Насыщенная земля',group:'sym-warm',base:'C'},
        {code:'N2001-A',name:'Морская пена',group:'sym-cold',base:'A'},{code:'N2002-A',name:'Светлая морская пена',group:'sym-cold',base:'A'},
        {code:'N2003-A',name:'Насыщенная морская пена',group:'sym-cold',base:'A'},{code:'N2004-A',name:'Горный ручей',group:'sym-cold',base:'A'},
        {code:'N2005-A',name:'Светлый горный ручей',group:'sym-cold',base:'A'},{code:'N2006-C',name:'Насыщенный горный ручей',group:'sym-cold',base:'C'},
        {code:'N2007-A',name:'Ледник',group:'sym-cold',base:'A'},{code:'N2008-A',name:'Светлый ледник',group:'sym-cold',base:'A'},
        {code:'N2009-C',name:'Насыщенный ледник',group:'sym-cold',base:'C'},{code:'N2010-A',name:'Глубина океана',group:'sym-cold',base:'A'},
        {code:'N2011-C',name:'Насыщенная глубина океана',group:'sym-cold',base:'C'},{code:'N2012-A',name:'Сосновый бор',group:'sym-cold',base:'A'},
        {code:'N2013-A',name:'Светлый сосновый бор',group:'sym-cold',base:'A'},{code:'N2014-C',name:'Насыщенный сосновый бор',group:'sym-cold',base:'C'},
        {code:'N2015-A',name:'Ель',group:'sym-cold',base:'A'},{code:'N2016-C',name:'Насыщенная ель',group:'sym-cold',base:'C'},
        {code:'N2017-A',name:'Мох',group:'sym-cold',base:'A'},{code:'N2018-A',name:'Насыщенный мох',group:'sym-cold',base:'A'},
        {code:'N2019-C',name:'Тёмный мох',group:'sym-cold',base:'C'},{code:'N2020-A',name:'Туман',group:'sym-cold',base:'A'},
        {code:'N2021-A',name:'Светлый туман',group:'sym-cold',base:'A'}
    ];

    function getRALColor(code) {
        var map = {
            'RAL 1000':'#C7B89E','RAL 1001':'#D1B894','RAL 1002':'#D2B773','RAL 1003':'#F7C030','RAL 1004':'#E3B82C','RAL 1005':'#C9A96B','RAL 1006':'#E3A832','RAL 1007':'#E79A2A','RAL 1011':'#B79A78','RAL 1012':'#D4B86A','RAL 1013':'#E9DFCE','RAL 1014':'#D9C8A8','RAL 1015':'#E8DCC8','RAL 1016':'#E1D84A','RAL 1017':'#E8B85A','RAL 1018':'#E8C84A','RAL 1019':'#B8A898','RAL 1020':'#A8A078','RAL 1021':'#E8B84A','RAL 1023':'#F0C830','RAL 1024':'#C8A868','RAL 1026':'#FFFF00','RAL 1027':'#A89038','RAL 1028':'#F0A830','RAL 1032':'#D8B848','RAL 1033':'#E8B84A','RAL 1034':'#E8C850','RAL 2000':'#D88228','RAL 2001':'#C06828','RAL 2002':'#C83828','RAL 2003':'#F0A848','RAL 2004':'#E85828','RAL 2005':'#FF2A00','RAL 2007':'#FFA800','RAL 2008':'#E86828','RAL 2009':'#E85818','RAL 2010':'#C84828','RAL 2011':'#D87028','RAL 2012':'#D87858','RAL 3000':'#A82828','RAL 3001':'#A82820','RAL 3002':'#A82828','RAL 3003':'#882828','RAL 3004':'#702028','RAL 3005':'#581820','RAL 3007':'#381018','RAL 3009':'#682820','RAL 3011':'#782020','RAL 3012':'#C8A088','RAL 3013':'#B84028','RAL 3014':'#D8A098','RAL 3015':'#D8B8B0','RAL 3016':'#B03838','RAL 3017':'#D05868','RAL 3018':'#C82848','RAL 3020':'#C01818','RAL 3022':'#D89878','RAL 3024':'#FF1A1A','RAL 3026':'#FF2828','RAL 3027':'#B02038','RAL 3031':'#A83848','RAL 4001':'#8A5A78','RAL 4002':'#882858','RAL 4003':'#D06898','RAL 4004':'#681838','RAL 4005':'#5A4878','RAL 4006':'#882858','RAL 4007':'#482048','RAL 4008':'#8828A8','RAL 4009':'#C8A8B8','RAL 4010':'#B82868','RAL 5000':'#284878','RAL 5001':'#285878','RAL 5002':'#2848A8','RAL 5003':'#284878','RAL 5004':'#182838','RAL 5005':'#1848A8','RAL 5007':'#4878A8','RAL 5008':'#384858','RAL 5009':'#286878','RAL 5010':'#2858A8','RAL 5011':'#182838','RAL 5012':'#3888B8','RAL 5013':'#182868','RAL 5014':'#6898A8','RAL 5015':'#4888C8','RAL 5017':'#1858A8','RAL 5018':'#289888','RAL 5019':'#1868A8','RAL 5020':'#183848','RAL 5021':'#188898','RAL 5022':'#282858','RAL 5023':'#4878A0','RAL 5024':'#88A8C8','RAL 6000':'#487868','RAL 6001':'#387848','RAL 6002':'#487838','RAL 6003':'#687848','RAL 6004':'#287868','RAL 6005':'#487838','RAL 6006':'#687858','RAL 6007':'#284828','RAL 6008':'#484838','RAL 6009':'#284828','RAL 6010':'#688838','RAL 6011':'#88A878','RAL 6012':'#283828','RAL 6013':'#887848','RAL 6014':'#685848','RAL 6015':'#384838','RAL 6016':'#188858','RAL 6017':'#78A838','RAL 6018':'#88B838','RAL 6019':'#B8D8B8','RAL 6020':'#485838','RAL 6021':'#88A880','RAL 6022':'#685848','RAL 6024':'#389838','RAL 6025':'#789848','RAL 6026':'#287858','RAL 6027':'#88C8B8','RAL 6028':'#487848','RAL 6029':'#388848','RAL 6032':'#389838','RAL 6033':'#58A898','RAL 6034':'#88C8B8','RAL 7000':'#888888','RAL 7001':'#A8A8A8','RAL 7002':'#888878','RAL 7003':'#787878','RAL 7004':'#989898','RAL 7005':'#888888','RAL 7006':'#887868','RAL 7008':'#787858','RAL 7009':'#687868','RAL 7010':'#586858','RAL 7011':'#586868','RAL 7012':'#686868','RAL 7013':'#787868','RAL 7015':'#586068','RAL 7016':'#484848','RAL 7021':'#383838','RAL 7022':'#484848','RAL 7023':'#888888','RAL 7024':'#585858','RAL 7026':'#484848','RAL 7030':'#989898','RAL 7031':'#788898','RAL 7032':'#B8B8A8','RAL 7033':'#888888','RAL 7034':'#988868','RAL 7035':'#C8C8C8','RAL 7036':'#A89898','RAL 7037':'#888888','RAL 7038':'#B8B8B8','RAL 7039':'#787878','RAL 7040':'#A8A8A8','RAL 7042':'#989898','RAL 7043':'#888888','RAL 7044':'#B8B8A8','RAL 7045':'#989898','RAL 7046':'#888888','RAL 7047':'#C8C8C8','RAL 8000':'#887858','RAL 8001':'#987858','RAL 8002':'#886848','RAL 8003':'#786838','RAL 8004':'#886848','RAL 8007':'#786848','RAL 8008':'#786848','RAL 8011':'#685848','RAL 8012':'#684838','RAL 8014':'#685848','RAL 8015':'#684838','RAL 8016':'#584838','RAL 8017':'#584838','RAL 8019':'#585048','RAL 8022':'#383838','RAL 8023':'#A86838','RAL 8024':'#887058','RAL 8025':'#887868','RAL 8028':'#685848','RAL 9001':'#E8E0D8','RAL 9002':'#D8D8D0','RAL 9003':'#F0F0F0','RAL 9004':'#282828','RAL 9005':'#181818','RAL 9006':'#C8C8C8','RAL 9007':'#888888','RAL 9010':'#F0F0E8','RAL 9011':'#282828','RAL 9016':'#F0F0F0','RAL 9017':'#282828','RAL 9018':'#D8D8D0'
        };
        return map[code] || '#CCCCCC';
    }

    function getSymphonyColor(code) {
        var map = {
            'S0101-A':'#F5E6C8','S0102-A':'#F0D8B8','S0103-A':'#F0D0B0','S0104-A':'#E8C8A0','S0105-A':'#F0D8A0','S0106-A':'#E8C888','S0107-A':'#E0B870','S0108-C':'#D8A050','S0201-A':'#F0E060','S0202-A':'#E8D050','S0203-C':'#F0D030','S0204-C':'#E8C020','S0301-A':'#F0D840','S0302-A':'#E8C830','S0303-C':'#F0C020','S0304-C':'#E8B010','S0401-A':'#E8C830','S0402-A':'#E0B820','S0403-C':'#E8A810','S0404-C':'#D89808','S0501-A':'#E8A830','S0502-A':'#E09820','S0503-C':'#F09018','S0504-C':'#E88008','S0601-A':'#E89820','S0602-A':'#E08818','S0603-C':'#F07810','S0604-C':'#E06808','S1001-A':'#F0E0C8','S1002-A':'#EAD8B8','S1003-A':'#E8D0B0','S1004-A':'#E0C8A0','S1005-A':'#D8C098','S1006-A':'#F0E8D0','S1007-A':'#E8E0C8','S1101-A':'#E0C8A0','S1102-A':'#D8C098','S1103-A':'#D0B888','S1104-A':'#C8A878','S1201-A':'#E0C090','S1202-A':'#D8B888','S1203-A':'#D0B078','S1204-A':'#C8A068','S1301-A':'#E8D8B8','S1302-A':'#E0D0B0','S1303-A':'#D8C8A8','S2001-A':'#B8A088','S2002-A':'#A89078','S2003-A':'#A08870','S2004-A':'#987868','S2005-A':'#887058','S2006-A':'#786048','S2007-C':'#685038','S2101-A':'#A07860','S2102-A':'#906850','S2103-C':'#805840','S2201-A':'#785848','S2202-A':'#684838','S2203-C':'#583830','S2301-C':'#382828','S2302-C':'#302020','S2303-C':'#281818','S3001-A':'#F0D0C8','S3002-A':'#E8C0B8','S3003-A':'#E0B0A8','S3004-A':'#D8A098','S3005-A':'#D09088','S3006-A':'#E8A8A0','S3007-A':'#E08880','S3008-C':'#E06858','S3101-A':'#D89880','S3102-A':'#D08870','S3103-C':'#C87058','S3201-A':'#B06058','S3202-A':'#A85048','S3203-C':'#984038','S3301-A':'#884038','S3302-A':'#783028','S3303-C':'#682820','S3401-C':'#C03020','S3402-C':'#B02018','S4001-A':'#F0D8D8','S4002-A':'#E8C8C8','S4003-A':'#E0B8B8','S4004-A':'#D8A8A8','S4005-A':'#D09898','S4101-A':'#E8B098','S4102-A':'#E0A088','S4103-C':'#D88870','S4201-A':'#E898A0','S4202-C':'#E07888','S4203-C':'#D86878','S5001-A':'#E0D0E8','S5002-A':'#D0C0D8','S5003-A':'#C8B0D0','S5004-A':'#B8A0C0','S5101-A':'#C8B8D8','S5102-A':'#B8A8C8','S5103-C':'#A898B8','S5201-A':'#9868B8','S5202-C':'#8858A8','S5203-C':'#784898','S6001-A':'#C8E0F0','S6002-A':'#B0D0E8','S6003-A':'#98C0E0','S6004-A':'#88B0D0','S6005-A':'#A8C8E0','S6006-A':'#88B0C8','S6007-C':'#6898B8','S6101-A':'#5888C8','S6102-A':'#4878B8','S6103-C':'#3868A8','S6201-A':'#386898','S6202-C':'#285888','S6301-A':'#2878A8','S6302-A':'#206898','S6303-C':'#185888','S7001-A':'#C8E0C8','S7002-A':'#B0D0B0','S7003-A':'#98C098','S7004-A':'#88B088','S7101-A':'#A8D8B8','S7102-A':'#90C8A8','S7103-C':'#78B898','S7201-A':'#58B898','S7202-A':'#48A888','S7203-C':'#389878','S7301-A':'#388068','S7302-C':'#287058','S7303-C':'#186048','N1001-A':'#E8D8B8','N1002-A':'#E0D0B0','N1003-A':'#D8C8A8','N1004-A':'#D0C098','N1005-A':'#D8C098','N1006-A':'#D0B888','N1007-C':'#C8A878','N1008-C':'#C89868','N1009-C':'#C09060','N1010-C':'#B88858','N1011-A':'#B88848','N1012-A':'#B08040','N1013-C':'#A87838','N1014-A':'#B87038','N1015-C':'#A86830','N1016-A':'#A06848','N1017-C':'#906040','N1018-A':'#887058','N1019-C':'#786048','N2001-A':'#C8E8E8','N2002-A':'#B8D8D8','N2003-A':'#A8C8C8','N2004-A':'#88C8D8','N2005-A':'#78B8C8','N2006-C':'#68A8B8','N2007-A':'#D8E8E8','N2008-A':'#C8D8D8','N2009-C':'#B8C8C8','N2010-A':'#2888B8','N2011-C':'#2078A8','N2012-A':'#488868','N2013-A':'#407860','N2014-C':'#386858','N2015-A':'#285848','N2016-C':'#204838','N2017-A':'#689068','N2018-A':'#588058','N2019-C':'#487048','N2020-A':'#C8D8D0','N2021-A':'#B8C8C0'
        };
        return map[code] || '#CCCCCC';
    }

    function renderRALColors() {
        var groups = {
            'ral-all': ralColors,
            'ral-yellow': ralColors.filter(function(c){return c.group==='ral-yellow';}),
            'ral-orange': ralColors.filter(function(c){return c.group==='ral-orange';}),
            'ral-red': ralColors.filter(function(c){return c.group==='ral-red';}),
            'ral-violet': ralColors.filter(function(c){return c.group==='ral-violet';}),
            'ral-blue': ralColors.filter(function(c){return c.group==='ral-blue';}),
            'ral-green': ralColors.filter(function(c){return c.group==='ral-green';}),
            'ral-grey': ralColors.filter(function(c){return c.group==='ral-grey';}),
            'ral-brown': ralColors.filter(function(c){return c.group==='ral-brown';}),
            'ral-white': ralColors.filter(function(c){return c.group==='ral-white';}),
            'ral-black': ralColors.filter(function(c){return c.group==='ral-black';})
        };
        for (var gid in groups) {
            var c = document.getElementById(gid);
            if (!c) continue;
            var colors = groups[gid];
            var h = '';
            for (var i = 0; i < colors.length; i++) {
                var col = colors[i];
                var hex = getRALColor(col.code);
                var base = 'A';
                if (['RAL 1026','RAL 2005','RAL 2007','RAL 3024','RAL 3026','RAL 9005','RAL 9011','RAL 9017'].indexOf(col.code) !== -1) base = 'C';
                h += '<div class="color-item"><div class="color-swatch" style="background:' + hex + ';"></div><div class="color-info"><span class="color-code">' + col.code + '</span><span class="color-name">' + col.name + '</span><span class="color-base">База ' + base + '</span></div></div>';
            }
            c.innerHTML = h;
        }
    }

    function renderSymphonyColors() {
        var groups = {
            'sym-all': symphonyColors,
            'sym-yellow': symphonyColors.filter(function(c){return c.group==='sym-yellow';}),
            'sym-beige': symphonyColors.filter(function(c){return c.group==='sym-beige';}),
            'sym-brown': symphonyColors.filter(function(c){return c.group==='sym-brown';}),
            'sym-red': symphonyColors.filter(function(c){return c.group==='sym-red';}),
            'sym-pink': symphonyColors.filter(function(c){return c.group==='sym-pink';}),
            'sym-violet': symphonyColors.filter(function(c){return c.group==='sym-violet';}),
            'sym-blue': symphonyColors.filter(function(c){return c.group==='sym-blue';}),
            'sym-green': symphonyColors.filter(function(c){return c.group==='sym-green';}),
            'sym-warm': symphonyColors.filter(function(c){return c.group==='sym-warm';}),
            'sym-cold': symphonyColors.filter(function(c){return c.group==='sym-cold';})
        };
        for (var gid in groups) {
            var c = document.getElementById(gid);
            if (!c) continue;
            var colors = groups[gid];
            var h = '';
            for (var i = 0; i < colors.length; i++) {
                var col = colors[i];
                var hex = getSymphonyColor(col.code);
                h += '<div class="color-item"><div class="color-swatch" style="background:' + hex + ';"></div><div class="color-info"><span class="color-code">' + col.code + '</span><span class="color-name">' + col.name + '</span><span class="color-base">База ' + col.base + '</span></div></div>';
            }
            c.innerHTML = h;
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        renderRALColors();
        renderSymphonyColors();
    });
    </script>`;
}

// ============================================================
// СТРАНИЦА: ДОСТАВКА И ОПЛАТА
// ============================================================
function renderDeliveryPage() {
    const pageUrl = SITE_URL + '/dostavka';
    const title = 'Доставка и оплата — КолорМСК';
    const description = 'Доставка лакокрасочных материалов по Москве, МО и регионам РФ. Оплата наличными при получении.';

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": "Доставка и оплата", "item": pageUrl }
        ]
    };

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + pageUrl + '">\n' +
        renderAnalytics() + '\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar('') + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › Доставка и оплата</div>\n' +
        '<div class="info-page">\n' +
        '<h1>Доставка и оплата</h1>\n' +
        '<p class="info-intro">Условия доставки лакокрасочных материалов по Москве, Московской области и регионам РФ</p>\n' +

        '<h2>Доставка по Москве и МО</h2>\n' +
        '<p>Доставляем заказы <strong>курьером</strong>. Стоимость зависит от суммы заказа и расстояния от МКАД.</p>\n' +
        '<table class="info-table">\n' +
        '<thead><tr><th>Зона доставки</th><th>Сумма заказа</th><th>Стоимость доставки</th></tr></thead>\n' +
        '<tbody>\n' +
        '<tr><td rowspan="2"><strong>Москва и до 50 км от МКАД</strong></td><td>от 15 000 ₽</td><td class="info-price">Бесплатно</td></tr>\n' +
        '<tr><td>менее 15 000 ₽</td><td class="info-price">800 ₽</td></tr>\n' +
        '<tr><td rowspan="2"><strong>Свыше 50 км от МКАД</strong></td><td>от 15 000 ₽</td><td class="info-price">15 ₽ × (км − 50)</td></tr>\n' +
        '<tr><td>менее 15 000 ₽</td><td class="info-price">800 ₽ + 15 ₽ × (км − 50)</td></tr>\n' +
        '</tbody></table>\n' +

        '<div class="info-highlight"><strong>Пример 1: адрес в 20 км от МКАД, заказ 5 000 ₽</strong><br>' +
        'Зона «до 50 км», заказ менее 15 000 ₽ → доставка <strong>800 ₽</strong>.<br>' +
        'Итого к оплате: 5 000 + 800 = <strong>5 800 ₽</strong>.</div>\n' +

        '<div class="info-highlight"><strong>Пример 2: адрес в 20 км от МКАД, заказ 20 000 ₽</strong><br>' +
        'Зона «до 50 км», заказ от 15 000 ₽ → доставка <strong>бесплатно</strong>.<br>' +
        'Итого к оплате: <strong>20 000 ₽</strong>.</div>\n' +

        '<div class="info-highlight"><strong>Пример 3: адрес в 80 км от МКАД, заказ 5 000 ₽</strong><br>' +
        'Зона «свыше 50 км»: 800 ₽ + 15 ₽ × (80 − 50) = 800 + 450 = <strong>1 250 ₽</strong>.<br>' +
        'Итого к оплате: 5 000 + 1 250 = <strong>6 250 ₽</strong>.</div>\n' +

        '<div class="info-highlight"><strong>Пример 4: адрес в 80 км от МКАД, заказ 20 000 ₽</strong><br>' +
        'Зона «свыше 50 км», заказ от 15 000 ₽: доставка 15 ₽ × (80 − 50) = <strong>450 ₽</strong>.<br>' +
        'Итого к оплате: 20 000 + 450 = <strong>20 450 ₽</strong>.</div>\n' +

        '<h2>Доставка в регионы РФ</h2>\n' +
        '<p>Отправляем заказы в любой регион России через <strong>транспортные компании</strong>:</p>\n' +
        '<ul><li>СДЭК</li><li>Деловые Линии</li><li>ПЭК</li><li>Другие ТК по вашему выбору</li></ul>\n' +
        '<div class="info-note"><strong>Важно:</strong><br>' +
        'Стоимость доставки в регионы <strong>рассчитывается транспортной компанией</strong> и оплачивается заказчиком отдельно. Мы упаковываем товар, передаём его ТК и сообщаем вам трек-номер для отслеживания.</div>\n' +

        '<h2>Оплата</h2>\n' +
        '<div class="info-card"><h3>Наличными при получении</h3>' +
        '<p>Оплата наличными курьеру при получении заказа. Курьер передаёт товар только после оплаты.</p></div>\n' +
        '<div class="info-card"><h3>Безналичный расчёт для юр. лиц</h3>' +
        '<p>Для организаций и ИП возможна оплата по счёту. Свяжитесь с нами для выставления счёта.</p></div>\n' +

        '<h2>Как оформить заказ</h2>\n' +
        '<ol><li>Добавьте товары в <strong>корзину</strong> на сайте.</li>' +
        '<li>Перейдите в <strong>оформление заказа</strong>.</li>' +
        '<li>Заполните контактные данные и адрес доставки.</li>' +
        '<li>Подтвердите заказ. Мы свяжемся с вами для уточнения деталей.</li></ol>\n' +

        '<h2>Частые вопросы</h2>\n' +
        '<div class="info-faq">\n' +
        '<details><summary>Сколько идёт доставка по Москве?</summary><p>Обычно <strong>1–2 рабочих дня</strong>. Точную дату согласуем при подтверждении заказа.</p></details>\n' +
        '<details><summary>Можно ли изменить адрес после оформления?</summary><p>Да, если заказ ещё не передан курьеру. Позвоните нам по телефону <a href="tel:+79036692534">+7 (903) 669-25-34</a> или напишите на email.</p></details>\n' +
        '<details><summary>Как отследить заказ в регионы?</summary><p>После отправки мы сообщим вам <strong>трек-номер</strong> транспортной компании. Отследить можно на сайте ТК.</p></details>\n' +
        '<details><summary>Что делать, если товар повреждён при доставке?</summary><p>Осмотрите товар при получении курьера. Если есть повреждения — <strong>не оплачивайте</strong> и свяжитесь с нами. Заменим товар или вернём деньги.</p></details>\n' +
        '<details><summary>Работаете ли вы с юридическими лицами?</summary><p>Да, работаем с организациями и ИП. Возможна оплата по счёту, отсрочка платежа по договорённости.</p></details>\n' +
        '</div>\n' +

        '<div class="info-contact">\n' +
        '<h3>Остались вопросы?</h3>\n' +
        '<p>Свяжитесь с нами — поможем рассчитать доставку</p>\n' +
        '<p><a href="tel:+79036692534">+7 (903) 669-25-34</a></p>\n' +
        '<p><a href="mailto:info@colormsk.ru">info@colormsk.ru</a></p>\n' +
        '</div>\n' +
        '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        '</body>\n</html>';
}

// ============================================================
// СТРАНИЦА: ПОЛЕЗНАЯ ИНФОРМАЦИЯ
// ============================================================
function renderInfoPage() {
    const pageUrl = SITE_URL + '/info';
    const title = 'Полезная информация о ЛКМ — КолорМСК';
    const description = 'Руководство по лакокрасочным материалам: выбор краски, подготовка поверхностей, технология нанесения, дефекты покрытий.';

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": "Полезная информация", "item": pageUrl }
        ]
    };

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + pageUrl + '">\n' +
        renderAnalytics() + '\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar('') + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › Полезная информация</div>\n' +
        '<div class="info-page">\n' +

        '<h1>Полезная информация</h1>\n' +
        '<p class="info-intro">Руководство по лакокрасочным материалам: от выбора краски до технологии нанесения</p>\n' +

        '<div class="info-contents">\n' +
        '<h3>Содержание</h3>\n' +
        '<ul>\n' +
        '<li><a href="#section1">1. Основные сведения о лакокрасочных материалах</a></li>\n' +
        '<li><a href="#section2">2. Окраска интерьера</a></li>\n' +
        '<li><a href="#section4">3. Лакировка деревянных поверхностей</a></li>\n' +
        '<li><a href="#section5">4. Защита и окраска деревянных фасадов</a></li>\n' +
        '<li><a href="#section6">5. Защита и окраска каменных фасадов</a></li>\n' +
        '<li><a href="#section7">6. Защита от коррозии металла</a></li>\n' +
        '<li><a href="#section8">7. Малярный инструмент</a></li>\n' +
        '<li><a href="#section9">8. Дефекты лакокрасочных покрытий</a></li>\n' +
        '</ul>\n' +
        '</div>\n' +

        '<div class="info-article" id="section1">\n' +
        '<h2>1. Основные сведения о лакокрасочных материалах</h2>\n' +
        '<h3>Из чего состоит краска?</h3>\n' +
        '<p>Окраска — традиционный метод отделки поверхностей. Общее назначение лакокрасочных покрытий — защита поверхности от внешних воздействий при одновременном придании ей определённого вида, цвета и фактуры.</p>\n' +
        '<p><strong>Лакокрасочные покрытия</strong> образуются в результате пленкообразования (отверждения) <strong>лакокрасочных материалов</strong>, нанесённых на поверхность.</p>\n' +
        '<p><strong>ЛКМ</strong> — это многокомпонентные составы, которые при нанесении тонким слоем формируют покрытия с заданным комплексом свойств.</p>\n' +
        '<div class="info-scheme">\n' +
        '<div class="info-scheme-item"><strong>30%</strong>Пленкообразующее</div>\n' +
        '<div class="info-scheme-item"><strong>25%</strong>Пигменты и наполнители</div>\n' +
        '<div class="info-scheme-item"><strong>5%</strong>Добавки</div>\n' +
        '<div class="info-scheme-item"><strong>40%</strong>Растворитель</div>\n' +
        '</div>\n' +
        '<h4>Пленкообразующее вещество</h4>\n' +
        '<p>Вещество, которое после нанесения образует сплошную плёнку с хорошей адгезией, способную выполнять защитные и декоративные функции.</p>\n' +
        '<h4>Водно-дисперсионные краски</h4>\n' +
        '<p>Отверждаются за счёт физического испарения воды. Состоят из дисперсной фазы и дисперсионной среды.</p>\n' +
        '<h4>Краски на растворителях</h4>\n' +
        '<p>Алкидные краски — раствор алкидной смолы в органическом растворителе.</p>\n' +
        '<h4>Пигменты и наполнители</h4>\n' +
        '<p>Пигменты придают цвет и укрывистость. Наполнители улучшают вязкость, прочность, влаго- и термостойкость.</p>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Отличие растворителя от разбавителя:</strong><br>\n' +
        '<strong>Растворитель</strong> — растворяет связующее и понижает вязкость.<br>\n' +
        '<strong>Разбавитель</strong> — не растворяет связующее, но понижает вязкость.\n' +
        '</div>\n' +
        '<div class="info-shop-link">\n' +
        '<span class="info-shop-icon">КАТАЛОГ</span>\n' +
        '<div>\n' +
        '<strong>Выбрать качественные ЛКМ</strong>\n' +
        '<p>Перейдите в каталог и найдите идеальный материал.</p>\n' +
        '<a href="/" class="info-shop-btn">Смотреть каталог →</a>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section2">\n' +
        '<h2>2. Окраска интерьера</h2>\n' +
        '<p>Основная цель применения ЛКМ для интерьеров — создать уютную и здоровую обстановку.</p>\n' +
        '<h3>Подготовка основания</h3>\n' +
        '<p>Поверхность должна быть чистой, сухой, без жира и отслаивающейся краски. Выровнять шпатлёвкой, отшлифовать, удалить пыль, загрунтовать и только потом красить.</p>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Советы по шпатлеванию:</strong><br>\n' +
        '• Очистите поверхность от грязи и пыли<br>\n' +
        '• Температура 10–20 °С, влажность 30–60%<br>\n' +
        '• После высыхания отшлифуйте<br>\n' +
        '• Удалите пыль и загрунтуйте\n' +
        '</div>\n' +
        '<h4>Грунтование поверхности</h4>\n' +
        '<p>Грунтовка улучшает адгезию, заполняет поры и выравнивает впитывающую способность.</p>\n' +
        '<p><a href="#" data-sku="00-00009377" class="t-product-link">EURO-Balance primer</a> — грунтовка на акрилатной основе с антисептическими добавками.</p>\n' +
        '<p><a href="#" data-sku="00-00009297" class="t-product-link">DEEP CONTACT</a> — адгезионная грунтовка для плотных оснований (бетон, кирпич, камень).</p>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Как выбрать краску для интерьера:</strong><br>\n' +
        '• <strong>Потолки в сухих помещениях:</strong> матовые водоразбавляемые краски (<a href="#" data-sku="00-00008953" class="t-product-link">CABINET-Royal</a>, <a href="#" data-sku="00-01100281" class="t-product-link">EURO-Balance 2</a>)<br>\n' +
        '• <strong>Стены в сухих помещениях:</strong> матовые, полуматовые (<a href="#" data-sku="00-01101606" class="t-product-link">AQUA-Marina</a>, <a href="#" data-sku="00-01100282" class="t-product-link">EURO-Balance 7</a>)<br>\n' +
        '• <strong>Влажные помещения (кухни, ванные):</strong> полуматовые, полуглянцевые с повышенной стойкостью к мытью (<a href="#" data-sku="00-01100263" class="t-product-link">EURO-Life</a>)<br>\n' +
        '• <strong>Детские комнаты:</strong> экологически чистые, сертифицированные\n' +
        '</div>\n' +
        '<div class="info-shop-link">\n' +
        '<span class="info-shop-icon">КАТАЛОГ</span>\n' +
        '<div>\n' +
        '<strong>Подберите краску для интерьера</strong>\n' +
        '<p>Матовые, полуматовые, влагостойкие — для любых помещений.</p>\n' +
        '<a href="/kraski-interiernye" class="info-shop-btn">Перейти в каталог →</a>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section4">\n' +
        '<h2>3. Лакировка деревянных поверхностей</h2>\n' +
        '<p>Дерево — материал, созданный природой. Оно безопасно, поддерживает кислородный баланс и оптимальную влажность.</p>\n' +
        '<h3>Нагрузки, падающие на древесину</h3>\n' +
        '<ul>\n' +
        '<li><strong>Повышенная влажность</strong> — гниение, плесень, грибки</li>\n' +
        '<li><strong>Чрезмерная сухость</strong> — растрескивание, щели</li>\n' +
        '<li><strong>УФ-излучение</strong> — потемнение и разрушение</li>\n' +
        '<li><strong>Механические нагрузки</strong> — истирание, износ</li>\n' +
        '</ul>\n' +
        '<h3>Лакировка</h3>\n' +
        '<p>Для сохранения текстуры и защиты поверхности требуется обработка дерева бесцветными или колеруемыми лаками.</p>\n' +
        '<div class="info-scheme">\n' +
        '<div class="info-scheme-item"><strong>Без покрытия</strong></div>\n' +
        '<div class="info-scheme-item"><strong>Лак на акриловой основе</strong></div>\n' +
        '<div class="info-scheme-item"><strong>Лак на алкидной основе</strong></div>\n' +
        '</div>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Советы по лакировке:</strong><br>\n' +
        '• Очистить от грязи и пыли<br>\n' +
        '• Удалить смолу с сучков<br>\n' +
        '• Заделать неровности шпатлёвкой по дереву<br>\n' +
        '• Отшлифовать и удалить пыль\n' +
        '</div>\n' +
        '<h4>Ассортимент лаков SYMPHONY</h4>\n' +
        '<ul>\n' +
        '<li><a href="#" data-sku="00-01100994" class="t-product-link">RESTAVRATOR</a> — лак-антисептик для панелей, вагонки, досок, брёвен</li>\n' +
        '<li><a href="#" data-sku="00-00013100" class="t-product-link">PREMIERA</a> — лак для мебели, дверей, стен</li>\n' +
        '<li><a href="#" data-sku="00-00012980" class="t-product-link">HARDWOOD Aqua</a> — полиуретановый лак для паркета и полов</li>\n' +
        '<li><a href="#" data-sku="00-00010734" class="t-product-link">NORDIC Sauna</a> — защитный состав для саун и бань</li>\n' +
        '<li><a href="#" data-sku="00-00009554" class="t-product-link">HARDWOOD яхтный</a> — полиуретановый лак для наружных работ</li>\n' +
        '</ul>\n' +
        '<div class="info-shop-link">\n' +
        '<span class="info-shop-icon">КАТАЛОГ</span>\n' +
        '<div>\n' +
        '<strong>Подобрать лак для дерева</strong>\n' +
        '<p>Акриловые, полиуретановые, яхтные — для любых задач.</p>\n' +
        '<a href="/laki" class="info-shop-btn">Смотреть лаки SYMPHONY →</a>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section5">\n' +
        '<h2>4. Защита и окраска деревянных фасадов</h2>\n' +
        '<p>Древесина обладает высокой прочностью, упругостью, низкой теплопроводностью, экологичностью и красивой текстурой.</p>\n' +
        '<h3>Факторы, разрушающие древесину</h3>\n' +
        '<ul>\n' +
        '<li><strong>УФ-излучение</strong> — деструкция лигнина</li>\n' +
        '<li><strong>Атмосферные осадки</strong> — гниение</li>\n' +
        '<li><strong>Перепады температур</strong> — деформация, растрескивание</li>\n' +
        '<li><strong>Биологические факторы</strong> — грибки, плесень, насекомые</li>\n' +
        '</ul>\n' +
        '<h3>Антисептики</h3>\n' +
        '<p><a href="/antiseptiki" class="t-cat-link">Антисептики</a> — ЛКМ с биоцидными, фунгицидными и инсектицидными свойствами.</p>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Последовательность работ:</strong><br>\n' +
        '1. Очистка от грязи, пыли, синевы<br>\n' +
        '2. Удаление смолы из сучков<br>\n' +
        '3. Обработка шляпок гвоздей грунтовкой<br>\n' +
        '4. Грунтовочный антисептик<br>\n' +
        '5. Покрывной материал в 2 слоя\n' +
        '</div>\n' +
        '<div class="info-shop-link">\n' +
        '<span class="info-shop-icon">КАТАЛОГ</span>\n' +
        '<div>\n' +
        '<strong>Защитить деревянный фасад</strong>\n' +
        '<p>Антисептики для наружных работ.</p>\n' +
        '<a href="/antiseptiki" class="info-shop-btn">Каталог антисептиков →</a>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section6">\n' +
        '<h2>5. Защита и окраска каменных фасадов</h2>\n' +
        '<p>Окраска фасадов — важный этап. Правильный выбор фасадной краски обеспечивает защиту от атмосферных воздействий.</p>\n' +
        '<h3>Требования к фасадным краскам</h3>\n' +
        '<ul>\n' +
        '<li><strong>Паропроницаемость</strong> — покрытие должно «дышать»</li>\n' +
        '<li><strong>Водостойкость</strong> — не пропускать воду</li>\n' +
        '<li><strong>Щелочестойкость</strong> — устойчивость к щелочной среде</li>\n' +
        '<li><strong>Стойкость к УФ</strong> — сохранение цвета</li>\n' +
        '</ul>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Ассортимент фасадных красок SYMPHONY:</strong><br>\n' +
        '• <a href="#" data-sku="00-01101608" class="t-product-link">EURO-Balance Facade Aqua</a> — водоразбавляемая акриловая<br>\n' +
        '• <a href="#" data-sku="00-00010827" class="t-product-link">EURO-Balance Facade Nord</a> — акриловая на растворителях (до -20°С)<br>\n' +
        '• <a href="#" data-sku="00-01100250" class="t-product-link">EURO-Balance Facade Siloxan</a> — силоксанмодифицированная\n' +
        '</div>\n' +
        '<div class="info-shop-link">\n' +
        '<span class="info-shop-icon">КАТАЛОГ</span>\n' +
        '<div>\n' +
        '<strong>Выбрать фасадную краску</strong>\n' +
        '<p>Для фасадов, цоколей и заборов.</p>\n' +
        '<a href="/kraski-fasadnye" class="info-shop-btn">Каталог фасадных красок →</a>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section7">\n' +
        '<h2>6. Защита от коррозии металла</h2>\n' +
        '<p><strong>Коррозия</strong> — разрушение металлов при взаимодействии с внешней средой.</p>\n' +
        '<h3>Способы защиты</h3>\n' +
        '<ol>\n' +
        '<li><strong>Легирование</strong> — введение никеля, хрома, титана</li>\n' +
        '<li><strong>Металлические покрытия</strong> — гальваника</li>\n' +
        '<li><strong>Лакокрасочные покрытия</strong> — грунтовка + финиш</li>\n' +
        '</ol>\n' +
        '<h4>Антикоррозионные материалы SYMPHONY</h4>\n' +
        '<ul>\n' +
        '<li><a href="#" data-sku="00-00011318" class="t-product-link">FerOx-Stopper</a> — противокоррозионная грунтовка для чёрных металлов</li>\n' +
        '<li><a href="#" data-sku="00-00009949" class="t-product-link">WINNER</a> — полиуретановая эмаль с противокоррозионными пигментами</li>\n' +
        '</ul>\n' +
        '<div class="info-shop-link">\n' +
        '<span class="info-shop-icon">КАТАЛОГ</span>\n' +
        '<div>\n' +
        '<strong>Защитить металл от коррозии</strong>\n' +
        '<p>Грунтовки и эмали для стали, оцинковки и алюминия.</p>\n' +
        '<a href="/alkidnye-kraski" class="info-shop-btn">Каталог эмалей →</a>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section8">\n' +
        '<h2>7. Малярный инструмент</h2>\n' +
        '<h4>Виды кистей</h4>\n' +
        '<ul>\n' +
        '<li><strong>Маховые</strong> — для больших поверхностей</li>\n' +
        '<li><strong>Ручники</strong> — для окон, дверей, плинтусов</li>\n' +
        '<li><strong>Флейцевые</strong> — для ровного нанесения</li>\n' +
        '<li><strong>Филеночные</strong> — для узких полосок</li>\n' +
        '</ul>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Как выбрать кисть:</strong><br>\n' +
        '• Для алкидных и масляных красок — натуральный ворс<br>\n' +
        '• Для акриловых и водно-дисперсионных — искусственный ворс\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-article" id="section9">\n' +
        '<h2>8. Дефекты лакокрасочных покрытий</h2>\n' +
        '<p>Дефекты возникают из-за низкого качества краски, плохой подготовки, некачественного инструмента, нарушения температурного режима.</p>\n' +
        '<h4>Основные дефекты</h4>\n' +
        '<ul>\n' +
        '<li><strong>Следы от кисти</strong> — густая краска. Устранение: зачистка и повторная окраска</li>\n' +
        '<li><strong>Потеки и наплывы</strong> — жидкая краска. Наносить 2 тонких слоя</li>\n' +
        '<li><strong>«Крокодилова кожа»</strong> — неравномерная толщина. Зачистка и окраска</li>\n' +
        '<li><strong>Отслаивание</strong> — плохое обезжиривание. Снятие покрытия, грунтование</li>\n' +
        '</ul>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Важно помнить:</strong><br>\n' +
        '• Правильная подготовка — 70% успеха<br>\n' +
        '• Соблюдение температурного режима обязательно<br>\n' +
        '• Качественный инструмент — ровное покрытие\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-related">\n' +
        '<h3>Читайте также:</h3>\n' +
        '<div class="info-related-grid">\n' +
        '<a href="#section1" class="info-related-link">Основные сведения о ЛКМ</a>\n' +
        '<a href="#section2" class="info-related-link">Окраска интерьера</a>\n' +
        '<a href="#section4" class="info-related-link">Лакировка дерева</a>\n' +
        '<a href="#section5" class="info-related-link">Защита деревянных фасадов</a>\n' +
        '<a href="#section6" class="info-related-link">Защита каменных фасадов</a>\n' +
        '<a href="#section7" class="info-related-link">Антикоррозионная защита</a>\n' +
        '<a href="#section8" class="info-related-link">Малярный инструмент</a>\n' +
        '<a href="#section9" class="info-related-link">Дефекты покрытий</a>\n' +
        '</div>\n' +
        '</div>\n' +

        '<div class="info-faq">\n' +
        '<h3 class="info-faq-title">Часто задаваемые вопросы</h3>\n' +
        '<div class="info-faq-item">\n' +
        '<strong class="info-faq-q">1. Какую краску выбрать для ванной?</strong>\n' +
        '<p class="info-faq-a">Выбирайте влагостойкие краски с пометкой «для влажных помещений». Подойдут <a href="#" data-sku="00-01100263" class="t-product-link">EURO-Life</a>.</p>\n' +
        '</div>\n' +
        '<div class="info-faq-item">\n' +
        '<strong class="info-faq-q">2. Нужно ли грунтовать стены перед покраской?</strong>\n' +
        '<p class="info-faq-a">Да! Грунтовка улучшает сцепление, выравнивает впитываемость и продлевает срок службы. Выбирайте <a href="#" data-sku="00-00009377" class="t-product-link">EURO-Balance primer</a> или <a href="#" data-sku="00-00009297" class="t-product-link">DEEP CONTACT</a>.</p>\n' +
        '</div>\n' +
        '<div class="info-faq-item">\n' +
        '<strong class="info-faq-q">3. Чем отличается акриловая краска от алкидной?</strong>\n' +
        '<p class="info-faq-a">Акриловая — на водной основе, без запаха. Алкидная — на растворителе, прочнее, но с запахом.</p>\n' +
        '</div>\n' +
        '<div class="info-faq-item">\n' +
        '<strong class="info-faq-q">4. Как рассчитать расход краски?</strong>\n' +
        '<p class="info-faq-a">Площадь × расход (на банке) + 10–15% запаса. Обычно 1 литр на 8–12 м² в один слой.</p>\n' +
        '</div>\n' +
        '<div class="info-faq-item">\n' +
        '<strong class="info-faq-q">5. Чем обработать дерево на улице?</strong>\n' +
        '<p class="info-faq-a">Антисептиками с УФ-фильтром для наружных работ. Например, <a href="/antiseptiki" class="t-cat-link">антисептики SYMPHONY</a>.</p>\n' +
        '</div>\n' +
        '<div class="info-faq-item">\n' +
        '<strong class="info-faq-q">6. Как защитить металл от коррозии?</strong>\n' +
        '<p class="info-faq-a">Система «грунтовка + финишный слой». Например, <a href="#" data-sku="00-00011318" class="t-product-link">FerOx-Stopper</a> + <a href="#" data-sku="00-00009949" class="t-product-link">WINNER</a>.</p>\n' +
        '</div>\n' +
        '</div>\n' +

        '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        renderInfoProductModalScript() + '\n' +
        '</body>\n</html>';
}

// ============================================================
// СТРАНИЦА: ОПТОВЫЕ ПОСТАВКИ
// ============================================================
function renderOptPage() {
    const pageUrl = SITE_URL + '/opt';
    const title = 'Оптовые поставки ЛКМ — КолорМСК';
    const description = 'Оптовые поставки лакокрасочных материалов в Москве. Минимальная партия от 100 000 ₽. Скидки обсуждаются индивидуально. Доставка по РФ.';

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": "Оптовые поставки", "item": pageUrl }
        ]
    };

    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + pageUrl + '">\n' +
        renderAnalytics() + '\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar('') + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › Оптовые поставки</div>\n' +
        '<div class="info-page">\n' +

        '<h1>Оптовые поставки ЛКМ</h1>\n' +
        '<p class="info-intro">Оптовые поставки лакокрасочных материалов для строительных организаций, ремонтных бригад и розничных магазинов. Работаем с юридическими лицами и ИП.</p>\n' +

        '<h2>Кому подходит опт</h2>\n' +
        '<div class="t-opt-grid">\n' +
        '<div class="t-opt-card">\n' +
        '<h3>Строительным организациям</h3>\n' +
        '<p>Для объектов любого масштаба: жилых, коммерческих, промышленных.</p>\n' +
        '</div>\n' +
        '<div class="t-opt-card">\n' +
        '<h3>Ремонтным бригадам</h3>\n' +
        '<p>Регулярные закупки материалов для отделочных работ.</p>\n' +
        '</div>\n' +
        '<div class="t-opt-card">\n' +
        '<h3>Розничным магазинам</h3>\n' +
        '<p>Пополнение ассортимента для перепродажи.</p>\n' +
        '</div>\n' +
        '<div class="t-opt-card">\n' +
        '<h3>Подрядчикам</h3>\n' +
        '<p>Комплексные поставки на тендеры и крупные проекты.</p>\n' +
        '</div>\n' +
        '</div>\n' +

        '<h2>Условия опта</h2>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Минимальная партия:</strong> от <strong>100 000 ₽</strong>.\n' +
        '</div>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Скидки:</strong> обсуждаются <strong>индивидуально</strong> по вашему запросу. Учитываем объём, регулярность закупок и условия сотрудничества.\n' +
        '</div>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Отсрочка платежа:</strong> обсуждается индивидуально для постоянных клиентов.\n' +
        '</div>\n' +
        '<div class="info-highlight">\n' +
        '<strong>Персональный менеджер:</strong> закрепляется за каждым оптовым клиентом.\n' +
        '</div>\n' +

        '<h2>Как получить прайс и оформить заказ</h2>\n' +
        '<ol class="t-steps">\n' +
        '<li>\n' +
        '<strong>Свяжитесь с нами</strong>\n' +
        'Позвоните по телефону +7 (903) 669-25-34 или напишите на info@colormsk.ru.\n' +
        '</li>\n' +
        '<li>\n' +
        '<strong>Согласуйте условия</strong>\n' +
        'Обсудим объём, скидку и сроки. Вышлем актуальный прайс-лист.\n' +
        '</li>\n' +
        '<li>\n' +
        '<strong>Оформите заявку</strong>\n' +
        'Пришлите список товаров и реквизиты для выставления счёта.\n' +
        '</li>\n' +
        '<li>\n' +
        '<strong>Получите товар</strong>\n' +
        'Отгружаем со склада в Москве. Доставка ТК в любой регион РФ.\n' +
        '</li>\n' +
        '</ol>\n' +

        '<h2>Преимущества работы с нами</h2>\n' +
        '<ul>\n' +
        '<li><strong>Прямой поставщик.</strong> Работаем без посредников, что даёт лучшие цены.</li>\n' +
        '<li><strong>Склад в Москве.</strong> Быстрая отгрузка — не нужно ждать поставки.</li>\n' +
        '<li><strong>Доставка по РФ.</strong> Отправляем транспортными компаниями (СДЭК, Деловые Линии, ПЭК).</li>\n' +
        '<li><strong>Полный пакет документов.</strong> Счёт, УПД, товарные накладные, сертификаты.</li>\n' +
        '<li><strong>Гибкие условия.</strong> Подберём оптимальные условия под ваш объём закупок.</li>\n' +
        '</ul>\n' +

        '<h2>Частые вопросы</h2>\n' +
        '<div class="info-faq">\n' +
        '<details>\n' +
        '<summary>Какая минимальная партия для опта?</summary>\n' +
        '<p>Минимальная сумма оптового заказа — <strong>100 000 ₽</strong>. Если сумма меньше — можно оформить обычный розничный заказ.</p>\n' +
        '</details>\n' +
        '<details>\n' +
        '<summary>Какие скидки вы предоставляете?</summary>\n' +
        '<p>Скидки <strong>рассчитываются индивидуально</strong> в зависимости от объёма, регулярности закупок и других условий. Свяжитесь с нами для расчёта.</p>\n' +
        '</details>\n' +
        '<details>\n' +
        '<summary>Работаете ли вы с отсрочкой платежа?</summary>\n' +
        '<p>Да, для постоянных клиентов возможна отсрочка. Условия обсуждаются индивидуально.</p>\n' +
        '</details>\n' +
        '<details>\n' +
        '<summary>Можно ли получить сертификаты на товары?</summary>\n' +
        '<p>Да, предоставляем все необходимые сертификаты и документы на продукцию.</p>\n' +
        '</details>\n' +
        '<details>\n' +
        '<summary>Как быстро отгружаете заказ?</summary>\n' +
        '<p>Отгрузка со склада в Москве — <strong>в течение 1–2 рабочих дней</strong> после оплаты. Точные сроки согласуем при оформлении.</p>\n' +
        '</details>\n' +
        '</div>\n' +

        '<div class="info-contact">\n' +
        '<h3>Обсудить оптовые поставки</h3>\n' +
        '<p>Свяжитесь с нами — рассчитаем скидку и условия</p>\n' +
        '<p><a href="tel:+79036692534">+7 (903) 669-25-34</a></p>\n' +
        '<p><a href="mailto:info@colormsk.ru">info@colormsk.ru</a></p>\n' +
        '</div>\n' +

        '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        '</body>\n</html>';
}

// ============================================================
// КЛИЕНТСКИЙ СКРИПТ: Модальное окно товара (для страницы /info)
// ============================================================
function renderInfoProductModalScript() {
    return `<script>
    (function() {
        var PRODUCTS_BASE = '/products/';
        var CATEGORIES = ['antiseptiki','kraski-interiernye','kraski-fasadnye','laki','gruntovki','dekorativnye-shtukaturki','alkidnye-kraski','rastvoriteli'];
        var productCache = {};

        function translitLocal(str) {
            var map = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'};
            var result = '';
            for (var i = 0; i < str.length; i++) {
                var ch = str[i];
                result += map[ch] || (ch.match(/[a-zA-Z0-9]/) ? ch : '-');
            }
            return result.replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
        }

        async function findProductBySku(sku) {
            for (var c = 0; c < CATEGORIES.length; c++) {
                var cat = CATEGORIES[c];
                try {
                    if (!productCache[cat]) {
                        var r = await fetch(PRODUCTS_BASE + cat + '.json');
                        if (!r.ok) continue;
                        productCache[cat] = await r.json();
                    }
                    var products = productCache[cat];
                    for (var i = 0; i < products.length; i++) {
                        var product = products[i];
                        if (!product.sizes) continue;
                        for (var j = 0; j < product.sizes.length; j++) {
                            var size = product.sizes[j];
                            if (!size.options) continue;
                            for (var k = 0; k < size.options.length; k++) {
                                var opt = size.options[k];
                                if (opt.sku === sku) {
                                    return { cat: cat, product: product, size: size, option: opt };
                                }
                            }
                        }
                    }
                } catch (e) { continue; }
            }
            return null;
        }

        function getModal() {
            var m = document.getElementById('info-product-modal');
            if (!m) {
                m = document.createElement('div');
                m.className = 'info-product-modal';
                m.id = 'info-product-modal';
                m.innerHTML = '<div class="info-product-modal-content"><button class="info-product-modal-close" type="button" aria-label="Закрыть">×</button><div id="info-product-modal-body"><div class="info-product-modal-loading">Загрузка товара...</div></div></div>';
                document.body.appendChild(m);
                m.querySelector('.info-product-modal-close').addEventListener('click', closeModal);
                m.addEventListener('click', function(e) { if (e.target === m) closeModal(); });
                document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
            }
            return m;
        }

        function closeModal() {
            var m = document.getElementById('info-product-modal');
            if (m) m.classList.remove('active');
            document.body.style.overflow = '';
        }

        function showToast(msg) {
            var old = document.querySelector('.info-toast');
            if (old) old.remove();
            var t = document.createElement('div');
            t.className = 'info-toast';
            t.textContent = msg;
            document.body.appendChild(t);
            setTimeout(function() {
                t.style.opacity = '0';
                setTimeout(function() { t.remove(); }, 300);
            }, 2500);
        }

        function renderModal(found) {
            var p = found.product;
            var opt = found.option;
            var size = found.size;
            var stock = opt.stock || 'Много';
            var stockClass = stock === 'Под заказ' ? 'on-order' : 'in-stock';
            var stockText = stock === 'Под заказ' ? 'Под заказ' : 'В наличии';
            var productUrl = '/' + found.cat + '/' + translitLocal(p.name) + '--' + opt.sku;

            var h = '';
            h += '<div class="info-product-modal-brand">' + (p.brand || '') + '</div>';
            h += '<h2 class="info-product-modal-name">' + (p.name || '') + '</h2>';
            h += '<div class="info-product-modal-sku">Артикул: ' + opt.sku + '</div>';
            h += '<div class="info-product-modal-grid">';
            h += '<div class="info-product-modal-image"><img src="/' + (p.photo || 'images/logo.png') + '" alt="" onerror="this.src=\\'/images/logo.png\\'"></div>';
            h += '<div class="info-product-modal-info">';
            h += '<div class="info-product-modal-price">' + (opt.price || 0).toLocaleString('ru-RU') + ' ₽</div>';
            h += '<div class="info-product-modal-stock ' + stockClass + '">' + stockText + '</div>';
            if (size && size.volume) {
                h += '<div style="font-size:13px;color:#6a7a8a;margin-top:8px;">Фасовка: <strong>' + size.volume + '</strong>' + (size.fill ? ' (' + size.fill + ')' : '') + '</div>';
            }
            h += '</div>';
            h += '</div>';
            if (p.desc) h += '<div class="info-product-modal-description"><strong>Описание:</strong><br>' + p.desc + '</div>';
            if (p.tech) h += '<div class="info-product-modal-tech"><strong>Характеристики:</strong><br>' + p.tech + '</div>';
            h += '<div class="info-product-modal-buy">';
            h += '<div class="info-product-modal-price-large">' + (opt.price || 0).toLocaleString('ru-RU') + ' ₽</div>';
            h += '<div>';
            if (stock === 'Под заказ') {
                h += '<button class="info-product-modal-btn buy" disabled>Под заказ</button>';
            } else {
                h += '<button class="info-product-modal-btn buy" id="info-modal-buy">В корзину</button>';
            }
            h += '<a class="info-product-modal-btn page" href="' + productUrl + '">Открыть страницу</a>';
            h += '</div>';
            h += '</div>';

            document.getElementById('info-product-modal-body').innerHTML = h;

            var buyBtn = document.getElementById('info-modal-buy');
            if (buyBtn) {
                buyBtn.addEventListener('click', function() {
                    var cart = window.CMSK_CART.getCart();
                    var key = opt.sku + (opt.color ? '|' + opt.color : '') + (opt.gloss ? '|' + opt.gloss : '');
                    var found2 = null;
                    for (var i = 0; i < cart.length; i++) {
                        if (cart[i].key === key) { found2 = cart[i]; break; }
                    }
                    if (found2) found2.qty = (parseInt(found2.qty) || 1) + 1;
                    else cart.push({
                        key: key,
                        brand: p.brand || '',
                        name: p.name || '',
                        sku: opt.sku,
                        price: opt.price || 0,
                        color: opt.color || '',
                        gloss: opt.gloss || '',
                        volume: size.volume || '',
                        fill: size.fill || '',
                        photo: p.photo || '',
                        qty: 1,
                        cat: found.cat
                    });
                    window.CMSK_CART.saveCart(cart);
                    window.CMSK_CART.updateFabCount();
                    window.CMSK_CART.renderCart();
                    showToast('Товар добавлен в корзину');
                    closeModal();
                });
            }
        }

        document.addEventListener('click', function(e) {
            var link = e.target.closest('a[data-sku]');
            if (!link) return;
            e.preventDefault();
            var sku = link.getAttribute('data-sku');
            if (!sku) return;
            var modal = getModal();
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            document.getElementById('info-product-modal-body').innerHTML = '<div class="info-product-modal-loading">Загрузка...</div>';
            findProductBySku(sku).then(function(found) {
                if (!found) {
                    document.getElementById('info-product-modal-body').innerHTML = '<div class="info-product-modal-loading">Товар не найден: ' + sku + '</div>';
                    return;
                }
                renderModal(found);
            });
        });
    })();
    </script>`;
}

// ============================================================
// СТРАНИЦА: КАТЕГОРИЯ
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
        renderAnalytics() + '\n' +
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
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCategoryScript(category) + '\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
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
                    cat: card.getAttribute('data-category') || category
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

function renderBrandPage(brandSlug, brandName, products) {
    const brandUrl = SITE_URL + '/brands/' + brandSlug;
    const title = brandName + ' — купить продукцию бренда в Москве | КолорМСК';
    const description = 'Купить продукцию ' + brandName + ' в Москве с доставкой. Каталог товаров бренда ' + brandName + ' по низким ценам. Оптом и в розницу.';

    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": brandName, "item": brandUrl }
        ]
    };

    const schemaBrand = {
        "@context": "https://schema.org/",
        "@type": "Brand",
        "name": brandName,
        "url": brandUrl
    };

    const schemaCollection = {
        "@context": "https://schema.org/",
        "@type": "CollectionPage",
        "name": brandName,
        "url": brandUrl,
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": products.length,
            "itemListElement": products.slice(0, 30).map(function(item, idx) {
                const p = item.product;
                const opt = p.sizes && p.sizes[0] && p.sizes[0].options && p.sizes[0].options[0];
                if (!opt) return null;
                const url = SITE_URL + '/' + item.category + '/' + translit(p.name) + '--' + opt.sku;
                return { "@type": "ListItem", "position": idx + 1, "url": url, "name": p.brand + ' ' + p.name };
            }).filter(Boolean)
        }
    };

    let cardsHtml = '';
    products.forEach(function(item) {
        const category = item.category;
        const product = item.product;
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
        '<link rel="canonical" href="' + brandUrl + '">\n' +
        renderAnalytics() + '\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBreadcrumbs) + '</script>\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaBrand) + '</script>\n' +
        '<script type="application/ld+json">' + JSON.stringify(schemaCollection) + '</script>\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar('') + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › ' + escapeHtml(brandName) + '</div>\n' +
        '<h1 class="page-title">' + escapeHtml(brandName) + '</h1>\n' +
        '<div class="cat-grid" id="cat-grid">' + cardsHtml + '</div>\n' +
        renderHitsBlock() + '\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        renderCartFab() + '\n' +
        renderCartModal() + '\n' +
        renderAccountModal() + '\n' +
        '<div class="toast" id="toast">Товар добавлен в корзину</div>\n' +
        renderCategoryScript('__brand__') + '\n' +
        renderCartScript() + '\n' +
        renderHitsScript() + '\n' +
        renderSearchScript() + '\n' +
        '</body>\n</html>';
}

// ============================================================
// Роуты
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

function collectBrandProducts(brandConfig) {
    const result = [];
    Object.keys(CATEGORIES).forEach(function(cat) {
        const products = loadCategory(cat);
        if (!products) return;
        products.forEach(function(p) {
            if (brandConfig.match.indexOf(p.brand) !== -1) {
                result.push({ category: cat, product: p });
            }
        });
    });
    return result;
}

app.get('/brands/:brand', (req, res) => {
    const brandSlug = req.params.brand;
    const brandConfig = BRANDS[brandSlug];
    if (!brandConfig) return res.sendFile(path.join(ROOT, 'index.html'));
    const products = collectBrandProducts(brandConfig);
    if (!products.length) return res.sendFile(path.join(ROOT, 'index.html'));
    res.send(renderBrandPage(brandSlug, brandConfig.name, products));
});

app.get('/:category/:slug--:sku', (req, res) => {
    const category = req.params.category;
    const sku = req.params.sku;
    if (!CATEGORIES[category]) return res.sendFile(path.join(ROOT, 'index.html'));
    const products = loadCategory(category);
    if (!products) return res.sendFile(path.join(ROOT, 'index.html'));

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
    if (!foundProduct) return res.sendFile(path.join(ROOT, 'index.html'));
    res.send(renderProductPage(category, foundProduct, foundOption));
});

app.get('/', (req, res) => {
    res.send(renderHomePage());
});

// Статика — ПЕРЕД /:category, чтобы /dostavka.html и другие .html отдавались как файлы
app.use(express.static(ROOT));

// ------------------------------------------------------------
// Роут: страница «Доставка и оплата»
// ------------------------------------------------------------
app.get('/dostavka', (req, res) => {
    res.send(renderDeliveryPage());
});

// ------------------------------------------------------------
// Роут: страница «Каталог цветов»
// ------------------------------------------------------------
app.get('/catalog-colors', (req, res) => {
    res.send(renderCatalogColorsPage());
});

// ------------------------------------------------------------
// Роут: страница «Полезная информация»
// ------------------------------------------------------------
app.get('/info', (req, res) => {
    res.send(renderInfoPage());
});

// ------------------------------------------------------------
// Роут: страница «Оптовые поставки»
// ------------------------------------------------------------
app.get('/opt', (req, res) => {
    res.send(renderOptPage());
});

app.get('/:category', (req, res) => {
    const category = req.params.category;
    if (!CATEGORIES[category]) return res.sendFile(path.join(ROOT, 'index.html'));
    const products = loadCategory(category);
    if (!products) return res.sendFile(path.join(ROOT, 'index.html'));
    res.send(renderCategoryPage(category, products));
});

app.use((req, res) => {
    res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
    console.log('SSR-сервер запущен на порту ' + PORT);
});
