// Platform-specific vault implementation for Windows.
// Uses Windows Credential Manager (advapi32.dll) with DPAPI (crypt32.dll) fallback.
// Strictly adheres to Claude Doc 15 (Privacy Encryption) & Sprint Plan §5.
//go:build windows

package crypto

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

var (
	advapi32    = syscall.NewLazyDLL("advapi32.dll")
	credWriteW  = advapi32.NewProc("CredWriteW")
	credReadW   = advapi32.NewProc("CredReadW")
	credDeleteW = advapi32.NewProc("CredDeleteW")
	credFree    = advapi32.NewProc("CredFree")

	crypt32            = syscall.NewLazyDLL("crypt32.dll")
	cryptProtectData   = crypt32.NewProc("CryptProtectData")
	cryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	localFree          = kernel32.NewProc("LocalFree")
)

const (
	credTypeGeneric          = 1
	credPersistLocalMachine  = 2
	cryptProtectUIForbidden  = 0x1
)

type credentialW struct {
	flags              uint32
	credType           uint32
	targetName         *uint16
	comment            *uint16
	lastWritten        syscall.Filetime
	credentialBlobSize uint32
	credentialBlob     *byte
	persist            uint32
	attributeCount     uint32
	attributes         uintptr
	targetAlias        *uint16
	userName           *uint16
}

type dataBlob struct {
	cbData uint32
	pbData *byte
}

// WindowsVault implements the Vault interface using Windows Credential Manager.
type WindowsVault struct {
	fallbackDir string
}

// NewWindowsVault creates a new Windows vault instance.
func NewWindowsVault() *WindowsVault {
	home, err := os.UserHomeDir()
	fallback := ""
	if err == nil {
		fallback = filepath.Join(home, ".vecta", "vault")
	}
	return &WindowsVault{fallbackDir: fallback}
}

// DefaultVault returns the platform-appropriate vault.
func DefaultVault() Vault {
	return NewWindowsVault()
}

func (v *WindowsVault) VaultType() string {
	return "Windows Credential Manager (DPAPI)"
}

// StoreSecret saves a secret into Windows Credential Manager.
func (v *WindowsVault) StoreSecret(name string, secret []byte) error {
	if len(secret) == 0 {
		return fmt.Errorf("secret cannot be empty")
	}

	targetPtr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return fmt.Errorf("invalid target name: %w", err)
	}

	commentPtr, _ := syscall.UTF16PtrFromString("Vecta AI Agent Secret")
	userPtr, _ := syscall.UTF16PtrFromString("Vecta")

	c := credentialW{
		flags:              0,
		credType:           credTypeGeneric,
		targetName:         targetPtr,
		comment:            commentPtr,
		credentialBlobSize: uint32(len(secret)),
		credentialBlob:     &secret[0],
		persist:            credPersistLocalMachine,
		userName:           userPtr,
	}

	ret, _, callErr := credWriteW.Call(uintptr(unsafe.Pointer(&c)), 0)
	if ret != 0 {
		// Successfully written to Windows Credential Manager
		return nil
	}

	// If Credential Manager write fails, use DPAPI file fallback
	return v.storeDPAPIFallback(name, secret, callErr)
}

// GetSecret retrieves a secret from Windows Credential Manager.
func (v *WindowsVault) GetSecret(name string) ([]byte, error) {
	targetPtr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, fmt.Errorf("invalid target name: %w", err)
	}

	var pCred *credentialW
	ret, _, callErr := credReadW.Call(
		uintptr(unsafe.Pointer(targetPtr)),
		uintptr(credTypeGeneric),
		0,
		uintptr(unsafe.Pointer(&pCred)),
	)

	if ret != 0 && pCred != nil {
		defer credFree.Call(uintptr(unsafe.Pointer(pCred)))

		if pCred.credentialBlobSize == 0 || pCred.credentialBlob == nil {
			return []byte{}, nil
		}

		result := make([]byte, pCred.credentialBlobSize)
		copy(result, unsafe.Slice(pCred.credentialBlob, pCred.credentialBlobSize))
		return result, nil
	}

	// Try DPAPI file fallback if not in Credential Manager
	fallbackData, fallbackErr := v.getDPAPIFallback(name)
	if fallbackErr == nil && len(fallbackData) > 0 {
		return fallbackData, nil
	}

	return nil, fmt.Errorf("secret '%s' not found in vault: %w", name, callErr)
}

// HasSecret checks whether a secret exists in Windows Credential Manager.
func (v *WindowsVault) HasSecret(name string) bool {
	secret, err := v.GetSecret(name)
	if err == nil && len(secret) > 0 {
		Memzero(secret)
		return true
	}
	return false
}

// DeleteSecret removes a secret from Windows Credential Manager.
func (v *WindowsVault) DeleteSecret(name string) error {
	targetPtr, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return fmt.Errorf("invalid target name: %w", err)
	}

	ret, _, callErr := credDeleteW.Call(
		uintptr(unsafe.Pointer(targetPtr)),
		uintptr(credTypeGeneric),
		0,
	)

	// Clean up fallback file as well
	if v.fallbackDir != "" {
		fallbackFile := filepath.Join(v.fallbackDir, fmt.Sprintf("%s.dpapi", name))
		_ = os.Remove(fallbackFile)
	}

	if ret == 0 {
		// ERROR_NOT_FOUND (1168) is acceptable when deleting
		if errno, ok := callErr.(syscall.Errno); ok && errno == 1168 {
			return nil
		}
		return fmt.Errorf("failed to delete secret '%s': %w", name, callErr)
	}

	return nil
}

// storeDPAPIFallback encrypts with DPAPI and stores into .vecta/vault/
func (v *WindowsVault) storeDPAPIFallback(name string, secret []byte, originalErr error) error {
	if v.fallbackDir == "" {
		return fmt.Errorf("Credential Manager write failed (%v) and no fallback directory available", originalErr)
	}

	if err := os.MkdirAll(v.fallbackDir, 0700); err != nil {
		return fmt.Errorf("creating vault fallback directory: %w", err)
	}

	encrypted, err := ProtectWithDPAPI(secret)
	if err != nil {
		return fmt.Errorf("DPAPI encryption failed: %w", err)
	}

	filePath := filepath.Join(v.fallbackDir, fmt.Sprintf("%s.dpapi", name))
	if err := os.WriteFile(filePath, encrypted, 0600); err != nil {
		return fmt.Errorf("writing DPAPI fallback file: %w", err)
	}

	return nil
}

// getDPAPIFallback reads and decrypts with DPAPI from .vecta/vault/
func (v *WindowsVault) getDPAPIFallback(name string) ([]byte, error) {
	if v.fallbackDir == "" {
		return nil, fmt.Errorf("no fallback directory configured")
	}

	filePath := filepath.Join(v.fallbackDir, fmt.Sprintf("%s.dpapi", name))
	encrypted, err := os.ReadFile(filePath)
	if err != nil {
		return nil, err
	}

	return UnprotectWithDPAPI(encrypted)
}

// ProtectWithDPAPI encrypts a byte slice using the current Windows user's login credentials.
func ProtectWithDPAPI(data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, fmt.Errorf("data to protect cannot be empty")
	}

	inBlob := dataBlob{
		cbData: uint32(len(data)),
		pbData: &data[0],
	}
	var outBlob dataBlob

	descr, _ := syscall.UTF16PtrFromString("Vecta DPAPI Data")

	ret, _, err := cryptProtectData.Call(
		uintptr(unsafe.Pointer(&inBlob)),
		uintptr(unsafe.Pointer(descr)),
		0,
		0,
		0,
		uintptr(cryptProtectUIForbidden),
		uintptr(unsafe.Pointer(&outBlob)),
	)

	if ret == 0 {
		return nil, fmt.Errorf("CryptProtectData failed: %w", err)
	}
	defer localFree.Call(uintptr(unsafe.Pointer(outBlob.pbData)))

	protected := make([]byte, outBlob.cbData)
	copy(protected, unsafe.Slice(outBlob.pbData, outBlob.cbData))
	return protected, nil
}

// UnprotectWithDPAPI decrypts a DPAPI-encrypted byte slice using the current Windows user's credentials.
func UnprotectWithDPAPI(protected []byte) ([]byte, error) {
	if len(protected) == 0 {
		return nil, fmt.Errorf("protected data cannot be empty")
	}

	inBlob := dataBlob{
		cbData: uint32(len(protected)),
		pbData: &protected[0],
	}
	var outBlob dataBlob

	ret, _, err := cryptUnprotectData.Call(
		uintptr(unsafe.Pointer(&inBlob)),
		0,
		0,
		0,
		0,
		uintptr(cryptProtectUIForbidden),
		uintptr(unsafe.Pointer(&outBlob)),
	)

	if ret == 0 {
		return nil, fmt.Errorf("CryptUnprotectData failed: %w", err)
	}
	defer localFree.Call(uintptr(unsafe.Pointer(outBlob.pbData)))

	plain := make([]byte, outBlob.cbData)
	copy(plain, unsafe.Slice(outBlob.pbData, outBlob.cbData))
	return plain, nil
}
