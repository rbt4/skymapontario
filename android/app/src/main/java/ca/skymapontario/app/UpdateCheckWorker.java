package ca.skymapontario.app;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

public final class UpdateCheckWorker extends Worker {
    private static final String RELEASE_URL = "https://rbt4.github.io/skymapontario/release.json";
    private static final String APK_URL = "https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk";
    private static final String SHA256_URL = "https://rbt4.github.io/skymapontario/download/SkyMap-Ontario-latest.apk.sha256";
    private static final int CONNECT_TIMEOUT_MS = 15_000;
    private static final int READ_TIMEOUT_MS = 60_000;
    private static final long MAX_APK_BYTES = 100L * 1024L * 1024L;

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        try {
            JSONObject release = new JSONObject(readText(RELEASE_URL, 64 * 1024));
            int remoteCode = release.optInt("versionCode", 0);
            String remoteVersion = release.optString("version", String.valueOf(remoteCode));
            if (remoteCode <= UpdateManager.currentVersionCode(context)) {
                UpdateManager.clearPending(context.getSharedPreferences(UpdateManager.PREFS, Context.MODE_PRIVATE), true);
                return Result.success();
            }

            String expectedSha256 = parseSha256(readText(SHA256_URL, 4096));
            SharedPreferences prefs = context.getSharedPreferences(UpdateManager.PREFS, Context.MODE_PRIVATE);
            String pendingPath = prefs.getString(UpdateManager.KEY_FILE, "");
            if (prefs.getInt(UpdateManager.KEY_VERSION_CODE, 0) == remoteCode
                    && pendingPath != null
                    && !pendingPath.isEmpty()) {
                File existing = new File(pendingPath);
                if (existing.isFile() && expectedSha256.equalsIgnoreCase(sha256(existing))) return Result.success();
            }

            File directory = UpdateManager.updateDirectory(context);
            File target = new File(directory, "SkyMap-Ontario-v" + safeVersion(remoteVersion) + ".apk");
            downloadVerified(APK_URL, target, expectedSha256);
            UpdateManager.savePending(context, remoteCode, remoteVersion, target, expectedSha256);
            return Result.success();
        } catch (Exception ignored) {
            return getRunAttemptCount() < 2 ? Result.retry() : Result.success();
        }
    }

    private static String safeVersion(String version) {
        String safe = version == null ? "update" : version.replaceAll("[^0-9A-Za-z._-]", "-");
        return safe.isEmpty() ? "update" : safe;
    }

    private static String parseSha256(String text) throws IOException {
        String token = text == null ? "" : text.trim().split("\\s+")[0];
        if (!token.matches("(?i)[0-9a-f]{64}")) throw new IOException("Invalid update checksum");
        return token.toUpperCase(Locale.ROOT);
    }

    private static String readText(String url, int maxBytes) throws IOException {
        HttpURLConnection connection = open(url);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > maxBytes) throw new IOException("Response too large");
                    output.write(buffer, 0, count);
                }
                return output.toString(StandardCharsets.UTF_8.name());
            }
        } finally {
            connection.disconnect();
        }
    }

    private static void downloadVerified(String url, File target, String expectedSha256) throws Exception {
        File partial = new File(target.getParentFile(), target.getName() + ".part");
        if (partial.exists()) partial.delete();

        HttpURLConnection connection = open(url);
        try {
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) throw new IOException("HTTP " + status);
            long declaredLength = connection.getContentLengthLong();
            if (declaredLength > MAX_APK_BYTES) throw new IOException("APK too large");

            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long total = 0L;
            try (InputStream input = new BufferedInputStream(connection.getInputStream());
                 FileOutputStream output = new FileOutputStream(partial)) {
                byte[] buffer = new byte[32 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_APK_BYTES) throw new IOException("APK too large");
                    digest.update(buffer, 0, count);
                    output.write(buffer, 0, count);
                }
                output.getFD().sync();
            }

            String actual = hex(digest.digest());
            if (!expectedSha256.equalsIgnoreCase(actual)) throw new IOException("APK checksum mismatch");
            if (target.exists() && !target.delete()) throw new IOException("Unable to replace old update");
            if (!partial.renameTo(target)) throw new IOException("Unable to finalize update");
        } finally {
            connection.disconnect();
            if (partial.exists() && !partial.equals(target)) partial.delete();
        }
    }

    private static HttpURLConnection open(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setInstanceFollowRedirects(true);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json,text/plain,application/vnd.android.package-archive,*/*;q=0.5");
        connection.setRequestProperty("User-Agent", "SkyMapOntario/16.0.0 updater");
        return connection;
    }

    static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[32 * 1024];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) builder.append(String.format(Locale.ROOT, "%02X", value & 0xff));
        return builder.toString();
    }
}
