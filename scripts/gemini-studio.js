/* gemini-studio.js: تعليق صوتي مصري وتفريغ صوتي عبر Gemini (منقول من OmniBoard)
   يُحقن بواسطة build.js قبل </body>. يعتمد على دوال الصفحة العامة: clips, bufs, scenes, cs, ensureAC, newId,
   idbGet, idbPut, idbDel, audioChanged, timeline, edited, renderScenePane, setTab. */
(function () {
  if (window.__rsGem) return; window.__rsGem = 1;
  var KK = 'rassam_gem_key_v1';
  var BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  /* تُجرَّب بالترتيب؛ عدّلها هنا لو تغيّرت أسماء النماذج */
  var TTS_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
  var TXT_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
  var VOICES = [['Kore', 'كوري (نسائي)'], ['Aoede', 'أويدي (نسائي)'], ['Zephyr', 'زيفير (نسائي)'],
    ['Charon', 'شارون (رجالي)'], ['Fenrir', 'فنرير (رجالي)'], ['Puck', 'باك (رجالي)']];
  var SPEEDS = [['0.8', 'بطيء'], ['1', 'عادي'], ['1.3', 'سريع']];
  var busy = false;

  function $g(id) { return document.getElementById(id); }
  function key() { try { return localStorage.getItem(KK) || ''; } catch (e) { return ''; } }
  function say(m) { var e = $g('gemMsg'); if (e) e.textContent = m || ''; }
  function lock(on) {
    busy = on;
    ['gemOne', 'gemAll', 'gemStt', 'gemSet'].forEach(function (i) { var b = $g(i); if (b) b.disabled = on; });
  }

  /* استدعاء generateContent مع تجربة النماذج بالترتيب */
  function gen(models, body) {
    var k = key();
    if (!k) return Promise.reject(new Error('أدخل مفتاح Gemini API أولاً.'));
    var i = 0;
    function go() {
      return fetch(BASE + models[i] + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
        body: JSON.stringify(body)
      }).then(function (r) {
        if ((r.status === 404 || r.status === 400) && ++i < models.length) return go();
        if (r.status === 429) throw new Error('تجاوزت حدّ الاستخدام، حاول بعد قليل.');
        if (r.status === 401 || r.status === 403) throw new Error('المفتاح غير صالح أو غير مسموح به.');
        if (!r.ok) throw new Error('خطأ من Gemini (' + r.status + ').');
        if (i > 0) models.unshift(models.splice(i, 1)[0]);
        return r.json();
      }, function () { throw new Error('تعذّر الاتصال بالإنترنت.'); });
    }
    return go();
  }

  /* نص إلى كلام: يرجع PCM خام 16-bit mono (غالباً 24kHz) */
  function tts(text, voice, speed) {
    var pace = speed < 0.85 ? 'at a calm, slow, clear pace' : speed > 1.15 ? 'at an energetic, brisk pace' : 'at a natural conversational pace';
    return gen(TTS_MODELS, {
      contents: [{ parts: [{ text: 'Speak in natural Egyptian Arabic dialect ' + pace + ':\n' + text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
    }).then(function (j) {
      var ps = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      var p = ps.filter(function (x) { return x.inlineData; })[0];
      if (!p) throw new Error('لم يصل صوت من Gemini.');
      var m = /rate=(\d+)/.exec(p.inlineData.mimeType || '');
      var bin = atob(p.inlineData.data), pcm = new Uint8Array(bin.length), i;
      for (i = 0; i < bin.length; i++) pcm[i] = bin.charCodeAt(i);
      var n = pcm.length >> 1, f = new Float32Array(n), dv = new DataView(pcm.buffer);
      for (i = 0; i < n; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
      return { f: f, sr: m ? +m[1] : 24000, pcm: pcm };
    });
  }

  function wav(pcm, sr) {
    var h = new DataView(new ArrayBuffer(44));
    function s(o, t) { for (var i = 0; i < 4; i++) h.setUint8(o + i, t.charCodeAt(i)); }
    s(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); s(8, 'WAVE'); s(12, 'fmt ');
    h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
    h.setUint32(24, sr, true); h.setUint32(28, sr * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
    s(36, 'data'); h.setUint32(40, pcm.length, true);
    var o = new Uint8Array(44 + pcm.length); o.set(new Uint8Array(h.buffer), 0); o.set(pcm, 44);
    return o.buffer;
  }

  /* يضيف مقطع تعليق جاهزاً (بدون فك ترميز) ويحفظه في IndexedDB كملف WAV */
  function addVoice(r, name, start) {
    var a = ensureAC();
    if (!a) throw new Error('تشغيل الصوت غير متاح في هذا المتصفح.');
    var b = a.createBuffer(1, r.f.length, r.sr); b.copyToChannel(r.f, 0);
    var c = { id: newId('a'), name: name.slice(0, 40), kind: 'voice', start: Math.round(start * 10) / 10, vol: 1, loop: false, dur: b.duration };
    bufs[c.id] = b; clips.push(c); selClip = c.id;
    var w = wav(r.pcm, r.sr);
    setTimeout(function () { idbPut(c.id, w); }, 80);
    return c;
  }

  function opts() {
    return { voice: $g('gemVoice').value, speed: parseFloat($g('gemSpeed').value) || 1 };
  }

  function genOne() {
    var tx = $g('gemText').value.trim();
    if (!tx) { say('اكتب نص التعليق أولاً.'); return; }
    var o = opts(); lock(true); say('جارٍ توليد الصوت...');
    tts(tx, o.voice, o.speed).then(function (r) {
      timeline(); addVoice(r, 'تعليق Gemini', cs()._s);
      audioChanged(); setTab('audio'); say('تمت إضافة التعليق عند بداية المشهد الحالي.');
    }).catch(function (e) { say(e.message || 'فشل التوليد.'); }).then(function () { lock(false); });
  }

  function genAll() {
    var list = [];
    scenes.forEach(function (s, i) { var t = String(s.narr || '').trim(); if (t) list.push([i, t]); });
    if (!list.length) { say('لا توجد نصوص تعليق في المشاهد. اكتبها من تبويب «المشهد» أو ولّدها من تبويب الذكاء الاصطناعي.'); return; }
    var o = opts(), k = 0; lock(true);
    /* نحذف تعليقات Gemini السابقة حتى لا تتكرر عند إعادة التوليد */
    clips.filter(function (c) { return /^تعليق مشهد \d+/.test(c.name || ''); }).forEach(function (c) {
      delete bufs[c.id]; idbDel(c.id); clips.splice(clips.indexOf(c), 1);
    });
    timeline();
    (function next() {
      if (k >= list.length) {
        audioChanged(); setTab('audio'); lock(false);
        say('تم توليد ' + list.length + ' مقطع. اضغط «مطابقة مدة المشاهد للتعليق الصوتي» لضبط التوقيت.');
        return;
      }
      var it = list[k]; say('جارٍ توليد التعليق ' + (k + 1) + '/' + list.length + '...');
      tts(it[1], o.voice, o.speed).then(function (r) {
        addVoice(r, 'تعليق مشهد ' + (it[0] + 1), scenes[it[0]]._s || 0); k++; next();
      }).catch(function (e) {
        if (k) audioChanged();
        lock(false); say((e.message || 'فشل التوليد.') + (k ? ' (اكتمل ' + k + ' من ' + list.length + ')' : ''));
      });
    })();
  }

  /* كشف نوع الملف من أول بايتات (الملفات المرفوعة تُحفظ بدون نوعها) */
  function mimeOf(b) {
    var u = new Uint8Array(b, 0, 12), s = String.fromCharCode.apply(null, u);
    if (s.slice(0, 4) === 'RIFF') return 'audio/wav';
    if (s.slice(0, 3) === 'ID3' || (u[0] === 255 && (u[1] & 224) === 224)) return 'audio/mp3';
    if (s.slice(4, 8) === 'ftyp') return 'audio/aac';
    if (s.slice(0, 4) === 'OggS') return 'audio/ogg';
    if (s.slice(0, 4) === 'fLaC') return 'audio/flac';
    return 'audio/mp3';
  }
  function b64(buf) {
    var u = new Uint8Array(buf), s = '';
    for (var i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
    return btoa(s);
  }

  function stt() {
    if (!selClip) { say('اختر مقطعاً صوتياً من قائمة المقاطع أولاً.'); return; }
    var id = selClip, fusha = $g('gemFusha').checked; lock(true); say('جارٍ قراءة المقطع...');
    idbGet(id).then(function (buf) {
      if (!buf) throw new Error('بيانات هذا المقطع غير محفوظة. أعد رفعه أولاً.');
      if (buf.byteLength > 14 * 1024 * 1024) throw new Error('المقطع كبير للتفريغ (الحد 14 ميغابايت).');
      say('جارٍ التفريغ...');
      var ins = fusha
        ? 'استمع إلى هذا التسجيل (قد يكون بالعامية المصرية) وفرّغه إلى نص بالعربية الفصحى السليمة مع علامات الترقيم. أعد النص فقط دون أي شرح.'
        : 'استمع إلى هذا التسجيل وفرّغه حرفياً كما قيل بلهجته المصرية مع علامات الترقيم. أعد النص فقط دون أي شرح.';
      return gen(TXT_MODELS, {
        contents: [{ parts: [{ text: ins }, { inlineData: { mimeType: mimeOf(buf), data: b64(buf) } }] }],
        generationConfig: { temperature: 0.2 }
      });
    }).then(function (j) {
      var ps = (((j.candidates || [])[0] || {}).content || {}).parts || [];
      var t = ps.map(function (p) { return p.text || ''; }).join('').trim();
      if (!t) throw new Error('تعذّر استخراج نص من المقطع.');
      $g('gemText').value = t; say('تم التفريغ. يمكنك تعديل النص ثم جعله نص تعليق المشهد.');
    }).catch(function (e) { say(e.message || 'فشل التفريغ.'); }).then(function () { lock(false); });
  }

  function setNarr() {
    var t = $g('gemText').value.trim();
    if (!t) { say('لا يوجد نص.'); return; }
    cs().narr = t.slice(0, 300); edited(); try { renderScenePane(); } catch (e) {}
    say('تم تعيين النص كتعليق للمشهد الحالي' + (t.length > 300 ? ' (قُصّ إلى 300 حرف).' : '.'));
  }

  function build() {
    var pane = $g('pane-audio'); if (!pane || $g('gemBox')) return;
    var d = document.createElement('div'); d.className = 'field'; d.id = 'gemBox';
    d.innerHTML = '<span class="lbl">تعليق وتفريغ بالذكاء الاصطناعي (Gemini)</span>' +
      '<input id="gemKey" type="password" autocomplete="off" placeholder="مفتاح Gemini API (يُحفظ على جهازك فقط)" aria-label="مفتاح Gemini">' +
      '<div class="row"><select id="gemVoice" class="grow" aria-label="الصوت">' + VOICES.map(function (v) { return '<option value="' + v[0] + '">' + v[1] + '</option>'; }).join('') + '</select>' +
      '<select id="gemSpeed" aria-label="السرعة">' + SPEEDS.map(function (v) { return '<option value="' + v[0] + '"' + (v[0] === '1' ? ' selected' : '') + '>' + v[1] + '</option>'; }).join('') + '</select></div>' +
      '<textarea id="gemText" rows="3" maxlength="1500" placeholder="نص التعليق، أو نتيجة التفريغ تظهر هنا"></textarea>' +
      '<div class="row"><button class="btn grow" id="gemOne" type="button">ولّد صوتاً لهذا النص</button>' +
      '<button class="btn primary grow" id="gemAll" type="button">ولّد صوتاً لكل المشاهد</button></div>' +
      '<div class="row"><button class="btn grow" id="gemStt" type="button">فرّغ المقطع المحدد</button>' +
      '<button class="btn grow" id="gemSet" type="button">اجعله تعليق المشهد</button></div>' +
      '<label class="chk2"><input type="checkbox" id="gemFusha"> حوّل التفريغ إلى فصحى</label>' +
      '<p class="note" id="gemMsg" role="status"></p>';
    var f = pane.querySelector('.field'); pane.insertBefore(d, f);
    var ki = $g('gemKey'); ki.value = key();
    ki.addEventListener('change', function () { try { localStorage.setItem(KK, ki.value.trim()); } catch (e) {} say(ki.value.trim() ? 'تم حفظ المفتاح.' : ''); });
    $g('gemOne').addEventListener('click', function () { if (!busy) genOne(); });
    $g('gemAll').addEventListener('click', function () { if (!busy) genAll(); });
    $g('gemStt').addEventListener('click', function () { if (!busy) stt(); });
    $g('gemSet').addEventListener('click', function () { if (!busy) setNarr(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
