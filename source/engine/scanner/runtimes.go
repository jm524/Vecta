// Status:: in-progress
// Day 9 (Step 3) — Runtime model query and parsing.
// Queries active local AI runtime APIs (Ollama, LM Studio, llama.cpp, GPT4All)
// for installed and loaded model names, sizes, families, and quantization levels.
// Context-aware with strict timeouts so probes never hang.
package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// RuntimeModel represents an individual model detected in an active runtime server.
type RuntimeModel struct {
	Name             string `json:"name"`
	ID               string `json:"id"`
	Family           string `json:"family,omitempty"`
	ParameterSize    string `json:"parameterSize,omitempty"`
	Quantization     string `json:"quantization,omitempty"`
	SizeMB           int64  `json:"sizeMb,omitempty"`
	Format           string `json:"format,omitempty"`
	CurrentlyRunning bool   `json:"currentlyRunning"`
}

// RuntimeTarget defines a runtime service to probe.
type RuntimeTarget struct {
	Name string
	Port int
}

// queryOllamaModels queries Ollama's /api/tags and /api/ps endpoints.
func queryOllamaModels(ctx context.Context, port int) []RuntimeModel {
	var models []RuntimeModel

	// Client with short timeout
	client := &http.Client{Timeout: 3 * time.Second}

	// 1. Check currently active/loaded models via /api/ps
	activeMap := make(map[string]bool)
	psReq, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("http://127.0.0.1:%d/api/ps", port), nil)
	if err == nil {
		if psResp, err := client.Do(psReq); err == nil && psResp.StatusCode == http.StatusOK {
			defer psResp.Body.Close()
			var psData struct {
				Models []struct {
					Name  string `json:"name"`
					Model string `json:"model"`
				} `json:"models"`
			}
			if body, err := io.ReadAll(psResp.Body); err == nil {
				if err := json.Unmarshal(body, &psData); err == nil {
					for _, m := range psData.Models {
						activeMap[m.Name] = true
						activeMap[m.Model] = true
					}
				}
			}
		}
	}

	// 2. Query all installed models via /api/tags
	tagsReq, err := http.NewRequestWithContext(ctx, "GET", fmt.Sprintf("http://127.0.0.1:%d/api/tags", port), nil)
	if err != nil {
		return models
	}

	resp, err := client.Do(tagsReq)
	if err != nil || resp.StatusCode != http.StatusOK {
		return models
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return models
	}

	var tagsData struct {
		Models []struct {
			Name    string `json:"name"`
			Model   string `json:"model"`
			Size    int64  `json:"size"`
			Details struct {
				Format            string `json:"format"`
				Family            string `json:"family"`
				ParameterSize     string `json:"parameter_size"`
				QuantizationLevel string `json:"quantization_level"`
			} `json:"details"`
		} `json:"models"`
	}

	if err := json.Unmarshal(body, &tagsData); err != nil {
		return models
	}

	for _, m := range tagsData.Models {
		sizeMB := m.Size / (1024 * 1024)
		format := m.Details.Format
		if format == "" {
			format = "gguf"
		}
		paramSize := m.Details.ParameterSize
		quant := m.Details.QuantizationLevel
		family := m.Details.Family

		// Fallback to name parsing if details are empty
		if paramSize == "" || quant == "" || family == "" {
			p, q, f := ParseModelMetadata(m.Name)
			if paramSize == "" {
				paramSize = p
			}
			if quant == "" {
				quant = q
			}
			if family == "" {
				family = f
			}
		}

		isRunning := activeMap[m.Name] || activeMap[m.Model]

		models = append(models, RuntimeModel{
			Name:             m.Name,
			ID:               m.Model,
			Family:           family,
			ParameterSize:    paramSize,
			Quantization:     quant,
			SizeMB:           sizeMB,
			Format:           format,
			CurrentlyRunning: isRunning,
		})
	}

	return models
}

// queryOpenAICompatibleModels queries standard OpenAI-compatible /v1/models endpoints (LM Studio, llama.cpp, GPT4All).
func queryOpenAICompatibleModels(ctx context.Context, port int, runtimeName string) []RuntimeModel {
	var models []RuntimeModel

	client := &http.Client{Timeout: 3 * time.Second}
	url := fmt.Sprintf("http://127.0.0.1:%d/v1/models", port)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return models
	}

	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return models
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return models
	}

	var data struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &data); err != nil {
		return models
	}

	for _, item := range data.Data {
		paramSize, quant, family := ParseModelMetadata(item.ID)
		models = append(models, RuntimeModel{
			Name:             item.ID,
			ID:               item.ID,
			Family:           family,
			ParameterSize:    paramSize,
			Quantization:     quant,
			Format:           "gguf",
			CurrentlyRunning: true, // If it's exposed on /v1/models in LM Studio or llama.cpp, it is loaded
		})
	}

	return models
}

// ParseModelMetadata extracts parameter size, quantization level, and model family from model name/path.
func ParseModelMetadata(name string) (paramSize string, quant string, family string) {
	lower := strings.ToLower(name)

	// Detect Model Family
	switch {
	case strings.Contains(lower, "llama-3") || strings.Contains(lower, "llama3"):
		family = "llama3"
	case strings.Contains(lower, "llama"):
		family = "llama"
	case strings.Contains(lower, "qwen2.5-coder") || strings.Contains(lower, "qwen2.5_coder"):
		family = "qwen-coder"
	case strings.Contains(lower, "qwen"):
		family = "qwen"
	case strings.Contains(lower, "deepseek"):
		family = "deepseek"
	case strings.Contains(lower, "mistral"):
		family = "mistral"
	case strings.Contains(lower, "mixtral"):
		family = "mixtral"
	case strings.Contains(lower, "phi"):
		family = "phi"
	case strings.Contains(lower, "gemma"):
		family = "gemma"
	case strings.Contains(lower, "codellama"):
		family = "codellama"
	default:
		family = "general"
	}

	// Detect Parameter Size (e.g. 1b, 1.5b, 3b, 3.2b, 3.8b, 7b, 8b, 14b, 32b, 70b)
	paramRegex := regexp.MustCompile(`(?i)(?:^|[-_.:\s])([0-9]+(?:\.[0-9]+)?)[bB](?:[-_.:\s]|$)`)
	if match := paramRegex.FindStringSubmatch(name); len(match) > 1 {
		val, err := strconv.ParseFloat(match[1], 64)
		if err == nil {
			if val == float64(int(val)) {
				paramSize = fmt.Sprintf("%dB", int(val))
			} else {
				paramSize = fmt.Sprintf("%.1fB", val)
			}
		}
	}

	// Detect Quantization (e.g. Q4_K_M, Q4_0, Q5_K_S, Q8_0, FP16, IQ3_M)
	quantRegex := regexp.MustCompile(`(?i)(?:^|[-_.])([qQiI][0-9](?:_[a-zA-Z0-9_]+)?|fp16|bf16)(?:[-_.]|$)`)
	if match := quantRegex.FindStringSubmatch(name); len(match) > 1 {
		quant = strings.ToUpper(match[1])
	} else if strings.Contains(strings.ToUpper(name), "Q4") {
		quant = "Q4"
	} else if strings.Contains(strings.ToUpper(name), "Q8") {
		quant = "Q8"
	}

	return paramSize, quant, family
}
