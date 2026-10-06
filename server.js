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

function renderHeader() {
    return `<header class="t-header">
        <div class="t-logo"><img class="t-logo-img" src="/images/logo.png" alt="КолорМСК">
            <div><a href="/">КолорМСК</a>
                <div class="t-slogan">Лакокрасочные материалы</div>
            </div>
        </div>
        <div class="t-contacts"><a href="mailto:info@colormsk.ru">info@colormsk.ru</a><a href="tel:+79036692534">+7 (903) 669-25-34</a></div>
    </header>`;
}

function renderSidebar(activeCat) {
    const items = Object.entries(CATEGORIES).map(([slug, name]) => {
        const active = slug === activeCat ? ' active' : '';
        return `<a href="/${slug}" class="t-nav-link${active}">${name}</a>`;
    }).join('');
    
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

function renderSidebarRight() {
    return `<aside class="t-sidebar-right">
        <div class="t-sidebar-card">
            <h3>Доставка и оплата</h3>
            <p>По Москве и МО — <strong>800 ₽</strong>. Бесплатно от <strong>15 000 ₽</strong>. В регионы — ТК.</p>
            <a href="/dostavka.html" style="display:block;background:rgba(255,209,102,.15);color:#ffd166;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:11px;text-align:center;">Подробнее о доставке</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Каталоги цветов</h3>
            <p>Более 15 000 оттенков по RAL, NCS, Monicolor.</p>
            <a href="/catalog-colors.html" style="display:block;background:rgba(255,209,102,.15);color:#ffd166;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:11px;text-align:center;">Перейти в каталог</a>
        </div>
        <div class="t-sidebar-card">
            <h3>Полезная информация</h3>
            <p>Основные сведения о ЛКМ, технологии окраски.</p>
            <a href="/info.html" style="display:block;background:rgba(255,209,102,.15);color:#ffd166;padding:8px 12px;border-radius:8px;text-decoration:none;font-weight:600;font-size:11px;text-align:center;">Читать подробнее</a>
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
        .t-header { background: rgba(255,255,255,0); padding: 10px 30px; display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 1000; }
        .t-header .t-logo { display: flex; align-items: center; gap: 12px; flex-shrink: 0; margin-right: auto; }
        .t-header .t-logo .t-logo-img { height: 40px; width: auto; border-radius: 4px; }
        .t-header .t-logo a { font-size: 26px; font-weight: 700; color: #fff; text-decoration: none; display: flex; align-items: center; gap: 8px; }
        .t-header .t-logo .t-slogan { font-size: 11px; color: rgba(255,255,255,.6); }
        .t-header .t-contacts { display: flex; align-items: center; gap: 18px; }
        .t-header .t-contacts a { color: rgba(255,255,255,.8); text-decoration: none; font-size: 13px; }
        .t-layout { display: flex; max-width: 100%; min-height: 100vh; width: 100%; align-items: stretch; }
        .t-sidebar { width: 280px; min-width: 280px; background: rgba(26,42,58,.85); padding: 20px 0 0; position: sticky; top: 0; align-self: stretch; min-height: 100vh; overflow-y: auto; z-index: 100; backdrop-filter: blur(10px); }
        .t-sidebar-nav { display: flex; flex-direction: column; gap: 2px; padding: 0 10px; }
        .t-nav-link { display: flex; align-items: center; gap: 10px; padding: 8px 14px; border-radius: 10px; color: rgba(255,255,255,.65); text-decoration: none; font-size: 13px; font-weight: 500; transition: all .2s; }
        .t-nav-link:hover { background: rgba(255,255,255,.08); color: #fff; }
        .t-nav-link.active { background: rgba(200,200,200,.15); color: #ddd; }
        .t-nav-divider { height: 1px; background: rgba(255,255,255,.08); margin: 12px 14px 8px; }
        .t-nav-section-title { font-size: 10px; font-weight: 700; color: rgba(255,255,255,.4); text-transform: uppercase; letter-spacing: 1.2px; padding: 0 14px 8px; }
        .t-nav-external { color: #ffd166 !important; font-weight: 600 !important; }
        .t-main-wrap { flex: 1; display: flex; min-width: 0; width: 100%; }
        .t-main { flex: 1; padding: 20px 24px 30px; min-width: 0; }
        .t-sidebar-right { width: 280px; min-width: 280px; background: rgba(26,42,58,.85); padding: 20px 16px 0; position: sticky; top: 0; align-self: stretch; min-height: 100vh; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; backdrop-filter: blur(10px); }
        .t-sidebar-card { background: rgba(255,255,255,.05); border-radius: 12px; padding: 12px; border: 1px solid rgba(255,255,255,.06); }
        .t-sidebar-card h3 { font-size: 13px; font-weight: 700; color: #fff; margin-bottom: 4px; }
        .t-sidebar-card p { font-size: 11px; color: rgba(255,255,255,.6); line-height: 1.4; margin-bottom: 8px; }
        .product-page { background: rgba(255,255,255,.95); border-radius: 14px; padding: 30px; box-shadow: 0 2px 12px rgba(0,0,0,.06); max-width: 900px; }
        .breadcrumbs { font-size: 13px; color: #6a7a8a; margin-bottom: 20px; }
        .breadcrumbs a { color: #6a7a8a; text-decoration: none; }
        .brand { font-size: 16px; color: #6a7a8a; margin-bottom: 4px; }
        h1 { font-size: 28px; margin-bottom: 8px; color: #1a2a3a; }
        .sku { font-size: 13px; color: #9aaabb; margin-bottom: 16px; }
        .price { font-size: 32px; font-weight: 700; margin: 16px 0; color: #1a2a3a; }
        .price .currency { font-size: 18px; font-weight: 400; color: #6a7a8a; }
        .stock { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
        .stock.in-stock { color: #3d7a4a; background: rgba(61,122,74,.12); }
        .stock.on-order { color: #d4880f; background: rgba(212,136,15,.12); }
        .photo { max-width: 300px; border-radius: 10px; margin: 20px 0; }
        .desc { line-height: 1.6; margin: 20px 0; color: #2c3e50; font-size: 14px; }
        .tech { background: #f8faff; border-radius: 10px; padding: 16px; margin: 16px 0; line-height: 1.6; font-size: 14px; color: #3d5166; }
        .btn-buy { display: inline-block; margin-top: 20px; padding: 14px 30px; background: #1a2a3a; color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px; }
        .btn-buy:hover { background: #2c3e50; }
        .t-seo-footer { background: rgba(26,42,58,.95); color: rgba(255,255,255,.7); padding: 30px; margin-top: 30px; font-size: 12px; line-height: 1.6; }
        .t-seo-footer h3 { color: #fff; font-size: 16px; margin-bottom: 10px; }
        .t-seo-footer a { color: #ffd166; text-decoration: none; }
    </style>`;
}

function renderProductPage(category, product, firstOption) {
    const categoryName = CATEGORIES[category] || category;
    const title = product.brand + ' ' + product.name + ' — купить в Москве | КолорМСК';
    const description = 'Купить ' + product.brand + ' ' + product.name + ' по цене от ' + firstOption.price + ' ₽. ' + categoryName + ' с доставкой по Москве и РФ. Артикул: ' + firstOption.sku + '.';
    const canonical = SITE_URL + '/' + category + '/' + translit(product.name) + '--' + firstOption.sku;
    
    return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n' +
        '<meta charset="UTF-8">\n' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
        '<title>' + escapeHtml(title) + '</title>\n' +
        '<meta name="description" content="' + escapeHtml(description) + '">\n' +
        '<link rel="canonical" href="' + canonical + '">\n' +
        renderStyles() + '\n' +
        '</head>\n<body>\n' +
        renderHeader() + '\n' +
        '<div class="t-layout">\n' +
        renderSidebar(category) + '\n' +
        '<div class="t-main-wrap">\n' +
        '<main class="t-main">\n' +
        '<div class="product-page">\n' +
        '<div class="breadcrumbs"><a href="/">Главная</a> › <a href="/' + category + '">' + categoryName + '</a> › ' + escapeHtml(product.name) + '</div>\n' +
        '<div class="brand">' + escapeHtml(product.brand) + '</div>\n' +
        '<h1>' + escapeHtml(product.name) + '</h1>\n' +
        '<div class="sku">Артикул: ' + firstOption.sku + '</div>\n' +
        '<div class="stock ' + (firstOption.stock === 'Под заказ' ? 'on-order' : 'in-stock') + '">' + escapeHtml(firstOption.stock) + '</div>\n' +
        '<img class="photo" src="' + SITE_URL + '/' + product.photo + '" alt="' + escapeHtml(product.name) + '">\n' +
        '<div class="price">' + firstOption.price.toLocaleString('ru-RU') + ' <span class="currency">₽</span></div>\n' +
        '<div class="desc"><strong>Описание:</strong><br>' + escapeHtml(product.desc) + '</div>\n' +
        '<div class="tech"><strong>Характеристики:</strong><br>' + escapeHtml(product.tech) + '</div>\n' +
        '<a href="/?product=' + firstOption.sku + '" class="btn-buy">🛒 Купить в корзине</a>\n' +
        '</div>\n' +
        renderFooter() + '\n' +
        '</main>\n' +
        renderSidebarRight() + '\n' +
        '</div>\n</div>\n</body>\n</html>';
}

app.use(express.static(ROOT));

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
        console.error('Ошибка:', e);
        res.sendFile(path.join(ROOT, 'index.html'));
    }
});

app.get('/:category', (req, res) => {
    const category = req.params.category;
    if (CATEGORIES[category]) {
        return res.sendFile(path.join(ROOT, 'index.html'));
    }
    res.sendFile(path.join(ROOT, 'index.html'));
});

app.use((req, res) => {
    res.sendFile(path.join(ROOT, 'index.html'));
});

app.listen(PORT, () => {
    console.log('SSR-сервер запущен на порту ' + PORT);
});
