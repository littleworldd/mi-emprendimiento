package cl.susana.emprendimiento;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * App de ventas y gastos de Susana.
 * Todo se guarda solo en el teléfono (la app no tiene permiso de internet).
 */
public class MainActivity extends Activity {

    private static final int REQ_ARCHIVO = 101;
    private static final String CARPETA = "Emprendimiento Susana";

    private WebView web;
    private ValueCallback<Uri[]> archivoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Puente(), "AndroidApp");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Nunca abrir páginas externas
                return !request.getUrl().toString().startsWith("file:///android_asset/");
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (archivoCallback != null) archivoCallback.onReceiveValue(null);
                archivoCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Elige el archivo .json del respaldo"), REQ_ARCHIVO);
                } catch (Exception e) {
                    archivoCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_ARCHIVO && archivoCallback != null) {
            archivoCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            archivoCallback = null;
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.onAndroidBack ? window.onAndroidBack() : 0)", value -> {
            if (!"1".equals(value)) finish();
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /* ===================== Puente JavaScript ↔ Android ===================== */
    private class Puente {

        private File archivoDatos() { return new File(getFilesDir(), "datos.json"); }
        private File archivoPrevio() { return new File(getFilesDir(), "datos.prev.json"); }

        @JavascriptInterface
        public String loadData() {
            File f = archivoDatos();
            if (!f.exists()) f = archivoPrevio();
            if (!f.exists()) return "";
            try {
                return new String(leer(f), StandardCharsets.UTF_8);
            } catch (Exception e) {
                try { return new String(leer(archivoPrevio()), StandardCharsets.UTF_8); } catch (Exception e2) { return ""; }
            }
        }

        @JavascriptInterface
        public synchronized boolean saveData(String json) {
            try {
                File dir = getFilesDir();
                File tmp = new File(dir, "datos.tmp");
                escribir(tmp, json.getBytes(StandardCharsets.UTF_8));
                File actual = archivoDatos();
                File previo = archivoPrevio();
                if (actual.exists()) {
                    previo.delete();
                    actual.renameTo(previo);
                }
                return tmp.renameTo(actual);
            } catch (Exception e) {
                return false;
            }
        }

        /** Guarda un archivo en Descargas/Emprendimiento Susana. Devuelve su dirección o "" si falla. */
        @JavascriptInterface
        public String saveFile(String nombre, String base64, String mime) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

                // Copia interna adicional (dentro de la app)
                File interna = new File(getFilesDir(), "respaldos");
                interna.mkdirs();
                escribir(new File(interna, nombre), bytes);

                if (Build.VERSION.SDK_INT >= 29) {
                    ContentResolver r = getContentResolver();
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.MediaColumns.DISPLAY_NAME, nombre);
                    cv.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    cv.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + CARPETA);
                    cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    Uri uri = r.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "";
                    try (OutputStream os = r.openOutputStream(uri)) {
                        if (os == null) return "";
                        os.write(bytes);
                    }
                    cv.clear();
                    cv.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    r.update(uri, cv, null, null);
                    return uri.toString();
                } else {
                    File dir = new File(getExternalFilesDir(null), CARPETA);
                    dir.mkdirs();
                    File f = new File(dir, nombre);
                    escribir(f, bytes);
                    return "file:" + f.getAbsolutePath();
                }
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean shareFile(String uri, String mime) {
            if (uri == null || !uri.startsWith("content://")) return false;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType(mime);
                    i.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(i, "Compartir respaldo"));
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "No se pudo compartir el archivo", Toast.LENGTH_LONG).show();
                }
            });
            return true;
        }

        @JavascriptInterface
        public boolean openFile(String uri, String mime) {
            if (uri == null || !uri.startsWith("content://")) return false;
            try {
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(Uri.parse(uri), mime);
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }

    /* ===================== Utilidades de archivos ===================== */
    private static byte[] leer(File f) throws Exception {
        try (InputStream in = new FileInputStream(f); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        }
    }

    private static void escribir(File f, byte[] datos) throws Exception {
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(datos);
            out.getFD().sync();
        }
    }
}
