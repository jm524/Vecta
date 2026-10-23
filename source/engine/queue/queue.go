// Status:: in-progress
// This file is the Go sequential task runner.
// It checks file boundaries, executes tasks one by one, and halts on runaway model loops.
package queue

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/vecta-cli/engine/bridge"
	"github.com/vecta-cli/engine/models"
)

// Runner manages sequential task execution, path checks, and 3x hash loop detection.
type Runner struct {
	mu              sync.Mutex
	outputHashes    []string
	inferenceClient *models.Client
}

// NewRunner creates a new queue runner.
func NewRunner() *Runner {
	return &Runner{
		outputHashes:    make([]string, 0),
		inferenceClient: models.NewClient(),
	}
}

// Reset clears the output hash history (e.g. at the start of a new pipeline or session).
func (r *Runner) Reset() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.outputHashes = make([]string, 0)
}

// GetRecentHashes returns a copy of recently recorded output hashes for testing/telemetry.
func (r *Runner) GetRecentHashes() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := make([]string, len(r.outputHashes))
	copy(cp, r.outputHashes)
	return cp
}

// hashSHA256 computes a SHA256 hex string for a given text output.
func hashSHA256(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

// ExecuteTask runs a single role task, enforces file boundaries, and checks for runaway loops.
func (r *Runner) ExecuteTask(payload bridge.QueueDispatchPayload) (*bridge.QueueDispatchResult, error) {
	// 1. Check Layer 1 file boundaries: ensure the role is not trying to touch forbidden directories.
	if err := r.validateBoundaries(payload.FilePaths, payload.FileBoundaries); err != nil {
		return nil, fmt.Errorf("boundary check failed for %s: %w", payload.Role, err)
	}

	// 2. Formulate the role output.
	// If a custom or simulated output is provided in payload, use that; otherwise invoke real model inference.
	output := payload.SimulatedOutput
	tokensUsed := 285

	if output == "" {
		// Real Model Inference Engine (Day 19: Local Ollama / Cloud / Local Models)
		timeoutSec := payload.TimeoutSeconds
		if timeoutSec <= 0 {
			timeoutSec = 600 // Default to 10 minutes (Sprint Plan §5)
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
		defer cancel()

		reqPrompt := payload.FullPrompt
		if reqPrompt == "" {
			reqPrompt = payload.Prompt
		}

		inferReq := models.InferenceRequest{
			Model:        payload.Model,
			Prompt:       reqPrompt,
			SystemPrompt: payload.SystemPrompt,
			Assignment:   payload.ModelAssignment,
			CustomPath:   payload.CustomPath,
			APIKey:       payload.APIKey,
		}

		inferResp, err := r.inferenceClient.ExecuteInference(ctx, inferReq)
		if err != nil {
			return nil, fmt.Errorf("model inference error for %s: %w", payload.Role, err)
		}

		output = inferResp.Output
		tokensUsed = inferResp.TokensUsed
		if tokensUsed <= 0 {
			tokensUsed = len(output) / 4
			if tokensUsed < 10 {
				tokensUsed = 10
			}
		}
	}

	// 3. 3x Hash Loop Detector (Day 18 Resilience):
	// Check if this output is identical to the last 2 consecutive outputs.
	outHash := hashSHA256(output)

	r.mu.Lock()
	n := len(r.outputHashes)
	if n >= 2 && r.outputHashes[n-1] == outHash && r.outputHashes[n-2] == outHash {
		r.mu.Unlock()
		return nil, fmt.Errorf("runaway loop detected: 3 consecutive identical outputs (hash: %.8s). Execution halted to prevent model runaway.", outHash)
	}
	r.outputHashes = append(r.outputHashes, outHash)
	if len(r.outputHashes) > 20 {
		r.outputHashes = r.outputHashes[len(r.outputHashes)-20:]
	}
	r.mu.Unlock()

	// 4. Return result with token count and timestamp.
	result := &bridge.QueueDispatchResult{
		TaskID:      payload.TaskID,
		Role:        payload.Role,
		Output:      output,
		TokensUsed:  tokensUsed,
		CompletedAt: time.Now().Format(time.RFC3339),
	}

	return result, nil
}

// validateBoundaries verifies that every target file path stays inside allowed directories.
func (r *Runner) validateBoundaries(targetPaths []string, allowedBoundaries []string) error {
	// If no boundaries are specified, default to allowing current workspace.
	if len(allowedBoundaries) == 0 {
		return nil
	}

	for _, target := range targetPaths {
		cleanTarget := filepath.Clean(target)
		allowed := false

		for _, boundary := range allowedBoundaries {
			cleanBoundary := filepath.Clean(boundary)
			// Check if the target path starts with the allowed boundary path.
			if strings.HasPrefix(cleanTarget, cleanBoundary) {
				allowed = true
				break
			}
		}

		if !allowed {
			return fmt.Errorf("path '%s' is outside permitted boundaries: %v", target, allowedBoundaries)
		}
	}

	return nil
}
