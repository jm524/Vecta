// Status:: complete
// Real Model Inference Engine for Vecta.
// Handles local Ollama (127.0.0.1:11434), cloud OpenAI-compatible endpoints,
// and enforces the Day 19 fallback law: fallback to Llama 3.1 8B / vecta-default strictly only if downloaded.
package models

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// InferenceRequest specifies the model, endpoint, prompt, and credentials for a task execution.
type InferenceRequest struct {
	Model         string `json:"model"`
	Prompt        string `json:"prompt"`
	SystemPrompt  string `json:"systemPrompt,omitempty"`
	Endpoint      string `json:"endpoint,omitempty"`
	Assignment    string `json:"assignment,omitempty"` // "local" or "cloud"
	CustomPath    string `json:"customPath,omitempty"`
	APIKey        string `json:"apiKey,omitempty"`
	MaxTokens     int    `json:"maxTokens,omitempty"`
	Temperature   float64`json:"temperature,omitempty"`
}

// InferenceResponse returns the generated text, token count, and metadata.
type InferenceResponse struct {
	Output      string `json:"output"`
	TokensUsed  int    `json:"tokensUsed"`
	Model       string `json:"model"`
	IsFallback  bool   `json:"isFallback"`
	Offline     bool   `json:"offline"`
	OfflineNote string `json:"offlineNote,omitempty"`
}

// Client executes HTTP requests against local Ollama or cloud providers.
type Client struct {
	httpClient *http.Client
	ollamaURL  string
}

// NewClient creates an inference client with sensible timeouts.
func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout: 15 * time.Minute, // 15-minute timeout allowing full 10-minute agent task execution
		},
		ollamaURL: "http://127.0.0.1:11434",
	}
}

// OllamaTagsResponse represents models returned by GET /api/tags
type OllamaTagsResponse struct {
	Models []struct {
		Name       string `json:"name"`
		Model      string `json:"model"`
		ModifiedAt string `json:"modified_at"`
		Size       int64  `json:"size"`
	} `json:"models"`
}

// ListOllamaModels returns the names of all currently loaded/available models in Ollama.
func (c *Client) ListOllamaModels(ctx context.Context) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.ollamaURL+"/api/tags", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama not reachable on %s: %w", c.ollamaURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("ollama /api/tags returned HTTP %d: %s", resp.StatusCode, string(body))
	}

	var data OllamaTagsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("failed to decode ollama tags: %w", err)
	}

	names := make([]string, 0, len(data.Models))
	for _, m := range data.Models {
		names = append(names, m.Name)
	}
	return names, nil
}

// HasOllamaModel checks whether a specific model tag is present in Ollama.
func (c *Client) HasOllamaModel(ctx context.Context, modelName string) bool {
	models, err := c.ListOllamaModels(ctx)
	if err != nil {
		return false
	}
	cleanTarget := strings.ToLower(strings.TrimSpace(modelName))
	for _, m := range models {
		cleanM := strings.ToLower(strings.TrimSpace(m))
		if cleanM == cleanTarget || strings.HasPrefix(cleanM, cleanTarget+":") || strings.HasPrefix(cleanTarget, cleanM+":") {
			return true
		}
	}
	return false
}

// OllamaGenerateRequest is the JSON payload for Ollama /api/generate
type OllamaGenerateRequest struct {
	Model     string                 `json:"model"`
	Prompt    string                 `json:"prompt"`
	System    string                 `json:"system,omitempty"`
	Stream    bool                   `json:"stream"`
	KeepAlive string                 `json:"keep_alive,omitempty"`
	Options   map[string]interface{} `json:"options,omitempty"`
}

// OllamaGenerateResponse is the JSON response from Ollama /api/generate
type OllamaGenerateResponse struct {
	Response        string `json:"response"`
	Done            bool   `json:"done"`
	TotalDuration   int64  `json:"total_duration"`
	PromptEvalCount int    `json:"prompt_eval_count"`
	EvalCount       int    `json:"eval_count"`
}

// ExecuteInference executes real inference for a role task.
// If the assigned model is unavailable, it enforces the Day 19 law:
// Fallback to Llama 3.1 8B / vecta-default strictly only if downloaded on disk.
func (c *Client) ExecuteInference(ctx context.Context, req InferenceRequest) (*InferenceResponse, error) {
	// If this is a cloud assignment with an API key, call the cloud endpoint
	if req.Assignment == "cloud" && req.APIKey != "" {
		return c.executeCloudInference(ctx, req)
	}

	// Local execution path:
	targetModel := strings.TrimSpace(req.Model)
	if targetModel == "" {
		targetModel = "vecta-default:latest"
	}
	if strings.Contains(targetModel, "sha256-dde5aa") || strings.Contains(req.CustomPath, "sha256-dde5aa") {
		targetModel = "llama3.2:3b"
	}

	// Check if local Ollama has the requested model
	hasTarget := c.HasOllamaModel(ctx, targetModel)
	isFallback := false

	if !hasTarget {
		// Priority 1: Check llama3.2:3b (fast 3B model on external drive D:)
		// Priority 2: Check vecta-default:latest
		// Priority 3: Check llama3.1:8b
		fallbackCandidates := []string{"llama3.2:3b", "llama3.2", "vecta-default:latest", "vecta-default", "llama3.1:8b", "llama3.1"}
		var resolvedFallback string

		for _, cand := range fallbackCandidates {
			if c.HasOllamaModel(ctx, cand) {
				resolvedFallback = cand
				break
			}
		}

		// User requirement: Support ANY local model that the user has downloaded
		if resolvedFallback == "" {
			allModels, err := c.ListOllamaModels(ctx)
			if err == nil && len(allModels) > 0 {
				resolvedFallback = allModels[0]
			}
		}

		if resolvedFallback != "" {
			targetModel = resolvedFallback
			isFallback = true
		} else {
			// Model is neither locally available nor present on disk
			offlineMsg := fmt.Sprintf(
				"[Model Offline]: Local model '%s' was not detected. Please ensure your external model drive (D:\\) is connected, Ollama is running, or select a model in /roles.",
				req.Model,
			)
			return &InferenceResponse{
				Output:      offlineMsg,
				TokensUsed:  0,
				Model:       req.Model,
				IsFallback:  false,
				Offline:     true,
				OfflineNote: offlineMsg,
			}, nil
		}
	}

	// Call local Ollama
	payload := OllamaGenerateRequest{
		Model:     targetModel,
		Prompt:    req.Prompt,
		System:    req.SystemPrompt,
		Stream:    false,
		KeepAlive: "60m", // Keep model pinned in RAM across all tasks in the pipeline
		Options: map[string]interface{}{
			"temperature": 0.2,
		},
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal ollama request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.ollamaURL+"/api/generate", bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.httpClient.Do(httpReq)
	if err != nil {
		// Connection failed (e.g. Ollama daemon not running or external drive unmounted)
		offlineMsg := fmt.Sprintf(
			"[Model Offline]: Cannot connect to Ollama at %s. Ensure Ollama is running and external model drive (D:\\) is connected.",
			c.ollamaURL,
		)
		return &InferenceResponse{
			Output:      offlineMsg,
			TokensUsed:  0,
			Model:       targetModel,
			IsFallback:  isFallback,
			Offline:     true,
			OfflineNote: offlineMsg,
		}, nil
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(httpResp.Body)
		offlineMsg := fmt.Sprintf("[Model Error HTTP %d]: %s", httpResp.StatusCode, string(respBody))
		return &InferenceResponse{
			Output:      offlineMsg,
			TokensUsed:  0,
			Model:       targetModel,
			IsFallback:  isFallback,
			Offline:     true,
			OfflineNote: offlineMsg,
		}, nil
	}

	var ollamaResp OllamaGenerateResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&ollamaResp); err != nil {
		return nil, fmt.Errorf("failed to decode ollama response: %w", err)
	}

	tokens := ollamaResp.EvalCount
	if tokens == 0 {
		tokens = ollamaResp.PromptEvalCount
	}
	if tokens == 0 {
		// Approximation: ~4 characters per token if counter missing
		tokens = len(ollamaResp.Response) / 4
	}

	return &InferenceResponse{
		Output:     ollamaResp.Response,
		TokensUsed: tokens,
		Model:      targetModel,
		IsFallback: isFallback,
		Offline:    false,
	}, nil
}

// executeCloudInference calls OpenAI-compatible cloud endpoints with Bearer auth.
func (c *Client) executeCloudInference(ctx context.Context, req InferenceRequest) (*InferenceResponse, error) {
	endpoint := req.Endpoint
	if endpoint == "" {
		endpoint = "https://api.openai.com/v1"
	}
	endpoint = strings.TrimRight(endpoint, "/") + "/chat/completions"

	messages := []map[string]string{}
	if req.SystemPrompt != "" {
		messages = append(messages, map[string]string{"role": "system", "content": req.SystemPrompt})
	}
	messages = append(messages, map[string]string{"role": "user", "content": req.Prompt})

	cloudPayload := map[string]interface{}{
		"model":       req.Model,
		"messages":    messages,
		"temperature": 0.2,
	}

	b, err := json.Marshal(cloudPayload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return &InferenceResponse{
			Output:     fmt.Sprintf("[Cloud API Error]: %v", err),
			TokensUsed: 0,
			Model:      req.Model,
			Offline:    true,
		}, nil
	}
	defer resp.Body.Close()

	var cloudResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
		Error *struct {
			Message string `json:"message"`
		} `json:"error,omitempty"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&cloudResp); err != nil {
		return nil, err
	}

	if cloudResp.Error != nil {
		return &InferenceResponse{
			Output:     fmt.Sprintf("[Cloud API Error]: %s", cloudResp.Error.Message),
			TokensUsed: 0,
			Model:      req.Model,
			Offline:    true,
		}, nil
	}

	output := ""
	if len(cloudResp.Choices) > 0 {
		output = cloudResp.Choices[0].Message.Content
	}

	return &InferenceResponse{
		Output:     output,
		TokensUsed: cloudResp.Usage.TotalTokens,
		Model:      req.Model,
		IsFallback: false,
		Offline:    false,
	}, nil
}
