// Status:: in-progress
// This is the starting point for the Go engine.
// It listens to TypeScript through standard input and replies through standard output.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/vecta-cli/engine/bridge"
	"github.com/vecta-cli/engine/crypto"
	"github.com/vecta-cli/engine/device"
	"github.com/vecta-cli/engine/queue"
	"github.com/vecta-cli/engine/scanner"
)

var (
	queueRunner  = queue.NewRunner()
	deviceServer = device.NewServer(device.DefaultPort)
)

func main() {
	// A scanner reads input line by line from TypeScript.
	scanner := bufio.NewScanner(os.Stdin)
	// Support up to 16 MB lines to prevent crashes on large prompts or scan results (BUG-001)
	scanner.Buffer(make([]byte, 64*1024), 16*1024*1024)

	// Keep listening as long as TypeScript keeps sending messages.
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		// Turn the raw incoming JSON text into our Request struct.
		var req bridge.Request
		if err := json.Unmarshal(line, &req); err != nil {
			sendError("", fmt.Sprintf("invalid json: %s", err))
			continue
		}

		// Handle the specific action requested.
		handleRequest(req)
	}

	// Check if scanner exited due to an error rather than clean EOF (BUG-008)
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "Engine fatal scanner error: %v\n", err)
	}
}

// handleRequest looks at what action was asked for and picks the right response.
func handleRequest(req bridge.Request) {
	switch req.Action {
	case "ping":
		// Answer the ping with a friendly pong message.
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.PingResponse{
				Message: "pong from Go engine",
				Version: "0.0.4",
			},
		}
		sendJSON(resp)

	case "queue_dispatch":
		// Parse the task payload sent from TypeScript.
		var payload bridge.QueueDispatchPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse dispatch payload: %v", err))
			return
		}

		// Execute the task sequentially via the queue runner.
		result, err := queueRunner.ExecuteTask(payload)
		if err != nil {
			sendError(req.ID, fmt.Sprintf("task execution failed: %v", err))
			return
		}

		// Return success with the task result.
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data:    result,
		}
		sendJSON(resp)

	case "queue_reset":
		// Clear the queue runner's output hash history (resets 3x loop detector).
		queueRunner.Reset()
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.QueueResetResult{
				Success: true,
			},
		}
		sendJSON(resp)

	case "hw_scan":
		// Run the full hardware + runtime + model file scan.
		ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
		defer cancel()

		// Check if TypeScript passed any custom model folders or files to scan.
		var customPaths []string
		if len(req.Payload) > 0 {
			var scanPayload bridge.HardwareScanPayload
			if err := json.Unmarshal(req.Payload, &scanPayload); err == nil {
				customPaths = scanPayload.CustomPaths
			}
		}

		scanResult, err := scanner.RunScanWithOptions(ctx, customPaths)
		if err != nil {
			sendError(req.ID, fmt.Sprintf("hardware scan failed: %v", err))
			return
		}

		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data:    scanResult,
		}
		sendJSON(resp)

	case "crypto_init":
		// Ensure primary encryption key exists in OS vault (Windows DPAPI / Keychain / Secret Service)
		_, err := crypto.EnsureEncryptionKey()
		if err != nil {
			sendError(req.ID, fmt.Sprintf("crypto init failed: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoInitResult{
				KeySet:    true,
				VaultType: crypto.GetVaultType(),
			},
		}
		sendJSON(resp)

	case "crypto_encrypt":
		var payload bridge.CryptoEncryptPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse encrypt payload: %v", err))
			return
		}
		ciphertext, err := crypto.Encrypt([]byte(payload.Plaintext))
		if err != nil {
			sendError(req.ID, fmt.Sprintf("encryption failed: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoEncryptResult{
				Ciphertext: ciphertext,
			},
		}
		sendJSON(resp)

	case "crypto_decrypt":
		var payload bridge.CryptoDecryptPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse decrypt payload: %v", err))
			return
		}
		plainBytes, err := crypto.Decrypt(payload.Ciphertext)
		if err != nil {
			sendError(req.ID, fmt.Sprintf("decryption failed: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoDecryptResult{
				Plaintext: string(plainBytes),
			},
		}
		sendJSON(resp)

	case "crypto_store_secret":
		var payload bridge.CryptoSecretPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse secret payload: %v", err))
			return
		}
		if err := crypto.StoreSecret(payload.Key, []byte(payload.Value)); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to store secret in vault: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoSecretResult{
				Key:     payload.Key,
				Success: true,
			},
		}
		sendJSON(resp)

	case "crypto_get_secret":
		var payload bridge.CryptoSecretPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse secret payload: %v", err))
			return
		}
		secretBytes, err := crypto.GetSecret(payload.Key)
		if err != nil {
			sendError(req.ID, fmt.Sprintf("failed to get secret from vault: %v", err))
			return
		}
		defer crypto.Memzero(secretBytes)
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoSecretResult{
				Key:     payload.Key,
				Value:   string(secretBytes),
				Success: true,
			},
		}
		sendJSON(resp)

	case "crypto_has_secret":
		var payload bridge.CryptoSecretPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse secret payload: %v", err))
			return
		}
		exists := crypto.HasSecret(payload.Key)
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoSecretResult{
				Key:     payload.Key,
				Exists:  exists,
				Success: true,
			},
		}
		sendJSON(resp)

	case "crypto_delete_secret":
		var payload bridge.CryptoSecretPayload
		if err := json.Unmarshal(req.Payload, &payload); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to parse secret payload: %v", err))
			return
		}
		if err := crypto.DeleteSecret(payload.Key); err != nil {
			sendError(req.ID, fmt.Sprintf("failed to delete secret from vault: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.CryptoSecretResult{
				Key:     payload.Key,
				Success: true,
			},
		}
		sendJSON(resp)

	case "device_server_start":
		// Start companion device server on 127.0.0.1:port
		if len(req.Payload) > 0 {
			var payload bridge.DeviceServerStartPayload
			if err := json.Unmarshal(req.Payload, &payload); err == nil && payload.Port > 0 {
				if deviceServer.IsRunning() {
					_ = deviceServer.Stop()
				}
				deviceServer = device.NewServer(payload.Port)
			}
		}
		if err := deviceServer.Start(); err != nil {
			sendError(req.ID, fmt.Sprintf("device server start failed: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.DeviceServerStatusResult{
				Running: true,
				Port:    deviceServer.Port(),
				Bound:   fmt.Sprintf("127.0.0.1:%d", deviceServer.Port()),
			},
		}
		sendJSON(resp)

	case "device_server_stop":
		// Stop companion device server
		if err := deviceServer.Stop(); err != nil {
			sendError(req.ID, fmt.Sprintf("device server stop failed: %v", err))
			return
		}
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.DeviceServerStatusResult{
				Running: false,
				Port:    deviceServer.Port(),
				Bound:   fmt.Sprintf("127.0.0.1:%d", deviceServer.Port()),
			},
		}
		sendJSON(resp)

	case "device_server_status":
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.DeviceServerStatusResult{
				Running: deviceServer.IsRunning(),
				Port:    deviceServer.Port(),
				Bound:   fmt.Sprintf("127.0.0.1:%d", deviceServer.Port()),
			},
		}
		sendJSON(resp)

	case "device_server_update":
		// Push latest chat messages, tasks, and roles to the companion device
		var payload bridge.DeviceServerUpdatePayload
		if len(req.Payload) > 0 {
			if err := json.Unmarshal(req.Payload, &payload); err != nil {
				sendError(req.ID, fmt.Sprintf("failed to parse device update payload: %v", err))
				return
			}
			deviceServer.UpdateState(payload.ChatID, payload.Messages, payload.Tasks, payload.Roles, payload.IsProcessing, payload.ActiveRole)
		}
		// Drain any remote actions (toggles, prompt edits) triggered from companion devices
		toggles, prompts := deviceServer.DrainRemoteActions()
		resp := bridge.Response{
			ID:      req.ID,
			Success: true,
			Data: bridge.DeviceServerUpdateResult{
				Success: true,
				Toggles: toggles,
				Prompts: prompts,
			},
		}
		sendJSON(resp)


	default:
		// Tell TypeScript we do not know this action yet.
		sendError(req.ID, fmt.Sprintf("unknown action: %s", req.Action))
	}
}

// sendJSON turns the response struct into text and writes it out on its own line.
func sendJSON(resp bridge.Response) {
	bytes, err := json.Marshal(resp)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to marshal response: %v\n", err)
		return
	}
	// Print a single clean line so TypeScript can read it easily.
	fmt.Println(string(bytes))
}

// sendError is a quick helper to send a failed response back to TypeScript.
func sendError(id string, msg string) {
	resp := bridge.Response{
		ID:      id,
		Success: false,
		Error:   msg,
	}
	sendJSON(resp)
}
