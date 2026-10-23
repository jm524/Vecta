import 'package:flutter/material.dart';
import '../constants/theme.dart';

/// Animated banner displayed when an autonomous agent role or the local engine
/// is actively generating output or processing tasks.
class RoleGeneratingIndicator extends StatelessWidget {
  final String roleName;

  const RoleGeneratingIndicator({
    super.key,
    required this.roleName,
  });

  @override
  Widget build(BuildContext context) {
    final roleColor = VectaTheme.getRoleColor(roleName);
    final upperRole = roleName.toUpperCase();

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      decoration: BoxDecoration(
        color: VectaTheme.surfaceCard,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: roleColor.withValues(alpha: 0.6),
          width: 1,
        ),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: roleColor,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              '$upperRole IS GENERATING A RESPONSE...',
              style: TextStyle(
                color: roleColor,
                fontSize: 11,
                fontWeight: FontWeight.bold,
                letterSpacing: 0.8,
                fontFamily: 'monospace',
              ),
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }
}
