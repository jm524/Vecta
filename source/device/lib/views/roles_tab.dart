import 'package:flutter/material.dart';
import '../constants/theme.dart';
import '../models/device_state.dart';

/// Autonomous Agent Workforce Roster view enabling live toggling of roles
/// and monitoring of assigned local or cloud model checkpoints.
class RolesTab extends StatelessWidget {
  final List<RoleItem> roles;
  final void Function(String roleSlug, bool enabled) onToggleRole;

  const RolesTab({
    super.key,
    required this.roles,
    required this.onToggleRole,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(12),
      children: [
        // Roster header guide
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: VectaTheme.surfaceCard,
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: VectaTheme.borderDefault),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'AGENT WORKFORCE ROSTER',
                style: TextStyle(
                  color: VectaTheme.primaryCyan,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 1.1,
                  fontFamily: 'monospace',
                ),
              ),
              SizedBox(height: 4),
              Text(
                'Toggle roles active in the autonomous workflow pipeline. Toggled state syncs instantly to desktop engine.',
                style: TextStyle(
                  color: VectaTheme.textMuted,
                  fontSize: 11,
                  height: 1.35,
                  fontFamily: 'monospace',
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),

        // Role cards
        ...roles.map((r) => _buildRoleCard(r)),
      ],
    );
  }

  /// Renders a single role configuration card with model indicator and toggle.
  Widget _buildRoleCard(RoleItem role) {
    final roleColor = VectaTheme.getRoleColor(role.name);
    final isEnabled = role.enabled;

    return Card(
      color: VectaTheme.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: isEnabled ? roleColor.withValues(alpha: 0.5) : VectaTheme.borderDefault,
          width: 1,
        ),
      ),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(
          children: [
            // Role avatar badge with first initial
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: roleColor.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: roleColor.withValues(alpha: 0.4)),
              ),
              child: Center(
                child: Text(
                  role.name.isNotEmpty ? role.name[0] : 'W',
                  style: TextStyle(
                    color: roleColor,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),

            // Role identification and model tag
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(
                        role.name,
                        style: const TextStyle(
                          color: VectaTheme.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                      const SizedBox(width: 8),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: VectaTheme.surfaceSubtle,
                          borderRadius: BorderRadius.circular(3),
                        ),
                        child: Text(
                          role.model,
                          style: const TextStyle(
                            color: VectaTheme.textFaint,
                            fontSize: 9,
                            fontFamily: 'monospace',
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    role.description,
                    style: const TextStyle(
                      color: VectaTheme.textMuted,
                      fontSize: 11,
                      height: 1.3,
                      fontFamily: 'monospace',
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),

            // Operational toggle switch
            Switch.adaptive(
              value: isEnabled,
              activeTrackColor: roleColor,
              activeThumbColor: VectaTheme.surfaceSubtle,
              onChanged: (val) {
                onToggleRole(role.slug, val);
              },
            ),
          ],
        ),
      ),
    );
  }
}
