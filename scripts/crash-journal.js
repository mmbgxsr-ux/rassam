/* crash-journal.js: سجل أخطاء وجلسات يبقى بعد إعادة فتح التطبيق.
   يُحقن قبل </body> (انظر build.js) ولا يعدّل index.html.
   - يحفظ آخر 30 خطأً في localStorage (مفتاح rs-journal).
   - يكشف إن كانت الجلسة السابقة انتهت فجأة (تعطل أو نفاد ذاكرة) وهل كان التصدير يعمل.
   - يضيف آخر الأحداث السابقة إلى window.__rassamErrs ليظهرها زر «تقرير المشكلة» الموجود. */
(function () {
  if (window.__rsJ) return;
  var KJ = 'rs-journal', KS = 'rs-session', MAXJ = 30, MAXPREV = 5, BEAT = 4000;

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function jget(k, d) { try { var v = JSON.parse(ls(k)); return v == null ? d : v; } catch (e) { return d; } }
  function when(t) { try { return new Date(t).toLocaleString('ar-EG'); } catch (e) { return String(t); } }

  var journal = jget(KJ, []); if (!Array.isArray(journal)) journal = [];
  var prev = jget(KS, null);

  function save() { while (journal.length > MAXJ) journal.shift(); lset(KJ, JSON.stringify(journal)); }
  function add(kind, msg) {
    msg = String(msg == null ? '' : msg).slice(0, 400);
    var last = journal[journal.length - 1];
    if (last && last.k === kind && last.m === msg) { last.n = (last.n || 1) + 1; last.t = Date.now(); }
    else journal.push({ t: Date.now(), k: kind, m: msg });
    save();
  }
  function busy() { var e = document.getElementById('exRes'); return !!(e && e.disabled); }

  /* 1) أخطاء هذه الجلسة التي التقطها المراقب الداخلي قبل تحميل هذه الإضافة */
  var EL = (window.__rassamErrs = window.__rassamErrs || []);
  var early = EL.slice();
  var older = journal.slice(-MAXPREV); /* أحداث الجلسات السابقة فقط */

  /* 2) هل انتهت الجلسة السابقة بشكل غير طبيعي؟ */
  var abnormal = '';
  if (prev && prev.state === 'running') {
    abnormal = 'انتهت الجلسة السابقة فجأة' + (prev.busy ? ' أثناء التصدير' : '') + ' (آخر نشاط ' + when(prev.t) + ')';
  } else if (prev && prev.state === 'hidden' && prev.busy) {
    abnormal = 'أُغلقت الجلسة السابقة في الخلفية أثناء التصدير، وربما أنهاها النظام (آخر نشاط ' + when(prev.t) + ')';
  }
  if (abnormal) { add('crash', abnormal); older = journal.slice(-MAXPREV); }
  early.forEach(function (x) { add('error', String(x).split('\n')[0]); });

  /* 3) نضيف السجل السابق إلى قائمة الأخطاء التي يعرضها زر التقرير */
  older.forEach(function (x) {
    if (EL.length < 20) EL.push('[سابق ' + when(x.t) + '] ' + x.k + ': ' + x.m + (x.n > 1 ? ' ×' + x.n : ''));
  });

  /* 4) تسجيل أخطاء الجلسة الحالية */
  window.addEventListener('error', function (e) {
    if (!e || (e.target && e.target !== window)) return; /* نتجاهل أخطاء تحميل الموارد */
    add('error', (e.message || 'error') + (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + (e.lineno || 0) : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason; add('promise', r && r.message ? r.message : r);
  });

  /* 5) حالة الجلسة: running ← hidden ← exit، مع نبضة خفيفة لمعرفة آخر نشاط */
  var ses = { t0: Date.now(), t: Date.now(), state: document.hidden ? 'hidden' : 'running', busy: false };
  function put() { ses.t = Date.now(); ses.busy = busy(); lset(KS, JSON.stringify(ses)); }
  put();
  setInterval(put, BEAT);
  document.addEventListener('visibilitychange', function () { ses.state = document.hidden ? 'hidden' : 'running'; put(); });
  window.addEventListener('pagehide', function () { ses.state = 'exit'; put(); });

  /* 6) تنبيه صغير يُغلق تلقائيًا إن كان التصدير السابق قد توقف فجأة */
  if (abnormal && prev && prev.busy) {
    try {
      var d = document.createElement('div');
      d.setAttribute('role', 'status'); d.setAttribute('dir', 'rtl');
      d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;padding:10px 14px;border-radius:10px;background:#3b2f0b;color:#fff;font:13px/1.6 system-ui,sans-serif;box-shadow:0 6px 20px #0006';
      d.textContent = 'توقّف التصدير السابق فجأة. جرّب دقة أقل أو اضغط «تقرير المشكلة» لنسخ التفاصيل. (اضغط لإخفاء هذا التنبيه)';
      d.onclick = function () { d.remove(); };
      document.body.appendChild(d);
      setTimeout(function () { if (d.parentNode) d.remove(); }, 12000);
    } catch (e) { }
  }

  window.__rsJ = {
    list: function () { return journal.slice(); },
    clear: function () { journal = []; save(); }
  };
})();
