package ca.skymapontario.app;

import android.app.Activity;
import android.app.Application;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

public final class SkyMapApplication extends Application implements Application.ActivityLifecycleCallbacks {
    private Activity resumedActivity;

    private final BroadcastReceiver updateReadyReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!UpdateManager.ACTION_UPDATE_READY.equals(intent.getAction())) return;
            Activity activity = resumedActivity;
            if (activity instanceof MainActivity) UpdateManager.promptPendingUpdate(activity);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        registerActivityLifecycleCallbacks(this);
        IntentFilter filter = new IntentFilter(UpdateManager.ACTION_UPDATE_READY);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(updateReadyReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(updateReadyReceiver, filter);
        }
        UpdateManager.schedule(this);
    }

    @Override
    public void onActivityResumed(@NonNull Activity activity) {
        resumedActivity = activity;
        if (activity instanceof MainActivity) UpdateManager.promptPendingUpdate(activity);
    }

    @Override public void onActivityCreated(@NonNull Activity activity, @Nullable Bundle state) { }
    @Override public void onActivityStarted(@NonNull Activity activity) { }

    @Override
    public void onActivityPaused(@NonNull Activity activity) {
        if (resumedActivity == activity) resumedActivity = null;
    }

    @Override public void onActivityStopped(@NonNull Activity activity) { }
    @Override public void onActivitySaveInstanceState(@NonNull Activity activity, @NonNull Bundle state) { }
    @Override public void onActivityDestroyed(@NonNull Activity activity) { }

    @Override
    public void onTerminate() {
        try { unregisterReceiver(updateReadyReceiver); } catch (RuntimeException ignored) { }
        super.onTerminate();
    }
}
