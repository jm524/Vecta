// Platform-specific disk space detection for Windows.
// Uses GetDiskFreeSpaceExW from kernel32.dll to get available bytes.
//go:build windows

package scanner

import (
	"fmt"
	"syscall"
	"unsafe"
)

// getFreeDiskSpace returns the number of free bytes available on the drive containing dirPath.
func getFreeDiskSpace(dirPath string) (uint64, error) {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getDiskFreeSpaceEx := kernel32.NewProc("GetDiskFreeSpaceExW")

	var freeBytesAvailable uint64

	dirPtr, err := syscall.UTF16PtrFromString(dirPath)
	if err != nil {
		return 0, fmt.Errorf("converting path to UTF-16: %w", err)
	}

	ret, _, callErr := getDiskFreeSpaceEx.Call(
		uintptr(unsafe.Pointer(dirPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailable)),
		0,
		0,
	)
	if ret == 0 {
		return 0, fmt.Errorf("GetDiskFreeSpaceExW failed: %w", callErr)
	}

	return freeBytesAvailable, nil
}
