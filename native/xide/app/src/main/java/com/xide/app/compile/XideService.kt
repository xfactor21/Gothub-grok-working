package com.xide.app.compile

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.xide.app.R
import com.xide.app.XideApp
import com.xide.app.toolchain.Installer
import com.xide.app.toolchain.LogBus
import kotlin.concurrent.thread

class XideService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action ?: ACTION_INSTALL
        val projectId = intent?.getStringExtra(EXTRA_PROJECT)
        val title = if (action == ACTION_ASSEMBLE) "Assembling APK" else "Downloading SDK"
        val note = NotificationCompat.Builder(this, XideApp.CHANNEL)
            .setContentTitle("xIDE")
            .setContentText(title)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(1, note, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, note)
        }
        thread(name = "xide-work", isDaemon = false) {
            try {
                when (action) {
                    ACTION_ASSEMBLE -> {
                        if (projectId.isNullOrBlank()) {
                            LogBus.job("failed", "No project", "Open a project first")
                        } else {
                            Assemble.run(this, projectId)
                        }
                    }
                    else -> Installer.install(this)
                }
            } catch (t: Throwable) {
                LogBus.job("failed", "Stopped", t.message ?: t.javaClass.simpleName)
            } finally {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    companion object {
        const val ACTION_INSTALL = "com.xide.app.INSTALL"
        const val ACTION_ASSEMBLE = "com.xide.app.ASSEMBLE"
        const val EXTRA_PROJECT = "projectId"

        fun installSdk(ctx: Context) {
            val i = Intent(ctx, XideService::class.java).setAction(ACTION_INSTALL)
            ContextCompat.startForegroundService(ctx, i)
        }

        fun assemble(ctx: Context, projectId: String) {
            val i = Intent(ctx, XideService::class.java)
                .setAction(ACTION_ASSEMBLE)
                .putExtra(EXTRA_PROJECT, projectId)
            ContextCompat.startForegroundService(ctx, i)
        }
    }
}
