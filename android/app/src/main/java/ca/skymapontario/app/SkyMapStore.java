package ca.skymapontario.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONException;
import org.json.JSONObject;


public final class SkyMapStore extends SQLiteOpenHelper {
    private static final String DB_NAME = "skymap_local_intelligence.db";
    private static final int DB_VERSION = 1;

    public SkyMapStore(Context context) {
        super(context, DB_NAME, null, DB_VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE forecast (fingerprint TEXT PRIMARY KEY, location TEXT NOT NULL, model TEXT NOT NULL, bucket TEXT NOT NULL, issued_at INTEGER NOT NULL, valid_at INTEGER NOT NULL, temp REAL, rain REAL, wind REAL, code INTEGER, scored INTEGER NOT NULL DEFAULT 0, temp_error REAL, wet_correct INTEGER)");
        db.execSQL("CREATE INDEX idx_forecast_location ON forecast(location)");
        db.execSQL("CREATE INDEX idx_forecast_valid ON forecast(valid_at)");
        db.execSQL("CREATE TABLE observation (id INTEGER PRIMARY KEY AUTOINCREMENT, location TEXT NOT NULL, observed_at INTEGER NOT NULL, temp REAL, rain REAL, wind REAL, station TEXT)");
        db.execSQL("CREATE TABLE skill (skill_key TEXT PRIMARY KEY, score REAL NOT NULL, samples INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE cache (cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE settings (setting_key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        db.execSQL("DROP TABLE IF EXISTS forecast");
        db.execSQL("DROP TABLE IF EXISTS observation");
        db.execSQL("DROP TABLE IF EXISTS skill");
        db.execSQL("DROP TABLE IF EXISTS cache");
        db.execSQL("DROP TABLE IF EXISTS settings");
        onCreate(db);
    }

    public synchronized void recordForecast(String json) {
        try {
            JSONObject object = new JSONObject(json);
            ContentValues values = new ContentValues();
            values.put("fingerprint", object.getString("fingerprint"));
            values.put("location", object.getString("location"));
            values.put("model", object.getString("model"));
            values.put("bucket", object.optString("bucket", "unknown"));
            values.put("issued_at", object.optLong("issuedAt", System.currentTimeMillis()));
            values.put("valid_at", object.getLong("validAt"));
            values.put("temp", object.optDouble("temp", Double.NaN));
            values.put("rain", object.optDouble("rain", 0));
            values.put("wind", object.optDouble("wind", 0));
            values.put("code", object.optInt("code", 0));
            getWritableDatabase().insertWithOnConflict("forecast", null, values, SQLiteDatabase.CONFLICT_IGNORE);
            cleanup();
        } catch (JSONException ignored) {
        }
    }

    public synchronized void recordObservation(String json) {
        try {
            JSONObject object = new JSONObject(json);
            String location = object.getString("location");
            long observedAt = object.getLong("time");
            double temp = object.optDouble("temp", Double.NaN);
            double rain = object.optDouble("rain", 0);
            double wind = object.optDouble("wind", 0);

            ContentValues observation = new ContentValues();
            observation.put("location", location);
            observation.put("observed_at", observedAt);
            observation.put("temp", temp);
            observation.put("rain", rain);
            observation.put("wind", wind);
            observation.put("station", object.optString("station", "Nearby station"));
            getWritableDatabase().insert("observation", null, observation);
            scorePendingForecasts(location, observedAt, temp, rain);
            cleanup();
        } catch (JSONException ignored) {
        }
    }

    private void scorePendingForecasts(String location, long observedAt, double observedTemp, double observedRain) {
        SQLiteDatabase db = getWritableDatabase();
        Cursor cursor = db.query(
                "forecast",
                new String[]{"fingerprint", "model", "bucket", "temp", "rain"},
                "location=? AND scored=0 AND ABS(valid_at-?)<=?",
                new String[]{location, String.valueOf(observedAt), String.valueOf(90L * 60L * 1000L)},
                null,
                null,
                null
        );
        try {
            while (cursor.moveToNext()) {
                String fingerprint = cursor.getString(0);
                String model = cursor.getString(1);
                String bucket = cursor.getString(2);
                double forecastTemp = cursor.isNull(3) ? observedTemp : cursor.getDouble(3);
                double forecastRain = cursor.isNull(4) ? 0 : cursor.getDouble(4);
                double tempError = Math.abs(forecastTemp - observedTemp);
                double tempScore = Math.max(0, 1 - tempError / 8.0);
                int wetCorrect = ((forecastRain >= 0.12) == (observedRain >= 0.10)) ? 1 : 0;
                double sampleScore = tempScore * 0.65 + wetCorrect * 0.35;
                updateSkill(model + ":" + bucket, sampleScore);

                ContentValues scored = new ContentValues();
                scored.put("scored", 1);
                scored.put("temp_error", tempError);
                scored.put("wet_correct", wetCorrect);
                db.update("forecast", scored, "fingerprint=?", new String[]{fingerprint});
            }
        } finally {
            cursor.close();
        }
    }

    private void updateSkill(String key, double sampleScore) {
        SQLiteDatabase db = getWritableDatabase();
        Cursor cursor = db.query("skill", new String[]{"score", "samples"}, "skill_key=?", new String[]{key}, null, null, null);
        double score = 0.5;
        int samples = 0;
        try {
            if (cursor.moveToFirst()) {
                score = cursor.getDouble(0);
                samples = cursor.getInt(1);
            }
        } finally {
            cursor.close();
        }
        double updated = score * 0.82 + sampleScore * 0.18;
        ContentValues values = new ContentValues();
        values.put("skill_key", key);
        values.put("score", updated);
        values.put("samples", samples + 1);
        values.put("updated_at", System.currentTimeMillis());
        db.insertWithOnConflict("skill", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public synchronized void rememberLocation(String json) {
        try {
            JSONObject object = new JSONObject(json);
            putSetting("location", object.toString());
        } catch (JSONException ignored) {
        }
    }

    public synchronized JSONObject getLocation() {
        String value = getSetting("location");
        if (value == null) {
            try {
                return new JSONObject("{\"name\":\"Toronto\",\"lat\":43.6532,\"lon\":-79.3832,\"zoom\":8}");
            } catch (JSONException impossible) {
                return new JSONObject();
            }
        }
        try {
            return new JSONObject(value);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private void putSetting(String key, String value) {
        ContentValues values = new ContentValues();
        values.put("setting_key", key);
        values.put("value", value);
        getWritableDatabase().insertWithOnConflict("settings", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private String getSetting(String key) {
        Cursor cursor = getReadableDatabase().query("settings", new String[]{"value"}, "setting_key=?", new String[]{key}, null, null, null);
        try {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        } finally {
            cursor.close();
        }
    }

    public synchronized void putCache(String key, String payload) {
        ContentValues values = new ContentValues();
        values.put("cache_key", key);
        values.put("payload", payload);
        values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("cache", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    public synchronized String getCache(String key) {
        Cursor cursor = getReadableDatabase().query("cache", new String[]{"payload"}, "cache_key=? AND updated_at>?", new String[]{key, String.valueOf(System.currentTimeMillis() - 7L * 24L * 60L * 60L * 1000L)}, null, null, null);
        try {
            return cursor.moveToFirst() ? cursor.getString(0) : null;
        } finally {
            cursor.close();
        }
    }

    public synchronized String getBootstrap() {
        JSONObject root = new JSONObject();
        JSONObject skills = new JSONObject();
        try {
            Cursor skillCursor = getReadableDatabase().query("skill", new String[]{"skill_key", "score"}, null, null, null, null, null);
            try {
                while (skillCursor.moveToNext()) skills.put(skillCursor.getString(0), skillCursor.getDouble(1));
            } finally {
                skillCursor.close();
            }

            Cursor countCursor = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM forecast", null);
            int count = 0;
            try {
                if (countCursor.moveToFirst()) count = countCursor.getInt(0);
            } finally {
                countCursor.close();
            }
            root.put("skills", skills);
            root.put("archiveCount", count);
            root.put("location", getLocation());
        } catch (JSONException ignored) {
        }
        return root.toString();
    }

    private void cleanup() {
        long now = System.currentTimeMillis();
        SQLiteDatabase db = getWritableDatabase();
        db.delete("forecast", "issued_at<?", new String[]{String.valueOf(now - 60L * 24L * 60L * 60L * 1000L)});
        db.delete("observation", "observed_at<?", new String[]{String.valueOf(now - 60L * 24L * 60L * 60L * 1000L)});
        db.delete("cache", "updated_at<?", new String[]{String.valueOf(now - 7L * 24L * 60L * 60L * 1000L)});
    }
}
