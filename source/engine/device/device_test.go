// Status:: complete
// Unit tests for the Vecta device companion server.
package device

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"
)

func TestDeviceServerLifecycle(t *testing.T) {
	// Use alternative test port to prevent conflicts
	testPort := 8770
	srv := NewServer(testPort)

	if srv.IsRunning() {
		t.Fatal("Expected server not to be running initially")
	}

	if err := srv.Start(); err != nil {
		t.Fatalf("Failed to start device server: %v", err)
	}
	defer srv.Stop()

	if !srv.IsRunning() {
		t.Fatal("Expected server to be running after Start()")
	}

	time.Sleep(50 * time.Millisecond)

	baseURL := fmt.Sprintf("http://127.0.0.1:%d", testPort)

	// 1. Test /health
	resp, err := http.Get(baseURL + "/health")
	if err != nil {
		t.Fatalf("GET /health failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected /health 200 OK, got %d", resp.StatusCode)
	}

	var healthData map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&healthData); err != nil {
		t.Fatalf("Failed to decode /health json: %v", err)
	}
	if healthData["status"] != "ok" {
		t.Fatalf("Expected status 'ok', got %v", healthData["status"])
	}

	// 2. Test State Update & Retrieval
	testMessages := `[{"id":"1","sender":"User","text":"Hello Vecta"}]`
	testTasks := `[{"taskId":"task-1","role":"Coder","status":"running"}]`
	srv.UpdateState("chat-123", []byte(testMessages), []byte(testTasks), nil)

	respState, err := http.Get(baseURL + "/api/state")
	if err != nil {
		t.Fatalf("GET /api/state failed: %v", err)
	}
	defer respState.Body.Close()

	var stateData ServerState
	if err := json.NewDecoder(respState.Body).Decode(&stateData); err != nil {
		t.Fatalf("Failed to decode /api/state: %v", err)
	}
	if stateData.ActiveChatID != "chat-123" {
		t.Fatalf("Expected chat-123, got %s", stateData.ActiveChatID)
	}

	// 3. Test /api/role/toggle POST
	toggleBody := []byte(`{"role":"coder","enabled":true}`)
	respToggle, err := http.Post(baseURL+"/api/role/toggle", "application/json", bytes.NewReader(toggleBody))
	if err != nil {
		t.Fatalf("POST /api/role/toggle failed: %v", err)
	}
	defer respToggle.Body.Close()
	if respToggle.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(respToggle.Body)
		t.Fatalf("POST /api/role/toggle returned %d: %s", respToggle.StatusCode, string(body))
	}

	// 4. Test /api/prompt POST
	promptBody := []byte(`{"role":"coder","prompt":"Write tests"}`)
	respPrompt, err := http.Post(baseURL+"/api/prompt", "application/json", bytes.NewReader(promptBody))
	if err != nil {
		t.Fatalf("POST /api/prompt failed: %v", err)
	}
	defer respPrompt.Body.Close()
	if respPrompt.StatusCode != http.StatusOK {
		t.Fatalf("POST /api/prompt returned %d", respPrompt.StatusCode)
	}

	// 5. Verify Drained Actions
	toggles, prompts := srv.DrainRemoteActions()
	if len(toggles) != 1 {
		t.Fatalf("Expected 1 drained toggle, got %d", len(toggles))
	}
	if toggles[0]["role"] != "coder" || toggles[0]["enabled"] != true {
		t.Fatalf("Unexpected toggle data: %v", toggles[0])
	}
	if len(prompts) != 1 {
		t.Fatalf("Expected 1 drained prompt, got %d", len(prompts))
	}
	if prompts[0]["prompt"] != "Write tests" {
		t.Fatalf("Unexpected prompt data: %v", prompts[0])
	}

	// 6. Test Shutdown
	if err := srv.Stop(); err != nil {
		t.Fatalf("Stop() failed: %v", err)
	}
	if srv.IsRunning() {
		t.Fatal("Expected server not to be running after Stop()")
	}
}
