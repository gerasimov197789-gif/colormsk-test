// ============================================================
// === ЧАСТЬ 1 из 4 ===
// ============================================================
// Сервер SSR для colormsk.ru
// Express + Node.js
// Рендерит страницы товаров, разделов, брендов, главную
// ============================================================

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const ROOT = '/var/www/colormsk';
const SITE_URL = 'https://colormsk.ru';

// ------------------------------------------------------------
// Справочник категорий (slug -> читаемое имя)
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
// Транслитерация (кириллица -> латиница)
// Используется для формирования URL товара
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
// Экранирование HTML (защита от XSS)
// ------------------------------------------------------------
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ------------------------------------------------------------
// Форматирование цены (число -> "1 075")
// ------------------------------------------------------------
function formatPrice(price) {
    return String(price || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
// ============================================================
// === ЧАСТЬ 2 из 4 ===
// ============================================================
// Компоненты страницы: шапка, левый сайдбар, правый сайдбар, футер
// ============================================================

// ------------------------------------------------------------
// ШАПКА
// ------------------------------------------------------------
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
        <a href="/cart" class="t-cart-btn" id="t-cart-btn" title="Корзина">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
            </svg>
            <span class="t-cart-count" id="t-cart-count">0</span>
        </a>
    </header>`;
}

// ------------------------------------------------------------
// ЛЕВЫЙ САЙДБАР
// Активная категория передаётся параметром (подсвечивается)
// ------------------------------------------------------------
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
        </nav>
    </aside>`;
}

// ------------------------------------------------------------
// ПРАВЫЙ САЙДБАР (доставка, каталоги, информация)
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// ФУТЕР (SEO-текст)
// ------------------------------------------------------------
function renderFooter() {
    return `<footer class="t-seo-footer">
        <div style="max-width:1200px;margin:0 auto;">
            <h3>Лакокрасочные материалы в Москве — ColorMSK / Колор МСК</h3>
            <p>Магазин лакокрасочных материалов «Колор МСК» предлагает <strong>купить краску, эмаль, лак, грунтовку, антисептик</strong> и декоративные штукатурки в Москве с доставкой. Работаем с розничными и оптовыми покупателями. <strong>Промышленные лакокрасочные материалы — поставщик Москва</strong> — от ведущих производителей: <a href="/symphony.html">SYMPHONY (Симфония)</a>, <a href="/decotech.html">DecoTech (Декотек)</a>.</p>
            <p><strong>Купить лакокрасочные материалы оптом в Москве</strong> можно по телефону <a href="tel:+79036692534">+7 (903) 669-25-34</a> или на сайте colormsk.ru. <a href="/opt.html">Оптовые поставки ЛКМ</a> — для строительных организаций. <a href="/dostavka.html">Доставка и оплата</a> — по Москве, МО и РФ.</p>
        </div>
    </footer>`;
}
// ============================================================
// === ЧАСТЬ 3 из 4 ===
// ============================================================
// renderStyles — полные CSS-стили
// renderProductPage — идеальная страница товара
// ============================================================

// ------------------------------------------------------------
// СТИЛИ
// ------------------------------------------------------------
function renderStyles() {
    return `<style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-image: url('/images/background.jpg'); background-size: cover; background-position: center; background-attachment: fixed; background-color: #f5f5f5; color: #1a2a3a; min-height: 100vh; }

        /* --- Шапка --- */
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

        /* --- Иконка корзины в шапке --- */
        .t-cart-btn { position: relative; display: flex; align-items: center; justify-content: center; width: 42px; height: 42px; border-radius: 10px; background: rgba(255,255,255,.1); color: #fff; text-decoration: none; transition: background .2s; }
        .t-cart-btn:hover { background: rgba(255,255,255,.2); }
        .t-cart-count { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: #ff5c5c; color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }

        /* --- Раскладка --- */
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

        /* --- Страница товара --- */
        .product-page { background: rgba(255,255,255,.97); border-radius: 14px; padding: 30px; box-shadow: 0 2px 12px rgba(0,0,0,.06); max-width: 1000px; }
        .breadcrumbs { font-size: 13px; color: #6a7a8a; margin-bottom: 20px; }
        .breadcrumbs a { color: #6a7a8a; text-decoration: none; }
        .breadcrumbs a:hover { color: #1a2a3a; }

        .product-grid { display: grid; grid-template-columns: 340px 1fr; gap: 30px; margin-bottom: 20px; }
        .product-photo-block { text-align: center; }
        .product-photo { width: 100%; max-width: 340px; border-radius: 12px; background: #f8faff; border: 1px solid #eef1f5; }

        .product-info-block { min-width: 0; }
        .brand { font-size: 14px; color: #6a7a8a; margin-bottom: 4px; }
        .product-title { font-size: 26px; font-weight: 700; color: #1a2a3a; line-height: 1.25; margin-bottom: 8px; }
        .sku { font-size: 13px; color: #9aaabb; margin-bottom: 12px; }
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

        .btn-cart { padding: 14px 32px; background: #f1f5f9; color: #1a2a3a; border: 1px solid #e2e8f0; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .2s; }
        .btn-cart:hover { background: #e2e8f0; }
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

        /* --- Подсказка «Добавлено» --- */
        .toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px); background: rgba(26,42,58,.95); color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; transition: all .3s; z-index: 5000; box-shadow: 0 8px 30px rgba(0,0,0,.3); pointer-events: none; }
        .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        /* --- Футер --- */
        .t-seo-footer { background: rgba(26,42,58,.95); color: rgba(255,255,255,.7); padding: 30px; margin-top: 30px; font-size: 12px; line-height: 1.6; }
        .t-seo-footer h3 { color: #fff; font-size: 16px; margin-bottom: 10px; }
        .t-seo-footer a { color: #ffd166; text-decoration: none; }
        .t-seo-footer a:hover { text-decoration: underline; }

        /* --- Адаптив --- */
        @media (max-width: 1100px) {
            .t-sidebar-right { display: none; }
        }
        @media (max-width: 800px) {
            .t-sidebar { display: none; }
            .t-header { padding: 10px 15px; flex-wrap: wrap; }
            .t-search-wrapper { width: 100%; order: 3; margin-top: 8px; }
            .product-grid { grid-template-columns: 1fr; }
            .product-title { font-size: 20px; }
            .price { font-size: 26px; }
        }
    </style>`;
}

// ------------------------------------------------------------
// ГЛАВНАЯ ФУНКЦИЯ — страница товара
// product — объект товара из JSON
// firstOption — первый option (для title, description, canonical)
// ------------------------------------------------------------
function renderProductPage(category, product, firstOption) {
    const categoryName = CATEGORIES[category] || category;
    const productUrl = SITE_URL + '/' + category + '/' + translit(product.name) + '--' + firstOption.sku;

    const title = product.brand + ' ' + product.name + ' — купить в Москве | КолорМСК';
    const description = 'Купить ' + product.brand + ' ' + product.name + ' по цене от ' + formatPrice(firstOption.price) + ' ₽. ' + categoryName + ' с доставкой по Москве и РФ. Артикул: ' + firstOption.sku + '.';

    const photoUrl = SITE_URL + '/' + (product.photo || 'images/logo.png');

    // --- Селект «Фасовка» ---
    let sizesHtml = '';
    if (product.sizes && product.sizes.length > 0) {
        sizesHtml += '<div class="select-group"><label>Фасовка</label>';
        sizesHtml += '<select id="size-select">';
        product.sizes.forEach(function(size, idx) {
            const opt = size.options && size.options[0] || {};
            sizesHtml += '<option value="' + idx + '">' + size.volume + ' (' + size.fill + ') — ' + formatPrice(opt.price) + ' ₽</option>';
        });
        sizesHtml += '</select></div>';
    }

    // --- Селект «Цвет» / «База» / «Блеск» ---
    let colorHtml = '';
    if (product.selectorLabel && product.colors && product.colors.length > 0) {
        colorHtml += '<div class="select-group"><label>' + escapeHtml(product.selectorLabel) + '</label>';
        colorHtml += '<select id="color-select">';
        product.colors.forEach(function(color, idx) {
            colorHtml += '<option value="' + idx + '">' + escapeHtml(color) + '</option>';
        });
        colorHtml += '</select></div>';
    }

    // --- Характеристики ---
    let specsHtml = '';
    if (product.tech) {
        specsHtml += '<div class="tech"><strong>Характеристики:</strong>';
        specsHtml += '<div class="specs-list">';
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

    // --- Schema.org Product (JSON-LD) ---
    const schemaProduct = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.brand + ' ' + product.name,
        "image": photoUrl,
        "description": product.desc,
        "sku": firstOption.sku,
        "brand": {
            "@type": "Brand",
            "name": product.brand
        },
        "offers": {
            "@type": "Offer",
            "url": productUrl,
            "priceCurrency": "RUB",
            "price": firstOption.price,
            "availability": firstOption.stock === 'Под заказ' ? "https://schema.org/PreOrder" : "https://schema.org/InStock"
        }
    };

    // --- Schema.org BreadcrumbList (JSON-LD) ---
    const schemaBreadcrumbs = {
        "@context": "https://schema.org/",
        "@type": "BreadcrumbList",
        "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Главная", "item": SITE_URL + "/" },
            { "@type": "ListItem", "position": 2, "name": categoryName, "item": SITE_URL + "/" + category },
            { "@type": "ListItem", "position": 3, "name": product.name, "item": productUrl }
        ]
    };

    // --- Сборка HTML ---
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
        '<div class="product-page">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › <a href="/' + category + '">' + categoryName + '</a> › ' + escapeHtml(product.name) + '</div>\n' +
        '<div class="product-grid">\n' +
        '<div class="product-photo-block">\n' +
        '<img class="product-photo" src="' + photoUrl + '" alt="' + escapeHtml(product.brand + ' ' + product.name) + '">\n' +
        '</div>\n' +
        '<div class="product-info-block">\n' +
        '<div class="brand">' + escapeHtml(product.brand) + '</div>\n' +
        '<h1 class="product-title">' + escapeHtml(product.name) + '</h1>\n' +
        '<div class="sku">Артикул: <span id="sku-value">' + firstOption.sku + '</span></div>\n' +
        '<div class="stock in-stock" id="stock-value">' + escapeHtml(firstOption.stock || 'В наличии') + '</div>\n' +
        '<div class="selectors">' + sizesHtml + colorHtml + '</div>\n' +
        '<div class="price-row">\n' +
        '<div class="price"><span id="price-value">' + formatPrice(firstOption.price) + '</span><span class="currency">₽</span></div>\n' +
        '<button class="btn-cart" id="btn-cart" type="button">В корзину</button>\n' +
        '</div>\n' +
        '</div>\n' +
        '</div>\n' +
        '<div class="product-desc"><strong>Описание:</strong><br>' + escapeHtml(product.desc) + '</div>\n' +
        specsHtml +
        '<a href="/' + category + '" class="btn-back">← Вернуться в каталог</a>\n' +
        '</div>\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n' +
        '<div class="toast" id="toast">Добавлено в корзину</div>\n' +
        renderProductScript(product, category) + '\n' +
        '</body>\n</html>';
}
// ============================================================
// === ЧАСТЬ 4 из 4 ===
// ============================================================
// renderProductScript — JS-интерактив на странице товара
// SSR-роуты
// app.listen
// ============================================================

// ------------------------------------------------------------
// JS-СКРИПТ на странице товара
// - обновление цены при смене фасовки/цвета
// - кнопка «В корзину» (в localStorage)
// - счётчик корзины в шапке
// ------------------------------------------------------------
function renderProductScript(product, category) {
    // Преобразуем данные в JSON для встраивания в скрипт
    const sizesJson = JSON.stringify(product.sizes || []);
    const categoryJson = JSON.stringify(category);

    return `<script>
    (function() {
        var SIZES = ${sizesJson};
        var CATEGORY = ${categoryJson};
        var PRODUCT_NAME = ${JSON.stringify(product.brand + ' ' + product.name)};
        var PRODUCT_PHOTO = ${JSON.stringify(product.photo || '')};

        var sizeSelect = document.getElementById('size-select');
        var colorSelect = document.getElementById('color-select');
        var priceEl = document.getElementById('price-value');
        var skuEl = document.getElementById('sku-value');
        var stockEl = document.getElementById('stock-value');
        var btnCart = document.getElementById('btn-cart');
        var toast = document.getElementById('toast');
        var cartCountEl = document.getElementById('t-cart-count');

        // Форматирование цены
        function fmt(price) {
            return String(price || 0).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ' ');
        }

        // Обновление цены и SKU по текущему выбору
        function updatePrice() {
            var si = sizeSelect ? parseInt(sizeSelect.value) : 0;
            var size = SIZES[si];
            if (!size || !size.options) return;

            var optIdx = 0;
            if (colorSelect && size.options.length > 0) {
                // Ищем option, соответствующий выбранному цвету
                var colorText = colorSelect.options[colorSelect.selectedIndex].textContent;
                for (var i = 0; i < size.options.length; i++) {
                    if (size.options[i].color === colorText) { optIdx = i; break; }
                }
            }
            var opt = size.options[optIdx];
            if (!opt) return;

            if (priceEl) priceEl.textContent = fmt(opt.price);
            if (skuEl) skuEl.textContent = opt.sku;
            if (stockEl) {
                stockEl.textContent = opt.stock || 'В наличии';
                stockEl.className = 'stock ' + (opt.stock === 'Под заказ' ? 'on-order' : 'in-stock');
            }
            btnCart.dataset.sku = opt.sku;
            btnCart.dataset.price = opt.price;
            btnCart.dataset.name = PRODUCT_NAME;
            btnCart.dataset.photo = PRODUCT_PHOTO;
        }

        // Обновление списка цветов при смене фасовки
        function updateColors() {
            if (!colorSelect || !sizeSelect) return;
            var si = parseInt(sizeSelect.value);
            var size = SIZES[si];
            if (!size || !size.options) return;

            var currentColors = [];
            var seen = {};
            size.options.forEach(function(o) {
                if (o.color && !seen[o.color]) { seen[o.color] = 1; currentColors.push(o.color); }
            });
            if (currentColors.length === 0) return;

            var prev = colorSelect.value;
            colorSelect.innerHTML = '';
            currentColors.forEach(function(c, i) {
                var opt = document.createElement('option');
                opt.value = i;
                opt.textContent = c;
                colorSelect.appendChild(opt);
            });
            if (prev && prev < colorSelect.options.length) colorSelect.value = prev;
        }

        // Инициализация
        updatePrice();

        if (sizeSelect) {
            sizeSelect.addEventListener('change', function() {
                updateColors();
                updatePrice();
            });
        }
        if (colorSelect) {
            colorSelect.addEventListener('change', updatePrice);
        }

        // --- КОРЗИНА ---
        function getCart() {
            try { return JSON.parse(localStorage.getItem('colormsk_cart') || '[]'); }
            catch (e) { return []; }
        }
        function saveCart(cart) {
            try { localStorage.setItem('colormsk_cart', JSON.stringify(cart)); } catch (e) {}
        }
        function updateCartCount() {
            var cart = getCart();
            var total = 0;
            cart.forEach(function(item) { total += item.qty || 1; });
            if (cartCountEl) cartCountEl.textContent = total;
        }
        function showToast(msg) {
            if (!toast) return;
            toast.textContent = msg;
            toast.classList.add('show');
            setTimeout(function() { toast.classList.remove('show'); }, 2000);
        }

        if (btnCart) {
            btnCart.addEventListener('click', function() {
                var sku = btnCart.dataset.sku;
                var price = parseInt(btnCart.dataset.price) || 0;
                var name = btnCart.dataset.name;
                var photo = btnCart.dataset.photo;
                if (!sku) return;

                var cart = getCart();
                var found = null;
                for (var i = 0; i < cart.length; i++) {
                    if (cart[i].sku === sku) { found = cart[i]; break; }
                }
                if (found) {
                    found.qty = (found.qty || 1) + 1;
                } else {
                    cart.push({ sku: sku, name: name, price: price, photo: photo, qty: 1, category: CATEGORY });
                }
                saveCart(cart);
                updateCartCount();
                showToast('Товар добавлен в корзину');
            });
        }

        // Счётчик корзины при загрузке страницы
        updateCartCount();
    })();
    </script>`;
}

// ------------------------------------------------------------
// Роут: страница товара
// Пример: /antiseptiki/antiseptik-v-e-wood-guard-c--00-00009689
// ------------------------------------------------------------
app.get('/:category/:slug--:sku', (req, res) => {
    const category = req.params.category;
    const sku = req.params.sku;

    if (!CATEGORIES[category]) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }

    const jsonPath = path.join(ROOT, 'products', category + '.json');
    if (!fs.existsSync(jsonPath)) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }

    try {
        let content = fs.readFileSync(jsonPath, 'utf8');
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        const products = JSON.parse(content);

        let foundProduct = null;
        let foundOption = null;

        for (let i = 0; i < products.length; i++) {
            const product = products[i];
            if (!product.sizes) continue;
            for (let j = 0; j < product.sizes.length; j++) {
                const size = product.sizes[j];
                if (!size.options) continue;
                for (let k = 0; k < size.options.length; k++) {
                    const option = size.options[k];
                    if (option.sku === sku) {
                        foundProduct = product;
                        foundOption = option;
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
    } catch (e) {
        console.error('Ошибка SSR:', e);
        res.sendFile(path.join(ROOT, 'index.html'));
    }
});

// ------------------------------------------------------------
// Роут: раздел (пока — отдаём index.html, доработаем позже)
// ------------------------------------------------------------
app.get('/:category', (req, res) => {
    const category = req.params.category;
    if (CATEGORIES[category]) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }
    res.sendFile(path.join(ROOT, 'index.html'));
});

// ------------------------------------------------------------
// Статика (CSS, JS, изображения)
// ------------------------------------------------------------
app.use(express.static(ROOT));

// ------------------------------------------------------------
// Fallback: всё остальное — на index.html (SPA)
// ------------------------------------------------------------
app.use((req, res) => {
    res.sendFile(path.join(ROOT, 'index.html'));
});

// ------------------------------------------------------------
// Запуск сервера
// ------------------------------------------------------------
app.listen(PORT, () => {
    console.log('SSR-сервер запущен на порту ' + PORT);
});

