// Platform-specific RAM detection for Linux and macOS.
// Queries /proc/meminfo on Linux or sysctl on macOS to get total and free RAM.
//go:build !windows

package scanner

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
)

// RAMStats stores how much total, free, and used memory the machine has.
type RAMStats struct {
	TotalBytes    uint64
	FreeBytes     uint64
	UsedBytes     uint64
	UsagePercent  int
	PagefileBytes uint64
}

// detectRAMPlatform reads system memory from /proc/meminfo on Linux or sysctl on macOS.
func detectRAMPlatform(ctx context.Context) (RAMStats, error) {
	switch runtime.GOOS {
	case "linux":
		data, err := os.ReadFile("/proc/meminfo")
		if err != nil {
			return RAMStats{}, fmt.Errorf("reading /proc/meminfo: %w", err)
		}
		var total, available uint64
		for _, line := range strings.Split(string(data), "\n") {
			if strings.HasPrefix(line, "MemTotal:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					if kb, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
						total = kb * 1024
					}
				}
			} else if strings.HasPrefix(line, "MemAvailable:") {
				fields := strings.Fields(line)
				if len(fields) >= 2 {
					if kb, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
						available = kb * 1024
					}
				}
			}
		}
		if total > 0 {
			used := uint64(0)
			if total > available {
				used = total - available
			}
			percent := 0
			if total > 0 {
				percent = int((used * 100) / total)
			}
			return RAMStats{
				TotalBytes:   total,
				FreeBytes:    available,
				UsedBytes:    used,
				UsagePercent: percent,
			}, nil
		}
		return RAMStats{}, fmt.Errorf("MemTotal not found in /proc/meminfo")

	case "darwin":
		cmd := exec.CommandContext(ctx, "sysctl", "-n", "hw.memsize")
		out, err := cmd.Output()
		if err != nil {
			return RAMStats{}, fmt.Errorf("running sysctl for RAM: %w", err)
		}
		val, err := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
		if err != nil {
			return RAMStats{}, fmt.Errorf("parsing hw.memsize: %w", err)
		}
		return RAMStats{
			TotalBytes:   val,
			FreeBytes:    val / 2, // approximation fallback
			UsedBytes:    val / 2,
			UsagePercent: 50,
		}, nil

	default:
		return RAMStats{}, fmt.Errorf("unsupported OS for RAM detection: %s", runtime.GOOS)
	}
}
