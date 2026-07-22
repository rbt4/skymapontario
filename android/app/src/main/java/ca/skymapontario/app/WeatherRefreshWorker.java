package ca.skymapontario.app;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

public final class WeatherRefreshWorker extends Worker {
    private static final long[] HORIZONS = {0, 1, 2, 8, 24, 72, 168, 336};
    private final SkyMapStore store;

    public WeatherRefreshWorker(@NonNull Context appContext, @NonNull WorkerParameters params) {
        super(appContext, params);
        store = new SkyMapStore(appContext.getApplicationContext());
    }

    @NonNull
    @Override
    public Result doWork() {
        JSONObject location = store.getLocation();
        double lat = location.optDouble("lat", 43.6532);
        double lon = location.optDouble("lon", -79.3832);
        String locationKey = String.format(Locale.US, "%.2f,%.2f", lat, lon);
        int success = 0;

        success += refreshModel("gem", "https://api.open-meteo.com/v1/gem", "gem_seamless", 10, lat, lon, locationKey) ? 1 : 0;
        success += refreshModel("ifs", "https://api.open-meteo.com/v1/ecmwf", "ecmwf_ifs025", 15, lat, lon, locationKey) ? 1 : 0;
        success += refreshModel("aifs", "https://api.open-meteo.com/v1/ecmwf", "ecmwf_aifs025_single", 15, lat, lon, locationKey) ? 1 : 0;
        success += refreshModel("gfs", "https://api.open-meteo.com/v1/gfs", "gfs_seamless", 16, lat, lon, locationKey) ? 1 : 0;
        refreshObservation(lat, lon, locationKey);

        return success > 0 ? Result.success() : Result.retry();
    }

    private boolean refreshModel(String id, String endpoint, String model, int days, double lat, double lon, String locationKey) {
        try {
            String hourly = "temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover";
            String url = endpoint
                    + "?latitude=" + lat
                    + "&longitude=" + lon
                    + "&timezone=auto"
                    + "&timeformat=unixtime"
                    + "&forecast_days=" + days
                    + "&models=" + URLEncoder.encode(model, StandardCharsets.UTF_8.name())
                    + "&hourly=" + URLEncoder.encode(hourly, StandardCharsets.UTF_8.name());
            String payload = download(url);
            if (payload == null) return false;
            store.putCache(id + ":" + locationKey, payload);
            archiveForecasts(id, locationKey, new JSONObject(payload));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    private void archiveForecasts(String model, String locationKey, JSONObject root) throws JSONException {
        JSONObject hourly = root.optJSONObject("hourly");
        if (hourly == null) return;
        JSONArray times = hourly.optJSONArray("time");
        JSONArray temps = hourly.optJSONArray("temperature_2m");
        JSONArray rain = hourly.optJSONArray("precipitation");
        JSONArray wind = hourly.optJSONArray("wind_speed_10m");
        JSONArray code = hourly.optJSONArray("weather_code");
        if (times == null || temps == null) return;

        long issuedAt = System.currentTimeMillis();
        long issueBucket = issuedAt / (6L * 60L * 60L * 1000L);
        for (long hours : HORIZONS) {
            long target = issuedAt + hours * 60L * 60L * 1000L;
            int index = closestIndex(times, target);
            if (index < 0) continue;
            long validAt = parseForecastTime(times.opt(index));
            if (validAt <= 0) continue;
            if (temps.isNull(index)) continue;
            double forecastTemp = temps.optDouble(index, Double.NaN);
            if (!Double.isFinite(forecastTemp)) continue;
            JSONObject record = new JSONObject();
            record.put("fingerprint", locationKey + ":" + model + ":" + Math.round(validAt / 3600000.0) + ":" + issueBucket);
            record.put("location", locationKey);
            record.put("model", model);
            record.put("bucket", bucket(hours));
            record.put("issuedAt", issuedAt);
            record.put("validAt", validAt);
            record.put("temp", forecastTemp);
            record.put("rain", rain == null ? 0 : rain.optDouble(index, 0));
            record.put("wind", wind == null ? 0 : wind.optDouble(index, 0));
            record.put("code", code == null ? 0 : code.optInt(index, 0));
            store.recordForecast(record.toString());
        }
    }

    private int closestIndex(JSONArray times, long target) {
        int best = -1;
        long delta = Long.MAX_VALUE;
        for (int i = 0; i < times.length(); i++) {
            long parsed = parseForecastTime(times.opt(i));
            if (parsed <= 0) continue;
            long candidate = Math.abs(parsed - target);
            if (candidate < delta) {
                delta = candidate;
                best = i;
            }
        }
        return best;
    }

    private String bucket(long hours) {
        if (hours <= 2) return "nowcast";
        if (hours <= 48) return "short";
        if (hours <= 120) return "medium";
        if (hours <= 240) return "long";
        return "extended";
    }

    private void refreshObservation(double lat, double lon, String locationKey) {
        try {
            String bbox = String.format(Locale.US, "%.4f,%.4f,%.4f,%.4f", lon - 0.8, lat - 0.6, lon + 0.8, lat + 0.6);
            String properties = "date_tm-value,air_temp,rnfl_amt_pst1hr,stn_nam-value,max_wnd_spd_10m_pst10mts";
            String url = "https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=60"
                    + "&bbox=" + URLEncoder.encode(bbox, StandardCharsets.UTF_8.name())
                    + "&sortby=-date_tm-value"
                    + "&properties=" + URLEncoder.encode(properties, StandardCharsets.UTF_8.name());
            String payload = download(url);
            if (payload == null) return;
            JSONObject root = new JSONObject(payload);
            JSONArray features = root.optJSONArray("features");
            if (features == null) return;

            JSONObject best = null;
            double bestDistance = Double.MAX_VALUE;
            for (int i = 0; i < features.length(); i++) {
                JSONObject feature = features.optJSONObject(i);
                JSONObject props = feature == null ? null : feature.optJSONObject("properties");
                JSONObject geometry = feature == null ? null : feature.optJSONObject("geometry");
                JSONArray coordinates = geometry == null ? null : geometry.optJSONArray("coordinates");
                if (props == null || coordinates == null || !props.has("air_temp") || props.isNull("air_temp")) continue;
                double featureLon = coordinates.optDouble(0, lon);
                double featureLat = coordinates.optDouble(1, lat);
                double distance = Math.pow(featureLat - lat, 2) + Math.pow(featureLon - lon, 2);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = feature;
                }
            }
            if (best == null) return;
            JSONObject props = best.getJSONObject("properties");
            JSONObject observation = new JSONObject();
            observation.put("location", locationKey);
            observation.put("time", parseObservationTime(props.optString("date_tm-value")));
            double observedTemp = props.optDouble("air_temp", Double.NaN);
            if (!Double.isFinite(observedTemp)) return;
            observation.put("temp", observedTemp);
            observation.put("rain", props.optDouble("rnfl_amt_pst1hr", 0));
            observation.put("wind", props.optDouble("max_wnd_spd_10m_pst10mts", 0));
            observation.put("station", props.optString("stn_nam-value", "Nearby ECCC station"));
            store.recordObservation(observation.toString());
        } catch (Exception ignored) {
        }
    }

    private long parseUtc(String value) {
        if (value == null || value.isEmpty()) return -1;
        String[] patterns = {"yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ssXXX"};
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date date = format.parse(value);
                if (date != null) return date.getTime();
            } catch (ParseException ignored) {
            }
        }
        return -1;
    }

    private long parseForecastTime(Object value) {
        if (value instanceof Number) {
            long numeric = ((Number) value).longValue();
            return numeric < 1_000_000_000_000L ? numeric * 1000L : numeric;
        }
        String text = String.valueOf(value);
        try {
            long numeric = Long.parseLong(text);
            return numeric < 1_000_000_000_000L ? numeric * 1000L : numeric;
        } catch (NumberFormatException ignored) {
            return parseUtc(text);
        }
    }

    private long parseObservationTime(String value) {
        if (value == null || value.isEmpty()) return System.currentTimeMillis();
        String[] patterns = {"yyyy-MM-dd'T'HH:mm:ss.SSSX", "yyyy-MM-dd'T'HH:mm:ssX", "yyyy-MM-dd'T'HH:mmX"};
        for (String pattern : patterns) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(pattern, Locale.US);
                Date date = format.parse(value);
                if (date != null) return date.getTime();
            } catch (ParseException ignored) {
            }
        }
        return System.currentTimeMillis();
    }

    private String download(String urlText) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(urlText).openConnection();
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("User-Agent", "SkyMapOntario/14.1.1 local-intelligence");
            connection.setInstanceFollowRedirects(true);
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return null;
            return readAll(connection.getInputStream());
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readAll(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }
}
