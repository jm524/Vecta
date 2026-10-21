package crypto

import (
	"bytes"
	"strings"
	"testing"
)

func TestCryptoLifecycle(t *testing.T) {
	// 1. Ensure encryption key in vault
	created, err := EnsureEncryptionKey()
	if err != nil {
		t.Fatalf("EnsureEncryptionKey failed: %v", err)
	}
	t.Logf("Encryption key ensured (newly created: %v, vault: %s)", created, GetVaultType())

	if !HasEncryptionKey() {
		t.Fatalf("HasEncryptionKey returned false after ensuring key")
	}

	// 2. Test Encrypt & Decrypt
	samplePlaintext := "ts=2026-10-19T23:00:00Z role=Coder task=\"Build LoginForm\" files=LoginForm.tsx msg=\"Validation added\""
	encrypted, err := Encrypt([]byte(samplePlaintext))
	if err != nil {
		t.Fatalf("Encrypt failed: %v", err)
	}

	if !strings.HasPrefix(encrypted, EncryptionPrefix) {
		t.Fatalf("Expected encrypted string to start with '%s', got: %s", EncryptionPrefix, encrypted)
	}
	t.Logf("Encrypted string: %s", encrypted)

	decrypted, err := Decrypt(encrypted)
	if err != nil {
		t.Fatalf("Decrypt failed: %v", err)
	}

	if string(decrypted) != samplePlaintext {
		t.Fatalf("Decrypted text does not match original plaintext!\nExpected: %s\nGot: %s", samplePlaintext, string(decrypted))
	}
	t.Logf("Decrypted plaintext matched perfectly!")

	// 3. Test Memzero
	secretSlice := []byte("super-sensitive-secret-token-12345")
	Memzero(secretSlice)
	for i, b := range secretSlice {
		if b != 0 {
			t.Fatalf("Memzero failed at index %d: expected 0, got %d", i, b)
		}
	}
	t.Logf("Memzero verified: all bytes set to 0")

	// 4. Test Storing and Retrieving an API Key (e.g. vecta-api-key-code-reviewer)
	apiKeyTarget := FormatRoleAPIKeyTarget("code-reviewer")
	testAPIKey := []byte("sk-test-fake-anthropic-key-999999")

	if err := StoreSecret(apiKeyTarget, testAPIKey); err != nil {
		t.Fatalf("StoreSecret failed: %v", err)
	}

	if !HasSecret(apiKeyTarget) {
		t.Fatalf("HasSecret returned false for stored secret")
	}

	retrieved, err := GetSecret(apiKeyTarget)
	if err != nil {
		t.Fatalf("GetSecret failed: %v", err)
	}
	defer Memzero(retrieved)

	if !bytes.Equal(retrieved, []byte("sk-test-fake-anthropic-key-999999")) {
		t.Fatalf("Retrieved secret does not match stored secret")
	}
	t.Logf("Role API key stored and retrieved successfully from OS vault: %s", apiKeyTarget)

	// Clean up test secret
	if err := DeleteSecret(apiKeyTarget); err != nil {
		t.Logf("Notice: DeleteSecret returned: %v", err)
	}
}
