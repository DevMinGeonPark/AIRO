package com.heptivision.airo.core.design

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val AirBlue = Color(0xFF86A5FF)
val Ink = Color(0xFF0A0A0A)
val Panel = Color(0xFF141414)
val Raised = Color(0xFF1C1C1C)
val Hairline = Color(0xFF2B2B2B)
val Muted = Color(0xFFA1A1AA)
val Ivory = Color(0xFFF3F1EA)

private val colors = darkColorScheme(
    primary = AirBlue, onPrimary = Ink, primaryContainer = Color(0xFF1C2948), onPrimaryContainer = Color(0xFFCBD8FF),
    background = Ink, onBackground = Ivory, surface = Panel, onSurface = Ivory,
    surfaceVariant = Raised, onSurfaceVariant = Muted, outline = Hairline, outlineVariant = Hairline,
    surfaceContainer = Panel, surfaceContainerHigh = Raised, surfaceContainerLow = Ink,
    surfaceContainerHighest = Raised, surfaceContainerLowest = Ink,
    secondary = AirBlue, onSecondary = Ink, secondaryContainer = Color(0xFF1C2948), onSecondaryContainer = Color(0xFFCBD8FF),
    error = Color(0xFFFFB4AB),
)
private val typography = Typography(
    displaySmall = TextStyle(fontFamily = FontFamily.SansSerif, fontSize = 38.sp, lineHeight = 49.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-1.3).sp),
    headlineLarge = TextStyle(fontSize = 30.sp, lineHeight = 40.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.8).sp),
    headlineSmall = TextStyle(fontSize = 24.sp, lineHeight = 33.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.5).sp),
    titleLarge = TextStyle(fontSize = 20.sp, lineHeight = 29.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
    bodyLarge = TextStyle(fontSize = 16.sp, lineHeight = 26.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 22.sp),
    labelLarge = TextStyle(fontSize = 14.sp, lineHeight = 20.sp, fontWeight = FontWeight.SemiBold),
)

@Composable fun AiroTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = colors, typography = typography, content = content)
}
