set -eo pipefail
mkdir -p www out assets
# المصدر الحقيقي للتعديل هو src/ (انظر scripts/assemble.js): نولّد index.html منه قبل أي شيء
[ -f src/index.template.html ] && node scripts/assemble.js
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
bash scripts/check-build-log.sh build.log

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
mkdir -p "$D"
cp -f android-src/MainActivity.java "$D/MainActivity.java"
echo "STEP: MainActivity written"

npx cap sync android
echo "STEP: cap sync done"
# تسريع Gradle: ذاكرة أكبر + تشغيل متوازي + كاش البناء
GP=android/gradle.properties
touch "$GP"
sed -i '/^org.gradle.jvmargs/d;/^org.gradle.parallel/d;/^org.gradle.caching/d;/^org.gradle.daemon/d' "$GP"
printf '\norg.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8\norg.gradle.parallel=true\norg.gradle.caching=true\norg.gradle.daemon=false\n' >> "$GP"

# رقم إصدار تلقائي: كل تشغيل للـ workflow ياخد رقم أكبر من اللي قبله
GR=android/app/build.gradle
VC=${GITHUB_RUN_NUMBER:-1}
sed -i -E "s/versionCode [0-9]+/versionCode $VC/; s/versionName \"[^\"]*\"/versionName \"1.$VC\"/" "$GR"
grep -nE "versionCode|versionName" "$GR" || true

echo "STEP: gradle start"
ROOT=$(pwd)
trap 'rm -f "$ROOT/release.p12" "$ROOT/aligned.apk"' EXIT
cd android
chmod +x gradlew
if [ -n "$KS_B64" ] && [ -n "$KS_PASS" ]; then
  ./gradlew assembleRelease
  BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
  APK=$(ls app/build/outputs/apk/release/*.apk | head -1)
  echo "$KS_B64" | base64 -d > ../release.p12
  "$BT/zipalign" -p 4 "$APK" ../aligned.apk
  "$BT/apksigner" sign --ks ../release.p12 --ks-pass env:KS_PASS --key-pass env:KS_PASS --out ../out/rassam.apk ../aligned.apk
  echo "SIGNED with stable key"
else
  ./gradlew assembleDebug
  cp app/build/outputs/apk/debug/app-debug.apk ../out/rassam.apk
  echo "WARNING: built with debug key (no secrets)"
fi

cd "$ROOT"
[ -s out/rassam.apk ] || { echo "ERROR: لم يُنتج out/rassam.apk"; exit 1; }
echo "STEP: done"
