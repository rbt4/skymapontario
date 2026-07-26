package ca.skymapontario.app;

import android.net.Uri;
import android.webkit.WebResourceResponse;

import androidx.annotation.Nullable;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.FilterInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class GeoMetProxy {
    private static final String APP_HOST = "appassets.androidplatform.net";
    private static final String PROXY_PATH = "/geomet-proxy";
    private static final String UPSTREAM = "https://geo.weather.gc.ca/geomet";

    boolean handles(Uri uri) {
        return uri != null
                && "https".equalsIgnoreCase(uri.getScheme())
                && APP_HOST.equalsIgnoreCase(uri.getHost())
                && PROXY_PATH.equals(uri.getPath());
    }

    WebResourceResponse fetch(Uri requestUri) {
        HttpURLConnection connection = null;
        try {
            String query = requestUri.getEncodedQuery();
            URL target = new URL(UPSTREAM + (query == null || query.isEmpty() ? "" : "?" + query));
            connection = (HttpURLConnection) target.openConnection();
            connection.setConnectTimeout(12_000);
            connection.setReadTimeout(18_000);
            connection.setInstanceFollowRedirects(true);
            connection.setUseCaches(true);
            connection.setRequestProperty("Accept", "image/png,application/json,application/xml,text/xml,*/*;q=0.8");
            connection.setRequestProperty("User-Agent", "SkyMapOntario/18.0.0 Android GeoMet Relay");
            connection.connect();

            int status = connection.getResponseCode();
            String reason = connection.getResponseMessage();
            String contentType = connection.getContentType();
            String mime = contentType == null ? "application/octet-stream" : contentType.split(";", 2)[0].trim();
            String encoding = mime.startsWith("text/") || mime.contains("json") || mime.contains("xml") ? "UTF-8" : null;
            InputStream body = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (body == null) body = new ByteArrayInputStream(new byte[0]);
            final HttpURLConnection activeConnection = connection;
            body = new FilterInputStream(body) {
                @Override
                public void close() throws IOException {
                    try {
                        super.close();
                    } finally {
                        activeConnection.disconnect();
                    }
                }
            };

            Map<String, String> headers = safeHeaders(connection.getHeaderFields());
            headers.put("Access-Control-Allow-Origin", "https://" + APP_HOST);
            headers.put("X-SkyMap-Transport", "native-geomet-relay");
            return new WebResourceResponse(mime, encoding, status, reason == null || reason.isEmpty() ? (status >= 400 ? "Upstream Error" : "OK") : reason, headers, body);
        } catch (IOException error) {
            if (connection != null) connection.disconnect();
            byte[] message = ("SkyMap GeoMet relay failed: " + error.getClass().getSimpleName())
                    .getBytes(StandardCharsets.UTF_8);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "https://" + APP_HOST);
            headers.put("Cache-Control", "no-store");
            headers.put("X-SkyMap-Transport", "native-geomet-relay-error");
            return new WebResourceResponse(
                    "text/plain",
                    "UTF-8",
                    502,
                    "Bad Gateway",
                    headers,
                    new ByteArrayInputStream(message)
            );
        }
    }

    /*
     * Only headers that are still true after relaying are forwarded.
     * HttpURLConnection has already decompressed the body, so passing the upstream
     * Content-Encoding or Content-Length through would corrupt every response.
     * Cookies and authentication headers from an upstream service have no business
     * reaching the app origin at all.
     */
    private static final String[] FORWARDED = { "Content-Type", "Cache-Control", "Expires", "Last-Modified", "ETag" };

    private static Map<String, String> safeHeaders(@Nullable Map<String, List<String>> source) {
        Map<String, String> result = new HashMap<>();
        if (source == null) return result;
        for (Map.Entry<String, List<String>> entry : source.entrySet()) {
            String key = entry.getKey();
            if (key == null || entry.getValue() == null || entry.getValue().isEmpty()) continue;
            for (String allowed : FORWARDED) {
                if (allowed.equalsIgnoreCase(key)) {
                    result.put(allowed, String.join(", ", entry.getValue()));
                    break;
                }
            }
        }
        return result;
    }
}
