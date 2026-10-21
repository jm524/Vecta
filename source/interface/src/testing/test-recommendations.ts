// npx tsx src/test-recommendations.ts
// Status:: in-progress
// Automated test script for hardware recommendations.
// Tests the Go engine hardware scan, runtime probe, and recommendation engine.
// Evaluates only real models found on the user's computer.
// If zero models exist, it displays a wide range of starter models matching the Recommendation Range.
// Shows the download command and online source URL for every recommendation.
// Contains zero emojis and uses clean CLI text badges.

import { engineBridge } from "../bridge/client.js";
import type { HardwareScanResult } from "../types/bridge.js";
import { generateRecommendations } from "../services/recommendation.js";

// runTest boots the engine, performs a live scan, and prints recommendations.
async function runTest(): Promise<void> {
  console.log("=================================================");
  console.log("   VECTA: RUNTIME MODELS & RECOMMENDATIONS");
  console.log("=================================================");

  // Step 1: Start the Go background engine.
  console.log("\n[1/4] Starting Vecta Go Engine...");
  engineBridge.start();

  try {
    // Step 2: Request live hardware and runtime scan from Go engine over stdio.
    console.log("[2/4] Executing live hardware & runtime scan...");
    const res = await engineBridge.send<HardwareScanResult>("hw_scan");

    if (!res.success || !res.data) {
      console.error("Scan failed:", res.error);
      return;
    }

    const { hardware, runtimes, models, catalog } = res.data;

    console.log(`[+] Live Scan Complete:`);
    console.log(`    CPU: ${hardware.cpuModel} (${hardware.physicalCores} Cores, ${hardware.logicalProcessors} Threads, AVX2: ${hardware.hasAvx2})`);
    console.log(`    RAM: ${hardware.totalRamGb} Total | ${hardware.freeRamGb} Free (${hardware.ramUsagePercent}% load) | Pagefile: ${hardware.pagefileGb}`);
    console.log(`    GPU: ${hardware.gpuName} (${hardware.gpuType}) | Vulkan: ${hardware.computeApis.vulkan} | DirectML: ${hardware.computeApis.directml}`);
    console.log(`    Power: ${hardware.powerSource} (${hardware.batteryPercent}%)`);
    console.log(`    Storage: ${hardware.freeDiskGb} free (${hardware.diskType}, NVMe: ${hardware.isNvme})`);

    // Step 3: Print active runtime server ports.
    console.log("\n[3/4] Active Runtimes & Discovered Models:");
    runtimes.forEach((rt) => {
      console.log(`    - ${rt.name} (Port ${rt.port}): ${rt.running ? "[RUNNING]" : "[OFFLINE]"}`);
      if (rt.models && rt.models.length > 0) {
        rt.models.forEach((m) => {
          console.log(`        └─ ${m.name} (${m.parameterSize || "N/A"}, ${m.quantization || "N/A"}) - Running: ${m.currentlyRunning}`);
        });
      }
    });

    const diskModels = models || [];
    const catalogItems = catalog || [];

    console.log(`\n    Local On-Disk Models: ${diskModels.length} found`);
    console.log(`    Merged Catalog Items: ${catalogItems.length} items`);

    // Step 4: Run the recommendation engine on the real catalog.
    // If 0 models exist, it provides the wide-range starter catalog with commands and sources.
    console.log("\n[4/4] Running Recommendation Engine...");
    const report = await generateRecommendations(hardware, catalogItems);

    console.log("\n=================================================");
    console.log(`   ${report.recommendationRange.name.toUpperCase()}`);
    console.log("=================================================");
    console.log(`Summary: ${report.recommendationRange.summary}`);
    console.log(`Max Comfortable Model: ${report.recommendationRange.maxComfortableParams}`);
    console.log(`Max Tight Model: ${report.recommendationRange.maxTightParams}`);

    // Live System Advisories (Resource awareness & power).
    console.log("\n--- LIVE SYSTEM ADVISORIES ---");
    if (report.advisories.ramWarning) {
      console.log(`[RAM ADVISORY] ${report.advisories.ramWarning}`);
    } else {
      console.log(`[RAM ADVISORY] Ample RAM headroom available.`);
    }

    if (report.advisories.powerWarning) {
      console.log(`[POWER ADVISORY] ${report.advisories.powerWarning}`);
    } else {
      console.log(`[POWER ADVISORY] Connected to AC wall power.`);
    }

    console.log(`[GPU STATUS] ${report.advisories.gpuStatus}`);
    console.log(`[STORAGE STATUS] ${report.advisories.storageStatus}`);

    // If the user has local models, evaluate each one.
    if (report.evaluations.length > 0) {
      console.log("\n--- LOCAL MODEL FIT EVALUATIONS ---");
      report.evaluations.forEach((ev) => {
        const badge = `[${ev.rating}]`.padEnd(12);
        console.log(`${badge} ${ev.model.name.padEnd(26)} | Est RAM: ${(ev.estimatedRamMb / 1024).toFixed(1)} GB | Fit: ${ev.recommendedForRoles.join(", ")}`);
        console.log(`   Reason: ${ev.reason}`);
      });

      console.log("\n--- ROLE-SPECIFIC RECOMMENDATIONS ---");
      console.log(report.userControlNotice);
      console.log(`Recommended for Manager:    ${report.roleRecommendations.manager.map((m) => m.name).join(", ") || "No ideal match found"}`);
      console.log(`Recommended for Coder:      ${report.roleRecommendations.coder.map((m) => m.name).join(", ") || "No ideal match found"}`);
      console.log(`Recommended for Documenter: ${report.roleRecommendations.documenter.map((m) => m.name).join(", ") || "No ideal match found"}`);
    } else {
      console.log("\n--- LOCAL MODEL STATUS ---");
      console.log("[INFO] No local model files detected on disk or in running servers.");
      console.log(report.userControlNotice);
    }

    // Display the wide range of starter recommendations when 0 models exist.
    if (report.starterRecommendations.length > 0) {
      console.log("\n--- STARTER MODEL RECOMMENDATIONS ---");
      console.log(`Wide range of models matching your ${report.recommendationRange.category} profile:`);
      report.starterRecommendations.forEach((sm) => {
        console.log(`\n• [${sm.role}] ${sm.name} (${sm.parameterSize}, ~${(sm.ramRequirementMb / 1024).toFixed(1)} GB RAM)`);
        console.log(`  Reason: ${sm.reason}`);
        console.log(`  Pull Command:     ${sm.pullCommand}`);
        if (sm.setupCommand) {
          console.log(`  Setup & Pull (${hardware.os}): ${sm.setupCommand}`);
        }
        console.log(`  Online Source:    ${sm.sourceUrl}`);
      });
    }

    console.log("\n=================================================");
    console.log("   RECOMMENDATIONS VERIFICATION COMPLETE");
    console.log("=================================================");
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    // Step 5: Stop the Go engine subprocess cleanly.
    engineBridge.stop();
  }
}

// Execute the test script.
runTest();
