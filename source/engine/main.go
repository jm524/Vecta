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
	"github.com/vecta-cli/engine/queue"
	"github.com/vecta-cli/engine/scanner"
)

var queueRunner = queue.NewRunner()

func main() {
	// A scanner reads input line by line from TypeScript.
	scanner := bufio.NewScanner(os.Stdin)

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
