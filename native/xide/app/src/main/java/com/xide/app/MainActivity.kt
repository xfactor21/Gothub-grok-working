package com.xide.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.core.app.ActivityCompat
import androidx.core.view.WindowCompat
import com.xide.app.ui.XideRoot
import com.xide.app.ui.theme.XideTheme
import com.xide.app.vm.XideViewModel

class MainActivity : ComponentActivity() {
    private val vm: XideViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= 33 &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        setContent {
            XideTheme {
                XideRoot(vm)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        vm.refreshToolchain()
    }
}
