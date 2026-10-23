// Data models representing the synchronized state between the Vecta
// desktop host engine and the connected mobile phone client.
//
// Encapsulates chat messages, task pipeline items, autonomous roles,
// and active execution statuses with safe null handling.

/// A single message in the live conversation stream.
class ChatMessage {
  final String id;
  final String sender;
  final String text;
  final String timestamp;

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.text,
    required this.timestamp,
  });

  bool get isUser => sender.toLowerCase() == 'user';

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id']?.toString() ?? 'msg_${DateTime.now().millisecondsSinceEpoch}',
      sender: json['sender']?.toString() ?? 'Agent',
      text: json['text']?.toString() ?? '',
      timestamp: json['timestamp']?.toString() ?? '',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'sender': sender,
      'text': text,
      'timestamp': timestamp,
    };
  }
}

/// A pipeline execution task item queued or processed by an autonomous role.
class TaskItem {
  final String id;
  final String role;
  final String prompt;
  final String status;

  const TaskItem({
    required this.id,
    required this.role,
    required this.prompt,
    required this.status,
  });

  bool get isRunning => status == 'in_progress' || status == 'running';
  bool get isDone => status == 'completed' || status == 'done';
  bool get isFailed => status == 'failed' || status == 'error';
  bool get isPending => !isRunning && !isDone && !isFailed;

  factory TaskItem.fromJson(Map<String, dynamic> json) {
    return TaskItem(
      id: json['id']?.toString() ?? 'task_unknown',
      role: json['role']?.toString() ?? 'General',
      prompt: json['prompt']?.toString() ?? (json['description']?.toString() ?? ''),
      status: (json['status']?.toString() ?? 'pending').toLowerCase(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'role': role,
      'prompt': prompt,
      'status': status,
    };
  }
}

/// An autonomous agent workforce role with operational toggle and model assignment.
class RoleItem {
  final String name;
  final String slug;
  final String description;
  final bool enabled;
  final String model;
  final String? colorHex;

  const RoleItem({
    required this.name,
    required this.slug,
    required this.description,
    required this.enabled,
    required this.model,
    this.colorHex,
  });

  RoleItem copyWith({bool? enabled}) {
    return RoleItem(
      name: name,
      slug: slug,
      description: description,
      enabled: enabled ?? this.enabled,
      model: model,
      colorHex: colorHex,
    );
  }

  factory RoleItem.fromJson(Map<String, dynamic> json) {
    return RoleItem(
      name: json['name']?.toString() ?? 'Worker',
      slug: json['slug']?.toString() ?? (json['name']?.toString().toLowerCase() ?? 'worker'),
      description: json['description']?.toString() ?? 'Pipeline worker role',
      enabled: json['enabled'] is bool ? json['enabled'] as bool : true,
      model: json['model']?.toString() ?? 'llama3.2:3b',
      colorHex: json['color']?.toString(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'slug': slug,
      'description': description,
      'enabled': enabled,
      'model': model,
      if (colorHex != null) 'color': colorHex,
    };
  }
}

/// Root snapshot payload received from the host bridge at GET /api/state.
class DeviceState {
  final String activeChatId;
  final List<ChatMessage> messages;
  final List<TaskItem> tasks;
  final List<RoleItem> roles;
  final bool isProcessing;
  final String? activeRole;
  final Map<String, dynamic>? theme;

  const DeviceState({
    required this.activeChatId,
    required this.messages,
    required this.tasks,
    required this.roles,
    required this.isProcessing,
    this.activeRole,
    this.theme,
  });

  /// Standard fallback workforce roles if host server has not yet populated roles array.
  static List<RoleItem> get defaultRoles => const [
    RoleItem(
      name: 'Manager',
      slug: 'manager',
      description: 'Pipeline orchestration and task decomposition',
      enabled: true,
      model: 'llama3.2:3b',
      colorHex: '#00e5ff',
    ),
    RoleItem(
      name: 'Planner',
      slug: 'planner',
      description: 'Deconstructs user instructions into verified tasks',
      enabled: true,
      model: 'llama3.2:3b',
      colorHex: '#00b0ff',
    ),
    RoleItem(
      name: 'Coder',
      slug: 'coder',
      description: 'Executes code modifications and feature creation',
      enabled: true,
      model: 'llama3.2:3b',
      colorHex: '#00e676',
    ),
    RoleItem(
      name: 'Reviewer',
      slug: 'reviewer',
      description: 'Validates quality gates, diffs, and security boundaries',
      enabled: true,
      model: 'llama3.2:3b',
      colorHex: '#e040fb',
    ),
    RoleItem(
      name: 'Documenter',
      slug: 'documenter',
      description: 'Maintains sprint logs, debugging.md, and tech debt registry',
      enabled: true,
      model: 'llama3.2:3b',
      colorHex: '#94a3b8',
    ),
  ];

  factory DeviceState.fromJson(Map<String, dynamic> json) {
    final rawMessages = json['messages'];
    final parsedMessages = <ChatMessage>[];
    if (rawMessages is List) {
      for (final item in rawMessages) {
        if (item is Map<String, dynamic>) {
          parsedMessages.add(ChatMessage.fromJson(item));
        }
      }
    }

    final rawTasks = json['tasks'];
    final parsedTasks = <TaskItem>[];
    if (rawTasks is List) {
      for (final item in rawTasks) {
        if (item is Map<String, dynamic>) {
          parsedTasks.add(TaskItem.fromJson(item));
        }
      }
    }

    final rawRoles = json['roles'];
    final parsedRoles = <RoleItem>[];
    if (rawRoles is List && rawRoles.isNotEmpty) {
      for (final item in rawRoles) {
        if (item is Map<String, dynamic>) {
          parsedRoles.add(RoleItem.fromJson(item));
        }
      }
    }

    return DeviceState(
      activeChatId: json['activeChatId']?.toString() ?? 'default',
      messages: parsedMessages,
      tasks: parsedTasks,
      roles: parsedRoles.isNotEmpty ? parsedRoles : defaultRoles,
      isProcessing: json['isProcessing'] is bool ? json['isProcessing'] as bool : false,
      activeRole: json['activeRole']?.toString(),
      theme: json['theme'] is Map<String, dynamic> ? json['theme'] as Map<String, dynamic> : null,
    );
  }
}
