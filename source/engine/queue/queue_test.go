package queue

import (
	"strings"
	"testing"

	"github.com/vecta-cli/engine/bridge"
)

func TestQueueRunnerExecutionAndBoundaries(t *testing.T) {
	runner := NewRunner()

	// 1. Test normal execution inside boundary
	payload := bridge.QueueDispatchPayload{
		TaskID:         "task-test-1",
		Role:           "Coder",
		Stage:          1,
		Prompt:         "Write helper functions",
		FilePaths:      []string{"source/test.ts"},
		FileBoundaries: []string{"source/"},
	}

	result, err := runner.ExecuteTask(payload)
	if err != nil {
		t.Fatalf("expected successful execution, got error: %v", err)
	}
	if result.Role != "Coder" || result.TaskID != "task-test-1" {
		t.Fatalf("unexpected result fields: %+v", result)
	}

	// 2. Test boundary violation check
	badPayload := bridge.QueueDispatchPayload{
		TaskID:         "task-test-bad",
		Role:           "Malicious Role",
		Stage:          1,
		Prompt:         "Touch system directory",
		FilePaths:      []string{"C:\\Windows\\System32\\calc.exe"},
		FileBoundaries: []string{"source/"},
	}

	_, err = runner.ExecuteTask(badPayload)
	if err == nil {
		t.Fatalf("expected error for boundary violation, got nil")
	}
	if !strings.Contains(err.Error(), "outside permitted boundaries") {
		t.Fatalf("expected 'outside permitted boundaries' error, got: %v", err)
	}
}

func Test3xHashLoopDetector(t *testing.T) {
	runner := NewRunner()

	// Dispatch 1: First occurrence of output
	p1 := bridge.QueueDispatchPayload{
		TaskID:          "task-1",
		Role:            "Coder",
		Stage:           1,
		Prompt:          "Generate loop test",
		FilePaths:       []string{"source/"},
		FileBoundaries:  []string{"source/"},
		SimulatedOutput: "IDENTICAL_OUTPUT_TEST_PAYLOAD",
	}

	res1, err := runner.ExecuteTask(p1)
	if err != nil {
		t.Fatalf("expected task 1 to succeed, got error: %v", err)
	}
	if res1.Output != "IDENTICAL_OUTPUT_TEST_PAYLOAD" {
		t.Fatalf("unexpected output 1: %s", res1.Output)
	}

	// Dispatch 2: Second consecutive identical output
	p2 := bridge.QueueDispatchPayload{
		TaskID:          "task-2",
		Role:            "Coder",
		Stage:           1,
		Prompt:          "Generate loop test",
		FilePaths:       []string{"source/"},
		FileBoundaries:  []string{"source/"},
		SimulatedOutput: "IDENTICAL_OUTPUT_TEST_PAYLOAD",
	}

	_, err = runner.ExecuteTask(p2)
	if err != nil {
		t.Fatalf("expected task 2 to succeed (2 consecutive identical is allowed), got error: %v", err)
	}

	// Dispatch 3: Third consecutive identical output - loop detector MUST trip!
	p3 := bridge.QueueDispatchPayload{
		TaskID:          "task-3",
		Role:            "Coder",
		Stage:           1,
		Prompt:          "Generate loop test",
		FilePaths:       []string{"source/"},
		FileBoundaries:  []string{"source/"},
		SimulatedOutput: "IDENTICAL_OUTPUT_TEST_PAYLOAD",
	}

	_, err = runner.ExecuteTask(p3)
	if err == nil {
		t.Fatalf("expected 3x hash loop detector to trip on 3rd identical output, but got nil error")
	}
	if !strings.Contains(err.Error(), "runaway loop detected: 3 consecutive identical outputs") {
		t.Fatalf("unexpected loop error message: %v", err)
	}

	// Test Reset clears the loop detector state
	runner.Reset()
	if len(runner.GetRecentHashes()) != 0 {
		t.Fatalf("expected reset to clear hash history, got: %d", len(runner.GetRecentHashes()))
	}

	// Now task should succeed again
	res4, err := runner.ExecuteTask(p1)
	if err != nil {
		t.Fatalf("expected task to succeed after reset, got: %v", err)
	}
	if res4.Output != "IDENTICAL_OUTPUT_TEST_PAYLOAD" {
		t.Fatalf("unexpected output after reset: %s", res4.Output)
	}
}
