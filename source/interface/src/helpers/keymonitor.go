// Status:: complete
// Native keyboard modifier monitor for Vecta.
// Tracks physical modifier key states (Shift, Ctrl, Alt, Meta) in real time
// to resolve conflicting terminal shortcuts where consoles swallow modifier states.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

var user32 = syscall.NewLazyDLL("user32.dll")
var getAsyncKeyState = user32.NewProc("GetAsyncKeyState")

// Virtual key codes for modifier keys
const (
	vkShift   = 0x10 // Shift (Left or Right)
	vkControl = 0x11 // Ctrl (Left or Right)
	vkMenu    = 0x12 // Alt / Option
	vkLWin    = 0x5B // Left Windows / Super key
	vkRWin    = 0x5C // Right Windows / Super key
)

func isKeyDown(vk uintptr) bool {
	r, _, _ := getAsyncKeyState.Call(vk)
	return (r & 0x8000) != 0
}

func main() {
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	var lastShift, lastCtrl, lastAlt, lastMeta bool

	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-sigChan:
			return
		case <-ticker.C:
			shift := isKeyDown(vkShift)
			ctrl := isKeyDown(vkControl)
			alt := isKeyDown(vkMenu)
			meta := isKeyDown(vkLWin) || isKeyDown(vkRWin)

			if shift != lastShift || ctrl != lastCtrl || alt != lastAlt || meta != lastMeta {
				lastShift = shift
				lastCtrl = ctrl
				lastAlt = alt
				lastMeta = meta

				// Output format: K:shift:ctrl:alt:meta (e.g. K:1:0:0:0)
				fmt.Printf("K:%d:%d:%d:%d\n", b2i(shift), b2i(ctrl), b2i(alt), b2i(meta))
			}
		}
	}
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}
