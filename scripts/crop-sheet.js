/* crop-sheet.js: قصّ رسومات من صورة كبيرة (منقول من فكرة SPR في whiteboard5)
   ارفع صورة مرة واحدة، حدّد مستطيلاً بالسحب، واضغط «أضف المحدد» لتصير القطعة صورة عادية في المشهد.
   يمرّ القصّ عبر addImage() الموجودة في الأداة، فتنطبق عليه إزالة الخلفية والتحويل لخطوط. */
(function () {
  if (window.__rsCrop) return;
  var im = null, url = null, sc = 1, sel = null, a = null, cv, ctx, msgEl;
  function $c(id) { return document.getElementById(id); }
  function say(m) { if (msgEl) msgEl.textContent = m || ''; }

  /* مستطيل بإحداثيات الشاشة من نقطتين، مقصوص على حدود الصورة */
  function rectFrom(p, q, W, H) {
    var x1 = Math.max(0, Math.min(p.x, q.x)), y1 = Math.max(0, Math.min(p.y, q.y));
    var x2 = Math.min(W, Math.max(p.x, q.x)), y2 = Math.min(H, Math.max(p.y, q.y));
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  window.__rsCrop = { rectFrom: rectFrom };

  function draw() {
    if (!im || !ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(im, 0, 0, cv.width, cv.height);
    if (sel && sel.w > 1 && sel.h > 1) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.fillRect(0, 0, cv.width, sel.y);
      ctx.fillRect(0, sel.y + sel.h, cv.width, cv.height - sel.y - sel.h);
      ctx.fillRect(0, sel.y, sel.x, sel.h);
      ctx.fillRect(sel.x + sel.w, sel.y, cv.width - sel.x - sel.w, sel.h);
      ctx.strokeStyle = '#1e6fe0'; ctx.lineWidth = 2; ctx.strokeRect(sel.x, sel.y, sel.w, sel.h);
    }
  }
  function pt(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; }

  function load(file) {
    if (!file) return;
    if (url) { try { URL.revokeObjectURL(url); } catch (e) {} }
    url = URL.createObjectURL(file);
    var i = new Image();
    i.onload = function () {
      im = i; sel = null;
      var w = Math.min($c('crBox').clientWidth || 320, 480), h = 360;
      sc = Math.min(w / im.naturalWidth, h / im.naturalHeight);
      cv.width = Math.max(1, Math.round(im.naturalWidth * sc)); cv.height = Math.max(1, Math.round(im.naturalHeight * sc));
      cv.hidden = false; $c('crAdd').disabled = true; draw();
      say('اسحب على الصورة لتحديد القطعة، ثم اضغط «أضف المحدد». يمكنك تكرار ذلك من نفس الصورة.');
    };
    i.onerror = function () { say('تعذّر فتح هذا الملف كصورة.'); };
    i.src = url;
  }

  function add() {
    if (!im || !sel || sel.w < 8 || sel.h < 8) { say('حدّد قطعة أكبر بالسحب أولاً.'); return; }
    var sx = Math.round(sel.x / sc), sy = Math.round(sel.y / sc), sw = Math.round(sel.w / sc), sh = Math.round(sel.h / sc);
    var c = document.createElement('canvas'); c.width = sw; c.height = sh;
    c.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh);
    c.toBlob(function (b) {
      if (!b) { say('تعذّر قصّ هذه القطعة.'); return; }
      sel = null; $c('crAdd').disabled = true; draw();
      say('جارٍ إضافة القطعة...');
      addImage(new File([b], 'قطعة.png', { type: 'image/png' }));
      setTimeout(function () { say('أُضيفت القطعة. حدّد قطعة أخرى لإضافتها.'); }, 400);
    }, 'image/png');
  }

  function build() {
    var f = $c('fileImg'), host = f && f.closest('.field');
    if (!host || $c('crBox')) return;
    var d = document.createElement('div'); d.className = 'field'; d.id = 'crBox';
    d.innerHTML = '<span class="lbl">قصّ رسومات من صورة كبيرة</span>' +
      '<label class="btn" for="crFile">+ رفع صورة للقصّ منها</label>' +
      '<input class="verh" id="crFile" type="file" accept="image/*">' +
      '<canvas id="crCv" hidden style="width:100%;max-width:100%;touch-action:none;border:1px solid var(--line);border-radius:8px;margin-top:8px;cursor:crosshair"></canvas>' +
      '<button class="btn primary" id="crAdd" type="button" style="margin-top:6px" disabled>أضف المحدد</button>' +
      '<p class="note" id="crMsg" role="status"></p>';
    host.parentNode.insertBefore(d, host.nextSibling);
    cv = $c('crCv'); ctx = cv.getContext('2d'); msgEl = $c('crMsg');
    $c('crFile').addEventListener('change', function (e) { load(e.target.files[0]); e.target.value = ''; });
    $c('crAdd').addEventListener('click', add);
    cv.addEventListener('pointerdown', function (e) { if (!im) return; try { cv.setPointerCapture(e.pointerId); } catch (x) {} a = pt(e); sel = null; draw(); });
    cv.addEventListener('pointermove', function (e) { if (!a) return; sel = rectFrom(a, pt(e), cv.width, cv.height); draw(); });
    function up() { if (!a) return; a = null; $c('crAdd').disabled = !(sel && sel.w >= 8 && sel.h >= 8); }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
