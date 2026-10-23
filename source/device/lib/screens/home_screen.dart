import 'dart:async';
import 'package:flutter/material.dart';
import '../constants/theme.dart';
import '../models/device_state.dart';
import '../services/device_api.dart';
import '../components/status_bar.dart';
import '../views/chat_tab.dart';
import '../views/tasks_tab.dart';
import '../views/roles_tab.dart';

/// Root home screen coordinator for the Vecta connected phone application.
///
/// Orchestrates periodic state polling, tab navigation, optimistic UI updates,
/// and remote prompt/role dispatch to the desktop host engine.
class DeviceHomeScreen extends StatefulWidget {
  const DeviceHomeScreen({super.key});

  @override
  State<DeviceHomeScreen> createState() => _DeviceHomeScreenState();
}

/// Backward compatibility alias for test suites expecting CompanionHomeScreen.
typedef CompanionHomeScreen = DeviceHomeScreen;

class _DeviceHomeScreenState extends State<DeviceHomeScreen> {
  final DeviceApiService _apiService = DeviceApiService();

  int _currentTabIndex = 0;
  Timer? _pollTimer;

  final TextEditingController _promptController = TextEditingController();
  final ScrollController _chatScrollController = ScrollController();
  bool _isSending = false;

  // Active state representation
  DeviceState _state = DeviceState(
    activeChatId: 'default',
    messages: [],
    tasks: [],
    roles: DeviceState.defaultRoles,
    isProcessing: false,
    activeRole: null,
  );

  @override
  void initState() {
    super.initState();
    _startPolling();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _promptController.dispose();
    _chatScrollController.dispose();
    super.dispose();
  }

  /// Initiates the background polling loop querying the desktop host engine.
  void _startPolling() {
    _pollTimer?.cancel();
    _syncState();
    _pollTimer = Timer.periodic(const Duration(milliseconds: 1500), (_) {
      _syncState();
    });
  }

  /// Queries the desktop host for the latest state snapshot.
  Future<void> _syncState() async {
    final fetched = await _apiService.fetchState();
    if (fetched != null && mounted) {
      setState(() {
        _state = fetched;
      });
    } else if (mounted) {
      setState(() {
        // Triggers UI rebuild to reflect connection drop in status bar
      });
    }
  }

  /// Dispatches a remote prompt to the desktop host engine with optimistic feedback.
  Future<void> _sendPrompt() async {
    final text = _promptController.text.trim();
    if (text.isEmpty || _isSending) return;

    setState(() {
      _isSending = true;
    });

    // Optimistic local chat injection
    final optimisticMsg = ChatMessage(
      id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
      sender: 'User',
      text: text,
      timestamp: DateTime.now().toIso8601String(),
    );

    setState(() {
      _state = DeviceState(
        activeChatId: _state.activeChatId,
        messages: [..._state.messages, optimisticMsg],
        tasks: _state.tasks,
        roles: _state.roles,
        isProcessing: true,
        activeRole: 'Engine',
        theme: _state.theme,
      );
    });

    _promptController.clear();
    _scrollToBottom();

    final success = await _apiService.sendPrompt(text);

    if (!success && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Failed to deliver instruction to host server.',
            style: TextStyle(fontFamily: 'monospace'),
          ),
          backgroundColor: VectaTheme.statusDanger,
        ),
      );
    }

    if (mounted) {
      setState(() {
        _isSending = false;
      });
      _syncState();
    }
  }

  /// Toggles an agent role locally and remotely pushes the change to the host.
  Future<void> _toggleRole(String roleSlug, bool enabled) async {
    // Optimistic local state update
    final updatedRoles = _state.roles.map((r) {
      if (r.slug.toLowerCase() == roleSlug.toLowerCase() ||
          r.name.toLowerCase() == roleSlug.toLowerCase()) {
        return r.copyWith(enabled: enabled);
      }
      return r;
    }).toList();

    setState(() {
      _state = DeviceState(
        activeChatId: _state.activeChatId,
        messages: _state.messages,
        tasks: _state.tasks,
        roles: updatedRoles,
        isProcessing: _state.isProcessing,
        activeRole: _state.activeRole,
        theme: _state.theme,
      );
    });

    await _apiService.toggleRole(roleSlug, enabled);
    _syncState();
  }

  /// Animates the chat list viewport to the latest message.
  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_chatScrollController.hasClients) {
        _chatScrollController.animateTo(
          _chatScrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  /// Identifies the first running task in the pipeline queue.
  TaskItem? _getActiveRunningTask() {
    try {
      return _state.tasks.firstWhere((t) => t.isRunning);
    } catch (_) {
      return null;
    }
  }

  /// Evaluates whether an autonomous agent role is actively generating output.
  bool _isRoleGenerating() {
    final runningTask = _getActiveRunningTask();
    return _state.isProcessing || runningTask != null || _isSending;
  }

  /// Returns the name of the role currently driving the generation sequence.
  String _getGeneratingRoleName() {
    if (_state.activeRole != null && _state.activeRole!.isNotEmpty) {
      return _state.activeRole!;
    }
    final runningTask = _getActiveRunningTask();
    if (runningTask != null && runningTask.role.isNotEmpty) {
      return runningTask.role;
    }
    if (_isSending) return 'Engine';
    return 'Agent';
  }

  @override
  Widget build(BuildContext context) {
    final isGenerating = _isRoleGenerating();
    final generatingRole = _getGeneratingRoleName();

    return Scaffold(
      appBar: VectaStatusBar(
        isConnected: _apiService.isConnected,
        isReconnecting: _apiService.isReconnecting,
        activeEndpoint: _apiService.activeEndpoint,
        activeChatId: _state.activeChatId,
        lastSyncTime: _apiService.lastSyncTime,
        isGenerating: isGenerating,
        generatingRole: generatingRole,
        onSyncPressed: _syncState,
      ),
      body: IndexedStack(
        index: _currentTabIndex,
        children: [
          ChatTab(
            messages: _state.messages,
            isGenerating: isGenerating,
            generatingRole: generatingRole,
            isSending: _isSending,
            promptController: _promptController,
            scrollController: _chatScrollController,
            onSendPrompt: _sendPrompt,
          ),
          TasksTab(
            tasks: _state.tasks,
          ),
          RolesTab(
            roles: _state.roles,
            onToggleRole: _toggleRole,
          ),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentTabIndex,
        onTap: (index) {
          setState(() {
            _currentTabIndex = index;
          });
        },
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.chat_bubble_outline),
            activeIcon: const Icon(Icons.chat_bubble),
            label: 'Chat (${_state.messages.length})',
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.checklist_rtl_outlined),
            activeIcon: const Icon(Icons.checklist_rtl),
            label: 'Tasks (${_state.tasks.length})',
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.tune_outlined),
            activeIcon: const Icon(Icons.tune),
            label: 'Roles (${_state.roles.where((r) => r.enabled).length})',
          ),
        ],
      ),
    );
  }
}
