// Automated test suite for Day 17 (Oct 20) milestone:
// Log Compaction, Ring-Buffer Eviction & Inactivity Auto-Delete Pruning.
// Strictly tests Claude Doc 14, Sprint Plan §2E, §2H, §2I, and user specifications:
// - Rolling 350-word cap compaction to summary.json (oldest pruned from beginning, newest preserved)
// - Ring-buffer size cap eviction on raw.log (oldest lines dropped from top)
// - Inactivity auto-delete prunes raw.log while permanently preserving summary.json and Key Points
// - Timer resets ONLY on message send or Documenter logging, NOT on chat select/open

import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  documenterCompactToSummary,
  enforceRawLogRingBuffer,
  pruneInactiveRawLogs,
  documenterPassiveCopy,
  getRawLogPath,
  getRawLogSize,
  getRawLogEntries,
  documenterOfficialTurn,
} from "../../../roles/documenter.js";
import {
  getChatSummary,
  saveChatSummary,
  countWords,
  truncateOldestWords,
} from "../../../state/memory.js";
import { ChatService } from "../services/chat-service.js";

async function runTests() {
  console.log("=== Running Day 17 (Oct 20) Compaction & Pruning Test Suite ===\n");
  const testBase = path.join(os.tmpdir(), `vecta-test-oct20-${Date.now()}`);
  fs.mkdirSync(testBase, { recursive: true });

  try {
    // -------------------------------------------------------------------------
    // Test 1: Rolling Compaction to summary.json under 350-word Cap
    // -------------------------------------------------------------------------
    console.log("[Test 1] Testing rolling compaction to summary.json under 350-word cap...");
    const chatId1 = "chat_test1_compaction";
    const chatDir1 = path.join(testBase, "chats", chatId1);
    fs.mkdirSync(chatDir1, { recursive: true });

    // Initialize initial chat summary with permanent Key Points
    const initialSummary = {
      chatId: chatId1,
      keyPoints: [
        "Architectural decision: Use SQLite with WAL mode",
        "Security rule: Zero cloud telemetry",
      ],
      narrative: "Initial discussion: team agreed on local-first architecture.",
      updatedAt: new Date().toISOString(),
    };
    saveChatSummary(initialSummary, testBase);

    // Passively log 3 tasks through Documenter
    await documenterPassiveCopy(
      chatId1,
      {
        case: "role_output",
        role: "Coder",
        task: "Build auth routes in Go",
        output: "Created POST /login and POST /register with bcrypt hashing",
        files_touched: ["source/engine/auth.go"],
        timestamp: new Date().toISOString(),
      },
      testBase
    );

    await documenterPassiveCopy(
      chatId1,
      {
        case: "role_output",
        role: "Code Reviewer",
        task: "Review password salt length",
        output: "Salt length approved at 16 bytes",
        files_touched: ["source/engine/auth.go"],
        timestamp: new Date().toISOString(),
      },
      testBase
    );

    // Compact task chunk into summary.json
    const compacted1 = await documenterCompactToSummary(chatId1, testBase);
    assert.ok(compacted1.narrative.includes("Coder"), "Compacted narrative must reference Coder");
    assert.strictEqual(compacted1.keyPoints.length, 2, "Key Points must be preserved untouched");
    console.log("  Compacted 2 raw entries into summary.json narrative.");

    // Now append a large narrative chunk that exceeds 350 words to verify rolling pruning
    const longWords: string[] = [];
    for (let i = 1; i <= 400; i++) {
      longWords.push(`WordEntry${i}`);
    }
    const longChunk = longWords.join(" ");

    const compactedRolling = await documenterCompactToSummary(
      chatId1,
      testBase,
      `Major sprint milestone: ${longChunk}`
    );

    const wordCount = countWords(compactedRolling.narrative);
    assert.ok(
      wordCount <= 350,
      `Compacted narrative word count (${wordCount}) must strictly be <= 350 words`
    );

    // Verify rolling eviction: the oldest entries were dropped from the beginning,
    // and the newest words (e.g. WordEntry390-WordEntry400) are preserved!
    assert.ok(
      compactedRolling.narrative.includes("WordEntry400"),
      "Newest entries must be preserved at the end of summary narrative"
    );
    assert.ok(
      !compactedRolling.narrative.includes("WordEntry1 "),
      "Oldest entries must be evicted from the beginning of summary narrative"
    );
    // Key points must remain 100% intact
    assert.strictEqual(compactedRolling.keyPoints.length, 2, "Key points must never be evicted");
    console.log(`  Rolling 350-word cap verified: narrative clamped to ${wordCount} words.`);
    console.log("  Oldest words evicted from beginning, newest words preserved, Key Points intact.");
    console.log("[Test 1] Passed!\n");

    // -------------------------------------------------------------------------
    // Test 2: Ring-Buffer Eviction for raw.log under Size Cap
    // -------------------------------------------------------------------------
    console.log("[Test 2] Testing ring-buffer size cap eviction on raw.log...");
    const chatId2 = "chat_test2_ringbuffer";
    const chatDir2 = path.join(testBase, "chats", chatId2);
    fs.mkdirSync(chatDir2, { recursive: true });

    // Write 25 encrypted lines to raw.log
    for (let i = 1; i <= 25; i++) {
      await documenterPassiveCopy(
        chatId2,
        {
          case: "role_output",
          role: "Coder",
          task: `Batch task number ${i} execution with detailed file change list`,
          output: `Detailed result of building component batch item ${i} with mock payload verification`,
          files_touched: [`source/file_${i}.ts`, `source/engine/file_${i}.go`],
          timestamp: new Date().toISOString(),
        },
        testBase
      );
    }

    const rawSizeBefore = await getRawLogSize(chatId2, testBase);
    console.log(`  Initial raw.log size: ${rawSizeBefore} bytes (25 encrypted entries).`);
    assert.ok(rawSizeBefore > 1000, "Raw log should contain multiple KB of encrypted data");

    // Enforce ring-buffer eviction with a small cap: 0.003 MB (~3145 bytes)
    const capMB = 0.003;
    const ringResult = await enforceRawLogRingBuffer(chatId2, testBase, capMB);
    console.log(
      `  Evicted ${ringResult.evictedLines} oldest lines (${ringResult.bytesPruned} bytes pruned). Current size: ${ringResult.currentSize} bytes.`
    );

    assert.ok(ringResult.evictedLines > 0, "Must have evicted oldest lines");
    assert.ok(
      ringResult.currentSize <= Math.floor(capMB * 1024 * 1024),
      "Current size must be under the cap"
    );

    // Verify that the remaining entries can be decrypted and contain the newest entries
    const remainingDecrypted = await getRawLogEntries(chatId2, testBase);
    assert.ok(remainingDecrypted.length > 0, "Remaining entries must be readable");
    const lastEntry = remainingDecrypted[remainingDecrypted.length - 1]!;
    assert.ok(
      lastEntry.includes("batch item 25") || lastEntry.includes("Batch task number 25"),
      "Newest entries must remain at the bottom of the log"
    );
    console.log("  Newest entries confirmed intact after oldest lines evicted.");
    console.log("[Test 2] Passed!\n");

    // -------------------------------------------------------------------------
    // Test 3: Inactivity Auto-Delete Runner
    // -------------------------------------------------------------------------
    console.log("[Test 3] Testing inactivity auto-delete runner (Claude Doc 14 & Sprint Plan §2I)...");
    const chatService = new ChatService(testBase);

    // Create Chat A (inactive: last active 25 days ago, > 2 weeks cutoff)
    const chatA = chatService.createChat("Inactive Chat A");
    const date25DaysAgo = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString();
    const chatAFolder = path.join(testBase, "chats", chatA.id);
    const metaA = JSON.parse(fs.readFileSync(path.join(chatAFolder, "meta.json"), "utf8"));
    metaA.lastActiveAt = date25DaysAgo;
    metaA.updatedAt = date25DaysAgo;
    fs.writeFileSync(path.join(chatAFolder, "meta.json"), JSON.stringify(metaA, null, 2), "utf8");

    // Add summary.json and raw.log to Chat A
    saveChatSummary(
      {
        chatId: chatA.id,
        keyPoints: ["Chat A permanent key point"],
        narrative: "Chat A summary narrative that must survive deletion.",
        updatedAt: date25DaysAgo,
      },
      testBase
    );
    await documenterPassiveCopy(
      chatA.id,
      {
        case: "role_output",
        role: "Coder",
        task: "Chat A raw task",
        output: "Chat A output",
        files_touched: ["a.ts"],
        timestamp: date25DaysAgo,
      },
      testBase
    );

    // Simulate 25 days of inactivity passing since the last Documenter write
    metaA.lastActiveAt = date25DaysAgo;
    metaA.updatedAt = date25DaysAgo;
    fs.writeFileSync(path.join(chatAFolder, "meta.json"), JSON.stringify(metaA, null, 2), "utf8");

    // Create Chat B (active: last active 2 days ago, < 2 weeks cutoff)
    const chatB = chatService.createChat("Active Chat B");
    const date2DaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const chatBFolder = path.join(testBase, "chats", chatB.id);
    const metaB = JSON.parse(fs.readFileSync(path.join(chatBFolder, "meta.json"), "utf8"));
    metaB.lastActiveAt = date2DaysAgo;
    metaB.updatedAt = date2DaysAgo;
    fs.writeFileSync(path.join(chatBFolder, "meta.json"), JSON.stringify(metaB, null, 2), "utf8");

    await documenterPassiveCopy(
      chatB.id,
      {
        case: "role_output",
        role: "Coder",
        task: "Chat B active task",
        output: "Chat B active output",
        files_touched: ["b.ts"],
        timestamp: date2DaysAgo,
      },
      testBase
    );
    metaB.lastActiveAt = date2DaysAgo;
    metaB.updatedAt = date2DaysAgo;
    fs.writeFileSync(path.join(chatBFolder, "meta.json"), JSON.stringify(metaB, null, 2), "utf8");

    // Verify both raw logs exist before pruning
    const rawPathA = getRawLogPath(chatA.id, testBase);
    const rawPathB = getRawLogPath(chatB.id, testBase);
    assert.ok(fs.existsSync(rawPathA), "Chat A raw log must exist before pruning");
    assert.ok(fs.existsSync(rawPathB), "Chat B raw log must exist before pruning");

    // Run inactivity pruning with 2 weeks threshold (default)
    const prunedIds = await pruneInactiveRawLogs(testBase, 2);
    console.log(`  Pruned chat IDs: ${prunedIds.join(", ")}`);

    // Verify Chat A raw.log was pruned
    assert.ok(!fs.existsSync(rawPathA), "Chat A raw log must be deleted after inactivity prune");
    assert.ok(prunedIds.includes(chatA.id), "Chat A must be in prunedIds list");

    // Verify Chat A summary.json, Key Points, and meta.json STILL EXIST (Claude Doc 14)
    const summaryAAfter = getChatSummary(chatA.id, testBase);
    assert.strictEqual(
      summaryAAfter.keyPoints[0],
      "Chat A permanent key point",
      "Summary Key Points must survive raw log deletion"
    );
    assert.ok(
      summaryAAfter.narrative.includes("Chat A summary narrative"),
      "Summary narrative must survive raw log deletion"
    );
    assert.ok(fs.existsSync(path.join(chatAFolder, "meta.json")), "meta.json must survive");
    console.log("  Chat A raw log deleted while summary.json and Key Points 100% preserved.");

    // Verify Chat B raw.log was NOT pruned (still active)
    assert.ok(fs.existsSync(rawPathB), "Chat B raw log must NOT be deleted (recently active)");
    assert.ok(!prunedIds.includes(chatB.id), "Chat B must not be in prunedIds list");
    console.log("  Chat B raw log preserved (within 2-week active window).");

    // Test autoDeleteWeeks = 0 (disabled: never delete)
    // Recreate a raw log in Chat A and run with weeks = 0
    await documenterPassiveCopy(
      chatA.id,
      {
        case: "role_output",
        role: "Coder",
        task: "Chat A recreated task",
        output: "New raw log entry",
        files_touched: ["a2.ts"],
        timestamp: date25DaysAgo,
      },
      testBase
    );
    metaA.lastActiveAt = date25DaysAgo;
    fs.writeFileSync(path.join(chatAFolder, "meta.json"), JSON.stringify(metaA, null, 2), "utf8");
    const rawPathARecreated = getRawLogPath(chatA.id, testBase);
    assert.ok(fs.existsSync(rawPathARecreated), "Chat A fresh raw log created");

    const disabledPruned = await pruneInactiveRawLogs(testBase, 0);
    assert.strictEqual(disabledPruned.length, 0, "No chats should be pruned when autoDeleteWeeks is 0");
    assert.ok(fs.existsSync(rawPathARecreated), "Raw log preserved when auto-delete is disabled (0)");
    console.log("  Auto-delete disabled (0 weeks) verified: zero deletions.");
    console.log("[Test 3] Passed!\n");

    // -------------------------------------------------------------------------
    // Test 4: Timer Reset Rules (Message & Documenter only; NOT Chat Selection)
    // -------------------------------------------------------------------------
    console.log("[Test 4] Testing inactivity timer reset rules (User explicit rules)...");
    const chatC = chatService.createChat("Timer Test Chat");
    const oldTimestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const chatCFolder = path.join(testBase, "chats", chatC.id);

    // Set lastActiveAt to 10 days ago
    const metaC = JSON.parse(fs.readFileSync(path.join(chatCFolder, "meta.json"), "utf8"));
    metaC.lastActiveAt = oldTimestamp;
    fs.writeFileSync(path.join(chatCFolder, "meta.json"), JSON.stringify(metaC, null, 2), "utf8");

    // 4a: Selecting / reading the chat must NOT reset the timer
    const fetched = chatService.getChat(chatC.id);
    assert.ok(fetched !== null);
    const readMeta1 = JSON.parse(fs.readFileSync(path.join(chatCFolder, "meta.json"), "utf8"));
    assert.strictEqual(
      readMeta1.lastActiveAt,
      oldTimestamp,
      "Opening/selecting chat must NOT reset lastActiveAt timer"
    );
    console.log("  Rule verified: Opening/reading chat does NOT reset the inactivity timer.");

    // 4b: Sending a message resets the timer
    chatService.saveChatMessages(chatC.id, [
      {
        id: "msg1",
        sender: "User",
        text: "Building new feature",
        timestamp: "12:00",
      },
    ]);
    const readMeta2 = JSON.parse(fs.readFileSync(path.join(chatCFolder, "meta.json"), "utf8"));
    assert.notStrictEqual(
      readMeta2.lastActiveAt,
      oldTimestamp,
      "Sending a message MUST reset lastActiveAt timer"
    );
    const messageResetTime = new Date(readMeta2.lastActiveAt).getTime();
    assert.ok(
      Date.now() - messageResetTime < 5000,
      "lastActiveAt must be set to current time on message send"
    );
    console.log("  Rule verified: Sending a message resets the inactivity timer.");

    // 4c: Documenter logging or compaction resets the timer
    // Manually push timer back again
    const midTimestamp = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    readMeta2.lastActiveAt = midTimestamp;
    fs.writeFileSync(path.join(chatCFolder, "meta.json"), JSON.stringify(readMeta2, null, 2), "utf8");

    await documenterPassiveCopy(
      chatC.id,
      {
        case: "role_output",
        role: "Coder",
        task: "Update duties",
        output: "Complete",
        files_touched: ["duties.ts"],
        timestamp: new Date().toISOString(),
      },
      testBase
    );
    const readMeta3 = JSON.parse(fs.readFileSync(path.join(chatCFolder, "meta.json"), "utf8"));
    assert.notStrictEqual(
      readMeta3.lastActiveAt,
      midTimestamp,
      "Documenter logging MUST reset lastActiveAt timer"
    );
    console.log("  Rule verified: Documenter logging resets the inactivity timer.");
    console.log("[Test 4] Passed!\n");

    // -------------------------------------------------------------------------
    // Test 5: Documenter Official Turn with Automatic Task Chunk Compaction
    // -------------------------------------------------------------------------
    console.log("[Test 5] Testing Documenter official turn auto-compaction...");
    const chatId5 = "chat_test5_official_turn";
    const turnSummary = await documenterOfficialTurn(
      chatId5,
      "Deploy authentication microservice",
      "Coder -> Code Reviewer -> Security Checker",
      testBase
    );
    assert.ok(turnSummary.includes("Audit trail recorded"), "Official turn must include audit note");
    assert.ok(turnSummary.includes("Deploy authentication microservice"), "Official turn must include task");

    // Verify summary.json was automatically created and updated by documenterOfficialTurn
    const summary5 = getChatSummary(chatId5, testBase);
    assert.ok(
      summary5.narrative.includes("Deploy authentication microservice"),
      "summary.json narrative must contain the official turn task chunk"
    );
    console.log("  Documenter official turn automatically compacted task chunk to summary.json.");
    console.log("[Test 5] Passed!\n");

    console.log("========================================================");
    console.log("ALL DAY 17 (OCT 20) COMPACTION & PRUNING TESTS PASSED (5/5)!");
    console.log("========================================================\n");
  } finally {
    // Cleanup temporary test directory
    try {
      fs.rmSync(testBase, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
