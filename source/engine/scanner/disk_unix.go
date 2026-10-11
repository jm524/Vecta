// Platform-specific disk space detection for Linux and macOS.
// Uses syscall.Statfs to get available bytes on the filesystem.
//go:build !windows

package scanner

import (
	"fmt"
	"syscall"
)

// getFreeDiskSpace returns the number of free bytes available on the filesystem containing dirPath.
func getFreeDiskSpace(dirPath string) (uint64, error) {
	var stat syscall.Statfs_t
	if err := syscall.Statfs(dirPath, &stat); err != nil {
		return 0, fmt.Errorf("statfs on %s: %w", dirPath, err)
	}
	// Available blocks * block size = available bytes
	return stat.Bavail * uint64(stat.Bsize), nil
}
