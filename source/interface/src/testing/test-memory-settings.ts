// Automated verification test suite for Oct 17 milestone:
// Config state, Multi-tier memory engine, word limits, and Layer 2 toggles.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  readConfig,
  writeConfig,
  DEFAULT_CONFIG,
} from "../../../state/config.js";

import {
  getGlobalPreferences,
  addGlobalPreference,
  updateGlobalPreference,
  removeGlobalPreference,
  getScopeCCM,
  saveScopeCCM,
  addScopeKeyPoint,
  removeScopeKeyPoint,
  updateScopeNarrative,
  listMemoryScopes,
  listChatMemories,
  addChatKeyPoint,
  removeChatKeyPoint,
  updateChatKeyPoint,
  updateChatNarrative,
  getChatSummary,
  saveChatSummary,
  countWords,
  truncateWords,
} from "../../../state/memory.js";
import { ChatService } from "../services/chat-service.js";

function runTests() {
  console.log("Starting Oct 17 Memory & Settings Test Suite...\n");

  // Create isolated temp directory for test runs
  const testBaseDir = path.join(os.tmpdir(), `vecta-test-mem-${Date.now()}`);
  fs.mkdirSync(testBaseDir, { recursive: true });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Config Defaults & Self-Healing
    // -------------------------------------------------------------------------
    console.log("Test 1: Config initialization & defaults...");
    const cfg = readConfig(testBaseDir);
    assert.strictEqual(cfg.rawLogCapMB, 256, "Default raw log cap must be 256MB");
    assert.strictEqual(cfg.autoDeleteWeeks, 2, "Default auto-delete must be 2 weeks");
    assert.strictEqual(cfg.timeouts.roleTimeoutSeconds, 600, "Default timeout must be 600s");
    assert.strictEqual(cfg.tokenCaps.cap1, 10000, "Default token Cap 1 must be 10,000");
    assert.strictEqual(cfg.tokenCaps.cap2, 100000, "Default token Cap 2 must be 100,000");
    assert.strictEqual(cfg.layer2.confirmFileWrites, false, "Layer 2 confirmFileWrites defaults to false");
    console.log("✓ Config defaults verified.");

    // -------------------------------------------------------------------------
    // TEST 2: Config Mutation & Layer 2 Toggles
    // -------------------------------------------------------------------------
    console.log("Test 2: Config mutation...");
    const updatedCfg = writeConfig(
      {
        theme: "royal",
        rawLogCapMB: 512,
        layer2: {
          confirmFileWrites: true,
          rolesTalkDirectly: true,
          showRoleThinking: false,
        },
      },
      testBaseDir
    );
    assert.strictEqual(updatedCfg.theme, "royal");
    assert.strictEqual(updatedCfg.rawLogCapMB, 512);
    assert.strictEqual(updatedCfg.layer2.confirmFileWrites, true);
    assert.strictEqual(updatedCfg.layer2.rolesTalkDirectly, true);
    assert.strictEqual(updatedCfg.layer2.showRoleThinking, false);
    console.log("✓ Config mutations and Layer 2 toggles verified.");

    // -------------------------------------------------------------------------
    // TEST 3: Tier 1 Global Preferences
    // -------------------------------------------------------------------------
    console.log("Test 3: Tier 1 Global Preferences...");
    let prefs = getGlobalPreferences(testBaseDir);
    assert.strictEqual(prefs.length, 0, "Initial preferences should be empty");

    prefs = addGlobalPreference("Prefers minimal code comments", testBaseDir);
    prefs = addGlobalPreference("TypeScript strict mode always", testBaseDir);
    assert.strictEqual(prefs.length, 2);
    assert.strictEqual(prefs[0], "Prefers minimal code comments");

    prefs = updateGlobalPreference(0, "Prefers concise comments", testBaseDir);
    assert.strictEqual(prefs[0], "Prefers concise comments");

    prefs = removeGlobalPreference(1, testBaseDir);
    assert.strictEqual(prefs.length, 1);
    assert.strictEqual(prefs[0], "Prefers concise comments");
    console.log("✓ Tier 1 Global Preferences verified.");

    // -------------------------------------------------------------------------
    // TEST 4: Tier 2 Scoped CCM & 700-Word Cap Enforcement
    // -------------------------------------------------------------------------
    console.log("Test 4: Tier 2 Scoped CCM...");
    const generalCCM = getScopeCCM("general", testBaseDir);
    assert.strictEqual(generalCCM.scopeId, "general");
    assert.strictEqual(generalCCM.keyPoints.length, 0);

    // Add Key Points
    addScopeKeyPoint("general", "JWT for auth", testBaseDir);
    addScopeKeyPoint("general", "Sequential queue only", testBaseDir);
    const withPoints = getScopeCCM("general", testBaseDir);
    assert.strictEqual(withPoints.keyPoints.length, 2);
    assert.strictEqual(withPoints.keyPoints[0], "JWT for auth");

    // Remove Key Point
    removeScopeKeyPoint("general", 0, testBaseDir);
    const afterRemove = getScopeCCM("general", testBaseDir);
    assert.strictEqual(afterRemove.keyPoints.length, 1);
    assert.strictEqual(afterRemove.keyPoints[0], "Sequential queue only");

    // Word Cap test: Generate 800 words, verify truncation to 700 words
    const longWords = Array.from({ length: 800 }, (_, i) => `word${i}`).join(" ");
    assert.strictEqual(countWords(longWords), 800);

    updateScopeNarrative("general", longWords, testBaseDir);
    const narrativeScope = getScopeCCM("general", testBaseDir);
    assert.strictEqual(
      countWords(narrativeScope.narrative),
      700,
      "CCM narrative must be strictly capped at 700 words"
    );
    console.log("✓ Tier 2 Scoped CCM and 700-word cap verified.");

    // -------------------------------------------------------------------------
    // TEST 5: Tier 3 Per-Chat Summary & 350-Word Cap Enforcement
    // -------------------------------------------------------------------------
    console.log("Test 5: Tier 3 Per-Chat Summary...");
    const chatId = "chat_test123";
    const initialSummary = getChatSummary(chatId, testBaseDir);
    assert.strictEqual(initialSummary.keyPoints.length, 0);

    const summaryWords = Array.from({ length: 450 }, (_, i) => `token${i}`).join(" ");
    saveChatSummary(
      {
        chatId,
        keyPoints: ["Chat specific fact: built auth router"],
        narrative: summaryWords,
        updatedAt: new Date().toISOString(),
      },
      testBaseDir
    );

    const savedSummary = getChatSummary(chatId, testBaseDir);
    assert.strictEqual(savedSummary.keyPoints.length, 1);
    assert.strictEqual(
      countWords(savedSummary.narrative),
      350,
      "summary.json narrative must be strictly capped at 350 words"
    );
    console.log("✓ Tier 3 summary.json and 350-word cap verified.");

    // -------------------------------------------------------------------------
    // TEST 6: Scope Listing
    // -------------------------------------------------------------------------
    console.log("Test 6: Scope listing overview...");
    const scopes = listMemoryScopes(testBaseDir);
    assert.ok(scopes.length >= 1, "Must contain at least the General scope");
    assert.strictEqual(scopes[0]?.id, "general");
    assert.strictEqual(scopes[0]?.name, "General (standalone chats)");
    console.log("✓ Scope listing verified.");

    // -------------------------------------------------------------------------
    // TEST 7: Chat Memory CRUD & Listing for /memory Chats Tab
    // -------------------------------------------------------------------------
    console.log("Test 7: Chat Memory CRUD & Listing for /memory Chats Tab...");
    const chatService = new ChatService(testBaseDir);
    const newChat = chatService.createChat("Sprint Retro Chat");
    assert.ok(newChat.id);

    // Add Key Point to chat
    addChatKeyPoint(newChat.id, "Sprint goal achieved", testBaseDir);
    addChatKeyPoint(newChat.id, "Deploy to staging first", testBaseDir);
    let chatSum = getChatSummary(newChat.id, testBaseDir);
    assert.strictEqual(chatSum.keyPoints.length, 2);
    assert.strictEqual(chatSum.keyPoints[0], "Sprint goal achieved");

    // Update Key Point in chat
    updateChatKeyPoint(newChat.id, 0, "Sprint goal 100% achieved", testBaseDir);
    chatSum = getChatSummary(newChat.id, testBaseDir);
    assert.strictEqual(chatSum.keyPoints[0], "Sprint goal 100% achieved");

    // Remove Key Point from chat
    removeChatKeyPoint(newChat.id, 1, testBaseDir);
    chatSum = getChatSummary(newChat.id, testBaseDir);
    assert.strictEqual(chatSum.keyPoints.length, 1);

    // Update chat narrative with word cap enforcement
    const chatNarrativeLong = Array.from({ length: 400 }, (_, i) => `chatword${i}`).join(" ");
    updateChatNarrative(newChat.id, chatNarrativeLong, testBaseDir);
    chatSum = getChatSummary(newChat.id, testBaseDir);
    assert.strictEqual(
      countWords(chatSum.narrative),
      350,
      "Chat narrative must be strictly capped at 350 words"
    );

    // Verify listChatMemories discovery
    const chatMemories = listChatMemories(testBaseDir);
    assert.ok(chatMemories.length >= 1);
    const found = chatMemories.find((c) => c.chatId === newChat.id);
    assert.ok(found, "Created chat must appear in chatMemories");
    assert.strictEqual(found?.title, "Sprint Retro Chat");
    assert.strictEqual(found?.keyPointsCount, 1);
    assert.strictEqual(found?.narrativeWordCount, 350);
    console.log("✓ Chat memory CRUD and Chats tab listing verified.");

    console.log("\n========================================================");
    console.log("ALL OCT 17 MEMORY & SETTINGS TESTS PASSED CLEANLY (7/7)!");
    console.log("========================================================\n");
  } finally {
    // Teardown temp directory
    try {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runTests();
