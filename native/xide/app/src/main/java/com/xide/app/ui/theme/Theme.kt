package com.xide.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.Typography
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

val Bg = Color(0xFF0B0D10)
val Surface = Color(0xFF12161B)
val Elevated = Color(0xFF181E25)
val Fg = Color(0xFFE8EAED)
val Muted = Color(0xFF8B949E)
val Subtle = Color(0xFF6B7380)
val Accent = Color(0xFF5EEAD4)
val AccentFg = Color(0xFF042F2E)
val Border = Color(0xFF232A33)
val Danger = Color(0xFFF07178)
val Warn = Color(0xFFE6C07B)
val Ok = Color(0xFF7FD99A)

private val Colors = darkColorScheme(
    primary = Accent,
    onPrimary = AccentFg,
    secondary = Accent,
    onSecondary = AccentFg,
    background = Bg,
    onBackground = Fg,
    surface = Surface,
    onSurface = Fg,
    surfaceVariant = Elevated,
    onSurfaceVariant = Muted,
    outline = Border,
    error = Danger,
    onError = Fg,
)

private val Type = Typography(
    headlineLarge = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.5).sp,
        color = Fg,
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        color = Fg,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 16.sp,
        lineHeight = 22.sp,
        color = Fg,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 22.sp,
        color = Fg,
    ),
    bodySmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 18.sp,
        color = Muted,
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        letterSpacing = 1.4.sp,
        color = Subtle,
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 20.sp,
        color = Fg,
    ),
)

@Composable
fun XideTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = Colors, typography = Type, content = content)
}
