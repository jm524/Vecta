// Status:: planned
// Go bridge types mirroring interface/src/types/bridge.ts exactly.
// Agent Context L102: JSON types live in one shared types file, mirrored exactly on Go side. No drift.
package bridge

import "encoding/json"

// Request represents a message sent from TypeScript to Go over stdin.
type Request struct {
	ID      string          `json:"id"`
	Action  string          `json:"action"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Response represents a message sent from Go to TypeScript over stdout.
type Response struct {
	ID      string      `json:"id"`
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}
