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

/** Details about an individual GPU detected */
export interface GPUInfo {
  name: string;
  type: string;
  vramMb: number;
  usedVramMb: number;
  usagePercent: number;
  isNvidia: boolean;
}

/** GPU compute translation layers supported for local AI */
export interface ComputeAPIs {
  vulkan: boolean;
  opencl: boolean;
  directml: boolean;
  cuda: boolean;
  metal: boolean;
}

/** Detected system hardware specs from Go scanner */
export interface HardwareInfo {
  totalRamBytes: number;
  totalRamGb: string;
  usedRamBytes: number;
  usedRamGb: string;
  freeRamBytes: number;
  freeRamGb: string;
  ramUsagePercent: number;
  pagefileBytes: number;
  pagefileGb: string;
  freeDiskBytes: number;
  freeDiskGb: string;
  diskType: string;
  isNvme: boolean;
  diskModel: string;
  gpuName: string;
  gpuType: string;
  gpuVramMb: number;
  gpuUsedVramMb: number;
  gpuUsagePercent: number;
  isNvidiaGpu: boolean;
  gpus: GPUInfo[];
  computeApis: ComputeAPIs;
  npuName: string;
  npuDetected: boolean;
  npuUsagePercent?: number;
  physicalCores: number;
  logicalProcessors: number;
  cpuCores: number;
  cpuModel: string;
  cpuUsagePercent: number;
  cpuL2CacheMb?: string;
  cpuL3CacheMb?: string;
  hasAvx2: boolean;
  aiAcceleration?: string;
  ramSpeedMhz?: number;
  powerSource: string;
  batteryPercent: number;
  isPluggedIn: boolean;
  installedClis: string[];
  os: string;
  arch: string;
}

/** A model detected in an active runtime server */
export interface RuntimeModel {
  name: string;
  id: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  sizeMb?: number;
  format?: string;
  currentlyRunning: boolean;
}

/** Status of a single AI runtime server */
export interface RuntimeStatus {
  name: string;
  port: number;
  running: boolean;
  models: RuntimeModel[];
}

/** A local model file found on disk */
export interface ModelFile {
  name: string;
  path: string;
  format: string;
  sizeMb: number;
  runnable: boolean;
}

/** A unified model entry merging active runtimes and local files */
export interface CatalogItem {
  id: string;
  name: string;
  source: "runtime" | "file" | "runtime + file";
  runtimeName?: string;
  path?: string;
  format: string;
  sizeMb: number;
  parameterSize?: string;
  quantization?: string;
  family?: string;
  runnable: boolean;
  running: boolean;
}

/** Full scan result returned by the hw_scan action */
export interface HardwareScanResult {
  hardware: HardwareInfo;
  runtimes: RuntimeStatus[];
  models: ModelFile[];
  catalog: CatalogItem[];
  scannedAt: string;
}

/** Payload for hw_scan allowing custom user model paths */
export interface HardwareScanPayload {
  customPaths?: string[];
}

export interface CryptoInitResult {
  keySet: boolean;
  vaultType: string;
}

export interface CryptoEncryptResult {
  ciphertext: string;
}

export interface CryptoDecryptResult {
  plaintext: string;
}

export interface CryptoSecretResult {
  key: string;
  value?: string;
  exists?: boolean;
  success: boolean;
}

/** Command requests sent from TypeScript to Go over stdin */
export type BridgeRequest =
  | { id: string; action: "ping"; payload?: Record<string, never> }
  | { id: string; action: "hw_scan"; payload?: HardwareScanPayload }
  | { id: string; action: "queue_dispatch"; payload: QueueDispatchPayload }
  | { id: string; action: "crypto_init"; payload?: Record<string, never> }
  | { id: string; action: "crypto_encrypt"; payload: { plaintext: string } }
  | { id: string; action: "crypto_decrypt"; payload: { ciphertext: string } }
  | { id: string; action: "crypto_store_secret"; payload: { key: string; value: string } }
  | { id: string; action: "crypto_get_secret"; payload: { key: string } }
  | { id: string; action: "crypto_has_secret"; payload: { key: string } }
  | { id: string; action: "crypto_delete_secret"; payload: { key: string } }
  | { id: string; action: "device_status"; payload?: Record<string, never> };

/** Response messages sent from Go to TypeScript over stdout */
export type BridgeResponse<T = unknown> = {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
};

