// يجهّز مجلد www: ينسخ index.html ويضمّن الخطوط داخل التطبيق (بدون إنترنت)
const fs = require('fs');
const path = require('path');

const OUT = 'www';
const FONTS = [
  ['ibm-plex-sans-arabic', [400, 500, 600]],
  ['aref-ruqaa', [400, 700]],
  ['lemonada', [500, 700]],
  ['cairo', [500, 700]],
  ['caveat', [600]],
];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });

let css = '';
for (const [id, weights] of FONTS) {
  const base = path.join('node_modules', '@fontsource', id);
  for (const w of weights) {
    const cssFile = path.join(base, w + '.css');
    if (!fs.existsSync(cssFile)) { console.warn('skip font:', id, w); continue; }
    const blocks = fs.readFileSync(cssFile, 'utf8').match(/@font-face\s*{[^}]*}/g) || [];
    for (let b of blocks) {
      const m = b.match(/url\(\.\/files\/([^)]+?-(?:arabic|latin)-\d+-normal\.woff2)\)/);
      if (!m) continue; // نستبعد باقي اللغات لتصغير حجم التطبيق
      const src = path.join(base, 'files', m[1]);
      if (!fs.existsSync(src)) continue;
      fs.copyFileSync(src, path.join(OUT, 'fonts', m[1]));
      b = b.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/, '')
           .replace('./files/', 'fonts/');
      css += b + '\n';
    }
  }
}

let html = fs.readFileSync('index.html', 'utf8');
// إزالة روابط Google Fonts
html = html
  .replace(/<noscript>\s*<link[^>]*fonts\.googleapis\.com[^>]*>\s*<\/noscript>/g, '')
  .replace(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
// حقن الخطوط المحلية
html = html.replace('</head>', '<style id="local-fonts">\n' + css + '</style>\n</head>');
fs.writeFileSync(path.join(OUT, 'index.html'), html);

console.log('www ready, font faces:', (css.match(/@font-face/g) || []).length);
