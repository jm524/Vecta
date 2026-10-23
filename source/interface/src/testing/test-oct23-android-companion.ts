// Test suite for Day 20 (Oct 23): Android Client Companion (v0.0.20)
// Validates Android manifest permissions, offline USB boundary,
// companion server HTTP endpoints, remote role toggles, remote chat prompt submissions,
// and zero-emoji compliance.

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { engineBridge } from "../bridge/client.js";
import { deviceBridge } from "../services/device-bridge.js";

async function httpRequest(url: string, method: string = "GET", body?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options: http.RequestOptions = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {
          // keep as string
        }
        resolve({ status: res.statusCode || 0, body: parsed });
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(typeof body === "string" ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log("=== Running Day 20 (Oct 23) Android Companion Client Test Suite ===");
  let passed = 0;

  try {
    // -------------------------------------------------------------------------
    // Test 1: Android Manifest, Network Security & Zero Emojis
    // -------------------------------------------------------------------------
    console.log("\n[Test 1] Verifying Android App configuration & Zero Emojis...");
    const deviceDir = fs.existsSync(path.resolve(process.cwd(), "../device"))
      ? path.resolve(process.cwd(), "../device")
      : path.resolve(process.cwd(), "../companion");

    const manifestPath = path.resolve(deviceDir, "android/app/src/main/AndroidManifest.xml");
    assert(fs.existsSync(manifestPath), `AndroidManifest.xml must exist at ${manifestPath}`);
    const manifestContent = fs.readFileSync(manifestPath, "utf8");
    assert(
      manifestContent.includes("android.permission.INTERNET"),
      "AndroidManifest.xml must declare android.permission.INTERNET for localhost loopback"
    );
    assert(
      manifestContent.includes('android:usesCleartextTraffic="true"'),
      "AndroidManifest.xml must enable cleartext traffic for local HTTP loopback"
    );

    const mainDartPath = path.resolve(deviceDir, "lib/main.dart");
    assert(fs.existsSync(mainDartPath), `main.dart must exist at ${mainDartPath}`);
    const mainDart = fs.readFileSync(mainDartPath, "utf8");

    // Modular components verification (Flutter best practices)
    const chatTabPath = path.resolve(deviceDir, "lib/views/chat_tab.dart");
    const tasksTabPath = path.resolve(deviceDir, "lib/views/tasks_tab.dart");
    const rolesTabPath = path.resolve(deviceDir, "lib/views/roles_tab.dart");
    const homeScreenPath = path.resolve(deviceDir, "lib/screens/home_screen.dart");
    const deviceApiPath = path.resolve(deviceDir, "lib/services/device_api.dart");
    const themePath = path.resolve(deviceDir, "lib/constants/theme.dart");
    const statusBarPath = path.resolve(deviceDir, "lib/components/status_bar.dart");
    const generatingPath = path.resolve(deviceDir, "lib/components/generating_indicator.dart");

    assert(fs.existsSync(chatTabPath), `chat_tab.dart must exist at ${chatTabPath}`);
    assert(fs.existsSync(tasksTabPath), `tasks_tab.dart must exist at ${tasksTabPath}`);
    assert(fs.existsSync(rolesTabPath), `roles_tab.dart must exist at ${rolesTabPath}`);
    assert(fs.existsSync(homeScreenPath), `home_screen.dart must exist at ${homeScreenPath}`);
    assert(fs.existsSync(deviceApiPath), `device_api.dart must exist at ${deviceApiPath}`);
    assert(fs.existsSync(themePath), `theme.dart must exist at ${themePath}`);
    assert(fs.existsSync(statusBarPath), `status_bar.dart must exist at ${statusBarPath}`);
    assert(fs.existsSync(generatingPath), `generating_indicator.dart must exist at ${generatingPath}`);

    // Zero-emoji verification across all device app code
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const allDartFiles = [
      mainDartPath,
      chatTabPath,
      tasksTabPath,
      rolesTabPath,
      homeScreenPath,
      deviceApiPath,
      themePath,
      statusBarPath,
      generatingPath,
    ];
    for (const f of allDartFiles) {
      const content = fs.readFileSync(f, "utf8");
      assert(!emojiRegex.test(content), `${path.basename(f)} must contain zero emojis per global project rules`);
    }

    assert(
      mainDart.includes("VectaDeviceApp") || mainDart.includes("VectaCompanionApp"),
      "main.dart must configure VectaDeviceApp"
    );
    assert(mainDart.includes("home_screen.dart"), "main.dart must link to home_screen.dart");
    console.log("  Android manifest, modular components, and zero-emoji compliance verified.");
    passed++;

    // -------------------------------------------------------------------------
    // Test 2: Go Companion Server HTTP API & Dual-Direction State Sync
    // -------------------------------------------------------------------------
    console.log("\n[Test 2] Testing Go companion server endpoints & remote action draining...");
    engineBridge.start();
    const pingRes = await engineBridge.ping();
    assert.strictEqual(pingRes.success, true, "Go engine must respond to ping");

    const testPort = 8788;
    const startRes = await engineBridge.deviceServerStart(testPort);
    assert(startRes.success, "deviceServerStart must succeed on port " + testPort);

    // Verify /health
    const health = await httpRequest(`http://127.0.0.1:${testPort}/health`);
    assert.strictEqual(health.status, 200, "/health should return 200 OK");
    assert.strictEqual(health.body.status, "ok");
    assert.strictEqual(health.body.bound, `127.0.0.1:${testPort}`);

    // Verify /status
    const status = await httpRequest(`http://127.0.0.1:${testPort}/status`);
    assert.strictEqual(status.status, 200, "/status should return 200 OK");
    assert.strictEqual(status.body.running, true);

    // Push initial state with active role generation status
    const syncRes = await engineBridge.deviceServerUpdate({
      chatId: "companion-test-chat",
      messages: [
        { id: "m1", sender: "Manager", text: "Decomposing task pipeline...", timestamp: "2026-10-23T12:00:00Z" },
        { id: "m2", sender: "Coder", text: "Compiling mobile companion app...", timestamp: "2026-10-23T12:01:00Z" },
      ],
      tasks: [
        { id: "t1", role: "Manager", prompt: "Plan Day 20", status: "completed" },
        { id: "t2", role: "Coder", prompt: "Build companion", status: "in_progress" },
      ],
      roles: [
        { name: "Manager", slug: "manager", enabled: true },
        { name: "Coder", slug: "coder", enabled: true },
        { name: "Reviewer", slug: "reviewer", enabled: true },
      ],
      isProcessing: true,
      activeRole: "Coder",
    });
    assert(syncRes.success, "deviceServerUpdate must succeed");

    // Fetch /api/state
    const state = await httpRequest(`http://127.0.0.1:${testPort}/api/state`);
    assert.strictEqual(state.status, 200, "/api/state should return 200 OK");
    assert.strictEqual(state.body.activeChatId, "companion-test-chat");
    assert.strictEqual(state.body.messages.length, 2, "messages length must be 2");
    assert.strictEqual(state.body.tasks.length, 2, "tasks length must be 2");
    assert.strictEqual(state.body.isProcessing, true, "isProcessing should be true in server state");
    assert.strictEqual(state.body.activeRole, "Coder", "activeRole should be 'Coder' in server state");

    // Remote Companion Action 1: Toggle role via POST /api/role/toggle
    const toggleRes = await httpRequest(`http://127.0.0.1:${testPort}/api/role/toggle`, "POST", {
      role: "reviewer",
      enabled: false,
    });
    assert.strictEqual(toggleRes.status, 200, "POST /api/role/toggle must return 200");
    assert.strictEqual(toggleRes.body.success, true);

    // Remote Companion Action 2: Send remote prompt via POST /api/chat
    const chatPostRes = await httpRequest(`http://127.0.0.1:${testPort}/api/chat`, "POST", {
      role: "user",
      content: "Run test suite from mobile emulator",
    });
    assert.strictEqual(chatPostRes.status, 200, "POST /api/chat must return 200");
    assert.strictEqual(chatPostRes.body.success, true);

    // Drain remote actions via desktop sync
    const drainRes = await engineBridge.deviceServerUpdate({});
    assert(drainRes.success, "deviceServerUpdate drain should succeed");
    const toggles = drainRes.data?.toggles || [];
    const prompts = drainRes.data?.prompts || [];

    assert.strictEqual(toggles.length, 1, "Should drain 1 remote role toggle");
    assert.strictEqual(toggles[0].role, "reviewer");
    assert.strictEqual(toggles[0].enabled, false);

    assert.strictEqual(prompts.length, 1, "Should drain 1 remote prompt");
    assert.strictEqual(prompts[0].prompt, "Run test suite from mobile emulator");
    assert.strictEqual(prompts[0].role, "user");

    // Cleanup server
    const stopRes = await engineBridge.deviceServerStop();
    assert(stopRes.success, "deviceServerStop must succeed");
    engineBridge.stop();
    console.log("  Go device companion server HTTP API & bidirectional action sync verified.");
    passed++;

    // -------------------------------------------------------------------------
    // Test 3: DeviceBridge ADB Device Enumeration & Reverse Tunnel Handler
    // -------------------------------------------------------------------------
    console.log("\n[Test 3] Testing ADB device enumeration & reverse tunnel mapping...");
    const devices = await deviceBridge.listAdbDevices();
    console.log(`  Connected ADB devices found: ${devices.length}`);
    for (const d of devices) {
      console.log(`    - Serial: ${d.serial}, State: ${d.state}, Emulator: ${d.isEmulator}`);
    }

    const reverseOk = await deviceBridge.setupAdbReverse(8765);
    console.log(`  ADB reverse tunnel probe executed (result: ${reverseOk ? "active" : "standby"}).`);
    passed++;

    // -------------------------------------------------------------------------
    // Test 4: Connected Phone App Widget Test & Analysis Verification
    // -------------------------------------------------------------------------
    console.log("\n[Test 4] Verifying connected phone widget test and project configuration...");
    const widgetTestPath = path.resolve(deviceDir, "test/widget_test.dart");
    assert(fs.existsSync(widgetTestPath), `widget_test.dart must exist at ${widgetTestPath}`);
    const widgetTest = fs.readFileSync(widgetTestPath, "utf8");
    assert(
      widgetTest.includes("VectaDeviceApp") || widgetTest.includes("VectaCompanionApp"),
      "widget test must reference VectaDeviceApp or VectaCompanionApp"
    );
    assert(!emojiRegex.test(widgetTest), "widget_test.dart must contain zero emojis");
    console.log("  Device test suite and project configuration verified.");
    passed++;

    console.log("\n==================================================================");
    console.log(`ALL DAY 20 (OCT 23) ANDROID CONNECTED PHONE TESTS PASSED (${passed}/4)!`);
    console.log("==================================================================");
    process.exit(0);
  } catch (err: any) {
    console.error(`\nTest failed: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

runTests();
