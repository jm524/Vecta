// Status:: in-progress
// Automated test script for testing the Go hardware scanner.
// Boots the engine and asks it to scan CPU, GPU, RAM, storage, power, and local AI servers.
// Run with: npx tsx src/test-scanner.ts

import { engineBridge } from "../bridge/client.js";
import type { HardwareScanResult } from "../types/bridge.js";

// runTest starts the engine, requests the hardware scan, and prints the findings.
async function runTest(): Promise<void> {
  console.log("Starting Vecta Go Engine...");
  engineBridge.start();

  console.log("\nSending hw_scan command...");
  
  try {
    const res = await engineBridge.send<HardwareScanResult>("hw_scan");
    if (res.success && res.data) {
      console.log("\n=== Hardware Scan Results ===");
      console.log(`OS: ${res.data.hardware.os} (${res.data.hardware.arch})`);
      console.log(`\nCPU: ${res.data.hardware.cpuModel || "Detected CPU"}`);
      console.log(`- Physical Cores: ${res.data.hardware.physicalCores}`);
      console.log(`- Logical Processors: ${res.data.hardware.logicalProcessors}`);
      console.log(`- Current Usage: ${res.data.hardware.cpuUsagePercent}%`);
      if (res.data.hardware.cpuL2CacheMb || res.data.hardware.cpuL3CacheMb) {
        const cacheParts: string[] = [];
        if (res.data.hardware.cpuL2CacheMb) {
          cacheParts.push(`L2: ${res.data.hardware.cpuL2CacheMb}`);
        }
        if (res.data.hardware.cpuL3CacheMb) {
          cacheParts.push(`L3: ${res.data.hardware.cpuL3CacheMb}`);
        }
        console.log(`- Hardware Cache: ${cacheParts.join(" | ")} (High-Speed Smart Cache)`);
      }
      const aiAcc = res.data.hardware.aiAcceleration || (res.data.hardware.hasAvx2 ? "AVX2 Supported (Ultra-fast quantized math)" : "Standard CPU (No AVX2)");
      console.log(`- AI Acceleration: ${aiAcc}`);

      console.log(`\nRAM & Virtual Memory:`);
      console.log(`- Physical Total: ${res.data.hardware.totalRamGb} | Available: ${res.data.hardware.freeRamGb} (${res.data.hardware.ramUsagePercent}% load)`);
      if (res.data.hardware.ramSpeedMhz && res.data.hardware.ramSpeedMhz > 0) {
        console.log(`- Memory Speed: ${res.data.hardware.ramSpeedMhz} MHz (High-Bandwidth)`);
      }
      const swapLabel = res.data.hardware.os === "windows" ? "Windows Pagefile" : "Swap Memory";
      console.log(`- ${swapLabel}: ${res.data.hardware.pagefileGb} allocated (Emergency spillover backup)`);

      console.log(`\nStorage (Disk & NVMe SSD):`);
      console.log(`- Free Space: ${res.data.hardware.freeDiskGb}`);
      console.log(`- Drive Model: ${res.data.hardware.diskModel || "Primary Drive"}`);
      console.log(`- Storage Type: ${res.data.hardware.diskType}`);
      console.log(`- NVMe SSD: ${res.data.hardware.isNvme ? "Yes (Ultra-fast model loading & mmap)" : "No (Standard storage)"}`);

      console.log(`\nPower Status:`);
      console.log(`- Source: ${res.data.hardware.powerSource}`);
      console.log(`- Battery: ${res.data.hardware.batteryPercent}%`);

      console.log(`\nDedicated Local AI Runners in PATH:`);
      if (res.data.hardware.installedClis && res.data.hardware.installedClis.length > 0) {
        console.log(`- Found: ${res.data.hardware.installedClis.join(", ")}`);
      } else {
        console.log(`- None found in PATH (Vecta will run models natively or connect to running servers)`);
      }

      console.log(`\nGPU(s) Detected:`);
      const apis = res.data.hardware.computeApis;
      if (res.data.hardware.gpus && res.data.hardware.gpus.length > 0) {
        res.data.hardware.gpus.forEach((gpu, idx) => {
          console.log(`  [GPU ${idx + 1}] ${gpu.name}`);
          console.log(`    - Category: ${gpu.type}`);
          console.log(`    - VRAM: ${gpu.vramMb > 0 ? gpu.vramMb + " MB" : "Shared / System Memory"}`);
          if (gpu.usedVramMb > 0) {
            console.log(`    - Used VRAM: ${gpu.usedVramMb} MB`);
          }
          console.log(`    - Utilization: ${gpu.usagePercent}%`);
          console.log(`    - Compute APIs: Vulkan (${apis.vulkan ? "Ready" : "N/A"}) | OpenCL (${apis.opencl ? "Ready" : "N/A"}) | DirectML (${apis.directml ? "Ready" : "N/A"}) | CUDA (${apis.cuda ? "Ready" : "N/A"})`);
          console.log(`    - Is NVIDIA: ${gpu.isNvidia ? "Yes (Dedicated AI Optimized)" : "No (System / Machine GPU)"}`);
        });
      } else {
        console.log(`  None detected (${res.data.hardware.gpuName})`);
      }

      console.log(`\nNPU (Neural Processing Unit):`);
      if (res.data.hardware.npuDetected) {
        console.log(`- Status: Detected (${res.data.hardware.npuName})`);
        console.log(`- Utilization: ${res.data.hardware.npuUsagePercent ?? 0}%`);
      } else {
        console.log(`- Status: Not detected`);
      }

      // Print runtime servers like Ollama or LM Studio.
      console.log("\n=== Detected Runtimes ===");
      res.data.runtimes.forEach(r => {
        console.log(`- ${r.name} (Port ${r.port}): ${r.running ? "[RUNNING]" : "[OFFLINE]"}`);
      });

      const modelsList = res.data.models || [];
      console.log(`\n=== Local Model Files (${modelsList.length} found) ===`);
      modelsList.slice(0, 5).forEach(m => {
        console.log(`- ${m.name} (${m.sizeMb} MB) [Runnable: ${m.runnable}]`);
        console.log(`  Path: ${m.path}`);
      });
      if (modelsList.length > 5) {
        console.log(`... and ${modelsList.length - 5} more.`);
      }
      
      console.log(`\nScanned at: ${res.data.scannedAt}`);
    } else {
      console.error("Scan failed:", res.error);
    }
  } catch (err) {
    console.error("Error communicating with engine:", err);
  } finally {
    engineBridge.stop();
  }
}

runTest();
