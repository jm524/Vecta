// Status:: in-progress
// Session manages temporary in-memory state that never saves to disk.
// It holds the active FIFO task queue, current running task, and active chat session.
import type { QueueDispatchPayload } from "../interface/src/types/bridge.js";

export type TaskStatus = "pending" | "running" | "done" | "error";

export interface SessionTask extends QueueDispatchPayload {
  status: TaskStatus;
  output?: string;
  tokensUsed?: number;
}

export interface SessionState {
  activeChatId: string | null;
  queue: SessionTask[];
  currentTaskId: string | null;
  isProcessing: boolean;
}

// In-memory session instance
class SessionManager {
  private state: SessionState = {
    activeChatId: null,
    queue: [],
    currentTaskId: null,
    isProcessing: false,
  };

  // Add new tasks to the end of the line (FIFO - First In, First Out)
  public enqueue(tasks: Omit<SessionTask, "status">[]): void {
    const sessionTasks: SessionTask[] = tasks.map((t) => ({
      ...t,
      status: "pending",
    }));
    this.state.queue.push(...sessionTasks);
  }

  // Look at the next task waiting in line
  public peekNext(): SessionTask | null {
    return this.state.queue.find((t) => t.status === "pending") || null;
  }

  // Update a task's status by its unique ID
  public updateStatus(taskId: string, status: TaskStatus, output?: string, tokensUsed?: number): void {
    // Find the specific pending or running task matching this ID
    const task = this.state.queue.find((t) => t.taskId === taskId && (t.status === "pending" || t.status === "running" || t.status === status));
    if (task) {
      task.status = status;
      if (output !== undefined) task.output = output;
      if (tokensUsed !== undefined) task.tokensUsed = tokensUsed;
    }

    if (status === "running") {
      this.state.currentTaskId = taskId;
      this.state.isProcessing = true;
    } else if (status === "done" || status === "error") {
      if (this.state.currentTaskId === taskId) {
        this.state.currentTaskId = null;
      }
      const hasPending = this.state.queue.some((t) => t.status === "pending" || t.status === "running");
      this.state.isProcessing = hasPending;
    }
  }

  // Get a snapshot copy of all tasks in the queue
  public getTasks(): SessionTask[] {
    return [...this.state.queue];
  }

  // Clear all tasks when starting fresh
  public clear(): void {
    this.state.queue = [];
    this.state.currentTaskId = null;
    this.state.isProcessing = false;
  }
}

export const sessionManager = new SessionManager();
