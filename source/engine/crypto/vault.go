// Status:: in-progress
// Vault interface and common secret management contracts.
// Defines how Vecta interacts with OS native vaults across Windows, macOS, and Linux.
// Strictly adheres to Claude Doc 15 (Privacy Encryption) & Sprint Plan §5.
package crypto

import "fmt"

// Standard secret names in the OS vault per Claude Doc 15
const (
	// TargetEncryptionKey is the OS vault identifier for Vecta's primary encryption key
	TargetEncryptionKey = "vecta-encryption-key"

	// TargetAPIKeyPrefix is the prefix used for storing cloud agent API keys per role
	TargetAPIKeyPrefix = "vecta-api-key-"
)

// Vault defines the contract for persistent, secure credential storage in the OS.
type Vault interface {
	// StoreSecret stores a named secret in the OS vault
	StoreSecret(name string, secret []byte) error

	// GetSecret retrieves a named secret from the OS vault
	GetSecret(name string) ([]byte, error)

	// HasSecret checks if a named secret exists in the OS vault
	HasSecret(name string) bool

	// DeleteSecret removes a named secret from the OS vault
	DeleteSecret(name string) error

	// VaultType returns a human-readable description of the active vault backend
	VaultType() string
}

// FormatRoleAPIKeyTarget returns the standardized vault target name for a role API key
func FormatRoleAPIKeyTarget(roleSlug string) string {
	return fmt.Sprintf("%s%s", TargetAPIKeyPrefix, roleSlug)
}
