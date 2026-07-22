package ca.skymapontario.app;

import android.content.Context;
import android.webkit.JavascriptInterface;

import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

public final class SkyMapBridge {
    private final Context context;
    private final SkyMapStore store;

    public SkyMapBridge(Context context, SkyMapStore store) {
        this.context = context.getApplicationContext();
        this.store = store;
    }

    @JavascriptInterface
    public void recordForecast(String json) {
        store.recordForecast(json);
    }

    @JavascriptInterface
    public void recordObservation(String json) {
        store.recordObservation(json);
    }

    @JavascriptInterface
    public void rememberLocation(String json) {
        store.rememberLocation(json);
    }

    @JavascriptInterface
    public String getBootstrap() {
        return store.getBootstrap();
    }

    @JavascriptInterface
    public String getCache(String key) {
        String payload = store.getCache(key);
        return payload == null ? "" : payload;
    }

    @JavascriptInterface
    public void refreshNow() {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WeatherRefreshWorker.class)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(context).enqueue(request);
    }
}
