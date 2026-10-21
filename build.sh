set -eo pipefail
mkdir -p www out assets
# لازم قبل cap add: كابستور يرفض إضافة android لو www/index.html غير موجود (build.js يعيد بناء www بعدها)
cp -f index.html www/index.html
# مع package-lock.json نثبّت الإصدارات بالضبط (npm ci)، وبدونه نرجع للتثبيت العادي
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund --prefer-offline
else
  echo "WARN-LOCK: package-lock.json غير موجود، إصدارات الحزم غير مثبّتة"
  npm install --no-audit --no-fund --prefer-offline
fi
[ -d android ] || npx cap add android

# تجهيز www: الخطوط والمكتبات + زر الرجوع + تسجيل الصوت + إذن الميكروفون
# (لازم بعد cap add عشان AndroidManifest.xml يكون موجود، وقبل cap sync)
node scripts/build.js 2>&1 | tee build.log

# فشل البناء لو أي استبدال مهم في index.html ما اتنفّذش (بدل ما تطلع نسخة ناقصة بدون ما تحس)
# للتخطي مؤقتاً: شغّل الـ workflow مع ALLOW_WARN=1
if grep -E "SKIP \(|SKIP: لم أجد|WARN: لم أجد مستمع زر الرجوع|WARN: تعذّر تفعيل|WARN: لم أنقل|التسريع غير مفعّل|WARN: AndroidManifest|WARN: لم أجد </activity>" build.log; then
  if [ "$ALLOW_WARN" != "1" ]; then
    echo "BUILD STOPPED: النصوص اللي فوق اتغيّرت في index.html. راجع build.js أو رجّع النص الأصلي."
    exit 1
  fi
fi

# فحص: التطبيق لازم يشتغل بدون إنترنت. (esm.run للذكاء الاصطناعي المحلي مقصود وغير مشمول)
OFF=$(grep -oE "cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com" www/index.html | sort | uniq -c || true)
if [ -n "$OFF" ]; then
  { echo "OFFLINE-CHECK: لسه فيه روابط خارجية في www/index.html:"; echo "$OFF"; } | tee -a build.log
else
  echo "OFFLINE-CHECK: OK (لا روابط CDN للمكتبات أو الخطوط)" | tee -a build.log
fi

# تعطيل فحص التحديثات داخل التطبيق (كان بيقرأ index.html كله بعد 4 ثواني من الفتح وكل ساعة، ومالوش لازمة في الـ APK)
node - <<'JS'
const fs = require('fs');
let h = fs.readFileSync('www/index.html', 'utf8');
const a = 'function auto(){if(cfg.on&&';
const b = 'setTimeout(function(){if(cfg.on)check(false);},4000);';
if (h.includes(a) && h.includes(b)) {
  h = h.replace(a, () => 'function auto(){if(false&&cfg.on&&').replace(b, () => '');
  fs.writeFileSync('www/index.html', h);
  console.log('OK: update check disabled');
} else console.log('WARN: لم أجد كود فحص التحديثات (غير مؤثر)');
JS

# أيقونة التطبيق (لا توقف البناء إن فشلت)
cp -f icon-only.png icon-foreground.png icon-background.png assets/ 2>/dev/null || true
npx capacitor-assets generate --android || echo "icon step skipped"

# إبقاء الشاشة مضاءة أثناء استخدام التطبيق
D=android/app/src/main/java/com/rassam/sabbura
