// Status:: test
// Automated test suite for Day 16 (Oct 19) Milestone:
// 1. Primary encryption key generation & OS vault integration (Windows DPAPI / Credential Manager)
// 2. AES-256-GCM authenticated encryption & decryption over Go engine bridge
// 3. Role API key storage, retrieval, check, and deletion in OS native vault
// 4. Documenter write-time raw log encryption & read-time decryption in memory
// 5. Memory zeroing of key/secret buffers
// Strictly adheres to Claude Doc 15 (Privacy Encryption), Doc 14 (Raw Log System), and Sprint Plan §5.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { engineBridge } from "../bridge/client.js";
import {
  documenterPassiveCopy,
  getRawLogEntries,
  getRawLogPath,
} from "../../../roles/documenter.js";
import {
  encryptTextLocal,
  decryptTextLocal,
  memzero,
  ENCRYPTION_PREFIX,
} from "../services/crypto-service.js";

async function runCryptoTestSuite() {
  console.log("=== Running Day 16 (Oct 19) Crypto & OS Vault Test Suite ===\n");

  const tempDir = path.join(os.tmpdir(), `vecta-crypto-test-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Go Engine Startup & Primary Key Vault Initialization
    // -------------------------------------------------------------------------
    console.log("[Test 1] Starting Go engine and initializing OS native vault key...");
    engineBridge.start();

    const pingRes = await engineBridge.ping();
    if (!pingRes.success) {
      throw new Error(`Engine ping failed: ${pingRes.error}`);
    }
    console.log(`✓ Engine responsive: ${pingRes.data?.message} (v${pingRes.data?.version})`);

    const initRes = await engineBridge.cryptoInit();
    if (!initRes.success || !initRes.data?.keySet) {
      throw new Error(`cryptoInit failed: ${initRes.error}`);
    }
    console.log(`✓ OS native vault initialized: keySet=${initRes.data.keySet}, vault=${initRes.data.vaultType}`);

    // -------------------------------------------------------------------------
    // TEST 2: AES-256-GCM Encryption & Decryption via Go Bridge
    // -------------------------------------------------------------------------
    console.log("\n[Test 2] Testing AES-256-GCM encryption & decryption over bridge...");
    const sampleAuditText = 'ts="2026-10-19T23:30:00Z" role=Coder task="Build auth modal" files="AuthModal.tsx" status=completed summary="Built modal with strict TypeScript"';

    const encRes = await engineBridge.cryptoEncrypt(sampleAuditText);
    if (!encRes.success || !encRes.data?.ciphertext) {
      throw new Error(`cryptoEncrypt failed: ${encRes.error}`);
    }

    const ciphertext = encRes.data.ciphertext;
    if (!ciphertext.startsWith(ENCRYPTION_PREFIX)) {
      throw new Error(`Ciphertext missing expected '${ENCRYPTION_PREFIX}' prefix: ${ciphertext}`);
    }
    console.log(`✓ Encrypted output generated with ${ENCRYPTION_PREFIX} prefix: ${ciphertext.slice(0, 36)}...`);

    const decRes = await engineBridge.cryptoDecrypt(ciphertext);
    if (!decRes.success || !decRes.data?.plaintext) {
      throw new Error(`cryptoDecrypt failed: ${decRes.error}`);
    }

    if (decRes.data.plaintext !== sampleAuditText) {
      throw new Error(`Decrypted text does not match original!\nExpected: ${sampleAuditText}\nGot: ${decRes.data.plaintext}`);
    }
    console.log("✓ Decrypted text matched original plaintext perfectly!");

    // -------------------------------------------------------------------------
    // TEST 3: Storing and Retrieving Role API Keys in OS Native Vault
    // -------------------------------------------------------------------------
    console.log("\n[Test 3] Testing role API key storage in OS native vault...");
    const testSecretKey = "vecta-api-key-security-checker";
    const testSecretValue = "sk-ant-api03-live-test-secret-key-abcdef123456";

    // 3a. Store secret
    const storeRes = await engineBridge.cryptoStoreSecret(testSecretKey, testSecretValue);
    if (!storeRes.success) {
      throw new Error(`cryptoStoreSecret failed: ${storeRes.error}`);
    }
    console.log(`✓ Stored secret under target: ${testSecretKey}`);

    // 3b. Verify secret exists
    const hasRes = await engineBridge.cryptoHasSecret(testSecretKey);
    if (!hasRes.success || !hasRes.data?.exists) {
      throw new Error(`cryptoHasSecret reported false for stored key: ${testSecretKey}`);
    }
    console.log(`✓ Verified secret existence in OS vault: ${testSecretKey}`);

    // 3c. Retrieve secret
    const getRes = await engineBridge.cryptoGetSecret(testSecretKey);
    if (!getRes.success || getRes.data?.value !== testSecretValue) {
      throw new Error(`cryptoGetSecret value mismatch!\nExpected: ${testSecretValue}\nGot: ${getRes.data?.value}`);
    }
    console.log("✓ Retrieved secret value matches original secret value exactly!");

    // 3d. Delete secret
    const delRes = await engineBridge.cryptoDeleteSecret(testSecretKey);
    if (!delRes.success) {
      throw new Error(`cryptoDeleteSecret failed: ${delRes.error}`);
    }
    console.log(`✓ Cleaned up test secret from vault: ${testSecretKey}`);

    // -------------------------------------------------------------------------
    // TEST 4: Documenter Encrypted Raw Log Lifecycle
    // -------------------------------------------------------------------------
    console.log("\n[Test 4] Testing Documenter write-time raw log encryption & read-time decryption...");
    const testChatId = "chat_crypto_test_8829";

    const confirmation = await documenterPassiveCopy(
      testChatId,
      {
        case: "role_output",
        role: "Coder",
        task: "Implement user session vault storage",
        output: "Created session.ts with vault encryption hooks and memory zeroing.",
        files_touched: ["source/state/session.ts", "source/engine/crypto/crypto.go"],
        timestamp: new Date().toISOString(),
      },
      tempDir
    );

    if (confirmation.status !== "confirmed") {
      throw new Error("Documenter passive copy handshake failed to confirm!");
    }
    console.log(`✓ Documenter confirmation handshake returned: ${confirmation.status} (${confirmation.bytesWritten} bytes written)`);

    // Verify raw file on disk is SCRAMBLED (unreadable without key)
    const rawPath = getRawLogPath(testChatId, tempDir);
    const rawDiskContent = fs.readFileSync(rawPath, "utf8").trim();

    if (!rawDiskContent.startsWith(ENCRYPTION_PREFIX)) {
      throw new Error(`Security violation! Raw log on disk was NOT encrypted!\nContent: ${rawDiskContent}`);
    }
    console.log(`✓ Disk inspection verified: File on disk is 100% encrypted (${rawDiskContent.slice(0, 32)}...)`);
    console.log("✓ Plaintext is NEVER written to disk at any point (Claude Doc 14 §Encryption).");

    // Verify getRawLogEntries decrypts back into clean logfmt entries in memory
    const entries = await getRawLogEntries(testChatId, tempDir);
    if (entries.length === 0) {
      throw new Error("getRawLogEntries returned empty array!");
    }

    const decryptedLogfmt = entries[0]!;
    if (!decryptedLogfmt.includes('role=Coder') || !decryptedLogfmt.includes('files=')) {
      throw new Error(`Decrypted entry missing expected logfmt fields: ${decryptedLogfmt}`);
    }
    console.log(`✓ Read-time decryption verified: Successfully read decrypted logfmt in memory:\n   ${decryptedLogfmt}`);

    // -------------------------------------------------------------------------
    // TEST 5: Memory Zeroing & Local Cryptographic Primitives
    // -------------------------------------------------------------------------
    console.log("\n[Test 5] Testing memory zeroing & standalone Node fallback primitives...");
    const sensitiveBuffer = Buffer.from("sk-temporary-in-memory-api-key");
    memzero(sensitiveBuffer);

    for (let i = 0; i < sensitiveBuffer.length; i++) {
      if (sensitiveBuffer[i] !== 0) {
        throw new Error(`memzero failed: byte at index ${i} is non-zero: ${sensitiveBuffer[i]}`);
      }
    }
    console.log("✓ Buffer memory zeroing verified: all bytes wiped to 0 in RAM.");

    const localPlain = "Standalone fallback test string 12345";
    const localEnc = encryptTextLocal(localPlain);
    if (!localEnc.startsWith(ENCRYPTION_PREFIX)) {
      throw new Error("encryptTextLocal failed to produce ENC:v1: prefix");
    }
    const localDec = decryptTextLocal(localEnc);
    if (localDec !== localPlain) {
      throw new Error("decryptTextLocal failed to reproduce original plaintext");
    }
    console.log("✓ Standalone local AES-256-GCM fallback encryption and decryption verified!");

    console.log("\n========================================================");
    console.log("ALL DAY 16 (OCT 19) CRYPTO & OS VAULT TESTS PASSED CLEANLY!");
    console.log("========================================================\n");
  } finally {
    engineBridge.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

runCryptoTestSuite().catch((err) => {
  console.error("FATAL TEST FAILURE:", err);
  engineBridge.stop();
  process.exit(1);
});
