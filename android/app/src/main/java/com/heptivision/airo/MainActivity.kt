package com.heptivision.airo

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.heptivision.airo.core.design.AiroTheme
import com.heptivision.airo.feature.auth.AuthViewModel
import com.heptivision.airo.navigation.AiroApp

fun <T : ViewModel> modelFactory(create: () -> T): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST") override fun <M : ViewModel> create(modelClass: Class<M>): M = create() as M
}

class MainActivity : ComponentActivity() {
    private val container get() = (application as AiroApplication).container
    private val auth: AuthViewModel by viewModels { modelFactory { AuthViewModel(container.auth) } }
    private val share: com.heptivision.airo.feature.share.ShareViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT), navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT))
        if (savedInstanceState == null) consume(intent)
        setContent { AiroTheme { AiroApp(container, auth, share, onServerChange = { value ->
            (application as AiroApplication).selectServer(value)
            viewModelStore.clear()
            recreate()
        }) } }
    }
    // The callback is consumed once; retain the original launch intent for recreation.
    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); consume(intent) }
    private fun consume(intent: Intent?) {
        if (intent?.action == Intent.ACTION_SEND) { share.receive(intent, container.auth.session.value?.user?.id); intent.action = Intent.ACTION_MAIN; intent.removeExtra(Intent.EXTRA_STREAM); intent.removeExtra(Intent.EXTRA_TEXT); intent.clipData = null }
        else if (intent?.action == Intent.ACTION_VIEW) intent.data?.takeIf { it.scheme == "com.heptivision.airo" && it.host == "auth" }?.let { auth.callback(it.toString()); intent.data = null }
    }
}
