package ca.skymapontario.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.io.File;
import java.util.concurrent.TimeUnit;

public final class UpdateManager {
    static final String PREFS = "skymap-updates";
    static final String KEY_VERSION_CODE = "pendingVersionCode";
    static final String KEY_VERSION_NAME = "pendingVersionName";
    static final String KEY_FILE = "pendingFile";
    static final String KEY_SHA256 = "pendingSha256";
    private static final String KEY_LAST_PROMPT = "lastPromptAt";
    private static final long PROMPT_COOLDOWN_MS = 6L * 60L * 60L * 1000L;

    private UpdateManager() { }

    public static void schedule(Context context) {
        Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();

        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, 12, TimeUnit.HOURS)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "skymap-public-apk-update",
                ExistingPeriodicWorkPolicy.UPDATE,
                periodic
        );

        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(UpdateCheckWorker.class)
                .setConstraints(constraints)
                .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "skymap-public-apk-update-now",
                ExistingWorkPolicy.REPLACE,
                immediate
        );
    }

    public static void promptPendingUpdate(Activity activity) {
        SharedPreferences prefs = activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        int versionCode = prefs.getInt(KEY_VERSION_CODE, 0);
        if (versionCode <= BuildConfig.VERSION_CODE) {
            clearPending(prefs, true);
            return;
        }

        String path = prefs.getString(KEY_FILE, "");
        String expectedSha256 = prefs.getString(KEY_SHA256, "");
        if (path == null || path.isEmpty() || expectedSha256 == null || expectedSha256.isEmpty()) return;

        File apk = new File(path);
        if (!apk.isFile()) {
            clearPending(prefs, false);
            return;
        }

        try {
            if (!expectedSha256.equalsIgnoreCase(UpdateCheckWorker.sha256(apk))) {
                clearPending(prefs, true);
                return;
            }
        } catch (Exception ignored) {
            return;
        }

        long now = System.currentTimeMillis();
        long lastPrompt = prefs.getLong(KEY_LAST_PROMPT, 0L);
        if (now - lastPrompt < PROMPT_COOLDOWN_MS) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !activity.getPackageManager().canRequestPackageInstalls()) {
            Intent permission = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + activity.getPackageName())
            );
            activity.startActivity(permission);
            return;
        }

        Uri uri = FileProvider.getUriForFile(
                activity,
                activity.getPackageName() + ".files",
                apk
        );
        Intent install = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        prefs.edit().putLong(KEY_LAST_PROMPT, now).apply();
        activity.startActivity(install);
    }

    static File updateDirectory(Context context) {
        File directory = new File(context.getFilesDir(), "updates");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("Unable to create update directory");
        }
        return directory;
    }

    static void savePending(Context context, int versionCode, String versionName, File apk, String sha256) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putInt(KEY_VERSION_CODE, versionCode)
                .putString(KEY_VERSION_NAME, versionName)
                .putString(KEY_FILE, apk.getAbsolutePath())
                .putString(KEY_SHA256, sha256)
                .putLong(KEY_LAST_PROMPT, 0L)
                .apply();
    }

    static void clearPending(SharedPreferences prefs, boolean deleteFile) {
        if (deleteFile) {
            String path = prefs.getString(KEY_FILE, "");
            if (path != null && !path.isEmpty()) {
                try { new File(path).delete(); } catch (RuntimeException ignored) { }
            }
        }
        prefs.edit()
                .remove(KEY_VERSION_CODE)
                .remove(KEY_VERSION_NAME)
                .remove(KEY_FILE)
                .remove(KEY_SHA256)
                .remove(KEY_LAST_PROMPT)
                .apply();
    }
}
