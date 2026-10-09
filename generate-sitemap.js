// generate-sitemap.js — читает products/*.json, генерирует sitemap.xml
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = './products';
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

const MAIN_PAGES = [
  { url: '/', priority: '1.0', changefreq: 'daily' },
  { url: '/antiseptiki', priority: '0.9', changefreq: 'weekly' },
  { url: '/kraski-interiernye', priority: '0.9', changefreq: 'weekly' },
  { url: '/kraski-fasadnye', priority: '0.9', changefreq: 'weekly' },
  { url: '/laki', priority: '0.9', changefreq: 'weekly' },
  { url: '/gruntovki', priority: '0.9', changefreq: 'weekly' },
  { url: '/dekorativnye-shtukaturki', priority: '0.9', changefreq: 'weekly' },
  { url: '/alkidnye-kraski', priority: '0.9', changefreq: 'weekly' },
  { url: '/rastvoriteli', priority: '0.9', changefreq: 'weekly' },
  { url: '/brands/symphony', priority: '0.8', changefreq: 'weekly' },
  { url: '/brands/decotech', priority: '0.8', changefreq: 'weekly' },
  { url: '/brands/artigiano', priority: '0.8', changefreq: 'weekly' },
  { url: '/catalog-colors', priority: '0.7', changefreq: 'monthly' },
  { url: '/info', priority: '0.6', changefreq: 'monthly' },
  { url: '/dostavka', priority: '0.6', changefreq: 'monthly' },
  { url: '/opt', priority: '0.6', changefreq: 'monthly' },
  { url: '/privacy', priority: '0.3', changefreq: 'yearly' }
];

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

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const today = new Date().toISOString().split('T')[0];

function generateSitemap() {
  const urls = [];

  MAIN_PAGES.forEach(page => {
    urls.push(`  <url>
    <loc>${SITE_URL}${page.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`);
  });

  let totalProducts = 0;
  const files = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.json'));

  files.forEach(file => {
    const category = file.replace('.json', '');
    if (!CATEGORIES[category]) return;

    let content = fs.readFileSync(path.join(PRODUCTS_DIR, file), 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

    let products;
    try {
      products = JSON.parse(content);
    } catch (e) {
      console.error(`Ошибка в ${file}:`, e.message);
      return;
    }

    products.forEach(product => {
      if (!product.sizes || !product.sizes[0]) return;
      const size = product.sizes[0];
      if (!size.options || !size.options[0]) return;
      const opt = size.options[0];

      const slug = translit(product.name);
      const url = `${SITE_URL}/${category}/${slug}--${opt.sku}`;
      urls.push(`  <url>
    <loc>${escapeXml(url)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
      totalProducts++;
    });

    console.log(`${category}: ${products.length} товаров`);
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  fs.writeFileSync('./sitemap.xml', sitemap, 'utf8');
  console.log(`\nГотово. Всего URL: ${urls.length}, товаров: ${totalProducts}`);
}

generateSitemap();
