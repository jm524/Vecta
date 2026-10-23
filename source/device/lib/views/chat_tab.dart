import 'package:flutter/material.dart';
import '../constants/theme.dart';
import '../models/device_state.dart';
import '../components/generating_indicator.dart';

/// Live Chat view tab enabling real-time inspection of agent conversations
/// and bidirectional remote prompt submission to the desktop engine.
class ChatTab extends StatelessWidget {
  final List<ChatMessage> messages;
  final bool isGenerating;
  final String generatingRole;
  final bool isSending;
  final TextEditingController promptController;
  final ScrollController scrollController;
  final Future<void> Function() onSendPrompt;

  const ChatTab({
    super.key,
    required this.messages,
    required this.isGenerating,
    required this.generatingRole,
    required this.isSending,
    required this.promptController,
    required this.scrollController,
    required this.onSendPrompt,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Live chat stream list
        Expanded(
          child: messages.isEmpty
              ? _buildEmptyState()
              : ListView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  itemCount: messages.length,
                  itemBuilder: (context, index) {
                    final msg = messages[index];
                    return _buildMessageCard(msg);
                  },
                ),
        ),

        // Live role generation status indicator banner
        if (isGenerating)
          RoleGeneratingIndicator(roleName: generatingRole),

        // Bottom remote input bar
        _buildInputBar(),
      ],
    );
  }

  /// Renders a terminal-styled placeholder when no conversation exists yet.
  Widget _buildEmptyState() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.terminal,
            size: 48,
            color: Color(0xFF475569),
          ),
          SizedBox(height: 12),
          Text(
            'No chat messages recorded.',
            style: TextStyle(
              color: VectaTheme.textMuted,
              fontSize: 14,
              fontWeight: FontWeight.w500,
              fontFamily: 'monospace',
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Send an instruction below to interact with Vecta.',
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

  /// Formats and renders an individual chat message card with role badges.
  Widget _buildMessageCard(ChatMessage msg) {
    final sender = msg.sender;
    final roleColor = VectaTheme.getRoleColor(sender);
    final isUser = msg.isUser;
    final timestamp = msg.timestamp;

    String cleanTime = '';
    if (timestamp.isNotEmpty) {
      cleanTime = timestamp.contains('T')
          ? timestamp.split('T')[1].split('.')[0]
          : timestamp;
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Container(
        decoration: BoxDecoration(
          color: VectaTheme.surfaceCard,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isUser
                ? VectaTheme.secondaryBlue.withValues(alpha: 0.4)
                : roleColor.withValues(alpha: 0.4),
            width: 1,
          ),
        ),
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: roleColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: roleColor.withValues(alpha: 0.6)),
                  ),
                  child: Text(
                    sender.toUpperCase(),
                    style: TextStyle(
                      color: roleColor,
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.8,
                      fontFamily: 'monospace',
                    ),
                  ),
                ),
                if (cleanTime.isNotEmpty)
                  Text(
                    cleanTime,
                    style: const TextStyle(
                      fontSize: 10,
                      color: VectaTheme.textFaint,
                      fontFamily: 'monospace',
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            SelectableText(
              msg.text,
              style: const TextStyle(
                fontSize: 13,
                height: 1.45,
                color: VectaTheme.textPrimary,
                fontFamily: 'monospace',
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Renders the fixed bottom prompt dispatch bar with submission triggers.
  Widget _buildInputBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: const BoxDecoration(
        color: VectaTheme.surfaceSubtle,
        border: Border(
          top: BorderSide(color: VectaTheme.borderDefault, width: 1),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: VectaTheme.surfaceCard,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: VectaTheme.borderSubtle),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12),
                child: TextField(
                  controller: promptController,
                  style: const TextStyle(
                    color: VectaTheme.textPrimary,
                    fontSize: 13,
                    fontFamily: 'monospace',
                  ),
                  decoration: const InputDecoration(
                    hintText: 'Type instructions for Vecta...',
                    hintStyle: TextStyle(
                      color: VectaTheme.textFaint,
                      fontSize: 13,
                      fontFamily: 'monospace',
                    ),
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => onSendPrompt(),
                ),
              ),
            ),
            const SizedBox(width: 8),
            InkWell(
              onTap: isSending ? null : () => onSendPrompt(),
              borderRadius: BorderRadius.circular(8),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: isSending ? VectaTheme.borderSubtle : VectaTheme.primaryCyan,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: isSending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: VectaTheme.surfaceSubtle,
                        ),
                      )
                    : const Icon(
                        Icons.send,
                        size: 20,
                        color: VectaTheme.surfaceSubtle,
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
