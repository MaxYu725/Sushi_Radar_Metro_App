package com.queue.metro.ui

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Density
import com.queue.metro.data.DisplayMode
import com.queue.metro.data.UserSettings

data class MetroColors(
    val background: Color,
    val surface: Color,
    val foreground: Color,
    val muted: Color,
    val line: Color,
    val accent: Color,
    val onAccent: Color,
    val danger: Color,
)

val AccentOptions = listOf(
    Color(0xFF1BA1E2),
    Color(0xFFE51400),
    Color(0xFF60A917),
    Color(0xFFF0A30A),
    Color(0xFF00ABA9),
    Color(0xFFA200FF),
    Color(0xFFD80073),
    Color(0xFFA0522D),
)

val LocalMetroColors = staticCompositionLocalOf {
    MetroColors(
        background = Color.Black,
        surface = Color(0xFF111111),
        foreground = Color.White,
        muted = Color(0xFF8A8A8A),
        line = Color(0xFF343434),
        accent = AccentOptions[2],
        onAccent = Color.White,
        danger = Color(0xFFE51400),
    )
}

@Composable
fun MetroTheme(settings: UserSettings, content: @Composable () -> Unit) {
    val configuration = LocalConfiguration.current
    val systemDark = configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
        Configuration.UI_MODE_NIGHT_YES
    val isDark = when (settings.displayMode) {
        DisplayMode.DARK -> true
        DisplayMode.LIGHT -> false
        DisplayMode.SYSTEM -> systemDark
    }
    val accent = AccentOptions[settings.accentIndex.mod(AccentOptions.size)]
    val colors = if (isDark) {
        MetroColors(
            background = Color.Black,
            surface = Color(0xFF111111),
            foreground = Color.White,
            muted = Color(0xFF888888),
            line = Color(0xFF343434),
            accent = accent,
            onAccent = Color.White,
            danger = Color(0xFFE51400),
        )
    } else {
        MetroColors(
            background = Color(0xFFF7F7F7),
            surface = Color.White,
            foreground = Color(0xFF111111),
            muted = Color(0xFF6B6B6B),
            line = Color(0xFFD4D4D4),
            accent = accent,
            onAccent = Color.White,
            danger = Color(0xFFC50F1F),
        )
    }
    val density = LocalDensity.current
    CompositionLocalProvider(
        LocalMetroColors provides colors,
        LocalDensity provides Density(density.density, density.fontScale * settings.textScale),
        content = content,
    )
}
