// Status:: in-progress
// This file defines the message shapes that TypeScript and Go send to each other.
package bridge

import "encoding/json"

// Request is what TypeScript sends into Go's standard input.
type Request struct {
	// ID helps match which response belongs to which question.
	ID string `json:"id"`
	// Action tells Go what job to do (for example: "ping").
	Action string `json:"action"`
	// Payload carries any extra information needed for the job.
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Response is what Go sends back out through standard output.
type Response struct {
	// ID matches the ID from the request so TypeScript knows which task finished.
	ID string `json:"id"`
	// Success is true if the job worked, false if something broke.
	Success bool `json:"success"`
	// Data carries the answer or result of the job.
	Data interface{} `json:"data,omitempty"`
	// Error tells what went wrong if Success is false.
	Error string `json:"error,omitempty"`
}

// PingResponse is the simple hello-world answer for action "ping".
type PingResponse struct {
	Message string `json:"message"`
	Version string `json:"version"`
}
