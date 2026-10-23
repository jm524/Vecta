import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../models/device_state.dart';

/// Network service managing communication between the connected mobile phone
/// client and the local Vecta desktop host engine.
///
/// Handles dual-loopback host discovery (127.0.0.1 ADB reverse vs 10.0.2.2 emulator alias),
/// state synchronization polling, remote prompt submission, and role toggling.
class DeviceApiService {
  String _activeEndpoint = 'http://127.0.0.1:8765';
  bool _isConnected = false;
  bool _isReconnecting = false;
  DateTime? _lastSyncTime;

  String get activeEndpoint => _activeEndpoint;
  bool get isConnected => _isConnected;
  bool get isReconnecting => _isReconnecting;
  DateTime? get lastSyncTime => _lastSyncTime;

  /// Fetches the latest system state snapshot from the desktop host engine.
  /// Tries the active endpoint first, with transparent fallback to the
  /// secondary loopback alias if unreachable.
  Future<DeviceState?> fetchState() async {
    final endpointsToTry = [
      _activeEndpoint,
      _activeEndpoint == 'http://127.0.0.1:8765'
          ? 'http://10.0.2.2:8765'
          : 'http://127.0.0.1:8765',
    ];

    for (final ep in endpointsToTry) {
      try {
        final uri = Uri.parse('$ep/api/state');
        final response = await http.get(uri).timeout(const Duration(seconds: 2));

        if (response.statusCode == 200) {
          final data = json.decode(response.body) as Map<String, dynamic>;
          final state = DeviceState.fromJson(data);

          _isConnected = true;
          _isReconnecting = false;
          _activeEndpoint = ep;
          _lastSyncTime = DateTime.now();

          return state;
        }
      } catch (e) {
        debugPrint('Fetch state failed for $ep: $e');
      }
    }

    // Both endpoints failed
    _isConnected = false;
    _isReconnecting = true;
    return null;
  }

  /// Sends a remote user prompt to the desktop engine via POST /api/chat.
  /// Returns true if the message was accepted by the host server.
  Future<bool> sendPrompt(String text) async {
    final clean = text.trim();
    if (clean.isEmpty) return false;

    try {
      final uri = Uri.parse('$_activeEndpoint/api/chat');
      final payload = json.encode({
        'role': 'user',
        'content': clean,
        'prompt': clean,
      });

      final response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: payload,
      ).timeout(const Duration(seconds: 3));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Send prompt error on $_activeEndpoint: $e');
      return false;
    }
  }

  /// Toggles an autonomous workforce role on or off via POST /api/role/toggle.
  /// Remote state change will be picked up by the desktop engine on the next sync drain.
  Future<bool> toggleRole(String roleSlug, bool enabled) async {
    try {
      final uri = Uri.parse('$_activeEndpoint/api/role/toggle');
      final payload = json.encode({
        'role': roleSlug,
        'enabled': enabled,
      });

      final response = await http.post(
        uri,
        headers: {'Content-Type': 'application/json'},
        body: payload,
      ).timeout(const Duration(seconds: 3));

      return response.statusCode == 200;
    } catch (e) {
      debugPrint('Role toggle error for $roleSlug: $e');
      return false;
    }
  }

  /// Verifies host server reachability via GET /health.
  Future<bool> checkHealth() async {
    try {
      final uri = Uri.parse('$_activeEndpoint/health');
      final response = await http.get(uri).timeout(const Duration(seconds: 2));
      return response.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}
