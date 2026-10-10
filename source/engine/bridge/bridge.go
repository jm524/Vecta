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

// QueueDispatchResult is what Go returns when a task finishes running.
type QueueDispatchResult struct {
	TaskID      string `json:"taskId"`
	Role        string `json:"role"`
	Output      string `json:"output"`
	TokensUsed  int    `json:"tokensUsed"`
	CompletedAt string `json:"completedAt"`
}
