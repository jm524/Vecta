// Platform-specific RAM detection for Linux and macOS.
// Queries /proc/meminfo on Linux or sysctl on macOS to get total and free RAM.
//go:build !windows

package scanner

import (
	"context"
	"fmt"
	"math"
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

// detectRAMPlatform reads system memory from /proc/meminfo on Linux or sysctl + vm_stat on macOS.
func detectRAMPlatform(ctx context.Context) (RAMStats, error) {
	switch runtime.GOOS {
	case "linux":
		return detectRAMLinux(ctx)
	case "darwin":
		return detectRAMDarwin(ctx)
	default:
		return RAMStats{}, fmt.Errorf("unsupported OS for RAM detection: %s", runtime.GOOS)
	}
}

// detectRAMLinux parses /proc/meminfo to retrieve total memory, available memory, and swap.
func detectRAMLinux(ctx context.Context) (RAMStats, error) {
	data, err := os.ReadFile("/proc/meminfo")
	if err != nil {
		return RAMStats{}, fmt.Errorf("reading /proc/meminfo: %w", err)
	}
	var total, available, swapTotal uint64
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		if strings.HasPrefix(line, "MemTotal:") {
			if kb, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
				total = kb * 1024
			}
		} else if strings.HasPrefix(line, "MemAvailable:") {
			if kb, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
				available = kb * 1024
			}
		} else if strings.HasPrefix(line, "SwapTotal:") {
			if kb, err := strconv.ParseUint(fields[1], 10, 64); err == nil {
				swapTotal = kb * 1024
			}
		}
	}
	if total == 0 {
		return RAMStats{}, fmt.Errorf("MemTotal not found in /proc/meminfo")
	}
	used := uint64(0)
	if total > available {
		used = total - available
	}
	percent := 0
	if total > 0 {
		percent = int(math.Round(float64(used) * 100.0 / float64(total)))
	}
	return RAMStats{
		TotalBytes:    total,
		FreeBytes:     available,
		UsedBytes:     used,
		UsagePercent:  percent,
		PagefileBytes: swapTotal,
	}, nil
}

// detectRAMDarwin queries sysctl hw.memsize, hw.pagesize, vm_stat, and sysctl vm.swapusage on macOS.
func detectRAMDarwin(ctx context.Context) (RAMStats, error) {
	// 1. Total RAM via sysctl hw.memsize
	totalCmd := exec.CommandContext(ctx, "sysctl", "-n", "hw.memsize")
	totalOut, err := totalCmd.Output()
	if err != nil {
		return RAMStats{}, fmt.Errorf("running sysctl for RAM: %w", err)
	}
	totalBytes, err := strconv.ParseUint(strings.TrimSpace(string(totalOut)), 10, 64)
	if err != nil {
		return RAMStats{}, fmt.Errorf("parsing hw.memsize: %w", err)
	}

	// 2. Page size via sysctl hw.pagesize (16384 on Apple Silicon, 4096 on Intel)
	pageSize := uint64(4096)
	if pageOut, err := exec.CommandContext(ctx, "sysctl", "-n", "hw.pagesize").Output(); err == nil {
		if ps, err := strconv.ParseUint(strings.TrimSpace(string(pageOut)), 10, 64); err == nil && ps > 0 {
			pageSize = ps
		}
	}

	// 3. vm_stat for accurate Activity Monitor memory metrics (App + Wired + Compressed = Used, Free + Inactive + Speculative + Purgeable = Available)
	freeBytes := totalBytes / 2
	usedBytes := totalBytes / 2
	usagePercent := 50

	if vmOut, err := exec.CommandContext(ctx, "vm_stat").Output(); err == nil {
		var freePages, activePages, inactivePages, speculativePages, wiredPages, purgeablePages, compressorPages uint64
		hasStats := false

		for _, line := range strings.Split(string(vmOut), "\n") {
			// Extract page size from header if present, e.g. "page size of 16384 bytes"
			if strings.Contains(line, "page size of") {
				if idx := strings.Index(line, "page size of"); idx != -1 {
					sub := strings.TrimSpace(line[idx+12:])
					if bIdx := strings.Index(sub, "bytes"); bIdx != -1 {
						numStr := strings.TrimSpace(sub[:bIdx])
						if ps, err := strconv.ParseUint(numStr, 10, 64); err == nil && ps > 0 {
							pageSize = ps
						}
					}
				}
			}

			parts := strings.Split(line, ":")
			if len(parts) != 2 {
				continue
			}
			key := strings.TrimSpace(parts[0])
			valStr := strings.TrimSpace(strings.TrimSuffix(parts[1], "."))
			val, parseErr := strconv.ParseUint(valStr, 10, 64)
			if parseErr != nil {
				continue
			}

			switch key {
			case "Pages free":
				freePages = val
				hasStats = true
			case "Pages active":
				activePages = val
				hasStats = true
			case "Pages inactive":
				inactivePages = val
				hasStats = true
			case "Pages speculative":
				speculativePages = val
				hasStats = true
			case "Pages wired down":
				wiredPages = val
				hasStats = true
			case "Pages purgeable":
				purgeablePages = val
				hasStats = true
			case "Pages occupied by compressor":
				compressorPages = val
				hasStats = true
			}
		}

		if hasStats {
			// In macOS Activity Monitor:
			// Memory Used = App Memory + Wired Memory + Compressed Memory
			var usedPages uint64
			if activePages > 0 || wiredPages > 0 || compressorPages > 0 {
				usedPages = activePages + wiredPages + compressorPages
			} else {
				availPages := freePages + inactivePages + speculativePages + purgeablePages
				if (availPages * pageSize) < totalBytes {
					usedPages = (totalBytes - (availPages * pageSize)) / pageSize
				}
			}

			usedBytes = usedPages * pageSize
			if usedBytes > totalBytes {
				usedBytes = totalBytes
			}

			availPages := freePages + inactivePages + speculativePages + purgeablePages
			availBytes := availPages * pageSize
			if availBytes > totalBytes {
				availBytes = totalBytes
			}

			if totalBytes >= usedBytes {
				freeBytes = totalBytes - usedBytes
			} else {
				freeBytes = availBytes
			}

			if totalBytes > 0 {
				usagePercent = int(math.Round(float64(usedBytes) * 100.0 / float64(totalBytes)))
			}
		}
	}

	// 4. Swap usage via sysctl vm.swapusage
	// Example output: total = 8192.00M  used = 7372.80M  free = 819.20M  (encrypted)
	var swapBytes uint64
	if swapOut, err := exec.CommandContext(ctx, "sysctl", "-n", "vm.swapusage").Output(); err == nil {
		swapStr := string(swapOut)
		if idx := strings.Index(swapStr, "total ="); idx != -1 {
			sub := strings.TrimSpace(swapStr[idx+7:])
			if endIdx := strings.IndexAny(sub, " \t"); endIdx != -1 {
				numStr := sub[:endIdx]
				if val, err := parseMemoryUnit(numStr); err == nil {
					swapBytes = val
				}
			}
		}
	}

	return RAMStats{
		TotalBytes:    totalBytes,
		FreeBytes:     freeBytes,
		UsedBytes:     usedBytes,
		UsagePercent:  usagePercent,
		PagefileBytes: swapBytes,
	}, nil
}

// parseMemoryUnit turns strings like "8192.00M" or "8.00G" into raw byte counts.
func parseMemoryUnit(s string) (uint64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0, nil
	}
	unit := s[len(s)-1]
	mult := float64(1)
	valPart := s
	switch unit {
	case 'G', 'g':
		mult = 1024 * 1024 * 1024
		valPart = s[:len(s)-1]
	case 'M', 'm':
		mult = 1024 * 1024
		valPart = s[:len(s)-1]
	case 'K', 'k':
		mult = 1024
		valPart = s[:len(s)-1]
	case 'B', 'b':
		valPart = s[:len(s)-1]
	}
	f, err := strconv.ParseFloat(valPart, 64)
	if err != nil {
		return 0, err
	}
	return uint64(f * mult), nil
}
