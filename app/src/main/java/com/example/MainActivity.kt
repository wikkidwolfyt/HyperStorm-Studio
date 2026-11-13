package com.example

import android.annotation.SuppressLint
import android.app.Activity
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import com.example.ui.theme.HyperStormTheme
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            HyperStormWebViewHost(
                onFinish = { finish() }
            )
        }
    }
}

private class HyperStormJsBridge(
    private val onThemeUpdate: (Boolean) -> Unit,
    private val onRequestSaveFile: (fileName: String, mimeType: String, bytes: ByteArray) -> Unit
) {
    @JavascriptInterface
    fun onThemeChanged(theme: String) {
        onThemeUpdate(theme == "light")
    }

    @JavascriptInterface
    fun saveBase64File(fileName: String, mimeType: String, base64Data: String) {
        val bytes = try {
            Base64.decode(base64Data, Base64.DEFAULT)
        } catch (_: IllegalArgumentException) {
            return
        }
        onRequestSaveFile(fileName, mimeType, bytes)
    }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HyperStormWebViewHost(onFinish: () -> Unit) {
    val context = LocalContext.current
    val activity = context as? Activity
    val scope = rememberCoroutineScope()

    var isLightTheme by remember { mutableStateOf(false) }
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var pendingFileChooserCallback by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    var pendingSaveBytes by remember { mutableStateOf<ByteArray?>(null) }

    val openDocumentLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.OpenDocument()
    ) { uri ->
        val callback = pendingFileChooserCallback
        pendingFileChooserCallback = null
        if (callback != null) {
            callback.onReceiveValue(if (uri != null) arrayOf(uri) else null)
        }
    }

    val createHyperLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val bytes = pendingSaveBytes
        pendingSaveBytes = null
        if (uri != null && bytes != null) {
            scope.launch(Dispatchers.IO) {
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(bytes)
                }
            }
        }
    }

    val createWavLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("audio/wav")
    ) { uri ->
        val bytes = pendingSaveBytes
        pendingSaveBytes = null
        if (uri != null && bytes != null) {
            scope.launch(Dispatchers.IO) {
                context.contentResolver.openOutputStream(uri)?.use { out ->
                    out.write(bytes)
                }
            }
        }
    }

    LaunchedEffect(isLightTheme) {
        activity?.window?.let { win ->
            val controller = WindowCompat.getInsetsController(win, win.decorView)
            controller.isAppearanceLightStatusBars = isLightTheme
            controller.isAppearanceLightNavigationBars = isLightTheme
        }
        webViewRef?.setBackgroundColor(
            if (isLightTheme) android.graphics.Color.WHITE else android.graphics.Color.BLACK
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            pendingFileChooserCallback?.onReceiveValue(null)
            pendingFileChooserCallback = null
            webViewRef?.destroy()
            webViewRef = null
        }
    }

    BackHandler {
        val wv = webViewRef
        if (wv == null) {
            onFinish()
        } else {
            wv.evaluateJavascript("window.__hsHandleBack ? window.__hsHandleBack() : false") { result ->
                if (result != "true") {
                    if (wv.canGoBack()) {
                        wv.goBack()
                    } else {
                        onFinish()
                    }
                }
            }
        }
    }

    HyperStormTheme(isLight = isLightTheme) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            containerColor = MaterialTheme.colorScheme.background,
            contentWindowInsets = WindowInsets.safeDrawing
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
            ) {
                AndroidView(
                    modifier = Modifier
                        .fillMaxSize()
                        .testTag("hyperstorm_webview"),
                    factory = { ctx ->
                        WebView(ctx).apply {
                            layoutParams = ViewGroup.LayoutParams(
                                ViewGroup.LayoutParams.MATCH_PARENT,
                                ViewGroup.LayoutParams.MATCH_PARENT
                            )
                            overScrollMode = View.OVER_SCROLL_NEVER
                            setBackgroundColor(android.graphics.Color.BLACK)

                            settings.apply {
                                javaScriptEnabled = true
                                domStorageEnabled = true
                                databaseEnabled = true
                                allowFileAccess = true
                                @Suppress("DEPRECATION")
                                allowFileAccessFromFileURLs = true
                                mediaPlaybackRequiresUserGesture = false
                                cacheMode = WebSettings.LOAD_DEFAULT
                                builtInZoomControls = false
                                displayZoomControls = false
                                useWideViewPort = true
                                loadWithOverviewMode = true
                            }

                            val jsBridge = HyperStormJsBridge(
                                onThemeUpdate = { light ->
                                    post { isLightTheme = light }
                                },
                                onRequestSaveFile = { fileName, mimeType, bytes ->
                                    post {
                                        pendingSaveBytes = bytes
                                        if (mimeType == "audio/wav" || fileName.endsWith(".wav", ignoreCase = true)) {
                                            createWavLauncher.launch(fileName)
                                        } else {
                                            createHyperLauncher.launch(fileName)
                                        }
                                    }
                                }
                            )
                            addJavascriptInterface(jsBridge, "HyperStormAndroid")

                            webViewClient = WebViewClient()
                            webChromeClient = object : WebChromeClient() {
                                override fun onShowFileChooser(
                                    webView: WebView?,
                                    filePathCallback: ValueCallback<Array<Uri>>?,
                                    fileChooserParams: FileChooserParams?
                                ): Boolean {
                                    pendingFileChooserCallback?.onReceiveValue(null)
                                    pendingFileChooserCallback = filePathCallback
                                    return try {
                                        openDocumentLauncher.launch(arrayOf("*/*"))
                                        true
                                    } catch (_: Exception) {
                                        pendingFileChooserCallback?.onReceiveValue(null)
                                        pendingFileChooserCallback = null
                                        false
                                    }
                                }
                            }

                            loadUrl("file:///android_asset/index.html")
                            webViewRef = this
                        }
                    }
                )
            }
        }
    }
}
