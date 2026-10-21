/* إضافات نسخة أندرويد: (1) زر الرجوع الذكي  (2) تسجيل التعليق الصوتي بالميكروفون.
   يحقنه build.js داخل www/index.html فقط، ولا يلمس index.html الأصلي. */

/* ---------- 2) تسجيل التعليق الصوتي ---------- */
(function () {
  var pane = document.getElementById('pane-audio');
  var vin = document.getElementById('fileVoice');
  var lab = pane && pane.querySelector('label[for="fileVoice"]');
  if (!pane || !vin || !lab || !lab.parentNode) return;
  var msg = document.getElementById('audioMsg');
  function say(t) { if (msg) msg.textContent = t || ''; }

  var row = document.createElement('div');
  row.className = 'row';
  var btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'recBtn'; btn.className = 'btn grow';
  btn.textContent = '🎙 تسجيل تعليق بالميكروفون';
  row.appendChild(btn);
  lab.parentNode.parentNode.insertBefore(row, lab.parentNode.nextSibling);

  var MAX_SEC = 20 * 60;
  var rec = null, stream = null, chunks = [], t0 = 0, timer = 0;

  function pickMime() {
    var c = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < c.length; i++) {
      try { if (MediaRecorder.isTypeSupported(c[i])) return c[i]; } catch (e) {}
    }
    return '';
  }
  function fmt(s) { var m = Math.floor(s / 60), x = s % 60; return m + ':' + (x < 10 ? '0' : '') + x; }
  function ui(on) {
    btn.textContent = on ? '⏹ إيقاف وحفظ التسجيل' : '🎙 تسجيل تعليق بالميكروفون';
    btn.classList.toggle('primary', !!on);
  }
  function release() {
    clearInterval(timer); timer = 0;
    if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    stream = null;
  }
  function finish() {
    var type = (rec && rec.mimeType) || 'audio/webm';
    var blob = new Blob(chunks, { type: type });
    chunks = []; rec = null; release(); ui(false);
    if (!blob.size) { say('لم يُسجَّل أي صوت. حاول مرة أخرى.'); return; }
    var ext = /mp4/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
    var d = new Date(), hh = (d.getHours() < 10 ? '0' : '') + d.getHours(), mm = (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    var file = new File([blob], 'تسجيل ' + hh + '-' + mm + '.' + ext, { type: type });
    try {
      var dt = new DataTransfer(); dt.items.add(file);
      vin.files = dt.files;
      vin.dispatchEvent(new Event('change', { bubbles: true })); // يمرّ على نفس مسار «+ تعليق صوتي»
    } catch (e) { say('تعذّر إضافة التسجيل إلى المقاطع.'); }
  }
  function stop() { if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch (e) { finish(); } } }
  function start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      say('التسجيل غير مدعوم على هذا الجهاز.'); return;
    }
    say('جارٍ تشغيل الميكروفون...');
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then(function (st) {
        stream = st;
        var mt = pickMime();
        try { rec = mt ? new MediaRecorder(st, { mimeType: mt }) : new MediaRecorder(st); }
        catch (e) { release(); say('تعذّر بدء التسجيل على هذا الجهاز.'); return; }
        chunks = [];
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = finish;
        rec.start(1000);
        t0 = Date.now(); ui(true);
        timer = setInterval(function () {
          var s = Math.floor((Date.now() - t0) / 1000);
          say('● جارٍ التسجيل ' + fmt(s));
          if (s >= MAX_SEC) stop();
        }, 500);
        say('● جارٍ التسجيل 0:00');
      })
      .catch(function (err) {
        var n = err && err.name;
        say(n === 'NotAllowedError' || n === 'SecurityError'
          ? 'لم يُسمح باستخدام الميكروفون. فعّله من إعدادات الأندرويد ← التطبيقات ← رسام السبورة ← الأذونات.'
          : 'تعذّر تشغيل الميكروفون.');
      });
  }
  btn.addEventListener('click', function () { if (rec && rec.state === 'recording') stop(); else start(); });
  // لو خرج المستخدم من التطبيق أثناء التسجيل نحفظ ما سُجّل بدل ضياعه
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  window.__rsRec = { active: function () { return !!rec && rec.state === 'recording'; }, stop: stop };
})();

/* ---------- 1) زر الرجوع الذكي (أندرويد فقط) ---------- */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var AP = C.Plugins && C.Plugins.App;
  if (!AP || !AP.addListener) return;
  var last = 0;

  function toast(t) {
    var e = document.getElementById('rsBackToast');
    if (!e) {
      e = document.createElement('div'); e.id = 'rsBackToast';
      e.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(90px + env(safe-area-inset-bottom,0px));' +
        'z-index:99999;background:rgba(20,24,31,.92);color:#fff;padding:9px 16px;border-radius:99px;font:600 13px system-ui,sans-serif;' +
        'pointer-events:none;transition:opacity .2s;max-width:90%;text-align:center';
      document.body.appendChild(e);
    }
    e.textContent = t; e.style.opacity = '1';
    clearTimeout(e._t); e._t = setTimeout(function () { e.style.opacity = '0'; }, 1800);
  }

  // يقفل أعلى طبقة مفتوحة ويرجع true، أو يرجع false لو مفيش طبقة
  function closeTop() {
    if (window.__rsRec && window.__rsRec.active()) { window.__rsRec.stop(); return true; }
    var cmd = document.getElementById('rsCmd');
    if (cmd && cmd.classList.contains('on')) { cmd.classList.remove('on'); return true; }
    var dl = document.querySelectorAll('dialog[open]');
    if (dl.length) {
      var d = dl[dl.length - 1];
      try { d.close(); } catch (e) { d.removeAttribute('open'); }
      return true;
    }
    if (document.querySelector('.board.pz')) {
      var x = document.getElementById('pzExit');
      if (x) { x.click(); return true; }
    }
    var pop = document.querySelector('.rs-pop[open]');
    if (pop) { pop.open = false; return true; }
    if (document.body.classList.contains('sheet-open')) {
      var mb = document.getElementById('mbBack');
      if (mb) mb.click();
      else {
        document.body.classList.remove('sheet-open');
        var mt = document.getElementById('mbTools'); if (mt) mt.setAttribute('aria-expanded', 'false');
      }
      return true;
    }
    if (document.body.classList.contains('focus')) {
      var fb = document.getElementById('focusBtn');
      if (fb) { fb.click(); return true; }
    }
    if (document.fullscreenElement && document.exitFullscreen) {
      try { document.exitFullscreen(); } catch (e) {}
      return true;
    }
    return false;
  }

  AP.addListener('backButton', function () {
    if (closeTop()) return;
    var now = Date.now();
    if (now - last < 2000) { AP.exitApp(); return; }
    last = now;
    toast('اضغط رجوع مرة أخرى للخروج');
  });
})();

/* ---------- 3) شاشة البداية + قياس الأداء على الجهاز ---------- */
(function () {
  var P = { fcp: 0, longtasks: [], events: [], loaf: [], splashAt: 0 };
  function pushTop(arr, item, max) {
    arr.push(item); arr.sort(function (a, b) { return b[0] - a[0]; });
    if (arr.length > max) arr.length = max;
  }
  function obs(type, opts, cb) {
    try {
      var o = new PerformanceObserver(function (l) { l.getEntries().forEach(cb); });
      var init = { type: type, buffered: true };
      for (var k in opts) init[k] = opts[k];
      o.observe(init);
    } catch (e) {}
  }
  obs('paint', {}, function (e) { if (e.name === 'first-contentful-paint') P.fcp = Math.round(e.startTime); });
  obs('longtask', {}, function (e) { pushTop(P.longtasks, [Math.round(e.duration), Math.round(e.startTime)], 8); });
  obs('event', { durationThreshold: 100 }, function (e) {
    var t = e.target; var n = t ? ((t.id ? '#' + t.id : '') || t.tagName || '?') : '?';
    pushTop(P.events, [Math.round(e.duration), e.name + ' ' + n], 8);
  });
  obs('long-animation-frame', {}, function (e) {
    var sc = (e.scripts && e.scripts[0]) || {};
    pushTop(P.loaf, [Math.round(e.duration), Math.round(e.blockingDuration || 0),
      (sc.invoker || sc.sourceFunctionName || '?') + '@' + (sc.sourceCharPosition == null ? '' : sc.sourceCharPosition)], 8);
  });

  function perfText() {
    var L = [], nav = {};
    try { nav = performance.getEntriesByType('navigation')[0] || {}; } catch (e) {}
    L.push('perf: fcp ' + P.fcp + ' ms | domReady ' + Math.round(nav.domContentLoadedEventEnd || 0) +
      ' ms | load ' + Math.round(nav.loadEventEnd || 0) + ' ms | splashHidden ' + P.splashAt + ' ms');
    var lp = document.getElementById('lowPow');
    L.push('perf: lowPowerMode ' + (lp ? lp.checked : '?') + ' | cores ' + (navigator.hardwareConcurrency || '?') +
      ' | ram ' + (navigator.deviceMemory || '?') + 'GB');
    try { var m = performance.memory; if (m) L.push('perf: jsHeap ' + Math.round(m.usedJSHeapSize / 1048576) + ' MB'); } catch (e) {}
    L.push('perf: longTasks (ms@start) ' + (P.longtasks.map(function (x) { return x[0] + '@' + x[1]; }).join(', ') || 'none'));
    L.push('perf: slowEvents (ms) ' + (P.events.map(function (x) { return x[0] + ' ' + x[1]; }).join(' | ') || 'none'));
    L.push('perf: slowFrames (ms,blocking,script) ' + (P.loaf.map(function (x) { return x[0] + ',' + x[1] + ',' + x[2]; }).join(' | ') || 'none'));
    return L.join('\n');
  }
  window.__rsPerfText = perfText;

  // نلحق بيانات الأداء بتقرير «نسخ تقرير المشاكل» الموجود أصلاً في التطبيق
  var rb = document.getElementById('repBtn');
  if (rb) rb.addEventListener('click', function () {
    var n = 0, iv = setInterval(function () {
      var ta = document.getElementById('repTxt');
      if (ta && ta.value && ta.value.indexOf('errors (') > -1 && ta.value.indexOf('perf: fcp') < 0) {
        clearInterval(iv);
        ta.value += '\n' + perfText();
        try { navigator.clipboard.writeText(ta.value); } catch (e) {}
        setTimeout(function () {
          var rm = document.getElementById('repMsg');
          if (rm) rm.textContent = 'نُسخ التقرير مع بيانات الأداء. الصقه في المحادثة.';
        }, 800);
      } else if (++n > 40) clearInterval(iv);
    }, 250);
  });

  // شاشة البداية: تفضل ظاهرة لحد ما التطبيق يرسم أول شاشة ثم تختفي
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var SS = C.Plugins && C.Plugins.SplashScreen;
  if (!SS || !SS.hide) return;
  var done = false;
  function hide() {
    if (done) return; done = true;
    P.splashAt = Math.round(performance.now());
    try { SS.hide({ fadeOutDuration: 200 }); } catch (e) {}
  }
  function ready() { requestAnimationFrame(function () { requestAnimationFrame(hide); }); }
  if (document.readyState === 'complete') ready(); else window.addEventListener('load', ready);
  setTimeout(hide, 2500); // احتياطي
})();


/* ---------- 4) ملء الشاشة أثناء العرض + فتح ملفات من تطبيقات تانية ---------- */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;

  function toast(t) {
    var e = document.getElementById('rsShareToast');
    if (!e) {
      e = document.createElement('div'); e.id = 'rsShareToast';
      e.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));' +
        'z-index:99999;background:rgba(20,24,31,.92);color:#fff;padding:9px 16px;border-radius:99px;font:600 13px system-ui,sans-serif;' +
        'pointer-events:none;transition:opacity .2s;max-width:90%;text-align:center';
      document.body.appendChild(e);
    }
    e.textContent = t; e.style.opacity = '1';
    clearTimeout(e._t); e._t = setTimeout(function () { e.style.opacity = '0'; }, 2400);
  }

  /* ----- (أ) ملء الشاشة: يخفي شريط الحالة وأزرار النظام في «التركيز» و«العرض المباشر» ----- */
  var lastImm = null, q = 0;
  function wantImm() {
    return document.body.classList.contains('focus') || !!document.querySelector('.board.pz');
  }
  function syncImm(force) {
    var w = wantImm();
    if (!force && w === lastImm) return;
    lastImm = w;
    try { if (window.RassamNative && window.RassamNative.immersive) window.RassamNative.immersive(w); } catch (e) {}
  }
  function schedImm() { if (q) return; q = requestAnimationFrame(function () { q = 0; syncImm(false); }); }
  try {
    new MutationObserver(schedImm).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class'] });
  } catch (e) {}
  // بعد الرجوع للتطبيق النظام بيرجّع الأشرطة، فنعيد الحالة
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { lastImm = null; syncImm(true); } });

  /* ----- (ب) الملفات اللي بتتبعت للتطبيق من «مشاركة» أو «فتح بواسطة» ----- */
  var busy = false;
  function feed(id, file) {
    var inp = document.getElementById(id);
    if (!inp) return false;
    try {
      var dt = new DataTransfer(); dt.items.add(file);
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    } catch (e) { return false; }
  }
  function ask(name) {
    return new Promise(function (res) {
      var ov = document.createElement('div');
      ov.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:16px';
      var bx = document.createElement('div');
      bx.setAttribute('dir', 'rtl');
      bx.style.cssText = 'background:#fff;color:#14181f;border-radius:14px;padding:16px;max-width:340px;width:100%;font:600 15px system-ui,sans-serif;display:flex;flex-direction:column;gap:10px';
      var t = document.createElement('div'); t.textContent = 'ملف صوتي: ' + name; t.style.cssText = 'word-break:break-all';
      bx.appendChild(t);
      [['voice', '🎙 تعليق صوتي'], ['music', '🎵 موسيقى خلفية'], ['', 'إلغاء']].forEach(function (o) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1];
        b.style.cssText = 'padding:11px;border-radius:10px;border:1px solid #d0d5dd;background:' + (o[0] ? '#4f46e5' : '#fff') + ';color:' + (o[0] ? '#fff' : '#14181f') + ';font:inherit';
        b.onclick = function () { ov.remove(); res(o[0]); };
        bx.appendChild(b);
      });
      ov.appendChild(bx); document.body.appendChild(ov);
    });
  }
  function kind(f) {
    var m = (f.mime || '').toLowerCase(), n = (f.name || '').toLowerCase();
    if (m === 'image/svg+xml' || /\.svg$/.test(n)) return 'svg';
    if (/^image\//.test(m) || /\.(png|jpe?g|webp|gif|bmp)$/.test(n)) return 'image';
    if (/^video\//.test(m) || /\.(mp4|webm|mov|m4v)$/.test(n)) return 'video';
    if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (/^audio\//.test(m) || /\.(mp3|m4a|wav|ogg|aac|opus|flac)$/.test(n)) return 'audio';
    return '';
  }
  function handle(f) {
    var k = kind(f);
    if (!k) { toast('نوع الملف غير مدعوم: ' + (f.name || '')); return Promise.resolve(); }
    var url = C.convertFileSrc ? C.convertFileSrc('file://' + encodeURI(f.path)) : '';
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('http'); return r.blob(); }).then(function (b) {
      var file = new File([b], f.name || 'file', { type: f.mime || b.type || '' });
      if (k === 'audio') {
        return ask(f.name || '').then(function (w) { if (w) { if (feed(w === 'music' ? 'fileMusic' : 'fileVoice', file)) toast('جارٍ إضافة الصوت...'); } });
      }
      var id = k === 'svg' ? 'fileSvg' : k === 'image' ? 'fileImg' : k === 'video' ? 'fileVid' : 'pdFile';
      if (feed(id, file)) toast('تمت إضافة الملف: ' + (f.name || ''));
      else toast('تعذّر فتح الملف');
    }).catch(function () { toast('تعذّر فتح الملف'); });
  }
  function pull() {
    if (busy) return;
    var N = window.RassamNative;
    if (!N || !N.takeShared) return;
    var list = [];
    try { list = JSON.parse(N.takeShared() || '[]'); } catch (e) { return; }
    if (!list.length) return;
    busy = true;
    (function next(i) {
      if (i >= list.length) { busy = false; return; }
      handle(list[i]).then(function () { setTimeout(function () { next(i + 1); }, 500); });
    })(0);
  }
  window.__rsPullShared = pull;
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(pull, 400); });
  window.addEventListener('focus', function () { setTimeout(pull, 400); });
  function first() { setTimeout(pull, 2500); }
  if (document.readyState === 'complete') first(); else window.addEventListener('load', first);
})();
