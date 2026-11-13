package com.example.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val HyperStormBlackColorScheme = darkColorScheme(
    primary = MonoBlackFg,
    onPrimary = MonoBlackBg,
    secondary = MonoBlackFg,
    onSecondary = MonoBlackBg,
    background = MonoBlackBg,
    onBackground = MonoBlackFg,
    surface = MonoBlackPanel,
    onSurface = MonoBlackFg,
    surfaceVariant = MonoBlackPanel,
    onSurfaceVariant = MonoBlackMuted,
    outline = MonoBlackBorder,
    outlineVariant = MonoBlackBorder
)

private val HyperStormLightColorScheme = lightColorScheme(
    primary = MonoLightFg,
    onPrimary = MonoLightBg,
    secondary = MonoLightFg,
    onSecondary = MonoLightBg,
    background = MonoLightBg,
    onBackground = MonoLightFg,
    surface = MonoLightPanel,
    onSurface = MonoLightFg,
    surfaceVariant = MonoLightPanel,
    onSurfaceVariant = MonoLightMuted,
    outline = MonoLightBorder,
    outlineVariant = MonoLightBorder
)

val HyperStormShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(10.dp),
    large = RoundedCornerShape(12.dp),
    extraLarge = RoundedCornerShape(16.dp)
)

@Composable
fun HyperStormTheme(
    isLight: Boolean = false,
    content: @Composable () -> Unit
) {
    MaterialTheme(
        colorScheme = if (isLight) HyperStormLightColorScheme else HyperStormBlackColorScheme,
        typography = HyperStormTypography,
        shapes = HyperStormShapes,
        content = content
    )
}
