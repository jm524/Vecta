// Status:: in-progress
// Bridge types for JSON stdio IPC between TypeScript (interface) and Go (engine).
// Agent Context L102: JSON types live in one shared types file, mirrored exactly on the Go side.

/** Task dispatch payload sent to Go */
export interface QueueDispatchPayload {
  taskId: string;
  role: string;
  stage: number;
  prompt: string;
  filePaths: string[];
  fileBoundaries: string[];
}

/** Result returned from Go when a task execution completes */
export interface QueueDispatchResult {
  taskId: string;
  role: string;
  output: string;
  tokensUsed: number;
  completedAt: string;
}

/** Command requests sent from TypeScript to Go over stdin */
export type BridgeRequest =
  | { id: string; action: "ping"; payload?: Record<string, never> }
  | { id: string; action: "scan_hardware"; payload?: Record<string, never> }
  | { id: string; action: "scan_models"; payload?: { customPaths?: string[] } }
  | { id: string; action: "queue_dispatch"; payload: QueueDispatchPayload }
  | { id: string; action: "crypto_encrypt"; payload: { plaintext: string; keyId?: string } }
  | { id: string; action: "crypto_decrypt"; payload: { ciphertext: string; keyId?: string } }
  | { id: string; action: "device_status"; payload?: Record<string, never> };

/** Response messages sent from Go to TypeScript over stdout */
export type BridgeResponse<T = unknown> = {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
};
