// Platform-specific hardware inspection for Linux and macOS.
// Checks CPU cores, Apple Silicon or Linux GPUs, power source, and storage type.
//go:build !windows

package scanner

import (
	"context"
	"fmt"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// CPUStats holds core counts and CPU model details.
type CPUStats struct {
	ModelName         string
	PhysicalCores     int
	LogicalProcessors int
	UsagePercent      int
}

// RawGPUInfo holds raw GPU name, VRAM bytes, and usage percentage from the OS.
type RawGPUInfo struct {
	Name         string
	AdapterRAM   uint64
	UsagePercent int
}

// PlatformHardwareResult packages all OS-specific hardware details before merging into the main scanner.
type PlatformHardwareResult struct {
	CPU            CPUStats
	GPUs           []RawGPUInfo
	NPUName        string
	NPUFound       bool
	NPUUtil        int
	DiskType       string
	IsNVMe         bool
	DiskModel      string
	HasAVX2        bool
	AIAcceleration string
	CPUL2CacheMb   string
	CPUL3CacheMb   string
	RAMSpeedMHz    int
	PowerSource    string
	BatteryPercent int
	IsPluggedIn    bool
}

// detectPlatformHardware gathers CPU, GPU, NPU, storage, cache, and power details on Unix platforms.
func detectPlatformHardware(ctx context.Context) (PlatformHardwareResult, error) {
	result := PlatformHardwareResult{
		CPU: CPUStats{
			ModelName:         "Generic Unix CPU",
			PhysicalCores:     runtime.NumCPU(),
			LogicalProcessors: runtime.NumCPU(),
			UsagePercent:      0,
		},
		GPUs:           []RawGPUInfo{},
		NPUName:        "Not detected",
		NPUFound:       false,
		NPUUtil:        0,
		DiskType:       "Standard Storage",
		IsNVMe:         false,
		DiskModel:      "Generic Disk",
		PowerSource:    "AC Wall Power",
		BatteryPercent: 100,
		IsPluggedIn:    true,
	}

	ctxTimeout, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()

	switch runtime.GOOS {
	case "darwin":
		// 1. CPU Model & Cores
		if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "machdep.cpu.brand_string").Output(); err == nil {
			brand := strings.TrimSpace(string(out))
			if brand != "" {
				result.CPU.ModelName = brand
			}
		}
		if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.physicalcpu").Output(); err == nil {
			if n, err := strconv.Atoi(strings.TrimSpace(string(out))); err == nil && n > 0 {
				result.CPU.PhysicalCores = n
			}
		}
		if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.logicalcpu").Output(); err == nil {
			if n, err := strconv.Atoi(strings.TrimSpace(string(out))); err == nil && n > 0 {
				result.CPU.LogicalProcessors = n
			}
		}

		// 2. CPU Cache — read performance levels on Apple Silicon, do not report L3 when absent
		pL2Bytes := uint64(0)
		eL2Bytes := uint64(0)
		if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.perflevel0.l2cachesize").Output(); err == nil {
			pL2Bytes, _ = strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
		}
		if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.perflevel1.l2cachesize").Output(); err == nil {
			eL2Bytes, _ = strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64)
		}

		if pL2Bytes > 0 && eL2Bytes > 0 {
			result.CPUL2CacheMb = fmt.Sprintf("P-cluster: %d MB, E-cluster: %d MB", pL2Bytes/(1024*1024), eL2Bytes/(1024*1024))
		} else if pL2Bytes > 0 {
			result.CPUL2CacheMb = fmt.Sprintf("%.1f MB", float64(pL2Bytes)/(1024*1024))
		} else if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.l2cachesize").Output(); err == nil {
			if l2, err := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64); err == nil && l2 > 0 {
				result.CPUL2CacheMb = fmt.Sprintf("%.1f MB", float64(l2)/(1024*1024))
			}
		}

		// L3 cache: Apple Silicon does not have an L3 cache, so only report if > 0
		if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.l3cachesize").Output(); err == nil {
			if l3, err := strconv.ParseUint(strings.TrimSpace(string(out)), 10, 64); err == nil && l3 > 0 {
				result.CPUL3CacheMb = fmt.Sprintf("%.1f MB", float64(l3)/(1024*1024))
			}
		}

		// 3. AI Acceleration & Architecture
		if runtime.GOARCH == "arm64" {
			result.HasAVX2 = false // AVX2 is x86 only; ARM has NEON and AMX
			result.AIAcceleration = "ARM NEON + Apple Neural Engine (Hardware Matrix & Neural Math)"
			result.NPUName = "Apple Neural Engine"
			result.NPUFound = true
		} else {
			if out, err := exec.CommandContext(ctxTimeout, "sysctl", "-n", "hw.optional.avx2_0").Output(); err == nil {
				result.HasAVX2 = strings.TrimSpace(string(out)) == "1"
			}
			if result.HasAVX2 {
				result.AIAcceleration = "AVX2 Supported (Ultra-fast quantized math)"
			} else {
				result.AIAcceleration = "Standard CPU (No AVX2)"
			}
		}

		// 4. Power Source & Battery via pmset -g batt
		if out, err := exec.CommandContext(ctxTimeout, "pmset", "-g", "batt").Output(); err == nil {
			text := string(out)
			if strings.Contains(text, "'Battery Power'") {
				result.IsPluggedIn = false
				result.PowerSource = "Battery Power"
			} else if strings.Contains(text, "'AC Power'") {
				result.IsPluggedIn = true
				result.PowerSource = "AC Wall Power"
			}

			// Parse battery percentage
			for _, line := range strings.Split(text, "\n") {
				if strings.Contains(line, "%") {
					pctIdx := strings.Index(line, "%")
					start := pctIdx - 1
					for start >= 0 && line[start] >= '0' && line[start] <= '9' {
						start--
					}
					if start+1 < pctIdx {
						if pct, err := strconv.Atoi(line[start+1 : pctIdx]); err == nil {
							result.BatteryPercent = pct
						}
					}

					lower := strings.ToLower(line)
					if strings.Contains(lower, "discharging") {
						result.PowerSource = fmt.Sprintf("Battery Power (%d%%, discharging)", result.BatteryPercent)
					} else if strings.Contains(lower, "charging") && !strings.Contains(lower, "finishing charge") {
						result.PowerSource = fmt.Sprintf("AC Wall Power (%d%%, charging)", result.BatteryPercent)
					} else if strings.Contains(lower, "charged") || strings.Contains(lower, "finishing charge") {
						result.PowerSource = "AC Wall Power (Fully Charged)"
					}
					break
				}
			}
		}

		// 5. Storage Model via SPNVMeDataType
		result.IsNVMe = true
		result.DiskType = "Apple Fabric / NVMe SSD"
		result.DiskModel = "Apple Internal NVMe SSD"

		if out, err := exec.CommandContext(ctxTimeout, "system_profiler", "SPNVMeDataType").Output(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				trimmed := strings.TrimSpace(line)
				if strings.HasPrefix(trimmed, "Model:") {
					model := strings.TrimSpace(strings.TrimPrefix(trimmed, "Model:"))
					if model != "" {
						result.DiskModel = model
						break
					}
				}
			}
		}

		// 6. GPU Detection & Core Count via SPDisplaysDataType
		if out, err := exec.CommandContext(ctxTimeout, "system_profiler", "SPDisplaysDataType").Output(); err == nil {
			lines := strings.Split(string(out), "\n")
			var currentChipset string
			var coreCount int
			for _, line := range lines {
				trimmed := strings.TrimSpace(line)
				if strings.HasPrefix(trimmed, "Chipset Model:") {
					currentChipset = strings.TrimSpace(strings.TrimPrefix(trimmed, "Chipset Model:"))
				} else if strings.HasPrefix(trimmed, "Total Number of Cores:") {
					coresStr := strings.TrimSpace(strings.TrimPrefix(trimmed, "Total Number of Cores:"))
					if c, err := strconv.Atoi(coresStr); err == nil && c > 0 {
						coreCount = c
					}
				}
			}
			if currentChipset != "" {
				name := currentChipset
				if coreCount > 0 {
					name = fmt.Sprintf("%s (%d-core GPU)", currentChipset, coreCount)
				}
				result.GPUs = append(result.GPUs, RawGPUInfo{Name: name, AdapterRAM: 0, UsagePercent: 0})
			}
		}
		if len(result.GPUs) == 0 && runtime.GOARCH == "arm64" {
			result.GPUs = append(result.GPUs, RawGPUInfo{Name: "Apple Silicon Integrated GPU", AdapterRAM: 0, UsagePercent: 0})
		}

		// 7. CPU Usage via top (Activity Monitor User + System parity)
		if out, err := exec.CommandContext(ctxTimeout, "top", "-l", "1", "-n", "0").Output(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				if strings.Contains(line, "CPU usage:") {
					// Format: "CPU usage: 12.50% user, 8.25% sys, 79.25% idle"
					var userPct, sysPct, idlePct float64
					parts := strings.Split(line, ",")
					for _, p := range parts {
						p = strings.TrimSpace(p)
						lower := strings.ToLower(p)
						if strings.Contains(lower, "user") {
							numStr := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(lower, "cpu usage:"), "user"))
							numStr = strings.TrimSpace(strings.TrimSuffix(numStr, "%"))
							userPct, _ = strconv.ParseFloat(numStr, 64)
						} else if strings.Contains(lower, "sys") {
							numStr := strings.TrimSpace(strings.TrimSuffix(lower, "sys"))
							numStr = strings.TrimSpace(strings.TrimSuffix(numStr, "%"))
							sysPct, _ = strconv.ParseFloat(numStr, 64)
						} else if strings.Contains(lower, "idle") {
							numStr := strings.TrimSpace(strings.TrimSuffix(lower, "idle"))
							numStr = strings.TrimSpace(strings.TrimSuffix(numStr, "%"))
							idlePct, _ = strconv.ParseFloat(numStr, 64)
						}
					}

					usage := 0
					if userPct > 0 || sysPct > 0 {
						usage = int(math.Round(userPct + sysPct))
					} else if idlePct > 0 {
						usage = int(math.Round(100.0 - idlePct))
					}
					if usage < 0 {
						usage = 0
					} else if usage > 100 {
						usage = 100
					}
					result.CPU.UsagePercent = usage
					break
				}
			}
		}

		// Fallback via ps if top returned 0 or failed
		if result.CPU.UsagePercent == 0 {
			if psOut, err := exec.CommandContext(ctxTimeout, "ps", "-A", "-o", "%cpu").Output(); err == nil {
				var totalCPU float64
				for _, line := range strings.Split(string(psOut), "\n") {
					line = strings.TrimSpace(line)
					if v, err := strconv.ParseFloat(line, 64); err == nil {
						totalCPU += v
					}
				}
				cores := result.CPU.LogicalProcessors
				if cores <= 0 {
					cores = result.CPU.PhysicalCores
				}
				if cores > 0 && totalCPU > 0 {
					avg := int(math.Round(totalCPU / float64(cores)))
					if avg > 100 {
						avg = 100
					}
					result.CPU.UsagePercent = avg
				}
			}
		}

	case "linux":
		// 1. CPU & Instruction Sets via /proc/cpuinfo
		if data, err := os.ReadFile("/proc/cpuinfo"); err == nil {
			content := string(data)
			if runtime.GOARCH == "amd64" {
				result.HasAVX2 = strings.Contains(content, "avx2")
				if result.HasAVX2 {
					result.AIAcceleration = "AVX2 Supported (Ultra-fast quantized math)"
				} else {
					result.AIAcceleration = "Standard CPU (No AVX2)"
				}
			} else if runtime.GOARCH == "arm64" {
				result.HasAVX2 = false
				result.AIAcceleration = "ARM NEON / ASIMD (Vector Math)"
			}

			lines := strings.Split(content, "\n")
			for _, line := range lines {
				if strings.HasPrefix(line, "model name") {
					parts := strings.SplitN(line, ":", 2)
					if len(parts) == 2 && result.CPU.ModelName == "Generic Unix CPU" {
						result.CPU.ModelName = strings.TrimSpace(parts[1])
						break
					}
				}
			}
		}

		// 2. Cache via sysfs
		if data, err := os.ReadFile("/sys/devices/system/cpu/cpu0/cache/index2/size"); err == nil {
			result.CPUL2CacheMb = strings.TrimSpace(string(data))
		}
		if data, err := os.ReadFile("/sys/devices/system/cpu/cpu0/cache/index3/size"); err == nil {
			result.CPUL3CacheMb = strings.TrimSpace(string(data))
		}

		// 3. Power via sysfs (check BAT0, BAT1, BAT2)
		batteryFound := false
		for _, bat := range []string{"BAT0", "BAT1", "BAT2"} {
			capPath := filepath.Join("/sys/class/power_supply", bat, "capacity")
			if data, err := os.ReadFile(capPath); err == nil {
				if pct, err := strconv.Atoi(strings.TrimSpace(string(data))); err == nil {
					result.BatteryPercent = pct
					status := "discharging"
					statPath := filepath.Join("/sys/class/power_supply", bat, "status")
					if statData, err := os.ReadFile(statPath); err == nil {
						status = strings.ToLower(strings.TrimSpace(string(statData)))
					}
					result.PowerSource = fmt.Sprintf("Battery Power (%d%%, %s)", pct, status)
					result.IsPluggedIn = status == "charging" || status == "full"
					batteryFound = true
					break
				}
			}
		}
		if !batteryFound {
			for _, ac := range []string{"AC", "ACAD", "ADP0", "ADP1"} {
				acPath := filepath.Join("/sys/class/power_supply", ac, "online")
				if data, err := os.ReadFile(acPath); err == nil && strings.TrimSpace(string(data)) == "1" {
					result.IsPluggedIn = true
					result.PowerSource = "AC Wall Power"
					break
				}
			}
		}

		// 4. GPUs via lspci
		if out, err := exec.CommandContext(ctxTimeout, "lspci").Output(); err == nil {
			lines := strings.Split(string(out), "\n")
			for _, line := range lines {
				lower := strings.ToLower(line)
				if strings.Contains(lower, "vga compatible controller") || strings.Contains(lower, "3d controller") || strings.Contains(lower, "display controller") {
					parts := strings.SplitN(line, ": ", 2)
					if len(parts) == 2 {
						result.GPUs = append(result.GPUs, RawGPUInfo{Name: strings.TrimSpace(parts[1]), AdapterRAM: 0, UsagePercent: 0})
					}
				}
			}
		}

		// 5. Storage
		if data, err := os.ReadFile("/sys/block/nvme0n1/device/model"); err == nil {
			result.IsNVMe = true
			result.DiskType = "NVMe SSD"
			result.DiskModel = strings.TrimSpace(string(data))
		} else if _, err := os.Stat("/sys/block/nvme0n1"); err == nil {
			result.IsNVMe = true
			result.DiskType = "NVMe SSD"
			result.DiskModel = "Linux NVMe Drive"
		} else if data, err := os.ReadFile("/sys/block/sda/device/model"); err == nil {
			result.DiskModel = strings.TrimSpace(string(data))
			result.DiskType = "SATA Storage"
		}

		// 6. CPU Usage via /proc/stat 100ms delta (System Monitor & htop parity)
		sampleProcStat := func() (uint64, uint64, error) {
			data, err := os.ReadFile("/proc/stat")
			if err != nil {
				return 0, 0, err
			}
			for _, line := range strings.Split(string(data), "\n") {
				if strings.HasPrefix(line, "cpu ") {
					fields := strings.Fields(line)
					if len(fields) >= 5 {
						var total, idle uint64
						for i := 1; i < len(fields); i++ {
							if v, err := strconv.ParseUint(fields[i], 10, 64); err == nil {
								total += v
								if i == 4 || i == 5 { // idle and iowait
									idle += v
								}
							}
						}
						return total, idle, nil
					}
				}
			}
			return 0, 0, fmt.Errorf("cpu line not found")
		}

		if t1, id1, err := sampleProcStat(); err == nil {
			time.Sleep(100 * time.Millisecond)
			if t2, id2, err := sampleProcStat(); err == nil && t2 > t1 {
				deltaTotal := t2 - t1
				deltaIdle := id2 - id1
				if deltaTotal >= deltaIdle {
					deltaUsed := deltaTotal - deltaIdle
					result.CPU.UsagePercent = int(math.Round(float64(deltaUsed) * 100.0 / float64(deltaTotal)))
				}
			} else if t1 > 0 && t1 >= id1 {
				result.CPU.UsagePercent = int(math.Round(float64(t1-id1) * 100.0 / float64(t1)))
			}
		}
	}

	return result, nil
}

// detectComputeAPIs checks which GPU compute translation layers are ready on Unix.
func detectComputeAPIs(isNvidia bool) ComputeAPIs {
	apis := ComputeAPIs{
		CUDA: isNvidia,
	}
	if runtime.GOOS == "darwin" {
		apis.Metal = true
	} else if runtime.GOOS == "linux" {
		// Vulkan loader check
		if _, err := os.Stat("/usr/lib/x86_64-linux-gnu/libvulkan.so.1"); err == nil {
			apis.Vulkan = true
		} else if _, err := os.Stat("/usr/lib/libvulkan.so.1"); err == nil {
			apis.Vulkan = true
		}
		// OpenCL loader check
		if _, err := os.Stat("/usr/lib/x86_64-linux-gnu/libOpenCL.so.1"); err == nil {
			apis.OpenCL = true
		} else if _, err := os.Stat("/usr/lib/libOpenCL.so.1"); err == nil {
			apis.OpenCL = true
		}
	}
	return apis
}

