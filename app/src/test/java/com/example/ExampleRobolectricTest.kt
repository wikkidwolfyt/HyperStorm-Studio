package com.example

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class ExampleRobolectricTest {

    @Test
    fun `read string from context`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val appName = context.getString(R.string.app_name)
        assertEquals("HyperStorm Studio", appName)
    }

    @Test
    fun `hyperstorm studio web assets are bundled`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val assetList = context.assets.list("")?.toSet().orEmpty()
        assertTrue(assetList.contains("index.html"))
        assertTrue(assetList.contains("styles.css"))
        assertTrue(assetList.contains("storage.js"))
        assertTrue(assetList.contains("audio-engine.js"))
        assertTrue(assetList.contains("app.js"))
        assertTrue(assetList.contains("hs_logo.jpg"))
    }

    @Test
    fun `index html references classic scripts and monochrome theme`() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val html = context.assets.open("index.html").bufferedReader().use { it.readText() }
        assertTrue(html.contains("theme-black"))
        assertTrue(html.contains("hs_logo.jpg"))
        assertTrue(html.contains("<script src=\"storage.js\"></script>"))
        assertTrue(html.contains("<script src=\"audio-engine.js\"></script>"))
        assertTrue(html.contains("<script src=\"app.js\"></script>"))
    }
}
