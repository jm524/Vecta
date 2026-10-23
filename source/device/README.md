# Vecta Connected Device

Mobile client application for Android devices and emulators, providing real-time autonomous pipeline inspection and remote control for the Vecta CLI desktop engine.

## Overview

The Vecta connected device client communicates exclusively over local loopback (`127.0.0.1:8765` via `adb reverse` or `10.0.2.2:8765` on emulators), adhering strictly to offline security boundaries with zero cloud routing or telemetry.

### Core Features
- **Live Chat Stream**: Real-time view of multi-agent conversations with role-specific badges (User, Manager, Planner, Coder, Reviewer, Documenter) and optimistic prompt input.
- **Role Generation Indicators**: Real-time visual feedback in the app bar and above the chat input indicating when an autonomous agent is actively generating responses.
- **Task Queue Inspector**: Pipeline checklist with status badges (Pending, Running, Done, Failed) and live throughput metrics (Total, In Progress, Pending, Completed).
- **Workforce Roster**: Remote toggling of autonomous agent roles with instant state propagation to the desktop engine.
- **Dynamic Theme Synchronization**: Theme color scheme linked with desktop CLI `/settings` preferences.

## Architecture

Modular component architecture under `lib/` adhering to Flutter best practices:

- `constants/theme.dart`: Design system tokens, role color palette, and dynamic theme parser.
- `models/device_state.dart`: Immutable data models for chat messages, tasks, roles, and server snapshots.
- `services/device_api.dart`: Network service handling dual-loopback host discovery, non-blocking polling, remote prompts, and role toggles.
- `components/status_bar.dart`: App header showing connection dot, version badge, active host, latency timestamp, and generating badge.
- `components/generating_indicator.dart`: Animated banner displaying active role and generation status.
- `views/chat_tab.dart`: Monospace chat stream and prompt dispatch bar.
- `views/tasks_tab.dart`: Task metrics summary and pipeline checklist cards.
- `views/roles_tab.dart`: Autonomous agent workforce roster with remote toggles.
- `screens/home_screen.dart`: Root stateful coordinator managing background polling and tab views.
- `main.dart`: Application entry point initializing `VectaDeviceApp`.

## Development & Verification

### Static Analysis
```bash
flutter analyze
```

### Unit & Widget Testing
```bash
flutter test
```

### Debug Build
```bash
flutter build apk --debug
```

Output binary: `build/app/outputs/flutter-apk/app-debug.apk`
