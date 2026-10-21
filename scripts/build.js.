// يجهّز مجلد www: ينسخ index.html ويضمّن الخطوط والمكتبات داخل التطبيق (بدون إنترنت)
const fs = require('fs');
const path = require('path');

const OUT = 'www';
const nm = (...p) => path.join('node_modules', ...p);

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'vendor', 'ffmpeg'), { recursive: true });

/* ---------- 1) الخطوط ---------- */
const FONTS = [
  ['ibm-plex-sans-arabic', [400, 500, 600]],
  ['aref-ruqaa', [400, 700]],
  ['lemonada', [500, 700]],
  ['cairo', [500, 700]],
  ['caveat', [600]],
];
let css = '';
for (const [id, weights] of FONTS) {
  const base = nm('@fontsource', id);
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
html = html
  .replace(/<noscript>\s*<link[^>]*fonts\.googleapis\.com[^>]*>\s*<\/noscript>/g, '')
  .replace(/<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
html = html.replace('</head>', '<style id="local-fonts">\n' + css + '</style>\n</head>');

/* ---------- 2) المكتبات (بدل CDN) ---------- */
// [النص الأصلي في index.html، النص البديل، [[مصدر، وجهة], ...]]
const LIBS = [
  ['تصدير MP4 السريع',
    "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.js",
    "vendor/mp4-muxer.js",
    [[nm('mp4-muxer', 'build', 'mp4-muxer.js'), 'mp4-muxer.js']]],
  ['قراءة PDF',
    "PDFB='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/'+PDFV+'/'",
    "PDFB='vendor/'",
    [[nm('pdfjs-dist', 'build', 'pdf.min.js'), 'pdf.min.js'],
     [nm('pdfjs-dist', 'build', 'pdf.worker.min.js'), 'pdf.worker.min.js']]],
  ['تحويل الفيديو (ffmpeg)',
    "FF_CDN='https://cdn.jsdelivr.net/npm/',FF_LIB=FF_CDN+'@ffmpeg/ffmpeg@0.12.10/dist/umd/',FF_CORE=FF_CDN+'@ffmpeg/core@0.12.6/dist/umd/'",
    "FF_CDN='vendor/',FF_LIB='vendor/ffmpeg/',FF_CORE='vendor/ffmpeg/'",
    [[nm('@ffmpeg', 'ffmpeg', 'dist', 'umd', 'ffmpeg.js'), 'ffmpeg/ffmpeg.js'],
     [nm('@ffmpeg', 'ffmpeg', 'dist', 'umd', '814.ffmpeg.js'), 'ffmpeg/814.ffmpeg.js'],
     [nm('@ffmpeg', 'core', 'dist', 'umd', 'ffmpeg-core.js'), 'ffmpeg/ffmpeg-core.js'],
     [nm('@ffmpeg', 'core', 'dist', 'umd', 'ffmpeg-core.wasm'), 'ffmpeg/ffmpeg-core.wasm']]],
];
for (const [name, from, to, files] of LIBS) {
  const missing = files.filter(([src]) => !fs.existsSync(src));
  if (missing.length) { console.warn('SKIP (يبقى على الإنترنت):', name, '- ناقص:', missing.map(m => m[0]).join(', ')); continue; }
  if (!html.includes(from)) { console.warn('SKIP: لم أجد الرابط في index.html:', name); continue; }
  for (const [src, dst] of files) fs.copyFileSync(src, path.join(OUT, 'vendor', dst));
  html = html.replace(from, to);
  console.log('OK:', name);
}

/* ---------- 3) إضافات أندرويد: زر الرجوع + تسجيل الصوت ---------- */
// نشيل مستمع زر الرجوع القديم (اللي كان بيسأل عن الخروج دايماً) لأن الإضافة بتحل محله
const OLD_BACK = "var AP=C.Plugins.App;if(AP&&AP.addListener)AP.addListener('backButton',function(){if(confirm('هل تريد الخروج من التطبيق؟'))AP.exitApp()});";
if (html.includes(OLD_BACK)) { html = html.replace(OLD_BACK, ''); console.log('OK: removed old back-button listener'); }
else console.warn('WARN: لم أجد مستمع زر الرجوع القديم في index.html (قد يتعارض مع الجديد)');
const OLD_HELP = 'التسجيل المباشر بالميكروفون غير متاح داخل هذه الصفحة، فسجّل التعليق بتطبيق التسجيل في جهازك ثم ارفعه هنا.';
if (html.includes(OLD_HELP)) html = html.replace(OLD_HELP, 'أو اضغط «تسجيل تعليق بالميكروفون» لتسجيله مباشرة.');
else console.warn('WARN: لم أجد رسالة المساعدة القديمة للصوت (غير مؤثر)');
const extras = fs.readFileSync(path.join(__dirname, 'android-extras.js'), 'utf8');
// نحقن قبل آخر </body> (فيه </body> تانية جوه نص برمجي لقالب التصدير ولازم ما نلمسهاش)
const bi = html.lastIndexOf('</body>');
if (bi < 0) throw new Error('لم أجد </body> في index.html');
html = html.slice(0, bi) + '<script id="rs-android-extras">\n' + extras + '\n</script>\n' + html.slice(bi);
console.log('OK: android extras injected');

// إذن الميكروفون في AndroidManifest.xml (لو مجلد android موجود وقت البناء)
const MF = path.join('android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (fs.existsSync(MF)) {
  let x = fs.readFileSync(MF, 'utf8'), add = '';
  for (const perm of ['android.permission.RECORD_AUDIO', 'android.permission.MODIFY_AUDIO_SETTINGS']) {
    if (!x.includes(perm)) add += '    <uses-permission android:name="' + perm + '" />\n';
  }
  if (add) { fs.writeFileSync(MF, x.replace('</manifest>', () => add + '</manifest>')); }
  console.log('OK: microphone permissions in AndroidManifest.xml');
} else {
  console.warn('WARN: AndroidManifest.xml غير موجود وقت البناء. تسجيل الصوت لن يعمل إلا بعد إضافة إذن RECORD_AUDIO يدوياً.');
}

fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('www ready, font faces:', (css.match(/@font-face/g) || []).length);
