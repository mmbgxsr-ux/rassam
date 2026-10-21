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
mkdir -p "$D"
cat > "$D/MainActivity.java" <<'JAVA'
package com.rassam.sabbura;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
  private final ArrayList<JSONObject> shared = new ArrayList<JSONObject>();

  // جسر بسيط بين الصفحة والنظام: ملء الشاشة + الملفات المستقبَلة من تطبيقات تانية
  public class Native {
    @JavascriptInterface
    public void immersive(final boolean on) {
      runOnUiThread(new Runnable() {
        public void run() { applyImmersive(on); }
      });
    }

    @JavascriptInterface
    public String takeShared() {
      synchronized (shared) {
        JSONArray a = new JSONArray();
        for (JSONObject o : shared) a.put(o);
        shared.clear();
        return a.toString();
      }
    }
  }

  @SuppressWarnings("deprecation")
  private void applyImmersive(boolean on) {
    View d = getWindow().getDecorView();
    if (on) {
      d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
          | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_FULLSCREEN
          | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
          | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
          | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    } else {
      d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
    }
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    try {
      getBridge().getWebView().addJavascriptInterface(new Native(), "RassamNative");
    } catch (Exception e) { }
    handleIntent(getIntent());
  }

  @Override
  protected void onNewIntent(Intent intent) {
    super.onNewIntent(intent);
    handleIntent(intent);
  }

  @SuppressWarnings("deprecation")
  private void handleIntent(Intent in) {
    if (in == null) return;
    String act = in.getAction();
    final ArrayList<Uri> uris = new ArrayList<Uri>();
    try {
      if (Intent.ACTION_SEND.equals(act)) {
        Uri u = (Uri) in.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u != null) uris.add(u);
      } else if (Intent.ACTION_SEND_MULTIPLE.equals(act)) {
        ArrayList<Uri> l = in.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
        if (l != null) uris.addAll(l);
      } else if (Intent.ACTION_VIEW.equals(act) && in.getData() != null) {
        uris.add(in.getData());
      }
    } catch (Exception e) { return; }
    if (uris.isEmpty()) return;
    in.setAction(Intent.ACTION_MAIN); // ما نعالجش نفس الملف مرتين
    final String fallbackType = in.getType();
    new Thread(new Runnable() {
      public void run() {
        for (Uri u : uris) copyShared(u, fallbackType);
      }
    }).start();
  }

  private void copyShared(Uri u, String fallbackType) {
    try {
      ContentResolver cr = getContentResolver();
      String mime = cr.getType(u);
      if (mime == null) mime = fallbackType;
      if (mime == null) mime = "";
      String name = "file";
      Cursor c = null;
      try {
        c = cr.query(u, null, null, null, null);
        if (c != null && c.moveToFirst()) {
          int i = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
          if (i >= 0) {
            String n = c.getString(i);
            if (n != null) name = n;
          }
        }
      } catch (Exception e) {
      } finally {
        if (c != null) c.close();
      }
      String safe = name.replaceAll("[^\\p{L}\\p{N}._ -]", "_");
      File dir = new File(getCacheDir(), "shared");
      dir.mkdirs();
      long now = System.currentTimeMillis();
      File[] old = dir.listFiles();
      if (old != null) {
        for (File f : old) {
          if (now - f.lastModified() > 3600000L) f.delete();
        }
      }
      File out = new File(dir, now + "_" + safe);
      InputStream is = cr.openInputStream(u);
      if (is == null) return;
      OutputStream os = new FileOutputStream(out);
      byte[] buf = new byte[65536];
      int n;
      long total = 0;
      while ((n = is.read(buf)) > 0) {
        os.write(buf, 0, n);
        total += n;
        if (total > 80L * 1024L * 1024L) break;
      }
      os.close();
      is.close();
      if (total > 80L * 1024L * 1024L) {
        out.delete();
        return;
      }
      JSONObject o = new JSONObject();
      o.put("path", out.getAbsolutePath());
      o.put("name", name);
      o.put("mime", mime);
      synchronized (shared) {
        shared.add(o);
      }
    } catch (Exception e) { }
  }
}
JAVA
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
