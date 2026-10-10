// Status:: in-progress
// This file is the Go sequential task runner.
// It checks file boundaries and executes tasks one by one.
package queue

import (
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/vecta-cli/engine/bridge"
)

// Runner manages sequential task execution and path checks.
type Runner struct{}

// NewRunner creates a new queue runner.
func NewRunner() *Runner {
	return &Runner{}
}

// ExecuteTask runs a single role task and enforces file boundaries.
func (r *Runner) ExecuteTask(payload bridge.QueueDispatchPayload) (*bridge.QueueDispatchResult, error) {
	// 1. Check Layer 1 file boundaries: ensure the role is not trying to touch forbidden directories.
	if err := r.validateBoundaries(payload.FilePaths, payload.FileBoundaries); err != nil {
		return nil, fmt.Errorf("boundary check failed for %s: %w", payload.Role, err)
	}

	// 2. Simulate task execution duration (one at a time, strictly sequential).
	time.Sleep(300 * time.Millisecond)

	// 3. Formulate the role output.
	output := fmt.Sprintf("[%s completed task %s]: Processed prompt '%s' successfully.", payload.Role, payload.TaskID, payload.Prompt)

	// 4. Return result with token count and timestamp.
	result := &bridge.QueueDispatchResult{
		TaskID:      payload.TaskID,
		Role:        payload.Role,
		Output:      output,
		TokensUsed:  285, // Sample tokens used for this turn
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
