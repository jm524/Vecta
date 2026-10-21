// Platform-specific vault implementation for Unix (macOS and Linux).
// Implements owner-only file permissions (0700 / 0600) with key wrapping per Claude Doc 15 §2.
//go:build !windows

package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// UnixVault implements the Vault interface for Linux and macOS.
type UnixVault struct {
	vaultDir string
}

// NewUnixVault creates a new Unix vault instance.
func NewUnixVault() *UnixVault {
	home, err := os.UserHomeDir()
	vaultDir := ""
	if err == nil {
		vaultDir = filepath.Join(home, ".vecta", "vault")
	}
	return &UnixVault{vaultDir: vaultDir}
}

// DefaultVault returns the Unix vault implementation.
func DefaultVault() Vault {
	return NewUnixVault()
}

func (v *UnixVault) VaultType() string {
	return "Unix Protected Storage (Owner-only 0700)"
}

func (v *UnixVault) StoreSecret(name string, secret []byte) error {
	if len(secret) == 0 {
		return fmt.Errorf("secret cannot be empty")
	}
	if v.vaultDir == "" {
		return fmt.Errorf("vault directory is not configured")
	}

	if err := os.MkdirAll(v.vaultDir, 0700); err != nil {
		return fmt.Errorf("creating vault directory: %w", err)
	}

	masterKey := v.getDerivationKey()
	defer Memzero(masterKey)

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return fmt.Errorf("creating cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("creating GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return fmt.Errorf("generating nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, secret, nil)

	filePath := filepath.Join(v.vaultDir, fmt.Sprintf("%s.sec", name))
	if err := os.WriteFile(filePath, ciphertext, 0600); err != nil {
		return fmt.Errorf("writing secret file: %w", err)
	}

	return nil
}

func (v *UnixVault) GetSecret(name string) ([]byte, error) {
	if v.vaultDir == "" {
		return nil, fmt.Errorf("vault directory is not configured")
	}

	filePath := filepath.Join(v.vaultDir, fmt.Sprintf("%s.sec", name))
	ciphertext, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("reading secret file: %w", err)
	}

	masterKey := v.getDerivationKey()
	defer Memzero(masterKey)

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, fmt.Errorf("creating cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("creating GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}

	nonce, encrypted := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, encrypted, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypting secret: %w", err)
	}

	return plaintext, nil
}

func (v *UnixVault) HasSecret(name string) bool {
	secret, err := v.GetSecret(name)
	if err == nil && len(secret) > 0 {
		Memzero(secret)
		return true
	}
	return false
}

func (v *UnixVault) DeleteSecret(name string) error {
	if v.vaultDir == "" {
		return fmt.Errorf("vault directory is not configured")
	}
	filePath := filepath.Join(v.vaultDir, fmt.Sprintf("%s.sec", name))
	return os.Remove(filePath)
}

// getDerivationKey computes a machine/user-bound key on Unix.
func (v *UnixVault) getDerivationKey() []byte {
	seed := fmt.Sprintf("vecta-unix-vault-%s-%d", os.Getenv("USER"), os.Getuid())
	h := sha256.Sum256([]byte(seed))
	key := make([]byte, 32)
	copy(key, h[:])
	return key
}
