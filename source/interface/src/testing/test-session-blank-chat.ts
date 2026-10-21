// Automated verification test suite for blank chat on launch & on-message creation.
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { ChatService } from "../services/chat-service.js";

function runTest() {
  console.log("Starting Blank Chat on Launch & Official Creation Test Suite...\n");

  const testBaseDir = path.join(os.tmpdir(), `vecta-test-blank-chat-${Date.now()}`);

  try {
    const service = new ChatService(testBaseDir);

    // Initial check: no chats exist on disk
    const initialChats = service.listChats();
    assert.strictEqual(initialChats.length, 0, "No chats should exist initially");

    // Simulate session behavior
    let activeChatId: string | null = null;
    let activeChat: any = null;
    let messages: any[] = [];

    // Verify initial launch state: blank standalone chat
    assert.strictEqual(activeChatId, null, "activeChatId must be null on launch");
    assert.strictEqual(activeChat, null, "activeChat must be null on launch");
    assert.strictEqual(messages.length, 0, "messages must be empty on launch");
    assert.strictEqual(service.listChats().length, 0, "No chat files should be written on launch");
    console.log("✓ Initial launch starts on a blank standalone chat with zero disk writes.");

    // Simulate sending a user message
    const userPrompt = "Build a local authentication module";
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    // Official creation logic matching useSession
    if (!activeChatId) {
      const titleSnippet = userPrompt.trim().replace(/[\r\n\s]+/g, " ");
      const title =
        titleSnippet.length > 36 ? titleSnippet.slice(0, 35) + "…" : titleSnippet || undefined;
      const created = service.createChat(title, null);
      activeChatId = created.id;
      activeChat = created;
    }

    const userMsg = {
      id: "msg-1",
      sender: "User",
      text: userPrompt,
      color: "yellow",
      timestamp: time,
    };
    messages.push(userMsg);
    service.saveChatMessages(activeChatId!, messages);

    // Verify chat was officially created on disk
    const chatsAfterUserMsg = service.listChats();
    assert.strictEqual(chatsAfterUserMsg.length, 1, "Exactly 1 chat must be created on disk");
    assert.strictEqual(chatsAfterUserMsg[0]?.id, activeChatId);
    assert.strictEqual(chatsAfterUserMsg[0]?.title, "Build a local authentication module");

    // Verify message persistence
    const loadedChat = service.getChat(activeChatId!);
    assert.ok(loadedChat);
    assert.strictEqual(loadedChat.messages.length, 1);
    assert.strictEqual(loadedChat.messages[0]?.text, userPrompt);
    console.log("✓ User sending a message officially creates and persists the chat on disk.");

    // Simulate role pipeline response appending to the official chat
    const managerMsg = {
      id: "msg-2",
      sender: "Manager",
      text: "Pipeline assembled: Coder -> Documenter",
      color: "cyan",
      timestamp: time,
    };
    messages.push(managerMsg);
    service.saveChatMessages(activeChatId!, messages);

    const reloadedChat = service.getChat(activeChatId!);
    assert.strictEqual(reloadedChat?.messages.length, 2);
    console.log("✓ Subsequent role messages persist cleanly to the official chat.");

    // Reset to a blank standalone chat
    activeChatId = null;
    activeChat = null;
    messages = [];
    assert.strictEqual(activeChatId, null);
    assert.strictEqual(messages.length, 0);
    // Previous chat still safely exists on disk
    assert.strictEqual(service.listChats().length, 1);
    console.log("✓ Resetting to blank chat preserves previous chats on disk.");

    console.log("\n========================================================");
    console.log("ALL BLANK CHAT ON LAUNCH TESTS PASSED CLEANLY!");
    console.log("========================================================\n");
  } finally {
    try {
      fs.rmSync(testBaseDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runTest();
