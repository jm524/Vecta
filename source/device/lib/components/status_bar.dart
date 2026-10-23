import 'package:flutter/material.dart';
import '../constants/theme.dart';

/// Top system status bar widget displaying connection health, active host,
/// chat identifier, and live role generation state.
class VectaStatusBar extends StatelessWidget implements PreferredSizeWidget {
  final bool isConnected;
  final bool isReconnecting;
  final String activeEndpoint;
  final String activeChatId;
  final DateTime? lastSyncTime;
  final bool isGenerating;
  final String generatingRole;
  final VoidCallback onSyncPressed;

  const VectaStatusBar({
    super.key,
    required this.isConnected,
    required this.isReconnecting,
    required this.activeEndpoint,
    required this.activeChatId,
    required this.lastSyncTime,
    required this.isGenerating,
    required this.generatingRole,
    required this.onSyncPressed,
  });

  @override
  Size get preferredSize => const Size.fromHeight(60.0);

  String _formatSyncTime(DateTime? time) {
    if (time == null) return '';
    final h = time.hour.toString().padLeft(2, '0');
    final m = time.minute.toString().padLeft(2, '0');
    final s = time.second.toString().padLeft(2, '0');
    return ' ($h:$m:$s)';
  }

  Color _getConnectionColor() {
    if (isConnected) return VectaTheme.statusSuccess;
    if (isReconnecting) return VectaTheme.statusWarning;
    return VectaTheme.statusDanger;
  }

  @override
  Widget build(BuildContext context) {
    final roleColor = VectaTheme.getRoleColor(generatingRole);
    final statusColor = _getConnectionColor();
    final cleanHost = activeEndpoint.replaceAll('http://', '');

    return AppBar(
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              const Text(
                'VECTA CONNECTED PHONE',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.1,
                  fontFamily: 'monospace',
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: VectaTheme.surfaceCard,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: VectaTheme.borderDefault),
                ),
                child: const Text(
                  'v0.0.20',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w600,
                    color: VectaTheme.primaryCyan,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
              if (isGenerating) ...[
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: roleColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: roleColor.withValues(alpha: 0.6)),
                  ),
                  child: Text(
                    'GENERATING',
                    style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.bold,
                      color: roleColor,
                      letterSpacing: 0.5,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 3),
          Text(
            isGenerating
                ? '$generatingRole is generating a response...'
                : (isConnected
                    ? 'Active Host: $cleanHost | Chat: $activeChatId${_formatSyncTime(lastSyncTime)}'
                    : 'Searching local host on 127.0.0.1:8765...'),
            style: TextStyle(
              fontSize: 10,
              color: isGenerating ? roleColor : VectaTheme.textMuted,
              fontWeight: isGenerating ? FontWeight.w600 : FontWeight.normal,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          icon: const Icon(Icons.sync, size: 20),
          tooltip: 'Sync now',
          onPressed: onSyncPressed,
        ),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(1.0),
        child: Container(
          color: VectaTheme.borderDefault,
          height: 1.0,
        ),
      ),
    );
  }
}
