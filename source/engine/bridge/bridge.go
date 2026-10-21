// Status:: in-progress
// This file defines the message shapes that TypeScript and Go send to each other.
package bridge

import "encoding/json"

// Request is what TypeScript sends into Go's standard input.
type Request struct {
	ID      string          `json:"id"`
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Response is what Go sends back out through standard output.
type Response struct {
	ID      string      `json:"id"`
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// PingResponse is the simple hello-world answer for action "ping".
type PingResponse struct {
	Message string `json:"message"`
	Version string `json:"version"`
}

// QueueDispatchPayload carries task instructions and boundaries sent from TypeScript to Go.
type QueueDispatchPayload struct {
	TaskID         string   `json:"taskId"`
	Role           string   `json:"role"`
	Stage          int      `json:"stage"`
	Prompt         string   `json:"prompt"`
	FilePaths      []string `json:"filePaths"`
	FileBoundaries []string `json:"fileBoundaries"`
}

// HardwareScanPayload carries optional custom search paths for finding models on disk.
type HardwareScanPayload struct {
	CustomPaths []string `json:"customPaths,omitempty"`
}

// Note: hw_scan action returns scanner.ScanResult directly in Response.Data.
// No separate bridge type needed — the generic interface{} field handles it.

// QueueDispatchResult is what Go returns when a task finishes running.
type QueueDispatchResult struct {
	TaskID      string `json:"taskId"`
	Role        string `json:"role"`
	Output      string `json:"output"`
	TokensUsed  int    `json:"tokensUsed"`
	CompletedAt string `json:"completedAt"`
}

// CryptoEncryptPayload carries plaintext to encrypt.
type CryptoEncryptPayload struct {
	Plaintext string `json:"plaintext"`
}

// CryptoEncryptResult carries the resulting 'ENC:v1:<base64>' ciphertext.
type CryptoEncryptResult struct {
	Ciphertext string `json:"ciphertext"`
}

// CryptoDecryptPayload carries ciphertext to decrypt.
type CryptoDecryptPayload struct {
	Ciphertext string `json:"ciphertext"`
}

// CryptoDecryptResult carries the decrypted plaintext.
type CryptoDecryptResult struct {
	Plaintext string `json:"plaintext"`
}

// CryptoSecretPayload carries a secret key and optional value for OS vault storage.
type CryptoSecretPayload struct {
	Key   string `json:"key"`
	Value string `json:"value,omitempty"`
}

// CryptoSecretResult returns the outcome of an OS vault secret query.
type CryptoSecretResult struct {
	Key     string `json:"key"`
	Value   string `json:"value,omitempty"`
	Exists  bool   `json:"exists,omitempty"`
	Success bool   `json:"success"`
}

// CryptoInitResult reports whether the primary vault encryption key is ready.
type CryptoInitResult struct {
	KeySet    bool   `json:"keySet"`
	VaultType string `json:"vaultType"`
}

