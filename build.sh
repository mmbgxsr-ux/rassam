set -e
mkdir -p www out assets
cp -f index.html www/index.html
npm install --no-audit --no-fund --prefer-offline
[ -d android ] || npx cap add android

# تجهيز www: الخطوط والمكتبات + زر الرجوع + تسجيل الصوت + إذن الميكروفون
# (لازم بعد cap add عشان AndroidManifest.xml يكون موجود، وقبل cap sync)
node scripts/build.js

# أيقونة التطبيق (لا توقف البناء إن فشلت)
cp -f icon-only.png icon-foreground.png icon-background.png assets/ 2>/dev/null || true
npx --yes @capacitor/assets generate --android || echo "icon step skipped"

# إبقاء الشاشة مضاءة أثناء استخدام التطبيق
D=android/app/src/main/java/com/rassam/sabbura
mkdir -p "$D"
cat > "$D/MainActivity.java" <<'JAVA'
package com.rassam.sabbura;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  }
}
JAVA

npx cap sync android
# تسريع Gradle: ذاكرة أكبر + تشغيل متوازي + كاش البناء
GP=android/gradle.properties
touch "$GP"
sed -i '/^org.gradle.jvmargs/d;/^org.gradle.parallel/d;/^org.gradle.caching/d;/^org.gradle.daemon/d' "$GP"
printf '\norg.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8\norg.gradle.parallel=true\norg.gradle.caching=true\norg.gradle.daemon=false\n' >> "$GP"

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
