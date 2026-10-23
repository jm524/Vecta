import 'package:flutter/material.dart';
import 'constants/theme.dart';
import 'screens/home_screen.dart';

// Export all modular domain components for decoupled access across tests and packages
export 'constants/theme.dart';
export 'models/device_state.dart';
export 'services/device_api.dart';
export 'components/status_bar.dart';
export 'components/generating_indicator.dart';
export 'views/chat_tab.dart';
export 'views/tasks_tab.dart';
export 'views/roles_tab.dart';
export 'screens/home_screen.dart';

/// Entry point for the Vecta connected phone application.
void main() {
  runApp(const VectaDeviceApp());
}

/// Root application widget configuring dark theme, design tokens,
/// and primary navigation routing.
class VectaDeviceApp extends StatelessWidget {
  const VectaDeviceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Vecta',
      debugShowCheckedModeBanner: false,
      theme: VectaTheme.buildTheme(),
      home: const DeviceHomeScreen(),
    );
  }
}

/// Backward compatibility alias supporting prior test suites referencing VectaCompanionApp.
typedef VectaCompanionApp = VectaDeviceApp;
