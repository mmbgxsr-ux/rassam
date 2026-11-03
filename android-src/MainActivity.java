package com.rassam.sabbura;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.MotionEvent;
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
  private static final long MAX_SHARED = 80L * 1024L * 1024L;
  private static final long IDLE_MS = 15L * 60L * 1000L; // الشاشة تنطفئ طبيعياً بعد 15 دقيقة بدون لمس
  private final Handler idle = new Handler(Looper.getMainLooper());
  private final Runnable clearKeep = new Runnable() {
    public void run() { getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); }
  };
  private long lastKeep = 0;

  private void keepAwake() {
    long now = System.currentTimeMillis();
    if (now - lastKeep < 5000L) return;
    lastKeep = now;
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    idle.removeCallbacks(clearKeep);
    idle.postDelayed(clearKeep, IDLE_MS);
  }

  @Override
  public boolean dispatchTouchEvent(MotionEvent ev) {
    keepAwake();
    return super.dispatchTouchEvent(ev);
  }

  // بعد ما ينتهي نسخ الملف نخبر الصفحة فوراً (بدل ما تعتمد على مؤقت قد يسبق انتهاء النسخ)
  private void notifyJs() {
    runOnUiThread(new Runnable() {
      public void run() {
        try {
          getBridge().getWebView().evaluateJavascript("window.__rsPullShared&&window.__rsPullShared()", null);
        } catch (Exception e) { }
      }
    });
  }

  // جسر بسيط بين الصفحة والنظام: ملء الشاشة + الملفات المستقبَلة من تطبيقات تانية
  public class Native {
    @JavascriptInterface
    public void immersive(final boolean on) {
      runOnUiThread(new Runnable() {
        public void run() { if (on) { lastKeep = 0; keepAwake(); } applyImmersive(on); }
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
    keepAwake();
    try {
      getBridge().getWebView().addJavascriptInterface(new Native(), "RassamNative");
    } catch (Exception e) { }
    handleIntent(getIntent());
  }

  @Override
  protected void onDestroy() {
    idle.removeCallbacks(clearKeep);
    try { getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } catch (Exception e) { }
    super.onDestroy();
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
      long total = 0;
      try {
        OutputStream os = new FileOutputStream(out);
        try {
          byte[] buf = new byte[65536];
          int n;
          while ((n = is.read(buf)) > 0) {
            os.write(buf, 0, n);
            total += n;
            if (total > MAX_SHARED) break;
          }
        } finally {
          try { os.close(); } catch (Exception e) { }
        }
      } catch (Exception e) {
        out.delete(); // نسخة ناقصة (انقطاع القراءة أو امتلاء التخزين): لا نمررها للصفحة
        return;
      } finally {
        try { is.close(); } catch (Exception e) { }
      }
      if (total > MAX_SHARED) {
        out.delete();
        JSONObject big = new JSONObject();
        big.put("error", "big");
        big.put("name", name);
        synchronized (shared) { shared.add(big); }
        notifyJs();
        return;
      }
      JSONObject o = new JSONObject();
      o.put("path", out.getAbsolutePath());
      o.put("name", name);
      o.put("mime", mime);
      synchronized (shared) {
        shared.add(o);
      }
      notifyJs();
    } catch (Exception e) { }
  }
}
