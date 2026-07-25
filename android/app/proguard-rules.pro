# WorkManager instantiates workers by class name after process recreation.
-keep class ca.skymapontario.app.WeatherRefreshWorker {
    public <init>(android.content.Context, androidx.work.WorkerParameters);
}
