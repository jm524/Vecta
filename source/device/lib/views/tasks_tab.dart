import 'package:flutter/material.dart';
import '../constants/theme.dart';
import '../models/device_state.dart';

/// Task Queue checklist view inspecting live autonomous agent tasks,
/// stage status badges, and pipeline metrics.
class TasksTab extends StatelessWidget {
  final List<TaskItem> tasks;

  const TasksTab({
    super.key,
    required this.tasks,
  });

  @override
  Widget build(BuildContext context) {
    final pendingCount = tasks.where((t) => t.isPending).length;
    final inProgressCount = tasks.where((t) => t.isRunning).length;
    final completedCount = tasks.where((t) => t.isDone).length;

    return Column(
      children: [
        // Summary metrics header
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: const BoxDecoration(
            color: VectaTheme.surfaceSubtle,
            border: Border(
              bottom: BorderSide(color: VectaTheme.borderDefault, width: 1),
            ),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildMetricBadge('Total', tasks.length, VectaTheme.textMuted),
              _buildMetricBadge('In Progress', inProgressCount, VectaTheme.primaryCyan),
              _buildMetricBadge('Pending', pendingCount, VectaTheme.statusWarning),
              _buildMetricBadge('Completed', completedCount, VectaTheme.statusSuccess),
            ],
          ),
        ),

        // Task pipeline checklist
        Expanded(
          child: tasks.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.all(12),
                  itemCount: tasks.length,
                  itemBuilder: (context, index) {
                    final task = tasks[index];
                    return _buildTaskCard(task);
                  },
                ),
        ),
      ],
    );
  }

  /// Summary metric item with numerical badge and descriptive label.
  Widget _buildMetricBadge(String label, int count, Color color) {
    return Column(
      children: [
        Text(
          '$count',
          style: TextStyle(
            color: color,
            fontSize: 18,
            fontWeight: FontWeight.bold,
            fontFamily: 'monospace',
          ),
        ),
        const SizedBox(height: 2),
        Text(
          label.toUpperCase(),
          style: const TextStyle(
            color: VectaTheme.textFaint,
            fontSize: 10,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
            fontFamily: 'monospace',
          ),
        ),
      ],
    );
  }

  /// Empty state rendered when the execution queue is empty.
  Widget _buildEmptyState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.checklist_rtl,
            size: 48,
            color: Color(0xFF475569),
          ),
          SizedBox(height: 12),
          Text(
            'Task queue is currently idle.',
            style: TextStyle(
              color: VectaTheme.textMuted,
              fontSize: 14,
              fontWeight: FontWeight.w500,
              fontFamily: 'monospace',
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Dispatched tasks from desktop will stream live here.',
            style: TextStyle(
              color: VectaTheme.textFaint,
              fontSize: 12,
              fontFamily: 'monospace',
            ),
          ),
        ],
      ),
    );
  }

  /// Card presenting a single pipeline task with status indicators and role tags.
  Widget _buildTaskCard(TaskItem task) {
    final roleColor = VectaTheme.getRoleColor(task.role);

    Widget statusIcon;
    Color statusColor;
    String statusLabel;

    if (task.isDone) {
      statusIcon = const Icon(Icons.check_circle_outline, size: 20, color: VectaTheme.statusSuccess);
      statusColor = VectaTheme.statusSuccess;
      statusLabel = 'DONE';
    } else if (task.isRunning) {
      statusIcon = const SizedBox(
        width: 16,
        height: 16,
        child: CircularProgressIndicator(strokeWidth: 2, color: VectaTheme.primaryCyan),
      );
      statusColor = VectaTheme.primaryCyan;
      statusLabel = 'RUNNING';
    } else if (task.isFailed) {
      statusIcon = const Icon(Icons.error_outline, size: 20, color: VectaTheme.statusDanger);
      statusColor = VectaTheme.statusDanger;
      statusLabel = 'FAILED';
    } else {
      statusIcon = const Icon(Icons.schedule, size: 20, color: VectaTheme.statusWarning);
      statusColor = VectaTheme.statusWarning;
      statusLabel = 'PENDING';
    }

    return Card(
      color: VectaTheme.surfaceCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: statusColor.withValues(alpha: 0.35),
          width: 1,
        ),
      ),
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    statusIcon,
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: roleColor.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(4),
                        border: Border.all(color: roleColor.withValues(alpha: 0.5)),
                      ),
                      child: Text(
                        task.role.toUpperCase(),
                        style: TextStyle(
                          color: roleColor,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          fontFamily: 'monospace',
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      task.id,
                      style: const TextStyle(
                        color: VectaTheme.textFaint,
                        fontSize: 10,
                        fontFamily: 'monospace',
                      ),
                    ),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    statusLabel,
                    style: TextStyle(
                      color: statusColor,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              task.prompt,
              style: const TextStyle(
                color: VectaTheme.textPrimary,
                fontSize: 13,
                height: 1.4,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
      ),
    );
  }
}
