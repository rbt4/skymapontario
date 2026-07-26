package ca.skymapontario.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewClientCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Set;
import java.util.concurrent.TimeUnit;

public final class MainActivity extends Activity {
    private static final int LOCATION_REQUEST = 4101;
    private static final String APP_ORIGIN = "https://appassets.androidplatform.net";
    private static final String BRIDGE_NAME = "SkyMapNative";
    private static final int MAX_NATIVE_MESSAGE_CHARS = 2_000_000;

    private WebView webView;
    private String geoOrigin;
    private GeolocationPermissions.Callback geoCallback;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(3, 9, 16));
        getWindow().setNavigationBarColor(Color.rgb(3, 9, 16));

        SkyMapStore store = new SkyMapStore(getApplicationContext());
        SkyMapBridge nativeBridge = new SkyMapBridge(getApplicationContext(), store);
        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
        GeoMetProxy geoMetProxy = new GeoMetProxy();

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(3, 9, 16));
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setUserAgentString(settings.getUserAgentString() + " SkyMapOntario/17.0.0");

        WebViewCompat.addWebMessageListener(
                webView,
                BRIDGE_NAME,
                Set.of(APP_ORIGIN),
                new NativeMessageListener(nativeBridge)
        );

        webView.setWebViewClient(new WebViewClientCompat() {
            @Override
            public @Nullable WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (geoMetProxy.handles(uri)) return geoMetProxy.fetch(uri);
                return assetLoader.shouldInterceptRequest(uri);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())) return false;
                if ("https".equalsIgnoreCase(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (RuntimeException ignored) {
                    }
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (!APP_ORIGIN.equals(origin)) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                } else {
                    geoOrigin = origin;
                    geoCallback = callback;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, LOCATION_REQUEST);
                }
            }
        });

        scheduleBackgroundRefresh();
        if (state == null) webView.loadUrl(APP_ORIGIN + "/assets/index.html");
        else webView.restoreState(state);
    }

    private static final class NativeMessageListener implements WebViewCompat.WebMessageListener {
        private final SkyMapBridge bridge;

        NativeMessageListener(SkyMapBridge bridge) {
            this.bridge = bridge;
        }

        @Override
        public void onPostMessage(
                @NonNull WebView view,
                @NonNull WebMessageCompat message,
                @NonNull Uri sourceOrigin,
                boolean isMainFrame,
                @NonNull JavaScriptReplyProxy replyProxy
        ) {
            String id = "";
            try {
                if (!isMainFrame || !isTrustedOrigin(sourceOrigin)) throw new SecurityException("Untrusted native message origin");
                String data = message.getData();
                if (data == null || data.length() > MAX_NATIVE_MESSAGE_CHARS) throw new SecurityException("Invalid native message size");

                JSONObject request = new JSONObject(data);
                id = request.optString("id", "");
                if (id.isEmpty() || id.length() > 120) throw new SecurityException("Invalid native message id");
                String method = request.getString("method");
                JSONArray args = request.optJSONArray("args");
                Object result;

                switch (method) {
                    case "recordForecast":
                        bridge.recordForecast(requireString(args, 0));
                        result = JSONObject.NULL;
                        break;
                    case "recordObservation":
                        bridge.recordObservation(requireString(args, 0));
                        result = JSONObject.NULL;
                        break;
                    case "rememberLocation":
                        bridge.rememberLocation(requireString(args, 0));
                        result = JSONObject.NULL;
                        break;
                    case "getBootstrap":
                        result = bridge.getBootstrap();
                        break;
                    case "getCache":
                        result = bridge.getCache(requireString(args, 0));
                        break;
                    case "refreshNow":
                        bridge.refreshNow();
                        result = JSONObject.NULL;
                        break;
                    default:
                        throw new SecurityException("Native method is not allowed");
                }

                postReply(replyProxy, id, true, result, null);
            } catch (Exception ignored) {
                postReply(replyProxy, id, false, JSONObject.NULL, "Native request rejected");
            }
        }

        private static boolean isTrustedOrigin(Uri origin) {
            return "https".equalsIgnoreCase(origin.getScheme())
                    && "appassets.androidplatform.net".equalsIgnoreCase(origin.getHost())
                    && origin.getPort() == -1;
        }

        private static String requireString(@Nullable JSONArray args, int index) throws JSONException {
            if (args == null || index >= args.length()) throw new JSONException("Missing argument");
            String value = args.getString(index);
            if (value.length() > MAX_NATIVE_MESSAGE_CHARS) throw new JSONException("Argument is too large");
            return value;
        }

        private static void postReply(JavaScriptReplyProxy replyProxy, String id, boolean ok, Object result, @Nullable String error) {
            try {
                JSONObject response = new JSONObject();
                response.put("id", id == null ? "" : id);
                response.put("ok", ok);
                response.put("result", result == null ? JSONObject.NULL : result);
                if (error != null) response.put("error", error);
                replyProxy.postMessage(response.toString());
            } catch (JSONException ignored) {
                replyProxy.postMessage("{\"id\":\"\",\"ok\":false,\"error\":\"Native response failed\"}");
            }
        }
    }

    private void scheduleBackgroundRefresh() {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(WeatherRefreshWorker.class, 30, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
                "skymap-local-intelligence-refresh",
                ExistingPeriodicWorkPolicy.UPDATE,
                request
        );
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == LOCATION_REQUEST && geoCallback != null) {
            geoCallback.invoke(geoOrigin, hasLocationPermission(), false);
            geoCallback = null;
            geoOrigin = null;
        }
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript("window.SkyMapBack ? window.SkyMapBack() : false", handled -> {
            if (!"true".equals(handled)) {
                if (webView.canGoBack()) webView.goBack();
                else MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        if (webView != null) webView.saveState(out);
        super.onSaveInstanceState(out);
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            WebViewCompat.removeWebMessageListener(webView, BRIDGE_NAME);
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
