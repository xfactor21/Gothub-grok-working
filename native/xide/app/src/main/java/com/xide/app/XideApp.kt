package com.xide.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.xide.app.data.ProjectRepository
import com.xide.app.toolchain.LogBus

class XideApp : Application() {
    lateinit var projects: ProjectRepository
        private set

    override fun onCreate() {
        super.onCreate()
        instance = this
        projects = ProjectRepository(this)
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(
                NotificationChannel(
                    CHANNEL,
                    getString(R.string.channel_work),
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }
        LogBus.add("xIDE native ready")
    }

    companion object {
        const val CHANNEL = "xide-work"
        lateinit var instance: XideApp
            private set
    }
}
