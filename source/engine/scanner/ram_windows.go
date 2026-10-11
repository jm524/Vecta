// Platform-specific RAM detection for Windows.
// Uses GlobalMemoryStatusEx from kernel32.dll to query total physical RAM, free RAM, and pagefile size.
//go:build windows

package scanner

import (
	"context"
	"fmt"
	"syscall"
	"unsafe"
)

// MEMORYSTATUSEX struct for GlobalMemoryStatusEx
type memoryStatusEx struct {
	cbSize                  uint32
	dwMemoryLoad            uint32
	ullTotalPhys            uint64
	ullAvailPhys            uint64
	ullTotalPageFile        uint64
	ullAvailPageFile        uint64
	ullTotalVirtual         uint64
	ullAvailVirtual         uint64
	ullAvailExtendedVirtual uint64
}

// RAMStats stores how much total, free, and used memory Windows has available.
type RAMStats struct {
	TotalBytes    uint64
	FreeBytes     uint64
	UsedBytes     uint64
	UsagePercent  int
	PagefileBytes uint64
}

// detectRAMPlatform calls Windows GlobalMemoryStatusEx to read real-time memory and pagefile metrics.
func detectRAMPlatform(ctx context.Context) (RAMStats, error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	globalMemoryStatusEx := kernel32.NewProc("GlobalMemoryStatusEx")

	var memInfo memoryStatusEx
	memInfo.cbSize = uint32(unsafe.Sizeof(memInfo))

	ret, _, callErr := globalMemoryStatusEx.Call(uintptr(unsafe.Pointer(&memInfo)))
	if ret == 0 {
		return RAMStats{}, fmt.Errorf("GlobalMemoryStatusEx failed: %w", callErr)
	}

	used := uint64(0)
	if memInfo.ullTotalPhys > memInfo.ullAvailPhys {
		used = memInfo.ullTotalPhys - memInfo.ullAvailPhys
	}

	pagefileBytes := uint64(0)
	if memInfo.ullTotalPageFile > memInfo.ullTotalPhys {
		pagefileBytes = memInfo.ullTotalPageFile - memInfo.ullTotalPhys
	}

	return RAMStats{
		TotalBytes:    memInfo.ullTotalPhys,
		FreeBytes:     memInfo.ullAvailPhys,
		UsedBytes:     used,
		UsagePercent:  int(memInfo.dwMemoryLoad),
		PagefileBytes: pagefileBytes,
	}, nil
}
