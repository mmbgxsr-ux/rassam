"""اختبار دخان: يفتح التطبيق (index.html + الإضافات كما يحقنها build.js) في Chromium بلا إنترنت
ويتحقق أنه يعمل بلا أخطاء، وأن سجل الأعطال يعمل. التشغيل: python tests/smoke.py"""
import http.server, json, os, re, socketserver, sys, tempfile, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

# نفس قائمة الإضافات التي يحقنها build.js (تُقرأ منه لتفادي التباعد)
html = read('index.html')
build = read('scripts', 'build.js')
addons = re.findall(r"\['([\w.-]+\.js)',\s*'([\w-]+)'\]", build.split('إضافات مستقلة', 1)[1][:600])
assert addons, 'لم أجد قائمة الإضافات في build.js'
for fname, sid in addons:
    if 'id="%s"' % sid in html:
        continue
    gi = html.rfind('</body>')
    html = html[:gi] + '<script id="%s">\n%s\n</script>\n' % (sid, read('scripts', fname)) + html[gi:]

tmp = tempfile.mkdtemp()
open(os.path.join(tmp, 'index.html'), 'w', encoding='utf-8').write(html)
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=tmp, **k)
    def log_message(s, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = 'http://127.0.0.1:%d/index.html' % port

fails = []
def check(ok, msg):
    print(('PASS ' if ok else 'FAIL ') + msg)
    if not ok: fails.append(msg)

# أخطاء شبكة متوقعة بلا إنترنت، وتسجيل service worker (sw.js غير موجود، والتطبيق يلتقط فشله)
NET = re.compile(r'Failed to load resource|net::ERR|ERR_INTERNET|ERR_NAME|ERR_FAILED|ServiceWorker|bad HTTP response code')
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 412, 'height': 915})
    ctx.route('**/*', lambda r: r.continue_() if r.request.url.startswith('http://127.0.0.1') else r.abort())

    # 1) فتح عادي
    pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)) if not NET.search(str(e)) else None)
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and not NET.search(m.text) else None)
    pg.goto(URL); pg.wait_for_timeout(2500)
    check(not errs, 'لا أخطاء عند الفتح ' + (str(errs[:3]) if errs else ''))
    check(pg.evaluate("!!window.__rsApp&&__rsApp.scenes.length>=1"), 'المشاهد تُحمَّل (عبر __rsApp)')
    check(pg.evaluate("typeof __rsApp.timeline==='function'"), 'واجهة __rsApp سليمة')
    for k in ('__rsBS', '__rsJ'):
        check(pg.evaluate("!!window.%s" % k), 'الإضافة %s محقونة' % k)

    # 2) زر تقرير المشكلة
    pg.evaluate("document.getElementById('repBtn').click()"); pg.wait_for_timeout(800)
    rep = pg.evaluate("(document.getElementById('repTxt')||{}).value||''")
    check('app:' in rep and 'project:' in rep, 'تقرير المشكلة يُنتج نصًا')

    # 3) تسجيل الأخطاء في السجل الدائم
    pg.evaluate("setTimeout(function(){throw new Error('smoke-test-error')},0)"); pg.wait_for_timeout(500)
    j = pg.evaluate("localStorage.getItem('rs-journal')||''")
    check('smoke-test-error' in j, 'الخطأ يُحفظ في rs-journal')
    pg.close()

    # 4) محاكاة تعطل أثناء التصدير في الجلسة السابقة
    p2 = ctx.new_page()
    p2.add_init_script("localStorage.setItem('rs-session',JSON.stringify({t0:1,t:Date.now()-60000,state:'running',busy:true}))")
    p2.goto(URL); p2.wait_for_timeout(1500)
    jl = p2.evaluate("JSON.stringify(window.__rsJ.list())")
    check('انتهت الجلسة السابقة فجأة أثناء التصدير' in jl, 'يكشف التعطل أثناء التصدير')
    ee = p2.evaluate("JSON.stringify(window.__rassamErrs||[])")
    check('[سابق' in ee, 'السجل السابق يظهر في قائمة التقرير')
    check(p2.evaluate("!!document.querySelector('[role=status][style*=\"99998\"]')"), 'يظهر تنبيه التصدير المتوقف')
    b.close()
srv.shutdown()
print('\nالنتيجة:', 'نجح كل شيء' if not fails else '%d فشل' % len(fails))
sys.exit(1 if fails else 0)
