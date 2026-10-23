import 'package:flutter/material.dart';

/// Design system tokens, color palettes, and theme resolution for the
/// Vecta connected phone application.
///
/// This module provides the dark developer-oriented theme and handles
/// dynamic color synchronization with the desktop CLI /settings.
class VectaTheme {
  // Primary background tokens (deep navy / slate dark palette)
  static const Color scaffoldBackground = Color(0xFF0B0F19);
  static const Color surfaceCard = Color(0xFF1E293B);
  static const Color surfaceSubtle = Color(0xFF0F172A);
  static const Color borderDefault = Color(0xFF334155);
  static const Color borderSubtle = Color(0xFF475569);

  // Core accent tokens
  static const Color primaryCyan = Color(0xFF00E5FF);
  static const Color secondaryBlue = Color(0xFF38BDF8);
  static const Color textPrimary = Color(0xFFF8FAFC);
  static const Color textMuted = Color(0xFF94A3B8);
  static const Color textFaint = Color(0xFF64748B);

  // Status indicator colors
  static const Color statusSuccess = Color(0xFF10B981);
  static const Color statusWarning = Color(0xFFF59E0B);
  static const Color statusDanger = Color(0xFFEF4444);

  // Canonical role color map matching Vecta CLI terminal aesthetics
  static const Map<String, Color> roleColors = {
    'manager': Color(0xFF00E5FF),
    'planner': Color(0xFF00B0FF),
    'coder': Color(0xFF00E676),
    'reviewer': Color(0xFFE040FB),
    'documenter': Color(0xFF94A3B8),
    'user': Color(0xFF38BDF8),
    'system': Color(0xFFA855F7),
  };

  /// Resolves the signature accent color for any autonomous role name or slug.
  /// Falls back to textMuted for unknown custom roles.
  static Color getRoleColor(String? roleName) {
    if (roleName == null || roleName.isEmpty) {
      return textMuted;
    }
    final normalized = roleName.toLowerCase().trim();
    for (final entry in roleColors.entries) {
      if (normalized.contains(entry.key)) {
        return entry.value;
      }
    }
    return textMuted;
  }

  /// Parses a hex color string (e.g. "#00E5FF" or "00E5FF") into a Color.
  /// Returns fallback if parsing fails.
  static Color parseHex(String? hexString, {Color fallback = primaryCyan}) {
    if (hexString == null || hexString.isEmpty) return fallback;
    try {
      String clean = hexString.replaceAll('#', '').trim();
      if (clean.length == 6) {
        clean = 'FF$clean';
      }
      if (clean.length == 8) {
        return Color(int.parse(clean, radix: 16));
      }
    } catch (_) {
      // Return fallback on parse failure
    }
    return fallback;
  }

  /// Builds the foundational Flutter dark theme. If a remote theme payload
  /// is provided from the bridge state (CLI /settings sync), accents are
  /// dynamically adjusted to match the user's terminal configuration.
  static ThemeData buildTheme({Map<String, dynamic>? remoteTheme}) {
    final primary = remoteTheme != null && remoteTheme['primary'] != null
        ? parseHex(remoteTheme['primary'].toString(), fallback: primaryCyan)
        : primaryCyan;

    final cardBg = remoteTheme != null && remoteTheme['surface'] != null
        ? parseHex(remoteTheme['surface'].toString(), fallback: surfaceCard)
        : surfaceCard;

    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: scaffoldBackground,
      cardColor: cardBg,
      primaryColor: primary,
      colorScheme: ColorScheme.dark(
        primary: primary,
        secondary: secondaryBlue,
        surface: cardBg,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: surfaceSubtle,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: surfaceSubtle,
        selectedItemColor: primary,
        unselectedItemColor: textFaint,
        elevation: 8,
      ),
      fontFamily: 'monospace',
    );
  }
}
