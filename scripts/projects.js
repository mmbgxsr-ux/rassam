/* شاشة المشاريع: كل مشروع له مفتاح حفظ وقاعدة بيانات خاصة به (بدون نسخ بيانات عند التبديل).
   المشروع القديم يحتفظ بأسمائه الأصلية (rassam-sabbura-v2 و rassam-audio) فلا يتأثر.
   يحقنه build.js بعد وسم <body> مباشرة، قبل الكود الرئيسي. */
(function () {
  'use strict';
  var LK = 'rs-projects', AK = 'rs-proj-active', DK = 'rs-proj-del', IK = 'rs-proj-init', SK = 'rs-skiphome';
  var LEG_KEY = 'rassam-sabbura-v2', LEG_DB = 'rassam-audio';
  var GLOBAL = ['mylib', 'scenelib']; // مكتبات مشتركة بين المشاريع (داخل قاعدة المشروع القديم)

  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lrm(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function ss(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function srm(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function jget(k, d) { try { var v = JSON.parse(ls(k)); return v == null ? d : v; } catch (e) { return d; } }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function list() { var a = jget(LK, []); return Array.isArray(a) ? a.filter(function (e) { return e && e.id && e.key && e.db; }) : []; }
  function saveList(a) { lset(LK, JSON.stringify(a)); }
  function find(id) { var a = list(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function update(id, patch) {
    var a = list();
    for (var i = 0; i < a.length; i++) if (a[i].id === id) { for (var k in patch) a[i][k] = patch[k]; }
    saveList(a);
  }
  function newId() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  /* أول تشغيل: المشروع الحالي للمستخدم يصبح أول بطاقة بدون أي نقل */
  function ensure() {
    if (list().length || ls(IK)) return;
    var ts = Date.now(), s = ls(LEG_KEY), m = s && /^\{"ts":(\d+)/.exec(s);
    if (m) ts = +m[1];
    saveList([{ id: 'p0', name: 'مشروعي', key: LEG_KEY, db: LEG_DB, ts: ts, legacy: 1 }]);
    lset(IK, '1');
  }
  ensure();

  function activeEntry() {
    var a = list();
    return find(ls(AK)) || a.sort(function (x, y) { return (y.ts || 0) - (x.ts || 0); })[0] || null;
  }
  // يُضبط مبكراً: الكود الرئيسي يقرأ هذين المتغيرين عند أول استخدام
  var ent0 = activeEntry();
  if (ent0) { window.__rsKey = ent0.key; window.__rsDb = ent0.db; }

  var booted = false, loadedId = null, state = 'idle', gateRes = null, ov = null, menuEl = null, openT = 0;
  var skip = ss(SK) === '1';
  srm(SK);

  /* ---------- قاعدة IndexedDB ---------- */
  function openDb(name) {
    return new Promise(function (res, rej) {
      try {
        var r = indexedDB.open(name, 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('a'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      } catch (e) { rej(e); }
    });
  }
  function dbGet(db, k) {
    return new Promise(function (res) {
      try { var q = db.transaction('a', 'readonly').objectStore('a').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(undefined); }; }
      catch (e) { res(undefined); }
    });
  }
  function dbPut(db, k, v) {
    return new Promise(function (res, rej) {
      var tx = db.transaction('a', 'readwrite'); tx.objectStore('a').put(v, k);
      tx.oncomplete = res; tx.onerror = tx.onabort = function () { rej(tx.error); };
    });
  }
  function dbKeys(db) {
    return new Promise(function (res) {
      try { var q = db.transaction('a', 'readonly').objectStore('a').getAllKeys(); q.onsuccess = function () { res(q.result || []); }; q.onerror = function () { res([]); }; }
      catch (e) { res([]); }
    });
  }
  function dbDel(db, k) {
    return new Promise(function (res) {
      var tx = db.transaction('a', 'readwrite'); tx.objectStore('a').delete(k);
      tx.oncomplete = res; tx.onerror = tx.onabort = function () { res(); };
    });
  }

  /* ---------- الحذف المؤجل (يُنفَّذ قبل أن يقرأ أي كود بيانات المشروع) ---------- */
  function processDeletes(skipId) {
    var q = jget(DK, []), keep = [];
    if (!Array.isArray(q) || !q.length) return;
    q.forEach(function (d) {
      if (skipId && d.id === skipId) { keep.push(d); return; }
      lrm(d.key);
      if (d.legacy) {
        openDb(d.db).then(function (db) {
          return dbKeys(db).then(function (ks) {
            return Promise.all(ks.filter(function (k) { return GLOBAL.indexOf(k) < 0; }).map(function (k) { return dbDel(db, k); }));
          }).then(function () { db.close(); });
        }).catch(function () {});
      } else {
        try { indexedDB.deleteDatabase(d.db); } catch (e) {}
      }
    });
    lset(DK, JSON.stringify(keep));
  }

  /* ---------- أدوات العرض ---------- */
  function ar(n) { try { return Number(n).toLocaleString('ar-EG'); } catch (e) { return String(n); } }
  function fmtSize(b) {
    if (!b) return '';
    var mb = b / 1048576;
    return mb >= 1 ? ar(Math.round(mb * 10) / 10) + ' MB' : ar(Math.max(1, Math.round(b / 1024))) + ' KB';
  }
  function fmtDate(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }
  function h(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  var CSS = '#rspOv{position:fixed;inset:0;z-index:100000;visibility:visible;background:var(--bg,#f4f5f7);color:var(--fg,#14181f);' +
    'overflow:auto;-webkit-overflow-scrolling:touch;padding:max(16px,env(safe-area-inset-top,0px)) 16px 24px;box-sizing:border-box;font-family:inherit}' +
    '#rspOv .rsp-in{max-width:1000px;margin:0 auto}' +
    '#rspOv .rsp-top{display:flex;align-items:center;gap:10px;margin-bottom:14px}' +
    '#rspOv .rsp-top h1{flex:1;margin:0;font-size:22px}' +
    '#rspOv .rsp-x{height:40px;padding:0 14px;border-radius:var(--r-ctl,10px);border:1px solid var(--line,#e3e6ec);background:var(--surface,#fff);color:var(--fg,#14181f);font:inherit;cursor:pointer}' +
    '#rspOv .rsp-new{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;min-height:110px;margin-bottom:20px;' +
    'border:0;border-radius:var(--r-card,12px);background:var(--accent,#4f46e5);color:var(--accent-fg,#fff);font:inherit;font-weight:700;font-size:18px;cursor:pointer}' +
    '#rspOv .rsp-new b{font-size:34px;line-height:1;font-weight:400}' +
    '#rspOv .rsp-new:active{opacity:.85}' +
    '#rspOv .rsp-hd{display:flex;justify-content:space-between;color:var(--muted,#667085);font-size:14px;margin:0 2px 10px}' +
    '#rspOv .rsp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}' +
    '#rspOv .rsp-card{position:relative;display:flex;gap:12px;align-items:center;padding:10px;border:1px solid var(--line,#e3e6ec);' +
    'border-radius:var(--r-card,12px);background:var(--surface,#fff);cursor:pointer;min-height:92px;-webkit-tap-highlight-color:transparent}' +
    '#rspOv .rsp-card:active{background:var(--surface2,#eef0f4)}' +
    '#rspOv .rsp-card.cur{border-color:var(--accent,#4f46e5)}' +
    '#rspOv .rsp-th{flex:0 0 112px;width:112px;height:68px;border-radius:var(--r-ctl,10px);background:var(--surface2,#eef0f4);overflow:hidden;display:flex;align-items:center;justify-content:center;color:var(--muted,#667085);font-size:28px}' +
    '#rspOv .rsp-th img{width:100%;height:100%;object-fit:cover;display:block}' +
    '#rspOv .rsp-tx{flex:1;min-width:0}' +
    '#rspOv .rsp-nm{font-weight:700;font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
    '#rspOv .rsp-mt{color:var(--muted,#667085);font-size:13px;margin-top:4px;line-height:1.5}' +
    '#rspOv .rsp-tag{display:inline-block;margin-inline-start:6px;padding:1px 8px;border-radius:99px;background:var(--accent,#4f46e5);color:var(--accent-fg,#fff);font-size:11px;font-weight:600;vertical-align:middle}' +
    '#rspOv .rsp-dots{flex:0 0 auto;width:40px;height:40px;border:0;border-radius:99px;background:transparent;color:var(--fg,#14181f);font-size:22px;cursor:pointer;line-height:1}' +
    '#rspOv .rsp-dots:active{background:var(--surface2,#eef0f4)}' +
    '#rspMenu{position:fixed;z-index:100001;min-width:170px;background:var(--surface,#fff);color:var(--fg,#14181f);border:1px solid var(--line,#e3e6ec);' +
    'border-radius:var(--r-card,12px);box-shadow:0 8px 30px rgba(0,0,0,.25);padding:6px;visibility:visible}' +
    '#rspMenu button{display:block;width:100%;text-align:start;padding:11px 12px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}' +
    '#rspMenu button:active{background:var(--surface2,#eef0f4)}#rspMenu button.d{color:#d92d20}' +
    '#rspOv .rsp-empty{padding:30px 10px;text-align:center;color:var(--muted,#667085)}' +
    '#rspOv .rsp-busy{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--bg,#f4f5f7);font-weight:600;font-size:16px;z-index:2}';

  function css() {
    if (document.getElementById('rspCss')) return;
    var s = document.createElement('style'); s.id = 'rspCss'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }

  function render() {
    if (!ov) return;
    var scroll = ov.scrollTop;
    ov.textContent = '';
    var inn = h('div', 'rsp-in');
    var top = h('div', 'rsp-top');
    top.appendChild(h('h1', '', 'رسّام السبورة'));
    if (booted) {
      var x = h('button', 'rsp-x', 'رجوع للمشروع'); x.type = 'button';
      x.addEventListener('click', function () { hideHome(); });
      top.appendChild(x);
    }
    inn.appendChild(top);
    var nb = h('button', 'rsp-new'); nb.type = 'button';
    nb.appendChild(h('b', '', '+')); nb.appendChild(h('span', '', 'مشروع جديد'));
    nb.addEventListener('click', function () { openEntry(createBlank()); });
    inn.appendChild(nb);

    var items = list().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    var hd = h('div', 'rsp-hd'); hd.appendChild(h('span', '', 'مشاريعي (' + ar(items.length) + ')')); hd.appendChild(h('span', '', 'الأحدث تعديلاً'));
    inn.appendChild(hd);
    if (!items.length) inn.appendChild(h('div', 'rsp-empty', 'لا توجد مشاريع بعد. اضغط «مشروع جديد» للبدء.'));
    var grid = h('div', 'rsp-grid');
    items.forEach(function (e) {
      var c = h('div', 'rsp-card' + (e.id === loadedId ? ' cur' : '')); c.setAttribute('role', 'button'); c.tabIndex = 0;
      var th = h('div', 'rsp-th');
      if (e.thumb) { var im = document.createElement('img'); im.alt = ''; im.src = e.thumb; th.appendChild(im); } else th.textContent = '🖌';
      var tx = h('div', 'rsp-tx');
      var nm = h('div', 'rsp-nm', e.name || 'بدون اسم');
      if (e.id === loadedId) nm.appendChild(h('span', 'rsp-tag', 'مفتوح الآن'));
      var parts = [];
      if (e.scenes) parts.push(ar(e.scenes) + ' مشهداً');
      if (e.size) parts.push(fmtSize(e.size));
      var mt = h('div', 'rsp-mt', parts.join(' · '));
      var dt = h('div', 'rsp-mt', fmtDate(e.ts));
      tx.appendChild(nm); if (parts.length) tx.appendChild(mt); tx.appendChild(dt);
      var dots = h('button', 'rsp-dots', '⋯'); dots.type = 'button'; dots.setAttribute('aria-label', 'خيارات المشروع');
      dots.addEventListener('click', function (ev) { ev.stopPropagation(); showMenu(e, dots); });
      c.appendChild(th); c.appendChild(tx); c.appendChild(dots);
      c.addEventListener('click', function () { closeMenu(); openEntry(e); });
      c.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') openEntry(e); });
      grid.appendChild(c);
    });
    inn.appendChild(grid);
    ov.appendChild(inn);
    if (state === 'opening') { ov.appendChild(h('div', 'rsp-busy', 'جارٍ فتح المشروع…')); }
    ov.scrollTop = scroll;
  }

  function showMenu(e, anchor) {
    closeMenu();
    var m = document.createElement('div'); m.id = 'rspMenu'; m.setAttribute('dir', 'rtl');
    [['إعادة التسمية', function () { rename(e); }], ['نسخ المشروع', function () { duplicate(e); }], ['حذف', function () { remove(e); }, 1]].forEach(function (o) {
      var b = h('button', o[2] ? 'd' : '', o[0]); b.type = 'button';
      b.addEventListener('click', function (ev) { ev.stopPropagation(); closeMenu(); o[1](); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    var left = Math.min(Math.max(8, r.left), window.innerWidth - mw - 8), top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    menuEl = m;
  }
  document.addEventListener('click', function (ev) { if (menuEl && !menuEl.contains(ev.target)) closeMenu(); }, true);

  function showHome() {
    css();
    if (!ov) { ov = document.createElement('div'); ov.id = 'rspOv'; ov.setAttribute('dir', 'rtl'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'مشاريعي'); }
    if (!ov.parentNode) document.body.appendChild(ov);
    state = 'choosing';
    window.__rsHomeShown = true;
    render();
    // نحدّث بيانات البطاقات بعد أن تظهر الشاشة (قراءة JSON كبير قد تأخذ وقتاً)
    setTimeout(refreshMeta, 60);
  }
  function hideHome() {
    closeMenu(); clearTimeout(openT);
    if (ov && ov.parentNode) ov.remove();
    state = 'idle';
  }

  /* ---------- بيانات البطاقات (عدد المشاهد، الحجم، المصغّرة) ---------- */
  function thumbFromEditor() {
    try {
      var cv = document.querySelector('#scenesBar canvas.scth');
      if (!cv || !cv.width || !cv.height) return null;
      var g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data, any = false;
      for (var i = 3; i < d.length; i += 97) if (d[i]) { any = true; break; }
      if (!any) return null;
      var c = document.createElement('canvas'); c.width = 224; c.height = 126;
      var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 224, 126); x.drawImage(cv, 0, 0, 224, 126);
      return c.toDataURL('image/jpeg', 0.6);
    } catch (e) { return null; }
  }
  var metaBusy = false;
  function refreshMeta() {
    if (metaBusy) return; metaBusy = true;
    var a = list(), i = 0;
    (function next() {
      if (i >= a.length) { metaBusy = false; render(); return; }
      var e = a[i++], s = ls(e.key), p = {}, m = s && /^\{"ts":(\d+)/.exec(s);
      if (s) {
        var ts = m ? +m[1] : e.ts;
        var live = booted && e.id === loadedId;
        if (ts !== e.pts || live) {
          p.size = s.length;
          if (ts !== e.pts || !e.scenes) {
            try { var o = JSON.parse(s); p.scenes = (o.scenes || []).length; } catch (er) {}
          }
          p.pts = ts; p.ts = ts;
        }
        if (live) { var t = thumbFromEditor(); if (t) p.thumb = t; }
        if (p.pts !== undefined || p.thumb) update(e.id, p);
      }
      setTimeout(next, 0);
    })();
  }

  /* ---------- العمليات ---------- */
  function createBlank() {
    var a = list(), n = 1, id = newId();
    var names = {}; a.forEach(function (e) { names[e.name] = 1; });
    while (names['مشروع ' + ar(n)]) n++;
    var e = { id: id, name: 'مشروع ' + ar(n), key: LEG_KEY + ':' + id, db: LEG_DB + '-' + id, ts: Date.now() };
    lset(e.key, '{"ts":' + e.ts + ',"scenes":[{"name":"","bg":"#ffffff","items":[]}],"cur":0,"clips":[]}');
    a.push(e); saveList(a);
    return e;
  }
  function flushNow() { try { if (window.__rsFlush) window.__rsFlush(); } catch (e) {} }

  function openEntry(e) {
    if (state === 'opening') return;
    if (booted && e.id === loadedId) { hideHome(); return; }
    lset(AK, e.id);
    if (!booted) {
      // أول فتح: نكمل تشغيل المحرر على هذا المشروع مباشرة
      window.__rsKey = e.key; window.__rsDb = e.db;
      loadedId = e.id; booted = true; state = 'opening';
      render();
      openT = setTimeout(hideHome, 20000); // احتياطي لو ما وصلت إشارة جاهزية الواجهة
      var r = gateRes; gateRes = null; if (r) r();
      return;
    }
    // المحرر شغّال على مشروع آخر: نحفظه ثم نعيد تحميل الصفحة على المشروع المختار
    state = 'opening'; render();
    flushNow();
    wait(700).then(function () { sset(SK, '1'); location.reload(); });
  }

  function rename(e) {
    var n = null;
    try { n = prompt('اسم المشروع', e.name || ''); } catch (er) {}
    if (n == null) return;
    n = String(n).trim().slice(0, 60);
    if (!n) return;
    update(e.id, { name: n }); render();
  }

  function remove(e) {
    var ok = true;
    try { ok = confirm('حذف «' + (e.name || 'بدون اسم') + '» نهائياً؟ لا يمكن التراجع.'); } catch (er) {}
    if (!ok) return;
    var a = list().filter(function (x) { return x.id !== e.id; });
    saveList(a);
    var q = jget(DK, []); q.push({ id: e.id, key: e.key, db: e.db, legacy: e.legacy ? 1 : 0 }); lset(DK, JSON.stringify(q));
    if (ls(AK) === e.id) lrm(AK);
    if (booted && e.id === loadedId) {
      // المحرر مفتوح على المشروع المحذوف: نعيد التحميل، والحذف الفعلي يتم قبل قراءة أي بيانات
      state = 'opening'; render();
      wait(100).then(function () { location.reload(); });
      return;
    }
    processDeletes(booted ? loadedId : null);
    render();
  }

  function duplicate(e) {
    if (state === 'opening') return;
    state = 'opening'; render();
    var busy = ov && ov.querySelector('.rsp-busy'); if (busy) busy.textContent = 'جارٍ نسخ المشروع…';
    var live = booted && e.id === loadedId;
    if (live) flushNow();
    wait(live ? 700 : 0).then(function () {
      var a = list(), id = newId(), src = ls(e.key), nE = {
        id: id, name: (e.name || 'مشروع') + ' (نسخة)', key: LEG_KEY + ':' + id, db: LEG_DB + '-' + id, ts: Date.now(),
        scenes: e.scenes, size: e.size, thumb: e.thumb
      };
      var srcDb, dstDb, latest = src;
      return openDb(e.db).then(function (d) { srcDb = d; return dbGet(d, 'auto:cur'); }).then(function (sn) {
        // نأخذ الأحدث بين نسخة التخزين المحلي ونسخة قاعدة البيانات
        var lts = src && /^\{"ts":(\d+)/.exec(src), lt = lts ? +lts[1] : 0;
        if (sn && typeof sn.json === 'string' && (+sn.ts || 0) > lt) latest = sn.json;
        if (!latest) throw new Error('empty');
        nE.ts = Date.now();
        return openDb(nE.db);
      }).then(function (d) {
        dstDb = d;
        return dbKeys(srcDb);
      }).then(function (ks) {
        ks = ks.filter(function (k) {
          k = String(k);
          return GLOBAL.indexOf(k) < 0 && k !== 'auto:cur' && k.indexOf('ver:') !== 0;
        });
        var i = 0;
        return (function step() {
          if (i >= ks.length) return null;
          var k = ks[i++];
          return dbGet(srcDb, k).then(function (v) { return v === undefined ? null : dbPut(dstDb, k, v); }).then(step);
        })();
      }).then(function () {
        return dbPut(dstDb, 'auto:cur', { ts: nE.ts, json: latest });
      }).then(function () {
        lset(nE.key, latest);
        a.push(nE); saveList(a);
        srcDb.close(); dstDb.close();
        state = 'choosing'; render();
      });
    }).catch(function () {
      state = 'choosing'; render();
      try { alert('تعذّر نسخ المشروع.'); } catch (er) {}
    });
  }

  /* ---------- نقطة الدخول: يستدعيها الكود الرئيسي قبل قراءة المشروع ---------- */
  window.__rsGate = function () {
    return new Promise(function (res) {
      processDeletes(null);
      if (skip) {
        var e = activeEntry();
        if (e) { window.__rsKey = e.key; window.__rsDb = e.db; loadedId = e.id; lset(AK, e.id); }
        booted = true;
        return res();
      }
      gateRes = res;
      var go = function () { showHome(); };
      if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
    });
  };

  // يستدعيها الكود الرئيسي عند جاهزية واجهة المحرر: نخفي شاشة «جارٍ الفتح»
  window.__rsOnReveal = function () { if (state === 'opening' && !metaBusy) hideHome(); else if (state === 'opening') setTimeout(window.__rsOnReveal, 200); };

  window.__rsProj = {
    show: function () { if (state === 'idle') { flushNow(); showHome(); } },
    visible: function () { return state !== 'idle'; },
    booted: function () { return booted; },
    back: function () { if (state === 'choosing' && booted) { hideHome(); return true; } return false; }
  };

  // زر «المشاريع» في رأس المحرر + تحديث بيانات المشروع المفتوح عند الخروج
  function addBtn() {
    var hb = document.querySelector('header.top .hb');
    if (!hb || document.getElementById('rspBtn')) return;
    var b = h('button', 'badge', '📁 المشاريع'); b.id = 'rspBtn'; b.type = 'button'; b.title = 'العودة لقائمة المشاريع';
    b.addEventListener('click', function () { window.__rsProj.show(); });
    b.style.cssText = 'background:var(--accent);color:var(--accent-fg);border-color:var(--accent);font-weight:600';
    hb.parentNode.insertBefore(b, hb); // خارج .hb حتى لا يختفي داخل قائمة «⋯» على الشاشات الضيقة
  }
  document.addEventListener('DOMContentLoaded', addBtn);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && booted && loadedId) {
      setTimeout(function () {
        var s = ls((find(loadedId) || {}).key), m = s && /^\{"ts":(\d+)/.exec(s);
        if (m) update(loadedId, { ts: +m[1] });
      }, 500);
    }
  });
})();
