/* board-styles.js: بطاقة ملاحظة وعنوان متموّج (منقولان من whiteboard5)
   يُحقن قبل </body>. يعتمد على دوال الأداة: dgPath, rrp, dgSvgItem, dgTxt, T, S, newId, cs, clamp,
   hasAr, edited, renderProps, setTab, play. يضيف قسماً في تبويب «القوالب» ويُدرج العناصر في المشهد الحالي. */
(function () {
  if (window.__rsBS) return; window.__rsBS = 1;
  var COLS = [['أزرق', '#1e6fe0'], ['أخضر', '#1f9d55'], ['برتقالي', '#f08a1c'], ['أحمر', '#e5383b'], ['بنفسجي', '#8e44ad'], ['فيروزي', '#0f9aa8']];
  var BGS = { '#1e6fe0': '#e4efff', '#1f9d55': '#e6f6ec', '#f08a1c': '#fff1de', '#e5383b': '#fdecea', '#8e44ad': '#f3eafd', '#0f9aa8': '#e1f5f7' };
  function $b(id) { return document.getElementById(id); }
  function say(m) { var e = $b('bsMsg'); if (e) e.textContent = m || ''; }

  /* بطاقة: إطار مستدير بخلفية فاتحة وحافة علوية سميكة بلون الموضوع، عنوان ملوّن، ونقاط */
  function noteItems(head, lines, col) {
    var n = lines.length, w = 780, h = 110 + n * 62, cx = 640, top = Math.round(360 - h / 2);
    var parts = [
      dgPath(rrp(cx, top + h / 2, w, h, 20), '#c9d2de', BGS[col] || '#fff6c8', 4),
      dgPath('M' + (cx - w / 2 + 20) + ' ' + (top + 4) + 'H' + (cx + w / 2 - 20), col, null, 10)
    ];
    var its = [dgSvgItem(parts)];
    its.push(dgTxt(head, cx, top + 52, clamp(Math.round(w * 1.4 / Math.max(head.length, 8)), 38, 54), col));
    lines.forEach(function (l, i) {
      var t = '• ' + l;
      its.push(dgTxt(t, cx, top + 118 + i * 62, clamp(Math.round(w * 1.6 / Math.max(t.length, 10)), 26, 38), '#1d2b4f'));
    });
    return its;
  }

  /* عنوان: نص كبير بلون الموضوع وتحته خط متموّج أحمر */
  function titleItems(txt, col) {
    var size = txt.length > 22 ? 64 : txt.length > 12 ? 80 : 96;
    var t = T(txt, 640, 150, size, hasAr(txt) ? 'aref' : 'cav', col, Math.round(clamp(txt.length * 0.12, 1.2, 3) * 10) / 10);
    var w = clamp(Math.round(txt.length * size * 0.55), 260, 1000);
    var u = S('squiggle', 640, 150 + Math.round(size * 0.62), w, '#e5383b', 0, 1.2);
    return [t, u];
  }

  function put(its, okMsg) {
    var g = newId('g'); its.forEach(function (i) { i.grp = g; });
    its.forEach(function (i) { cs().items.push(i); });
    sel = its[its.length - 1].id;
    edited(); renderProps(); setTab('props');
    var last = its[its.length - 1];
    try { play(its[0]._gs, last._gs + last.dur + 0.5); } catch (e) {}
    say(okMsg);
  }

  function addNote() {
    var head = $b('bsNoteH').value.trim().slice(0, 30);
    var lines = $b('bsNoteL').value.split('\n').map(function (x) { return x.trim().slice(0, 50); }).filter(Boolean).slice(0, 5);
    if (!head) { $b('bsNoteH').focus(); say('اكتب عنوان البطاقة.'); return; }
    if (!lines.length) { $b('bsNoteL').focus(); say('اكتب نقطة واحدة على الأقل، كل نقطة في سطر.'); return; }
    put(noteItems(head, lines, $b('bsCol').value), 'أُضيفت البطاقة إلى المشهد الحالي. يمكنك تحريكها أو تعديل نصوصها، أو التراجع بـ Ctrl+Z.');
  }
  function addTitle() {
    var t = $b('bsTitle').value.trim().slice(0, 40);
    if (!t) { $b('bsTitle').focus(); say('اكتب نص العنوان.'); return; }
    put(titleItems(t, $b('bsCol').value), 'أُضيف العنوان إلى المشهد الحالي.');
  }

  function build() {
    var f = $b('fcSteps'), host = f && f.closest('.tpl-sec');
    if (!host || $b('bsBox')) return;
    var d = document.createElement('div'); d.className = 'tpl-sec'; d.id = 'bsBox';
    d.innerHTML = '<div class="field"><label for="bsNoteH">بطاقة ملاحظة وعنوان متموّج</label>' +
      '<select id="bsCol" aria-label="اللون" style="width:100%;margin-bottom:6px">' + COLS.map(function (c) { return '<option value="' + c[1] + '">' + c[0] + '</option>'; }).join('') + '</select>' +
      '<input id="bsNoteH" maxlength="30" placeholder="عنوان البطاقة">' +
      '<textarea id="bsNoteL" rows="3" placeholder="كل نقطة في سطر (حتى 5 نقاط)"></textarea>' +
      '<button class="btn primary" id="bsNote" type="button" style="margin-top:6px">أضف البطاقة</button>' +
      '<input id="bsTitle" maxlength="40" placeholder="نص العنوان" style="margin-top:10px">' +
      '<button class="btn" id="bsTitleBtn" type="button" style="margin-top:6px">أضف عنواناً بخط متموّج</button>' +
      '<p class="note" id="bsMsg" role="status"></p></div>';
    host.parentNode.insertBefore(d, host);
    $b('bsNote').addEventListener('click', addNote);
    $b('bsTitleBtn').addEventListener('click', addTitle);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
