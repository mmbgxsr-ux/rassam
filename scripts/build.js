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
  // استقبال الملفات: زر «مشاركة» (صور/صوت/فيديو/PDF) و«فتح بواسطة» للصوت وPDF
  let m2 = fs.readFileSync(MF, 'utf8');
  if (!m2.includes('RASSAM_SHARE')) {
    const F = '\n        <!-- RASSAM_SHARE -->\n' +
      '        <intent-filter>\n            <action android:name="android.intent.action.SEND" />\n            <category android:name="android.intent.category.DEFAULT" />\n' +
      '            <data android:mimeType="image/*" />\n            <data android:mimeType="audio/*" />\n            <data android:mimeType="video/*" />\n            <data android:mimeType="application/pdf" />\n        </intent-filter>\n' +
      '        <intent-filter>\n            <action android:name="android.intent.action.SEND_MULTIPLE" />\n            <category android:name="android.intent.category.DEFAULT" />\n' +
      '            <data android:mimeType="image/*" />\n            <data android:mimeType="audio/*" />\n        </intent-filter>\n' +
      '        <intent-filter>\n            <action android:name="android.intent.action.VIEW" />\n            <category android:name="android.intent.category.DEFAULT" />\n            <category android:name="android.intent.category.BROWSABLE" />\n' +
      '            <data android:mimeType="audio/*" />\n            <data android:mimeType="application/pdf" />\n        </intent-filter>\n    ';
    if (m2.includes('</activity>')) {
      fs.writeFileSync(MF, m2.replace('</activity>', () => F + '</activity>'));
      console.log('OK: share/open-with intent filters in AndroidManifest.xml');
    } else console.warn('WARN: لم أجد </activity> في AndroidManifest.xml، لن يظهر التطبيق في قائمة المشاركة');
  }

  // ذاكرة أكبر للتطبيق (جهاز 2 جيجا + مشاريع كبيرة + تصدير فيديو)
  let m3 = fs.readFileSync(MF, 'utf8');
  if (!m3.includes('android:largeHeap')) {
    if (/<application\b/.test(m3)) {
      fs.writeFileSync(MF, m3.replace(/<application\b/, () => '<application android:largeHeap="true"'));
      console.log('OK: largeHeap in AndroidManifest.xml');
    } else console.warn('WARN: largeHeap: لم أجد <application في AndroidManifest.xml (غير مؤثر)');
  }
} else {
  console.warn('WARN: AndroidManifest.xml غير موجود وقت البناء. تسجيل الصوت لن يعمل إلا بعد إضافة إذن RECORD_AUDIO يدوياً.');
}

/* ---------- 4) تسريع الفتح: ما نشغّل محرك الصوت إلا لو فيه مقاطع محفوظة ---------- */
const AC_RE = /var a=ensureAC\(\);\s*if\(!a\|\|!clips\.length\)return;/;
if (AC_RE.test(html)) { html = html.replace(AC_RE, 'if(!clips.length)return;var a=ensureAC();if(!a)return;'); console.log('OK: lazy audio engine'); }
else console.warn('WARN: لم أجد سطر تشغيل الصوت عند الفتح (غير مؤثر)');

/* ---------- 4د) تحسينات إضافية (v3) ---------- */
// (أ) __U: كانت تفك base64 ببايت-بايت لكل صورة. للصور الصغيرة (< ~120KB) نرجّع الـ data URI مباشرة والمتصفح يفكها أسرع.
const U_OLD = "function __U(d){try{var c=__UC[d];if(c)return c;";
const U_NEW = "function __U(d){try{var c=__UC[d];if(c)return c;if(d.length<160000)return d;";
if (html.split(U_OLD).length === 2) { html = html.replace(U_OLD, () => U_NEW); console.log('OK: fast __U for small images'); }
else console.warn('WARN: تعذّر تفعيل تسريع __U (النص تغيّر في index.html)');

// (ب) شاشة البداية: نخفيها لحظة __rsReveal (جاهزية الواجهة) بدل مؤقت ثابت
// ملاحظة: setTimeout(window.__rsReveal,6000) يلتقط الدالة الأصلية وقت التنفيذ، فلازم نعدّل تعريفها نفسه (التغليف من برّه ما يكفي).
const RV_OLD = 'window.__rsReveal=function(){document.documentElement.classList.remove("rs-boot")};';
const RV_NEW = 'window.__rsReveal=function(){document.documentElement.classList.remove("rs-boot");try{if(window.__rsSplashHide)window.__rsSplashHide()}catch(e){}};';
if (html.split(RV_OLD).length === 2) { html = html.replace(RV_OLD, () => RV_NEW); console.log('OK: splash hides on __rsReveal'); }
else console.warn('WARN: تعذّر تفعيل إخفاء الشاشة من __rsReveal (النص تغيّر في index.html)');

/* ---------- 4ب) تسريع التعديل: مصغّرات المشاهد ---------- */
// الأصل: بعد كل تعديل بيعيد رسم مصغّرات كل المشاهد مرة واحدة (بطيء على المشاريع الكبيرة).
// الجديد: يرسم المتغيّر فقط (باقي المصغّرات من ذاكرة مؤقتة) وعلى دفعات صغيرة حتى ما يهنّجش الشاشة.
const THUMB_NEW = `var _thC={},_thRun=0,_thT=0;
function thReady(sc){
  var r='',i,it,v;
  for(i=0;i<sc.items.length;i++){
    it=sc.items[i];
    if(it.kind==='image'){v=VID[it.id];r+=((it._src&&it._hlen&&it._sd)?1:0)+((it._cci&&it._cci.complete&&it._cci.naturalWidth)?1:0)+((it._cli&&it._cli.complete&&it._cli.naturalWidth)?1:0)+((v&&v.v&&v.v.readyState>=2)?1:0);}
    else if(it.kind==='chart'||it.kind==='svg'){r+=it._parts?1:0;}
  }
  return r;
}
function thSig(sc){return JSON.stringify(sc,function(k,v){return k.charAt(0)==='_'?undefined:v;})+'|'+W+'x'+H+'|'+thReady(sc);}
if(document.fonts&&document.fonts.addEventListener){document.fonts.addEventListener('loadingdone',function(){clearTimeout(_thT);_thT=setTimeout(function(){_thC={};},1000);});}
(function(){var sb=document.getElementById('scenesBar');if(sb&&!sb._rsTh){sb._rsTh=1;sb.addEventListener('scroll',function(){if(typeof schedThumbs==='function')schedThumbs();},{passive:true});}})();
function drawScThumbs(){
  var run=++_thRun,live={},id;
  scenes.forEach(function(sc){live[sc.id]=1;});
  for(id in _thC){if(!live[id])delete _thC[id];}
  var cvs=Array.prototype.slice.call(document.querySelectorAll('#scenesBar canvas.scth'));
  // نرسم المصغّرات الظاهرة على الشاشة فقط (الباقي يتأجّل لحد ما يظهر بالتمرير) — كل مصغّرة بتاخد ~0.4 ثانية على التابلت الضعيف
  var sbx=document.getElementById('scenesBar'),sr=sbx?sbx.getBoundingClientRect():null;
  if(sr&&sr.width>0&&sr.height>0){
    cvs=cvs.filter(function(cv){var r=cv.getBoundingClientRect();return r.right>sr.left-60&&r.left<sr.right+60&&r.bottom>sr.top-60&&r.top<sr.bottom+60;});
  }
  cvs.sort(function(a,b){return (+(+b.dataset.k===cur))-(+(+a.dataset.k===cur));});
  var i=0;
  (function step(){
    if(run!==_thRun||playing)return;
    var t0=performance.now();
    while(i<cvs.length){
      var cv=cvs[i++],sc=scenes[+cv.dataset.k];
      if(!sc||!cv.isConnected)continue;
      var g=cv.getContext('2d');if(!g)continue;
      var sig=thSig(sc),c=_thC[sc.id];
      if(c&&c.sig===sig){g.clearRect(0,0,cv.width,cv.height);g.drawImage(c.cv,0,0);}
      else{
        g.save();
        try{g.setTransform(cv.width/W,0,0,cv.height/H,0,0);g.clearRect(0,0,W,H);cvScene(g,sc,0,camAt(sc,sc._len),'full');}catch(e){}
        g.restore();
        var cc=document.createElement('canvas');cc.width=cv.width;cc.height=cv.height;cc.getContext('2d').drawImage(cv,0,0);
        _thC[sc.id]={sig:sig,cv:cc};
      }
      if(performance.now()-t0>10)break;
    }
    if(i<cvs.length)setTimeout(step,60);
  })();
}
`;
const THUMB_RE = /function drawScThumbs\(\)\{\s*Array\.prototype\.forEach\.call\(document\.querySelectorAll\('#scenesBar canvas\.scth'\),function\(cv\)\{[\s\S]*?\n\}\n/;
const tm = html.match(THUMB_RE);
if (tm && tm[0].length < 800) { html = html.replace(THUMB_RE, () => THUMB_NEW); console.log('OK: fast scene thumbnails'); }
else console.warn('WARN: لم أجد دالة مصغّرات المشاهد (التسريع غير مفعّل)');

/* ---------- 4ج) تحسينات الأداء (v2) ---------- */
// (1) الحفظ التلقائي: كان بيحوّل المشروع كله لنص JSON كل 3 ثواني حتى لو ما اتغيّرش حاجة (تقطيع واضح في المشاريع الكبيرة).
//     الجديد: يتخطّى الحفظ لو مفيش تعديل، مع حفظ كامل احتياطي كل 30 ثانية. (الحفظ عند الخروج من التطبيق لسه شغّال زي ما هو)
const AS_OLD = "setInterval(function(){if(!rec)asFlush();},AUTO_MS);";
const AS_NEW = "var __rsFv=-1,__rsN=0;setInterval(function(){if(rec)return;if(!asDirty&&__rsFv===asVer&&(++__rsN%10)){beat();return;}__rsFv=asVer;asFlush();},AUTO_MS);";
if (html.includes(AS_OLD)) { html = html.replace(AS_OLD, () => AS_NEW); console.log('OK: smart autosave'); }
else console.warn('WARN: لم أجد سطر الحفظ التلقائي (التسريع غير مفعّل)');

// (1ب) الفتح: كان بيفكّ نسخة الحفظ من IndexedDB (JSON ضخم) حتى لو أقدم من نسخة localStorage ومش هتُستخدم. نفكّها بس لو ممكن تُستخدم.
const RP_OLD = "if(sn&&typeof sn.json==='string'){try{o=JSON.parse(sn.json);}catch(e){o=null;}}";
const RP_NEW = "if(sn&&typeof sn.json==='string'&&(!lok||sn.ts>(+lo.ts||0)+1500)){try{o=JSON.parse(sn.json);}catch(e){o=null;}}";
if (html.includes(RP_OLD)) { html = html.replace(RP_OLD, () => RP_NEW); console.log('OK: faster startup restore'); }
else console.warn('WARN: لم أجد سطر استرجاع الحفظ عند الفتح (التسريع غير مفعّل)');

// (1ج) الصوت: تحميل المقاطع المحفوظة (قراءة من IndexedDB + فك ترميز) كان بيحصل فوراً عند الفتح (توقف ~0.5 ثانية + ذاكرة كبيرة على جهاز 2 جيجا).
//      الجديد: يتأجّل لحد أول استخدام فعلي (تشغيل / تصدير / فتح تبويب الصوت)، وفيه احتياطي بعد 20 ثانية لو ما استُخدم.
//      لو ضغطت تشغيل قبل ما الصوت يجهز، التشغيل بيستنى التحميل ثم يبدأ تلقائياً.
const AU_RE = /var list=clips\.slice\(\),n=list\.length,k=0;\s*setAudioMsg\('جارٍ تحميل الصوت 0\/'\+n\+'\.\.\.'\);\s*\(function next\(\)\{\s*var c=list\[k\];\s*if\(!c\)\{setAudioMsg\(''\);timeline\(\);renderTimeline\(\);renderClipList\(\);return;\}\s*idbGet\(c\.id\)\.then\(function\(buf\)\{\s*if\(!buf\)return;\s*return a\.decodeAudioData\(buf\)\.then\(function\(b\)\{bufs\[c\.id\]=b;c\.dur=b\.duration;\}\);\s*\}\)\.catch\(function\(\)\{\}\)\.then\(function\(\)\{\s*k\+\+;setAudioMsg\(k<n\?'جارٍ تحميل الصوت '\+k\+'\/'\+n\+'\.\.\.':''\);\s*setTimeout\(next,0\);\s*\}\);\s*\}\)\(\);/;
const AU_NEW = `var list=clips.slice(),n=list.length,k=0,cbs=[],started=false;
  window.__rsAuPend=true;window.__rsAuQ=0;renderClipList();
  window.__rsAuThen=function(f,A){if(window.__rsAuQ)return;window.__rsAuQ=1;window.__rsAuLoad(function(){window.__rsAuQ=0;f.apply(null,A);});};
  var my=window.__rsAuLoad=function(cb){
    if(cb)cbs.push(cb);
    if(started)return;started=true;
    setAudioMsg('جارٍ تحميل الصوت 0/'+n+'...');
    (function next(){
      if(window.__rsAuLoad!==my)return;
      var c=list[k];
      if(!c){window.__rsAuPend=false;setAudioMsg('');timeline();renderTimeline();renderClipList();renderClipProps();var q=cbs.splice(0);q.forEach(function(f){try{f();}catch(e){}});return;}
      idbGet(c.id).then(function(buf){
        if(!buf)return;
        return a.decodeAudioData(buf).then(function(b){bufs[c.id]=b;c.dur=b.duration;});
      }).catch(function(){}).then(function(){
        k++;setAudioMsg(k<n?'جارٍ تحميل الصوت '+k+'/'+n+'...':'');
        setTimeout(next,60);
      });
    })();
  };
  setTimeout(function(){if(window.__rsAuLoad===my&&window.__rsAuPend)my();},20000);`;
const AU_HOOKS = [
  ["function play(from,to){", "function play(from,to){if(window.__rsAuPend){window.__rsAuThen(play,arguments);return;}"],
  ["function exportVideo(){", "function exportVideo(){if(window.__rsAuPend){window.__rsAuThen(exportVideo,arguments);return;}"],
  ["async function exportFast(auto,maxSec){", "async function exportFast(auto,maxSec){if(window.__rsAuPend){window.__rsAuThen(exportFast,arguments);return;}"],
  ["function setTab(n){", "function setTab(n){if(n==='audio'&&window.__rsAuPend&&window.__rsAuLoad)window.__rsAuLoad();"],
  ["var miss=!bufs[c.id];", "var miss=!bufs[c.id]&&!window.__rsAuPend;"],
  ["(bufs[c.id]?'':' (يحتاج إعادة رفع)')", "(bufs[c.id]||window.__rsAuPend?'':' (يحتاج إعادة رفع)')"],
];
const AU_OK = AU_RE.test(html) && AU_HOOKS.every(([o]) => html.split(o).length === 2);
if (AU_OK) {
  html = html.replace(AU_RE, () => AU_NEW);
  for (const [o, nw] of AU_HOOKS) html = html.replace(o, () => nw);
  console.log('OK: lazy audio loading (on first use)');
} else console.warn('WARN: تعذّر تفعيل تأجيل الصوت (نصوص ناقصة/متكرّرة في index.html) — يبقى التحميل عند الفتح');

// (1د) صور المكتبة المضمّنة (~1.2 ميجا base64 داخل الصفحة): نطلعها لملفات منفصلة في www/blobs وتتقرأ عند الحاجة، فالصفحة تخفّ ~45% وقت القراءة.
const BLOB_RE = /<script type="text\/plain" id="rsblob_(\d+)">([\s\S]*?)<\/script>/g;
const B_OLD = "function __B(i){var v=__BC[i];if(v===undefined){var e=document.getElementById('rsblob_'+i);v=__BC[i]=e?e.textContent:'';}return v;}";
const B_NEW = "function __B(i){var v=__BC[i];if(v===undefined){try{var x=new XMLHttpRequest();x.open('GET','blobs/'+i+'.txt',false);x.send();v=(x.status===200||x.status===0)?x.responseText:'';}catch(e){v='';}if(v)__BC[i]=v;}return v;}";
const blobs = [...html.matchAll(BLOB_RE)];
if (blobs.length && html.includes(B_OLD) && !/getElementById\('rsblob_/.test(html.replace(B_OLD, ''))) {
  fs.mkdirSync(path.join(OUT, 'blobs'), { recursive: true });
  for (const m of blobs) fs.writeFileSync(path.join(OUT, 'blobs', m[1] + '.txt'), m[2]);
  html = html.replace(BLOB_RE, '').replace(B_OLD, () => B_NEW);
  console.log('OK: library images moved to www/blobs (' + blobs.length + ' files)');
} else console.warn('WARN: لم أنقل صور المكتبة (الشكل مختلف عن المتوقع) — تبقى داخل الصفحة');

// (2) تمويه الخلفية (backdrop-filter) تقيل على الـ WebView وبيبطّئ الرسم فوق السبورة: نلغيه ونعوّضه بخلفية أغمق شوية.
// (3) لمس أسرع وأنعم: بدون وميض الضغط، وبدون سحب-للتحديث أو ارتداد الصفحة.
const PERF_CSS = `<style id="rs-perf">
*{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
#rsCmd{background:rgba(0,0,0,.6)}
#rsStudio .sg{background:var(--surface)!important}
.rs358p{background:var(--bg,#fff)!important}
html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent}
button,label,summary,[role=button]{touch-action:manipulation}
/* قائمة «العرض» كانت بتخرج برّه الشاشة على التابلت (عرض 641-1100 بكسل) فتوسّع الصفحة: نعرضها كورقة سفلية زي الموبايل */
@media (min-width:641px) and (max-width:1100px){.rs-view .rs-pop-body{position:fixed;inset-inline:12px;margin-inline:auto;max-width:420px;bottom:12px;top:auto;width:auto;max-height:70vh;overflow:auto}}
</style>
`;
html = html.replace('</head>', () => PERF_CSS + '</head>');
console.log('OK: perf css');

fs.writeFileSync(path.join(OUT, 'index.html'), html);
console.log('www ready, font faces:', (css.match(/@font-face/g) || []).length);

/* ---------- 5) شاشة البداية ---------- */
// (أ) إعداد إضافة SplashScreen في capacitor.config.json (حد أقصى 8 ثواني احتياطياً؛ الإخفاء الفعلي من __rsReveal عبر android-extras)
try {
  const CF = 'capacitor.config.json';
  if (fs.existsSync(CF)) {
    const cfg = JSON.parse(fs.readFileSync(CF, 'utf8'));
    cfg.plugins = cfg.plugins || {};
    cfg.plugins.SplashScreen = Object.assign(
      { launchShowDuration: 8000, launchAutoHide: true, backgroundColor: '#ffffff', showSpinner: false },
      cfg.plugins.SplashScreen || {});
    fs.writeFileSync(CF, JSON.stringify(cfg, null, 2));
    console.log('OK: splash screen config');
  } else console.warn('WARN: capacitor.config.json غير موجود، تخطّيت إعداد شاشة البداية');
} catch (e) { console.warn('WARN: splash config:', e.message); }

// (ب) صورة شاشة البداية من icon-only.png (لا توقف البناء لو فشلت)
(async () => {
  try {
    if (!fs.existsSync('icon-only.png')) { console.warn('SKIP: icon-only.png غير موجود، لم أولّد صورة شاشة البداية'); return; }
    const sharp = require('sharp');
    fs.mkdirSync('assets', { recursive: true });
    const S = 2732;
    const logo = await sharp('icon-only.png').resize(900, 900, { fit: 'inside' }).png().toBuffer();
    for (const [bg, out] of [['#ffffff', 'splash.png'], ['#14181f', 'splash-dark.png']]) {
      await sharp({ create: { width: S, height: S, channels: 4, background: bg } })
        .composite([{ input: logo, gravity: 'center' }]).png().toFile(path.join('assets', out));
    }
    console.log('OK: splash images');
  } catch (e) { console.warn('SKIP: صورة شاشة البداية:', e.message); }
})();
