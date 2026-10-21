// Status:: done
// Encryption engine — key generation, OS native vault integration (Windows DPAPI / Credential Manager),
// AES-256-GCM authenticated encryption/decryption, and memory zeroing of key/secret byte slices.
// Strictly implements Claude Doc 15 (Privacy Encryption), Doc 14, Doc 26 §6, and Sprint Plan §5.
package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"strings"
	"sync"
)

const (
	// EncryptionPrefix marks ciphertext encrypted with Vecta's version 1 AES-256-GCM scheme
	EncryptionPrefix = "ENC:v1:"

	// KeySizeBytes is 32 bytes (256 bits) for AES-256
	KeySizeBytes = 32

	// NonceSizeBytes is 12 bytes standard for AES-GCM
	NonceSizeBytes = 12
)

var (
	globalVault Vault
	vaultOnce   sync.Once
)

// getVault returns the singleton vault instance
func getVault() Vault {
	vaultOnce.Do(func() {
		globalVault = DefaultVault()
	})
	return globalVault
}

// Memzero immediately overwrites a byte slice in memory with zeros.
// Crucial for clearing cryptographic keys and plain secrets from RAM (Claude Doc 15 §2 & §6).
func Memzero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// GenerateRandomKey creates a cryptographically secure 256-bit (32-byte) random key.
func GenerateRandomKey() ([]byte, error) {
	key := make([]byte, KeySizeBytes)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		Memzero(key)
		return nil, fmt.Errorf("failed to generate random key: %w", err)
	}
	return key, nil
}

// EnsureEncryptionKey checks if the primary encryption key exists in the OS native vault.
// If missing (first run), it generates a 32-byte key purely in RAM, stores it into the OS vault,
// and immediately zeroes the memory buffer.
// Returns (wasNewlyCreated, error).
func EnsureEncryptionKey() (bool, error) {
	v := getVault()

	// Check if already present
	if v.HasSecret(TargetEncryptionKey) {
		return false, nil
	}

	// Generate key purely in memory
	key, err := GenerateRandomKey()
	if err != nil {
		return false, err
	}
	defer Memzero(key)

	// Send to OS vault
	if err := v.StoreSecret(TargetEncryptionKey, key); err != nil {
		return false, fmt.Errorf("failed to store primary encryption key in OS vault: %w", err)
	}

	return true, nil
}

// HasEncryptionKey returns true if the primary encryption key is present in the OS vault.
func HasEncryptionKey() bool {
	return getVault().HasSecret(TargetEncryptionKey)
}

// Encrypt scrambles plaintext using AES-256-GCM authenticated encryption.
// Fetches the key from the OS vault, generates a unique 12-byte nonce, performs encryption,
// zeroes the key from memory immediately, and returns formatted string 'ENC:v1:<base64>'.
func Encrypt(plaintext []byte) (string, error) {
	v := getVault()

	// 1. Fetch key from OS vault
	key, err := v.GetSecret(TargetEncryptionKey)
	if err != nil {
		// If key hasn't been generated yet, ensure it now
		if _, initErr := EnsureEncryptionKey(); initErr == nil {
			key, err = v.GetSecret(TargetEncryptionKey)
		}
	}
	if err != nil {
		return "", fmt.Errorf("failed to retrieve encryption key from OS vault: %w", err)
	}
	defer Memzero(key)

	if len(key) != KeySizeBytes {
		return "", fmt.Errorf("invalid key size: expected %d bytes, got %d", KeySizeBytes, len(key))
	}

	// 2. Initialize AES-256 cipher block
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("failed to create AES cipher: %w", err)
	}

	// 3. Initialize GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM block: %w", err)
	}

	// 4. Generate random 12-byte nonce
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	// 5. Seal data: ciphertext + 16-byte authentication tag appended to nonce
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)

	// 6. Return formatted prefix with base64 encoded payload
	encoded := base64.StdEncoding.EncodeToString(sealed)
	return fmt.Sprintf("%s%s", EncryptionPrefix, encoded), nil
}

// Decrypt unpacks an 'ENC:v1:<base64>' payload back into plaintext.
// If the payload does not start with 'ENC:v1:', it is returned as plain bytes (transparent backward compatibility).
func Decrypt(ciphertextStr string) ([]byte, error) {
	trimmed := strings.TrimSpace(ciphertextStr)

	// Transparent fallback for unencrypted legacy content
	if !strings.HasPrefix(trimmed, EncryptionPrefix) {
		return []byte(ciphertextStr), nil
	}

	rawB64 := strings.TrimPrefix(trimmed, EncryptionPrefix)
	payload, err := base64.StdEncoding.DecodeString(rawB64)
	if err != nil {
		return nil, fmt.Errorf("failed to decode base64 ciphertext: %w", err)
	}

	if len(payload) < NonceSizeBytes {
		return nil, fmt.Errorf("ciphertext too short: must be at least %d bytes", NonceSizeBytes)
	}

	v := getVault()

	// 1. Fetch key from OS vault
	key, err := v.GetSecret(TargetEncryptionKey)
	if err != nil {
		return nil, fmt.Errorf("failed to retrieve encryption key from OS vault: %w", err)
	}
	defer Memzero(key)

	if len(key) != KeySizeBytes {
		return nil, fmt.Errorf("invalid key size: expected %d bytes, got %d", KeySizeBytes, len(key))
	}

	// 2. Initialize AES-256 cipher block
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher: %w", err)
	}

	// 3. Initialize GCM mode
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM block: %w", err)
	}

	// 4. Extract nonce and ciphertext
	nonceSize := gcm.NonceSize()
	nonce := payload[:nonceSize]
	actualCiphertext := payload[nonceSize:]

	// 5. Decrypt and verify authentication tag
	plaintext, err := gcm.Open(nil, nonce, actualCiphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to decrypt ciphertext (authentication tag mismatch): %w", err)
	}

	return plaintext, nil
}

// StoreSecret saves an arbitrary named secret into the OS native vault (e.g. role API key).
func StoreSecret(name string, secret []byte) error {
	defer Memzero(secret)
	return getVault().StoreSecret(name, secret)
}

// GetSecret retrieves a named secret from the OS native vault.
func GetSecret(name string) ([]byte, error) {
	return getVault().GetSecret(name)
}

// HasSecret checks if a named secret exists in the OS native vault.
func HasSecret(name string) bool {
	return getVault().HasSecret(name)
}

// DeleteSecret deletes a named secret from the OS native vault.
func DeleteSecret(name string) error {
	return getVault().DeleteSecret(name)
}

// GetVaultType returns the active vault implementation description.
func GetVaultType() string {
	return getVault().VaultType()
}
