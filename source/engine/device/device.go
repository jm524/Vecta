// Status:: complete
// Device server — bound strictly to 127.0.0.1 (never 0.0.0.0, never wifi), exposed via adb reverse.
// Sprint Plan §3 & Claude Docs 04, 08: emulator companion demo target, same USB-boundary security model.
package device

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"
)

// ServerState holds in-memory cached state pushed from the desktop interface
// to be served to the companion device (e.g. Android client over adb reverse).
type ServerState struct {
	ActiveChatID string          `json:"activeChatId"`
	Messages     json.RawMessage `json:"messages"`
	Tasks        json.RawMessage `json:"tasks"`
	Roles        json.RawMessage `json:"roles,omitempty"`
	UpdatedAt    string          `json:"updatedAt"`
}

// Server manages the local HTTP companion server bound strictly to 127.0.0.1.
type Server struct {
	mu           sync.RWMutex
	httpServer   *http.Server
	listener     net.Listener
	isRunning    bool
	port         int
	host         string
	state        ServerState
	roleToggles  []map[string]interface{}
	promptSyncs  []map[string]interface{}
}

// DefaultPort is the standard Vecta device companion port (8765).
const DefaultPort = 8765

// NewServer creates a new companion device server configured for localhost binding.
func NewServer(port int) *Server {
	if port <= 0 {
		port = DefaultPort
	}
	return &Server{
		port:        port,
		host:        "127.0.0.1", // Strictly localhost (never 0.0.0.0 per Sprint Plan §3)
		roleToggles: make([]map[string]interface{}, 0),
		promptSyncs: make([]map[string]interface{}, 0),
		state: ServerState{
			ActiveChatID: "default",
			Messages:     json.RawMessage("[]"),
			Tasks:        json.RawMessage("[]"),
			UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
		},
	}
}

// Start binds the server strictly to 127.0.0.1:port and begins serving HTTP requests.
func (s *Server) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.isRunning {
		return fmt.Errorf("device server is already running on %s:%d", s.host, s.port)
	}

	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to bind device server to %s: %w", addr, err)
	}

	mux := http.NewServeMux()

	// 1. Health and Status
	mux.HandleFunc("/health", s.handleHealth)
	mux.HandleFunc("/status", s.handleStatus)

	// 2. State & Sync Endpoints
	mux.HandleFunc("/api/state", s.handleGetState)
	mux.HandleFunc("/api/chat", s.handleGetChat)
	mux.HandleFunc("/api/queue", s.handleGetQueue)

	// 3. Companion Control Actions (Role Toggles & Prompt Syncs)
	mux.HandleFunc("/api/role/toggle", s.handleRoleToggle)
	mux.HandleFunc("/api/prompt", s.handlePromptSync)

	s.listener = ln
	s.httpServer = &http.Server{
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}
	s.isRunning = true

	// Run HTTP listener in background goroutine
	go func() {
		if err := s.httpServer.Serve(ln); err != nil && err != http.ErrServerClosed {
			s.mu.Lock()
			s.isRunning = false
			s.mu.Unlock()
		}
	}()

	return nil
}

// Stop gracefully shuts down the device server and releases the localhost port.
func (s *Server) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.isRunning || s.httpServer == nil {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	err := s.httpServer.Shutdown(ctx)
	s.isRunning = false
	s.httpServer = nil
	s.listener = nil
	return err
}

// IsRunning returns whether the device server is currently active.
func (s *Server) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isRunning
}

// Port returns the port number the server is bound to.
func (s *Server) Port() int {
	return s.port
}

// UpdateState updates the cached messages and queue tasks to be served to the companion app.
func (s *Server) UpdateState(chatID string, messagesJSON, tasksJSON, rolesJSON []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if chatID != "" {
		s.state.ActiveChatID = chatID
	}
	if len(messagesJSON) > 0 {
		s.state.Messages = json.RawMessage(messagesJSON)
	}
	if len(tasksJSON) > 0 {
		s.state.Tasks = json.RawMessage(tasksJSON)
	}
	if len(rolesJSON) > 0 {
		s.state.Roles = json.RawMessage(rolesJSON)
	}
	s.state.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
}

// DrainRemoteActions returns any role toggles or prompt updates received from companion devices
// and clears the internal event buffer.
func (s *Server) DrainRemoteActions() (toggles []map[string]interface{}, prompts []map[string]interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()

	toggles = s.roleToggles
	prompts = s.promptSyncs

	s.roleToggles = make([]map[string]interface{}, 0)
	s.promptSyncs = make([]map[string]interface{}, 0)
	return toggles, prompts
}

// -----------------------------------------------------------------------------
// HTTP Handlers
// -----------------------------------------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status": "ok",
		"server": "vecta-device-server",
		"bound":  fmt.Sprintf("%s:%d", s.host, s.port),
		"time":   time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	running := s.isRunning
	port := s.port
	host := s.host
	updatedAt := s.state.UpdatedAt
	s.mu.RUnlock()

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":    "ready",
		"running":   running,
		"host":      host,
		"port":      port,
		"bound":     fmt.Sprintf("%s:%d", host, port),
		"updatedAt": updatedAt,
	})
}

func (s *Server) handleGetState(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	st := s.state
	s.mu.RUnlock()

	s.writeJSON(w, http.StatusOK, st)
}

func (s *Server) handleGetChat(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	msg := s.state.Messages
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(msg)
}

func (s *Server) handleGetQueue(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	tasks := s.state.Tasks
	s.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(tasks)
}

func (s *Server) handleRoleToggle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		Role    string `json:"role"`
		Enabled bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, fmt.Sprintf("invalid payload: %v", err), http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.roleToggles = append(s.roleToggles, map[string]interface{}{
		"role":      payload.Role,
		"enabled":   payload.Enabled,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
	s.mu.Unlock()

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Role '%s' toggle queued", payload.Role),
	})
}

func (s *Server) handlePromptSync(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload struct {
		Role   string `json:"role"`
		Prompt string `json:"prompt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, fmt.Sprintf("invalid payload: %v", err), http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	s.promptSyncs = append(s.promptSyncs, map[string]interface{}{
		"role":      payload.Role,
		"prompt":    payload.Prompt,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
	s.mu.Unlock()

	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Prompt for '%s' sync queued", payload.Role),
	})
}

func (s *Server) writeJSON(w http.ResponseWriter, code int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(data)
}
