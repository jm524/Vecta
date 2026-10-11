// Platform-specific hardware inspection for Windows.
// Checks CPU cores, speeds, GPU models, battery status, and storage type.
//go:build windows

package scanner

import (
	"context"
	"encoding/json"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
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
	CPUL2CacheMb   string
	CPUL3CacheMb   string
	RAMSpeedMHz    int
	PowerSource    string
	BatteryPercent int
	IsPluggedIn    bool
}

type systemPowerStatus struct {
	acLineStatus        byte
	batteryFlag         byte
	batteryLifePercent  byte
	systemStatusFlag    byte
	batteryLifeTime     uint32
	batteryFullLifeTime uint32
}

type psHardwareQuery struct {
	CPU struct {
		Name                      string `json:"Name"`
		NumberOfCores             int    `json:"NumberOfCores"`
		NumberOfLogicalProcessors int    `json:"NumberOfLogicalProcessors"`
		LoadPercentage            int    `json:"LoadPercentage"`
		L2CacheSize               uint64 `json:"L2CacheSize"`
		L3CacheSize               uint64 `json:"L3CacheSize"`
	} `json:"CPU"`
	GPUs      json.RawMessage `json:"GPUs"`
	GPUUtil   int             `json:"GPUUtil"`
	NPU       string          `json:"NPU"`
	NPUUtil   int             `json:"NPUUtil"`
	DiskModel string          `json:"DiskModel"`
	IsNVMe    bool            `json:"IsNVMe"`
	DiskType  string          `json:"DiskType"`
	RAMSpeed  int             `json:"RAMSpeed"`
}

type psGPUItem struct {
	Name       string `json:"Name"`
	AdapterRAM uint64 `json:"AdapterRAM"`
}

// detectPlatformHardware gathers CPU, GPU, NPU, storage, cache, power, and memory speed on Windows.
func detectPlatformHardware(ctx context.Context) (PlatformHardwareResult, error) {
	result := PlatformHardwareResult{
		CPU: CPUStats{
			ModelName:         "Unknown Windows CPU",
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
		DiskModel:      "Unknown Drive",
		PowerSource:    "Unknown Power Source",
		BatteryPercent: 100,
		IsPluggedIn:    true,
	}

	// 1. Direct Win32 checks (AVX2 & Power Status) via kernel32.dll (0 microsecond latency)
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	isProcessorFeaturePresent := kernel32.NewProc("IsProcessorFeaturePresent")
	// 40 = PF_AVX2_INSTRUCTIONS_AVAILABLE
	if ret, _, _ := isProcessorFeaturePresent.Call(40); ret != 0 {
		result.HasAVX2 = true
	}

	getSystemPowerStatus := kernel32.NewProc("GetSystemPowerStatus")
	var sps systemPowerStatus
	if ret, _, _ := getSystemPowerStatus.Call(uintptr(unsafe.Pointer(&sps))); ret != 0 {
		result.IsPluggedIn = sps.acLineStatus == 1
		if result.IsPluggedIn {
			result.PowerSource = "AC Wall Power (Plugged in - Max performance)"
		} else {
			result.PowerSource = "Battery Power (Throttled power-saving)"
		}
		if sps.batteryLifePercent <= 100 {
			result.BatteryPercent = int(sps.batteryLifePercent)
		}
	}

	// 2. Unified PowerShell CIM query for CPU, Cache, GPUs, NPU, Disk, and RAM speed
	psCmd := `$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name, NumberOfCores, NumberOfLogicalProcessors, LoadPercentage, L2CacheSize, L3CacheSize; $gpus = @(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM); $gpuUtil = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Measure-Object -Property UtilizationPercentage -Sum).Sum; $npu = (Get-CimInstance Win32_PnPEntity -Filter "PNPClass = 'ComputeAccelerator'" -ErrorAction SilentlyContinue | Select-Object -First 1).Name; $npuUtil = 0; if ($npu) { $npuUtil = (Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Compute|Neural' } | Measure-Object -Property UtilizationPercentage -Sum).Sum; }; $disk = Get-CimInstance -Namespace Root/Microsoft/Windows/Storage -ClassName MSFT_PhysicalDisk -ErrorAction SilentlyContinue | Select-Object -First 1 FriendlyName, MediaType, BusType; $isNvme = ($disk.BusType -eq 17 -or $disk.FriendlyName -match 'NVMe'); $diskType = 'Standard / HDD'; if ($isNvme) { $diskType = 'NVMe SSD'; } elseif ($disk.MediaType -eq 4) { $diskType = 'SATA SSD'; }; $ramSpeed = (Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | Select-Object -First 1).ConfiguredClockSpeed; if (-not $ramSpeed) { $ramSpeed = (Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue | Select-Object -First 1).Speed; }; @{ CPU = $cpu; GPUs = $gpus; GPUUtil = $gpuUtil; NPU = $npu; NPUUtil = $npuUtil; DiskModel = $disk.FriendlyName; IsNVMe = $isNvme; DiskType = $diskType; RAMSpeed = $ramSpeed } | ConvertTo-Json`

	ctxTimeout, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctxTimeout, "powershell", "-NoProfile", "-Command", psCmd)
	out, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			return result, fmt.Errorf("powershell query failed: %w: %s", err, string(exitErr.Stderr))
		}
		return result, fmt.Errorf("powershell query failed: %w", err)
	}

	var payload psHardwareQuery
	if err := json.Unmarshal(out, &payload); err != nil {
		return result, fmt.Errorf("parsing hardware query json: %w", err)
	}

	if payload.CPU.Name != "" {
		result.CPU.ModelName = strings.TrimSpace(payload.CPU.Name)
	}
	if payload.CPU.NumberOfCores > 0 {
		result.CPU.PhysicalCores = payload.CPU.NumberOfCores
	}
	if payload.CPU.NumberOfLogicalProcessors > 0 {
		result.CPU.LogicalProcessors = payload.CPU.NumberOfLogicalProcessors
	}
	if payload.CPU.LoadPercentage >= 0 {
		result.CPU.UsagePercent = payload.CPU.LoadPercentage
	}
	if payload.CPU.L2CacheSize > 0 {
		result.CPUL2CacheMb = fmt.Sprintf("%.1f MB", float64(payload.CPU.L2CacheSize)/1024)
	}
	if payload.CPU.L3CacheSize > 0 {
		result.CPUL3CacheMb = fmt.Sprintf("%.1f MB", float64(payload.CPU.L3CacheSize)/1024)
	}

	result.RAMSpeedMHz = payload.RAMSpeed

	var gpuList []psGPUItem
	if err := json.Unmarshal(payload.GPUs, &gpuList); err == nil {
		for _, g := range gpuList {
			if strings.TrimSpace(g.Name) != "" {
				result.GPUs = append(result.GPUs, RawGPUInfo{
					Name:         strings.TrimSpace(g.Name),
					AdapterRAM:   g.AdapterRAM,
					UsagePercent: payload.GPUUtil,
				})
			}
		}
	} else {
		var single psGPUItem
		if err := json.Unmarshal(payload.GPUs, &single); err == nil && strings.TrimSpace(single.Name) != "" {
			result.GPUs = append(result.GPUs, RawGPUInfo{
				Name:         strings.TrimSpace(single.Name),
				AdapterRAM:   single.AdapterRAM,
				UsagePercent: payload.GPUUtil,
			})
		}
	}

	if payload.NPU != "" && strings.TrimSpace(payload.NPU) != "" {
		result.NPUName = strings.TrimSpace(payload.NPU)
		result.NPUFound = true
		result.NPUUtil = payload.NPUUtil
	}

	if payload.DiskModel != "" {
		result.DiskModel = strings.TrimSpace(payload.DiskModel)
	}
	if payload.DiskType != "" {
		result.DiskType = strings.TrimSpace(payload.DiskType)
	}
	result.IsNVMe = payload.IsNVMe

	return result, nil
}

// detectComputeAPIs checks which GPU compute translation layers are ready on Windows.
func detectComputeAPIs(isNvidia bool) ComputeAPIs {
	apis := ComputeAPIs{
		DirectML: true, // Built into Windows 10/11 via DirectX 12
		CUDA:     isNvidia,
		Metal:    false,
	}

	// Check if Vulkan loader DLL is present and loadable
	vulkanDLL := syscall.NewLazyDLL("vulkan-1.dll")
	if vulkanDLL.Load() == nil {
		apis.Vulkan = true
	}

	// Check if OpenCL loader DLL is present and loadable
	openclDLL := syscall.NewLazyDLL("OpenCL.dll")
	if openclDLL.Load() == nil {
		apis.OpenCL = true
	}

	return apis
}

