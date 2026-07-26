package ca.skymapontario.app;

import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.core.content.FileProvider;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

public final class SkyMapBridge {
    private static final int MAX_SHARE_BYTES = 6_000_000;

    private final Context context;
    private final SkyMapStore store;

    public SkyMapBridge(Context context, SkyMapStore store) {
        this.context = context.getApplicationContext();
        this.store = store;
    }

    public void recordForecast(String json) {
        store.recordForecast(json);
    }

    public void recordObservation(String json) {
        store.recordObservation(json);
    }

    public void rememberLocation(String json) {
        store.rememberLocation(json);
    }

    public String getBootstrap() {
        return store.getBootstrap();
    }

    public String getCache(String key) {
        String payload = store.getCache(key);
        return payload == null ? "" : payload;
    }

    public void refreshNow() {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(WeatherRefreshWorker.class)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(context).enqueue(request);
    }

    public void shareFile(String filename, String mimeType, String base64, String shareText) throws IOException {
        if (!"image/png".equals(mimeType) && !"image/gif".equals(mimeType)) {
            throw new SecurityException("Unsupported share type");
        }
        String extension = "image/png".equals(mimeType) ? ".png" : ".gif";
        if (filename == null
                || !filename.matches("[A-Za-z0-9][A-Za-z0-9._-]{0,94}\\.(png|gif)")
                || !filename.endsWith(extension)) {
            throw new SecurityException("Invalid share filename");
        }
        if (base64 == null || base64.length() > 8_100_000) {
            throw new SecurityException("Invalid share payload");
        }

        byte[] bytes;
        try {
            bytes = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException error) {
            throw new SecurityException("Invalid share encoding", error);
        }
        if (bytes.length == 0 || bytes.length > MAX_SHARE_BYTES) {
            throw new SecurityException("Invalid share file size");
        }

        File directory = new File(context.getFilesDir(), "shares");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Share directory unavailable");
        }
        File[] previous = directory.listFiles();
        if (previous != null) {
            for (File file : previous) {
                if (file.isFile()) file.delete();
            }
        }

        File output = new File(directory, filename);
        String shareRoot = directory.getCanonicalPath() + File.separator;
        if (!output.getCanonicalPath().startsWith(shareRoot)) {
            throw new SecurityException("Invalid share path");
        }
        try (FileOutputStream stream = new FileOutputStream(output, false)) {
            stream.write(bytes);
            stream.flush();
        }

        Uri uri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".files",
                output
        );
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mimeType);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.setClipData(ClipData.newUri(context.getContentResolver(), "SkyMap weather window", uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        if (shareText != null && !shareText.isEmpty()) {
            send.putExtra(Intent.EXTRA_TEXT, shareText.substring(0, Math.min(2_000, shareText.length())));
        }
        Intent chooser = Intent.createChooser(send, "Share SkyMap weather");
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(chooser);
    }
}
