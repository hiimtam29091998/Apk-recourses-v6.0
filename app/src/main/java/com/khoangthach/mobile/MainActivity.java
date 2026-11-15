package com.khoangthach.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.content.Context;
import android.util.Base64;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import android.widget.EditText;
import android.widget.FrameLayout;

import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Offline Android shell. Solver is the embedded HiGHS WebAssembly; Python only exports XLSX/CSV.
 * No server, Internet permission, or third-party cloud service is used.
 */
public class MainActivity extends Activity {
    private static final String TAG = "KhoangThachMobile";
    private static final String LOCAL = "https://appassets.androidplatform.net/assets/";
    private static final int REQUEST_SAVE = 701;
    private static final int REQUEST_IMPORT = 702;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private WebView web;
    private FrameLayout root;
    private WebView printWeb;
    private String pendingRequestId;
    private byte[] pendingBytes;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(26, 32, 58));
        getWindow().setNavigationBarColor(Color.rgb(26, 32, 58));
        if (!Python.isStarted()) Python.start(new AndroidPlatform(this));
        root = new FrameLayout(this);
        setContentView(root);
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowFileAccessFromFileURLs(false);
        web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        web.getSettings().setSupportMultipleWindows(false);
        web.getSettings().setMixedContentMode(android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.getSettings().setDefaultTextEncodingName("UTF-8");
        web.addJavascriptInterface(new JsBridge(), "Android");
        // Use an HTTPS origin for Web Workers and WebAssembly without network permissions.
        // Only local packaged assets are made available to the WebView.
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(LOCAL);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.startsWith(LOCAL);
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url=request.getUrl().toString();
                if (!url.startsWith(LOCAL)) return blocked();
                String path=request.getUrl().getPath();
                if(path==null || !path.startsWith("/assets/"))return blocked();
                String asset=path.substring("/assets/".length());
                if(asset.isEmpty() || asset.contains("..") || asset.startsWith("/"))return blocked();
                String mime=asset.endsWith(".wasm") ? "application/wasm"
                        : asset.endsWith(".js") ? "application/javascript"
                        : asset.endsWith(".css") ? "text/css"
                        : asset.endsWith(".html") ? "text/html" : "application/octet-stream";
                try { return new WebResourceResponse(mime, asset.endsWith(".wasm")?null:"UTF-8",
                           getAssets().open(asset)); }
                catch (Exception e) { return blocked(); }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView v,String url,String msg,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                        .setPositiveButton("OK",(d,w)->result.confirm()).setCancelable(false).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView v,String url,String msg,JsResult result) {
                new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                        .setPositiveButton("Đồng ý",(d,w)->result.confirm())
                        .setNegativeButton("Hủy",(d,w)->result.cancel()).setCancelable(false).show();
                return true;
            }
            @Override public boolean onJsPrompt(WebView v,String url,String msg,String def,JsPromptResult result) {
                EditText value = new EditText(MainActivity.this);
                value.setSingleLine(true);
                value.setText(def == null ? "" : def);
                int pad = (int) (20 * getResources().getDisplayMetrics().density);
                FrameLayout wrap = new FrameLayout(MainActivity.this);
                wrap.setPadding(pad,0,pad,0);
                wrap.addView(value);
                new AlertDialog.Builder(MainActivity.this).setTitle(msg).setView(wrap)
                        .setPositiveButton("Lưu",(d,w)->result.confirm(value.getText().toString()))
                        .setNegativeButton("Hủy",(d,w)->result.cancel()).setCancelable(false).show();
                return true;
            }
        });
        web.loadUrl(LOCAL+"index.html");
    }

    private WebResourceResponse blocked() {
        return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",
                java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
    }

    private void resolve(String requestId, boolean ok, String value) {
        runOnUiThread(() -> {
            if (web == null) return;
            String script = "window.__mobileFinish(" + JSONObject.quote(requestId) + ","
                    + (ok ? "true" : "false") + "," + JSONObject.quote(value) + ");";
            web.evaluateJavascript(script, null);
        });
    }

    private void saveAs(String requestId, String filename, String mime, byte[] bytes) {
        runOnUiThread(() -> {
            try {
                if (pendingRequestId != null) {
                    resolve(requestId,false,"Đang mở một hộp thoại tệp khác.");
                    return;
                }
                pendingRequestId = requestId;
                pendingBytes = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mime);
                intent.putExtra(Intent.EXTRA_TITLE,filename);
                startActivityForResult(intent, REQUEST_SAVE);
            } catch (Exception ex) {
                pendingRequestId = null; pendingBytes = null;
                resolve(requestId,false,ex.toString());
            }
        });
    }

    private void importJson(String requestId) {
        runOnUiThread(() -> {
            try {
                if (pendingRequestId != null) {
                    resolve(requestId,false,"Đang mở một hộp thoại tệp khác.");return;
                }
                pendingRequestId = requestId;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivityForResult(intent, REQUEST_IMPORT);
            } catch (Exception ex) {
                pendingRequestId = null;
                resolve(requestId,false,ex.toString());
            }
        });
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode!=REQUEST_SAVE && requestCode!=REQUEST_IMPORT) return;
        String key=pendingRequestId;
        byte[] bytes=pendingBytes;
        pendingRequestId=null;pendingBytes=null;
        if (key==null) return;
        if (resultCode!=RESULT_OK || data==null || data.getData()==null) {
            resolve(key,false,"Đã hủy chọn tệp.");return;
        }
        Uri uri=data.getData();
        worker.execute(() -> {
            try {
                if (requestCode==REQUEST_IMPORT) {
                    ByteArrayOutputStream output=new ByteArrayOutputStream();
                    try(InputStream input=getContentResolver().openInputStream(uri)) {
                        if (input==null) throw new IllegalStateException("Không mở được tệp.");
                        byte[] buffer=new byte[8192];int n;int total=0;
                        while((n=input.read(buffer))!=-1){total+=n;if(total>5_000_000)throw new IllegalArgumentException("Tệp quá lớn.");output.write(buffer,0,n);}
                    }
                    resolve(key,true,output.toString("UTF-8"));
                } else {
                    try(OutputStream output=getContentResolver().openOutputStream(uri,"w")) {
                        if (output==null)throw new IllegalStateException("Không ghi được tệp.");
                        output.write(bytes);
                    }
                    resolve(key,true,"Đã lưu tệp.");
                }
            } catch (Exception ex) {resolve(key,false,ex.getMessage());}
        });
    }

    private void printHtml(String page) {
        runOnUiThread(() -> {
            if (printWeb!=null) {root.removeView(printWeb);printWeb.destroy();}
            printWeb=new WebView(MainActivity.this);
            printWeb.getSettings().setJavaScriptEnabled(false);
            printWeb.getSettings().setDefaultTextEncodingName("UTF-8");
            root.addView(printWeb,new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,1));
            printWeb.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view,String url) {
                    view.postDelayed(() -> {
                        try {
                            PrintManager manager=(PrintManager)getSystemService(Context.PRINT_SERVICE);
                            PrintAttributes attrs=new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                    .build();
                            manager.print("Khoang_Thach_Amethyst",view.createPrintDocumentAdapter("Amethyst"),attrs);
                        }catch(Exception e){Log.e(TAG,"Print failed",e);}
                    },350);
                }
            });
            // This HTML is generated locally using the player's own data.
            printWeb.loadDataWithBaseURL(LOCAL,page,"text/html","UTF-8",null);
        });
    }

    public final class JsBridge {
        @JavascriptInterface public void printHtml(String html) { MainActivity.this.printHtml(html); }
        @JavascriptInterface public void run(String kind,String key,String payload,String profile) {
            if ("import".equals(kind)) {importJson(key);return;}
            if ("backup".equals(kind)) {
                saveAs(key,"Ho_so_Khoang_Thach.json","application/json",payload.getBytes(StandardCharsets.UTF_8));
                return;
            }
            worker.execute(() -> {
                try {
                    PyObject mod=Python.getInstance().getModule("android_bridge");
                    if ("excel".equals(kind) || "csv".equals(kind)) {
                        String base64=mod.callAttr("excel".equals(kind)?"excel_base64_result":"csv_base64_result",payload,profile).toString();
                        byte[] raw=Base64.decode(base64,Base64.DEFAULT);
                        String extension="excel".equals(kind)?"xlsx":"zip";
                        String mime="excel".equals(kind)
                            ?"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"application/zip";
                        saveAs(key,"Khoang_Thach_"+sanitizeName(profile)+"."+extension,mime,raw);
                    } else resolve(key,false,"Thao tác không hợp lệ.");
                } catch (Exception ex) {
                    Log.e(TAG,"Native bridge failed: "+kind,ex);
                    resolve(key,false,ex.getMessage()==null?ex.toString():ex.getMessage());
                }
            });
        }
    }

    private static String sanitizeName(String s) {
        String r=s.replaceAll("[^a-zA-Z0-9_-]","_");
        return r.isEmpty()?"Player":r.substring(0,Math.min(60,r.length()));
    }

    @Override public void onBackPressed() {
        if (web!=null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if(printWeb!=null){root.removeView(printWeb);printWeb.destroy();printWeb=null;}
        if(web!=null){root.removeView(web);web.destroy();web=null;}
        worker.shutdownNow();
        super.onDestroy();
    }
}
