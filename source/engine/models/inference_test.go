// Status:: complete
// Unit tests for real model inference engine and fallback behavior.
package models

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestInferenceOfflineFallback(t *testing.T) {
	client := NewClient()
	// Point to unreachable port to simulate missing local model
	client.ollamaURL = "http://127.0.0.1:59999"

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resp, err := client.ExecuteInference(ctx, InferenceRequest{
		Model:  "non-existent-local-model",
		Prompt: "Test prompt",
	})
	if err != nil {
		t.Fatalf("ExecuteInference should not return error on offline model, got: %v", err)
	}

	if !resp.Offline {
		t.Fatal("Expected resp.Offline to be true when model is not available")
	}

	if resp.TokensUsed != 0 {
		t.Fatalf("Expected 0 tokens for offline model, got %d", resp.TokensUsed)
	}
}

func TestInferenceMockOllamaSuccess(t *testing.T) {
	// Create mock Ollama server
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/tags" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"models":[{"name":"llama3.1:8b"},{"name":"vecta-default:latest"}]}`))
			return
		}

		if r.URL.Path == "/api/generate" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{
				"response": "Here is the implemented code function.",
				"done": true,
				"prompt_eval_count": 25,
				"eval_count": 142
			}`))
			return
		}

		http.NotFound(w, r)
	}))
	defer mockServer.Close()

	client := NewClient()
	client.ollamaURL = mockServer.URL

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// 1. Direct model match
	resp, err := client.ExecuteInference(ctx, InferenceRequest{
		Model:  "vecta-default:latest",
		Prompt: "Write a fibonacci function in Go",
	})
	if err != nil {
		t.Fatalf("Inference failed: %v", err)
	}

	if resp.Offline {
		t.Fatal("Expected resp.Offline to be false for running mock Ollama")
	}

	if resp.TokensUsed != 142 {
		t.Fatalf("Expected 142 tokens used, got %d", resp.TokensUsed)
	}

	if resp.Output != "Here is the implemented code function." {
		t.Fatalf("Unexpected output: %s", resp.Output)
	}

	// 2. Fallback to Llama 3.1 8B when requested model is missing
	respFallback, err := client.ExecuteInference(ctx, InferenceRequest{
		Model:  "qwen2.5-coder:32b", // Missing from mock tags
		Prompt: "Audit this function",
	})
	if err != nil {
		t.Fatalf("Fallback inference failed: %v", err)
	}

	if !respFallback.IsFallback {
		t.Fatal("Expected resp.IsFallback to be true when primary model is missing but fallback exists")
	}
}
