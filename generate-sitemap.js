// generate-sitemap.js
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = './output';
const SITE_URL = 'https://colormsk.ru';

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
  { url: '/catalog-colors', priority: '0.7', changefreq: 'monthly' },
  { url: '/info', priority: '0.6', changefreq: 'monthly' },
  { url: '/dostavka.html', priority: '0.6', changefreq: 'monthly' },
  { url: '/opt.html', priority: '0.6', changefreq: 'monthly' },
  { url: '/privacy.html', priority: '0.3', changefreq: 'yearly' }
];

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
  
  const categories = fs.readdirSync(OUTPUT_DIR).filter(f => {
    return fs.statSync(path.join(OUTPUT_DIR, f)).isDirectory();
  });
  
  let totalProducts = 0;
  categories.forEach(category => {
    const categoryDir = path.join(OUTPUT_DIR, category);
    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.html'));
    
    files.forEach(file => {
      const url = `${SITE_URL}/${category}/${file.replace('.html', '')}`;
      urls.push(`  <url>
    <loc>${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
      totalProducts++;
    });
    
    console.log(`${category}: ${files.length} товаров`);
  });
  
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
  
  fs.writeFileSync('./sitemap.xml', sitemap, 'utf8');
  console.log(`\nГотово. Всего URL: ${urls.length}, товаров: ${totalProducts}`);
}

generateSitemap();