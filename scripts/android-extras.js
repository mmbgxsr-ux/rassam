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
