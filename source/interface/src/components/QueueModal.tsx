// Status:: complete
// Queue overlay — triggered by 'q' key or /queue command, displays full pipeline queue.
// Re-exports QueueView from commands/queue.tsx for modular architecture.

export { QueueView, QueueView as QueueModal, type QueueViewProps, type QueueViewProps as QueueModalProps } from "../commands/queue.js";
