// Status:: in-progress
// useQueue manages sequential execution of tasks through the Go engine.
// It enforces the strict rule: ONE task at a time, strictly in order (FIFO).
import { useState, useCallback, useRef } from "react";
import { sessionManager, type SessionTask } from "../../../state/session.js";
import { engineBridge } from "../bridge/client.js";
import type { QueueDispatchPayload, QueueDispatchResult } from "../types/bridge.js";

export interface QueueHookState {
  tasks: SessionTask[];
  isProcessing: boolean;
  activeTask: SessionTask | null;
  totalTokensUsed: number;
  dispatchPipeline: (
    payloads: QueueDispatchPayload[],
    onTaskComplete?: (result: QueueDispatchResult) => void,
    onPipelineComplete?: () => void
  ) => Promise<void>;
  clearQueue: () => void;
}

export function useQueue(): QueueHookState {
  const [tasks, setTasks] = useState<SessionTask[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTask, setActiveTask] = useState<SessionTask | null>(null);
  const [totalTokensUsed, setTotalTokensUsed] = useState(0);

  // Use a ref lock to guarantee strictly sequential execution (no double runs)
  const isRunningRef = useRef(false);

  const clearQueue = useCallback(() => {
    sessionManager.clear();
    setTasks([]);
    setActiveTask(null);
    setIsProcessing(false);
    isRunningRef.current = false;
  }, []);

  // Dispatch a full pipeline of tasks sequentially
  const dispatchPipeline = useCallback(
    async (
      payloads: QueueDispatchPayload[],
      onTaskComplete?: (result: QueueDispatchResult) => void,
      onPipelineComplete?: () => void
    ) => {
      if (isRunningRef.current) {
        console.warn("Queue is already executing a pipeline. Please wait for it to finish.");
        return;
      }

      isRunningRef.current = true;
      setIsProcessing(true);

      // Reset queue for this new pipeline run (Sprint Plan §2K: tokens and task queue reset per task)
      sessionManager.clear();
      setTotalTokensUsed(0);

      // 1. Enqueue all pipeline tasks into sessionManager
      sessionManager.enqueue(payloads);
      setTasks(sessionManager.getTasks());

      // 2. Execute tasks one by one in strict FIFO order
      while (true) {
        const nextTask = sessionManager.peekNext();
        if (!nextTask) {
          // No more pending tasks — pipeline complete!
          break;
        }

        // Mark task as currently running
        sessionManager.updateStatus(nextTask.taskId, "running");
        setActiveTask({ ...nextTask, status: "running" });
        setTasks(sessionManager.getTasks());

        try {
          // Send task to the Go systems engine over stdio
          const response = await engineBridge.send<QueueDispatchResult>("queue_dispatch", {
            taskId: nextTask.taskId,
            role: nextTask.role,
            stage: nextTask.stage,
            prompt: nextTask.prompt,
            filePaths: nextTask.filePaths,
            fileBoundaries: nextTask.fileBoundaries,
          });

          if (response.success && response.data) {
            const result = response.data;

            // Mark task as done
            sessionManager.updateStatus(nextTask.taskId, "done", result.output, result.tokensUsed);
            setTotalTokensUsed((prev) => prev + (result.tokensUsed || 0));
            setTasks(sessionManager.getTasks());

            if (onTaskComplete) {
              onTaskComplete(result);
            }
          } else {
            // Task failed
            const errorMsg = response.error || "Unknown execution error";
            sessionManager.updateStatus(nextTask.taskId, "error", errorMsg);
            setTasks(sessionManager.getTasks());
          }
        } catch (err: any) {
          sessionManager.updateStatus(nextTask.taskId, "error", err.message);
          setTasks(sessionManager.getTasks());
        }
      }

      // Finish pipeline
      setActiveTask(null);
      setIsProcessing(false);
      isRunningRef.current = false;

      if (onPipelineComplete) {
        onPipelineComplete();
      }
    },
    []
  );

  return {
    tasks,
    isProcessing,
    activeTask,
    totalTokensUsed,
    dispatchPipeline,
    clearQueue,
  };
}
