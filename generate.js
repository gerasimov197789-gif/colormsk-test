// generate.js — генератор статических HTML для товаров
const fs = require('fs');
const path = require('path');

const PRODUCTS_DIR = './products';
const OUTPUT_DIR = './output';
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

function generateProductHtml(product, category, categoryName, firstOption) {
  const url = `${SITE_URL}/${category}/${translit(product.name)}--${firstOption.sku}`;
  const title = `${product.brand} ${product.name} — купить в Москве | КолорМСК`;
  const description = `Купить ${product.brand} ${product.name} по цене от ${firstOption.price} ₽. ${categoryName} с доставкой по Москве и РФ. Артикул: ${firstOption.sku}.`;
  
  return `<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${url}">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; color: #1a2a3a; }
        .container { max-width: 900px; margin: 0 auto; background: #fff; border-radius: 14px; padding: 30px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
        h1 { font-size: 28px; margin-bottom: 8px; }
        .brand { font-size: 16px; color: #6a7a8a; margin-bottom: 4px; }
        .sku { font-size: 13px; color: #9aaabb; margin-bottom: 16px; }
        .price { font-size: 32px; font-weight: 700; margin: 16px 0; }
        .price .currency { font-size: 18px; font-weight: 400; color: #6a7a8a; }
        .stock { display: inline-block; padding: 4px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
        .stock.in-stock { color: #3d7a4a; background: rgba(61,122,74,.12); }
        .stock.on-order { color: #d4880f; background: rgba(212,136,15,.12); }
        .photo { max-width: 300px; border-radius: 10px; margin: 20px 0; }
        .desc { line-height: 1.6; margin: 20px 0; color: #2c3e50; }
        .tech { background: #f8faff; border-radius: 10px; padding: 16px; margin: 16px 0; line-height: 1.6; font-size: 14px; color: #3d5166; }
        .back { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #1a2a3a; color: #fff; text-decoration: none; border-radius: 8px; }
        .breadcrumbs { font-size: 13px; color: #6a7a8a; margin-bottom: 20px; }
        .breadcrumbs a { color: #6a7a8a; text-decoration: none; }
    </style>
</head>
<body>
    <div class="container">
        <div class="breadcrumbs">
            <a href="${SITE_URL}/">Главная</a> › 
            <a href="${SITE_URL}/${category}">${categoryName}</a> › 
            ${escapeHtml(product.name)}
        </div>
        <div class="brand">${escapeHtml(product.brand)}</div>
        <h1>${escapeHtml(product.name)}</h1>
        <div class="sku">Артикул: ${firstOption.sku}</div>
        <div class="stock ${firstOption.stock === 'Под заказ' ? 'on-order' : 'in-stock'}">${escapeHtml(firstOption.stock)}</div>
        <img class="photo" src="${SITE_URL}/${product.photo}" alt="${escapeHtml(product.name)}">
        <div class="price">${firstOption.price.toLocaleString('ru-RU')} <span class="currency">₽</span></div>
        <div class="desc"><strong>Описание:</strong><br>${escapeHtml(product.desc)}</div>
        <div class="tech"><strong>Характеристики:</strong><br>${escapeHtml(product.tech)}</div>
        <a href="${SITE_URL}/${category}" class="back">← Вернуться в каталог</a>
    </div>
</body>
</html>`;
}

function generateAll() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
  }
  
  let totalGenerated = 0;
  const categories = fs.readdirSync(PRODUCTS_DIR).filter(f => f.endsWith('.json'));
  
  console.log(`Найдено JSON-файлов: ${categories.length}`);
  
  categories.forEach(file => {
    const category = file.replace('.json', '');
    const categoryName = CATEGORIES[category] || category;
    const filePath = path.join(PRODUCTS_DIR, file);
    
    console.log(`\nОбработка: ${category} (${categoryName})`);
    
    // === Читаем файл и убираем BOM ===
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    
    const products = JSON.parse(content);
    console.log(`  Товаров: ${products.length}`);
    
    const categoryDir = path.join(OUTPUT_DIR, category);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    
    products.forEach(product => {
      if (!product.sizes || !product.sizes[0] || !product.sizes[0].options || !product.sizes[0].options[0]) {
        console.log(`  Пропущен: ${product.name} (нет данных)`);
        return;
      }
      
      const firstOption = product.sizes[0].options[0];
      const slug = translit(product.name);
      const fileName = `${slug}--${firstOption.sku}.html`;
      const outputPath = path.join(categoryDir, fileName);
      
      const html = generateProductHtml(product, category, categoryName, firstOption);
      // Убираем BOM из вывода
      fs.writeFileSync(outputPath, html.replace(/^\uFEFF/, ''), 'utf8');
      
      console.log(`  OK: ${fileName}`);
      totalGenerated++;
    });
  });
  
  console.log(`\n=== ГОТОВО ===`);
  console.log(`Сгенерировано HTML-файлов: ${totalGenerated}`);
  console.log(`Результат в папке: ${path.resolve(OUTPUT_DIR)}`);
}

generateAll();