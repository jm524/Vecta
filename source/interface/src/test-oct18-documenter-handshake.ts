// Automated test suite for Oct 18 Milestone (Day 15 / Step 5):
// Documenter full handshake + raw log write + manager-duties.json read/write.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  initManagerDuties,
  readManagerDuties,
  appendManagerContext,
  clearSessionDuties,
  getDutiesForFailsafe,
} from "../../state/manager-duties.js";

import {
  writeRelay,
  readRelay,
  clearRelay,
  isRelayConfirmedByDocumenter,
  getLastConfirmation,
} from "../../state/relay.js";

import {
  documenterPassiveCopy,
  getRawLogSize,
  getRawLogEntries,
  documenterOfficialTurn,
  parseLogfmt,
  getRawLogPath,
} from "../../roles/documenter.js";

import {
  formatRawLogCapDisplay,
  formatAutoDeleteDisplay,
  formatTimeoutDisplay,
} from "./commands/settings.js";

async function runTests() {
  console.log("Starting Oct 18 Documenter Handshake & Duties Test Suite...\n");

  const testBaseDir = path.join(os.tmpdir(), `vecta-test-oct18-${Date.now()}`);
  fs.mkdirSync(testBaseDir, { recursive: true });

  const testChatId = "chat_test_oct18";

  try {
    // -------------------------------------------------------------------------
    // TEST 1: manager-duties.json Initialization & Layer 1 Base Duties
    // -------------------------------------------------------------------------
    console.log("Test 1: manager-duties.json initialization...");
    const duties = await initManagerDuties(testChatId, testBaseDir);
    assert.strictEqual(duties.chatId, testChatId);
    assert.strictEqual(duties.layer1BaseDuties.length, 9, "Must contain all 9 canonical base duties");
    assert.strictEqual(duties.layer2SessionContext.length, 0, "Layer 2 starts empty");
    assert.ok(duties.layer1BaseDuties[0]?.includes("USER COMMUNICATION"));
    console.log("✓ Layer 1 base duties verified.");

    // -------------------------------------------------------------------------
    // TEST 2: manager-duties.json Layer 2 Context Appending & Compaction
    // -------------------------------------------------------------------------
    console.log("Test 2: manager-duties.json Layer 2 context appending...");
    await appendManagerContext(testChatId, "User prefers PostgreSQL and JWT auth", testBaseDir);
    await appendManagerContext(testChatId, "Backend Engineer completed auth router", testBaseDir);

    const withContext = await readManagerDuties(testChatId, testBaseDir);
    assert.strictEqual(withContext.layer2SessionContext.length, 2);
    assert.strictEqual(withContext.layer2SessionContext[0], "User prefers PostgreSQL and JWT auth");

    // Test Failsafe Briefing Generation
    const failsafeText = await getDutiesForFailsafe(testChatId, testBaseDir);
    assert.ok(failsafeText.includes("VECTA MANAGER DUTIES — AUTHORITATIVE FAILSAFE BRIEFING"));
    assert.ok(failsafeText.includes("LAYER 1: CORE PERMANENT DUTIES"));
    assert.ok(failsafeText.includes("LAYER 2: ACTIVE SESSION DISCOVERIES & CONTEXT"));
    assert.ok(failsafeText.includes("User prefers PostgreSQL and JWT auth"));
    console.log("✓ Layer 2 additions and failsafe briefing verified.");

    // Clear Layer 2 for new chat while preserving Layer 1
    const cleared = await clearSessionDuties(testChatId, testBaseDir);
    assert.strictEqual(cleared.layer2SessionContext.length, 0);
    assert.strictEqual(cleared.layer1BaseDuties.length, 9);
    console.log("✓ Layer 2 clearing with Layer 1 preservation verified.");

    // -------------------------------------------------------------------------
    // TEST 3: Documenter Passive Copy to raw.log & Audit Trail
    // -------------------------------------------------------------------------
    console.log("Test 3: Documenter passive copy & raw.log write...");
    const confirmation = await documenterPassiveCopy(
      testChatId,
      {
        case: "role_output",
        role: "Coder",
        task: "Implement LoginForm.tsx",
        output: "Built LoginForm component with email validation and error styling",
        files_touched: ["source/interface/src/components/LoginForm.tsx"],
        timestamp: new Date().toISOString(),
      },
      testBaseDir
    );

    assert.strictEqual(confirmation.status, "confirmed");
    assert.strictEqual(confirmation.entryCase, "role_output");
    assert.ok(confirmation.bytesWritten > 0);
    assert.ok(confirmation.auditSummary.includes("Coder touched"));

    const rawSize = await getRawLogSize(testChatId, testBaseDir);
    assert.ok(rawSize > 0, "raw.log must have positive size on disk");

    const entries = await getRawLogEntries(testChatId, testBaseDir);
    assert.strictEqual(entries.length, 1);
    assert.ok(entries[0]?.includes("role=Coder"));
    assert.ok(entries[0]?.includes("files="));
    assert.ok(entries[0]?.includes("LoginForm.tsx"));

    // Verify logfmt parsing
    const parsed = parseLogfmt(entries[0] || "");
    assert.strictEqual(parsed.role, "Coder");
    assert.strictEqual(parsed.level, "audit");
    assert.strictEqual(parsed.case, "role_output");
    assert.strictEqual(parsed.task, "Implement LoginForm.tsx");
    assert.strictEqual(parsed.files, "source/interface/src/components/LoginForm.tsx");
    assert.ok(parsed.summary?.includes("LoginForm component"));
    console.log("✓ Documenter passive copy, logfmt formatting, and parsing verified.");

    // -------------------------------------------------------------------------
    // TEST 4: task-relay.tmp Full Handshake Protocol
    // -------------------------------------------------------------------------
    console.log("Test 4: task-relay.tmp full Documenter handshake...");
    const handoffConf = await writeRelay(
      testChatId,
      {
        case: "role_output",
        role: "Backend Engineer",
        task: "Create JWT token verification middleware",
        output: "Implemented verifyToken middleware in auth.go with HMAC validation",
        files_touched: ["source/engine/auth.go"],
        timestamp: new Date().toISOString(),
      },
      testBaseDir
    );

    assert.strictEqual(handoffConf.status, "confirmed");
    assert.strictEqual(isRelayConfirmedByDocumenter(testChatId), true);
    assert.strictEqual(getLastConfirmation(testChatId)?.status, "confirmed");

    const activeRelay = await readRelay(testChatId, testBaseDir);
    assert.ok(activeRelay);
    assert.strictEqual(activeRelay?.case, "role_output");

    // Manager clears relay file after Documenter confirmation
    const clearResult = await clearRelay(testChatId, testBaseDir);
    assert.strictEqual(clearResult, true);

    const clearedRelay = await readRelay(testChatId, testBaseDir);
    assert.strictEqual(clearedRelay, null, "Relay file must be removed after clear");
    assert.strictEqual(isRelayConfirmedByDocumenter(testChatId), false);
    console.log("✓ Full Documenter handshake and relay clear verified.");

    // -------------------------------------------------------------------------
    // TEST 5: Handshake Enforcement (Cannot Clear If Unconfirmed)
    // -------------------------------------------------------------------------
    console.log("Test 5: Handshake security rule enforcement...");
    // Manually create a relay file without Documenter confirmation
    const relayPath = path.join(testBaseDir, "chats", testChatId, "task-relay.tmp");
    fs.writeFileSync(relayPath, JSON.stringify({ case: "role_output" }), "utf8");

    let threwAsExpected = false;
    try {
      await clearRelay(testChatId, testBaseDir);
    } catch (err: any) {
      threwAsExpected = true;
      assert.ok(err.message.includes("Documenter handshake not confirmed"));
    }
    assert.strictEqual(threwAsExpected, true, "clearRelay must reject unconfirmed handshake");
    console.log("✓ Handshake security check correctly prevented clearing unconfirmed relay.");

    // -------------------------------------------------------------------------
    // TEST 6: Documenter Official Turn
    // -------------------------------------------------------------------------
    console.log("Test 6: Documenter official turn summary...");
    const officialSummary = await documenterOfficialTurn(
      testChatId,
      "Add login form and token middleware",
      "Coder -> Backend Engineer -> Documenter",
      testBaseDir
    );
    assert.ok(officialSummary.includes("Audit trail recorded to raw_"));
    assert.ok(officialSummary.includes("Add login form and token middleware"));
    console.log("✓ Documenter official turn output verified.");

    // -------------------------------------------------------------------------
    // TEST 7: Settings Custom Value Unit Conversion (1024MB -> 1GB)
    // -------------------------------------------------------------------------
    console.log("Test 7: Settings unit conversion formatters...");
    assert.strictEqual(formatRawLogCapDisplay(1024), "1 GB (Ring buffer)");
    assert.strictEqual(formatRawLogCapDisplay(2048), "2 GB (Ring buffer)");
    assert.strictEqual(formatRawLogCapDisplay(256), "256 MB (Ring buffer)");
    assert.strictEqual(formatRawLogCapDisplay(0.5), "512 KB (Ring buffer)");

    assert.strictEqual(formatAutoDeleteDisplay(0), "Disabled (Never auto-delete)");
    assert.strictEqual(formatAutoDeleteDisplay(1), "1 week inactivity");
    assert.strictEqual(formatAutoDeleteDisplay(2), "2 weeks inactivity");
    assert.strictEqual(formatAutoDeleteDisplay(1 / 7), "1 day inactivity");
    assert.strictEqual(formatAutoDeleteDisplay(3 / 7), "3 days inactivity");

    assert.strictEqual(formatTimeoutDisplay(30), "30 seconds");
    assert.strictEqual(formatTimeoutDisplay(300), "5 minutes");
    assert.strictEqual(formatTimeoutDisplay(3600), "1 hour");
    assert.strictEqual(formatTimeoutDisplay(7200), "2 hours");
    console.log("✓ Settings conversions and formatters verified.");

    console.log("\n========================================================");
    console.log("ALL OCT 18 DOCUMENTER, LOGFMT & SETTINGS TESTS PASSED (7/7)!");
    console.log("========================================================\n");
  } finally {
    try {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runTests();
