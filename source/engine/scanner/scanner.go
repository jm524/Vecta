// Status:: in-progress
// Hardware scanner — detects system RAM, disk space, GPU name + VRAM.
// Runtime detection: probes Ollama (11434), LM Studio (1234), llama.cpp (8080), GPT4All.
// Sprint Plan §2U: catalog merges running servers + on-disk files.
// Agent Context: platform code isolated, context.Context on anything cancellable.
package scanner

import (
	"context"
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

// GPUInfo details a detected graphics card.
type GPUInfo struct {
	Name         string `json:"name"`
	Type         string `json:"type"` // "NVIDIA Dedicated GPU", "System / Integrated GPU", "Apple Silicon"
	VRAMMb       int    `json:"vramMb"`
	UsedVRAMMb   int    `json:"usedVramMb"`
	UsagePercent int    `json:"usagePercent"`
	IsNvidia     bool   `json:"isNvidia"`
}

// ComputeAPIs tracks available GPU compute translation layers for AI execution.
type ComputeAPIs struct {
	Vulkan   bool `json:"vulkan"`
	OpenCL   bool `json:"opencl"`
	DirectML bool `json:"directml"`
	CUDA     bool `json:"cuda"`
	Metal    bool `json:"metal"`
}

// HardwareInfo holds the detected system hardware specs.
type HardwareInfo struct {
	TotalRAMBytes     uint64      `json:"totalRamBytes"`
	TotalRAMGB        string      `json:"totalRamGb"`
	UsedRAMBytes      uint64      `json:"usedRamBytes"`
	UsedRAMGB         string      `json:"usedRamGb"`
	FreeRAMBytes      uint64      `json:"freeRamBytes"`
	FreeRAMGB         string      `json:"freeRamGb"`
	RAMUsagePercent   int         `json:"ramUsagePercent"`
	PagefileBytes     uint64      `json:"pagefileBytes"`
	PagefileGB        string      `json:"pagefileGb"`
	FreeDiskBytes     uint64      `json:"freeDiskBytes"`
	FreeDiskGB        string      `json:"freeDiskGb"`
	DiskType          string      `json:"diskType"`
	IsNVMe            bool        `json:"isNvme"`
	DiskModel         string      `json:"diskModel"`
	GPUName           string      `json:"gpuName"`
	GPUType           string      `json:"gpuType"`
	GPUVRAMMb         int         `json:"gpuVramMb"`
	GPUUsedVRAMMb     int         `json:"gpuUsedVramMb"`
	GPUUsagePercent   int         `json:"gpuUsagePercent"`
	IsNvidiaGPU       bool        `json:"isNvidiaGpu"`
	GPUs              []GPUInfo   `json:"gpus"`
	ComputeAPIs       ComputeAPIs `json:"computeApis"`
	NPUName           string      `json:"npuName"`
	NPUDetected       bool        `json:"npuDetected"`
	NPUUsagePercent   int         `json:"npuUsagePercent,omitempty"`
	PhysicalCores     int         `json:"physicalCores"`
	LogicalProcessors int         `json:"logicalProcessors"`
	CPUCores          int         `json:"cpuCores"`
	CPUModel          string      `json:"cpuModel"`
	CPUUsagePercent   int         `json:"cpuUsagePercent"`
	CPUL2CacheMb      string      `json:"cpuL2CacheMb,omitempty"`
	CPUL3CacheMb      string      `json:"cpuL3CacheMb,omitempty"`
	HasAVX2           bool        `json:"hasAvx2"`
	RAMSpeedMHz       int         `json:"ramSpeedMhz,omitempty"`
	PowerSource       string      `json:"powerSource"`
	BatteryPercent    int         `json:"batteryPercent"`
	IsPluggedIn       bool        `json:"isPluggedIn"`
	InstalledCLIs     []string    `json:"installedClis"`
	OS                string      `json:"os"`
	Arch              string      `json:"arch"`
}

// RuntimeStatus represents a single detected AI runtime server.
type RuntimeStatus struct {
	Name    string         `json:"name"`
	Port    int            `json:"port"`
	Running bool           `json:"running"`
	Models  []RuntimeModel `json:"models"`
}

// ModelFile represents a local model file found on disk.
type ModelFile struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Format   string `json:"format"`
	SizeMB   int64  `json:"sizeMb"`
	Runnable bool   `json:"runnable"`
}

// ScanResult is the full output of a hardware + runtime + model file scan.
type ScanResult struct {
	Hardware  HardwareInfo    `json:"hardware"`
	Runtimes  []RuntimeStatus `json:"runtimes"`
	Models    []ModelFile     `json:"models"`
	Catalog   []CatalogItem   `json:"catalog"`
	ScannedAt string          `json:"scannedAt"`
}

// RunFullScan performs the complete hardware, runtime, and model file scan.
// Uses context for cancellation support (Agent Context: context.Context on anything cancellable).
func RunFullScan(ctx context.Context) (*ScanResult, error) {
	return RunScanWithOptions(ctx, nil)
}

// RunScanWithOptions performs the scan including any user-specified custom model paths.
func RunScanWithOptions(ctx context.Context, customPaths []string) (*ScanResult, error) {
	hw, err := detectHardware(ctx)
	if err != nil {
		return nil, fmt.Errorf("detecting hardware: %w", err)
	}

	runtimes := probeRuntimes(ctx)
	models := scanModelFiles(ctx)
	if models == nil {
		models = []ModelFile{}
	}
	catalog := buildModelCatalog(ctx, runtimes, models, customPaths)
	if catalog == nil {
		catalog = []CatalogItem{}
	}

	result := &ScanResult{
		Hardware:  *hw,
		Runtimes:  runtimes,
		Models:    models,
		Catalog:   catalog,
		ScannedAt: time.Now().Format(time.RFC3339),
	}

	return result, nil
}

// detectHardware gathers RAM, disk, CPU, and GPU info from the operating system.
func detectHardware(ctx context.Context) (*HardwareInfo, error) {
	info := &HardwareInfo{
		CPUCores:          runtime.NumCPU(),
		LogicalProcessors: runtime.NumCPU(),
		PhysicalCores:     runtime.NumCPU(),
		OS:                runtime.GOOS,
		Arch:              runtime.GOARCH,
		GPUs:              []GPUInfo{},
	}

	// RAM detection — platform-specific
	ramStats, err := detectRAM(ctx)
	if err == nil {
		info.TotalRAMBytes = ramStats.TotalBytes
		info.TotalRAMGB = fmt.Sprintf("%.1f GB", float64(ramStats.TotalBytes)/(1024*1024*1024))
		info.FreeRAMBytes = ramStats.FreeBytes
		info.FreeRAMGB = fmt.Sprintf("%.1f GB", float64(ramStats.FreeBytes)/(1024*1024*1024))
		info.UsedRAMBytes = ramStats.UsedBytes
		info.UsedRAMGB = fmt.Sprintf("%.1f GB", float64(ramStats.UsedBytes)/(1024*1024*1024))
		info.RAMUsagePercent = ramStats.UsagePercent
		info.PagefileBytes = ramStats.PagefileBytes
		if ramStats.PagefileBytes > 0 {
			info.PagefileGB = fmt.Sprintf("%.1f GB", float64(ramStats.PagefileBytes)/(1024*1024*1024))
		} else {
			info.PagefileGB = "0.0 GB"
		}
	}

	// Disk space — check the drive where the working directory lives
	disk, err := detectFreeDisk()
	if err == nil {
		info.FreeDiskBytes = disk
		info.FreeDiskGB = fmt.Sprintf("%.1f GB", float64(disk)/(1024*1024*1024))
	}

	// CPU, GPU, NPU, and Storage detection from unified platform query
	platRes, _ := detectPlatformHardware(ctx)
	info.DiskType = platRes.DiskType
	info.IsNVMe = platRes.IsNVMe
	info.DiskModel = platRes.DiskModel
	if platRes.CPU.ModelName != "" {
		info.CPUModel = platRes.CPU.ModelName
	}
	if platRes.CPU.PhysicalCores > 0 {
		info.PhysicalCores = platRes.CPU.PhysicalCores
	}
	if platRes.CPU.LogicalProcessors > 0 {
		info.LogicalProcessors = platRes.CPU.LogicalProcessors
		info.CPUCores = platRes.CPU.LogicalProcessors
	}
	info.CPUUsagePercent = platRes.CPU.UsagePercent

	// GPU detection — distinguishes NVIDIA dedicated vs System/Integrated GPUs with utilization
	gpus := detectGPUs(ctx, platRes.GPUs)
	info.GPUs = gpus
	if len(gpus) > 0 {
		// Prefer dedicated NVIDIA GPU if present
		primary := gpus[0]
		for _, g := range gpus {
			if g.IsNvidia {
				primary = g
				break
			}
		}
		info.GPUName = primary.Name
		info.GPUType = primary.Type
		info.GPUVRAMMb = primary.VRAMMb
		info.GPUUsedVRAMMb = primary.UsedVRAMMb
		info.GPUUsagePercent = primary.UsagePercent
		info.IsNvidiaGPU = primary.IsNvidia
	} else {
		info.GPUName = "Not detected"
		info.GPUType = "Not detected"
		info.GPUVRAMMb = 0
		info.GPUUsedVRAMMb = 0
		info.GPUUsagePercent = 0
		info.IsNvidiaGPU = false
	}

	// NPU detection
	info.NPUName = platRes.NPUName
	info.NPUDetected = platRes.NPUFound
	if platRes.NPUFound {
		info.NPUUsagePercent = platRes.NPUUtil
	}

	// GPU compute API translation layers (Vulkan, OpenCL, DirectML, CUDA, Metal)
	info.ComputeAPIs = detectComputeAPIs(info.IsNvidiaGPU)

	// CPU Cache, AI Instruction extensions, RAM speed, and Power status
	info.HasAVX2 = platRes.HasAVX2
	info.CPUL2CacheMb = platRes.CPUL2CacheMb
	info.CPUL3CacheMb = platRes.CPUL3CacheMb
	info.RAMSpeedMHz = platRes.RAMSpeedMHz
	info.PowerSource = platRes.PowerSource
	info.BatteryPercent = platRes.BatteryPercent
	info.IsPluggedIn = platRes.IsPluggedIn
	info.InstalledCLIs = detectInstalledCLIs()

	return info, nil
}

// detectInstalledCLIs checks if dedicated local AI model runner CLIs are available in PATH.
func detectInstalledCLIs() []string {
	tools := []string{"ollama", "llama-server", "llama-cli", "lms", "vllm"}
	var found []string
	for _, tool := range tools {
		if path, err := exec.LookPath(tool); err == nil && path != "" {
			found = append(found, tool)
		}
	}
	return found
}

// detectRAM reads total and available system memory.
func detectRAM(ctx context.Context) (RAMStats, error) {
	return detectRAMPlatform(ctx)
}

// detectFreeDisk checks available disk space on the working directory's drive.
func detectFreeDisk() (uint64, error) {
	wd, err := os.Getwd()
	if err != nil {
		return 0, fmt.Errorf("getting working directory: %w", err)
	}
	return getFreeDiskSpace(wd)
}

// detectGPUs finds all GPUs (NVIDIA dedicated + platform/integrated system GPUs).
func detectGPUs(ctx context.Context, rawGPUs []RawGPUInfo) []GPUInfo {
	var gpus []GPUInfo
	nvidiaFound := false

	// Try nvidia-smi first (works on Windows, Linux, macOS with NVIDIA drivers)
	cmd := exec.CommandContext(ctx, "nvidia-smi",
		"--query-gpu=name,memory.total,memory.used,utilization.gpu",
		"--format=csv,noheader,nounits")
	out, err := cmd.Output()
	if err == nil {
		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.Split(line, ",")
			if len(parts) >= 1 {
				name := strings.TrimSpace(parts[0])
				vramTotal := 0
				vramUsed := 0
				util := 0
				if len(parts) >= 2 {
					vramTotal, _ = strconv.Atoi(strings.TrimSpace(parts[1]))
				}
				if len(parts) >= 3 {
					vramUsed, _ = strconv.Atoi(strings.TrimSpace(parts[2]))
				}
				if len(parts) >= 4 {
					util, _ = strconv.Atoi(strings.TrimSpace(parts[3]))
				}
				gpus = append(gpus, GPUInfo{
					Name:         name,
					Type:         "NVIDIA Dedicated GPU",
					VRAMMb:       vramTotal,
					UsedVRAMMb:   vramUsed,
					UsagePercent: util,
					IsNvidia:     true,
				})
				nvidiaFound = true
			}
		}
	}

	// Merge system/integrated GPUs from platform detection
	for _, raw := range rawGPUs {
		nameLower := strings.ToLower(raw.Name)
		isNvidia := strings.Contains(nameLower, "nvidia")
		if isNvidia && nvidiaFound {
			// Skip duplicate if nvidia-smi already found it
			continue
		}

		gpuType := "System / Integrated GPU"
		if isNvidia {
			gpuType = "NVIDIA Dedicated GPU"
		} else if strings.Contains(nameLower, "apple") {
			gpuType = "Apple Silicon Integrated GPU"
		} else if strings.Contains(nameLower, "radeon") && raw.AdapterRAM > 4*1024*1024*1024 {
			gpuType = "AMD Dedicated GPU"
		}

		vramMb := int(raw.AdapterRAM / (1024 * 1024))

		gpus = append(gpus, GPUInfo{
			Name:         raw.Name,
			Type:         gpuType,
			VRAMMb:       vramMb,
			UsedVRAMMb:   0,
			UsagePercent: raw.UsagePercent,
			IsNvidia:     isNvidia,
		})
	}

	return gpus
}

// probeRuntimes checks if known AI runtimes are listening on their default ports.
// When a runtime is running, it queries the runtime API for exact model names, parameter sizes, and quantization.
// Sprint Plan: Ollama 11434, LM Studio 1234, llama.cpp 8080, GPT4All.
func probeRuntimes(ctx context.Context) []RuntimeStatus {
	targets := []struct {
		Name string
		Port int
	}{
		{"Ollama", 11434},
		{"LM Studio", 1234},
		{"llama.cpp", 8080},
		{"GPT4All", 4891},
	}

	results := make([]RuntimeStatus, 0, len(targets))
	for _, t := range targets {
		running := probePort(ctx, t.Port)
		var models []RuntimeModel
		if running {
			if t.Name == "Ollama" {
				models = queryOllamaModels(ctx, t.Port)
			} else {
				models = queryOpenAICompatibleModels(ctx, t.Port, t.Name)
			}
		}
		if models == nil {
			models = []RuntimeModel{}
		}
		results = append(results, RuntimeStatus{
			Name:    t.Name,
			Port:    t.Port,
			Running: running,
			Models:  models,
		})
	}
	return results
}

// probePort checks if a TCP port is listening on localhost.
// Uses a 1-second timeout so the scan doesn't hang on unresponsive ports.
func probePort(ctx context.Context, port int) bool {
	addr := fmt.Sprintf("127.0.0.1:%d", port)
	dialer := net.Dialer{Timeout: 1 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", addr)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// scanModelFiles looks for local AI model files (.gguf, .safetensors) in default folders.
// Sprint Plan §2U: scan Ollama models dir, LM Studio models dir, HuggingFace cache,
// llama.cpp model folders, plus any user-added paths.
func scanModelFiles(ctx context.Context) []ModelFile {
	var models []ModelFile
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return models
	}

	// Default search directories for model files
	searchDirs := getDefaultModelDirs(homeDir)

	// Supported model file extensions
	// Sprint Plan §2U: .gguf runnable in v0.1.0; others listed but marked not runnable
	runnableExts := map[string]bool{".gguf": true}
	knownExts := map[string]bool{
		".gguf":         true,
		".safetensors":  true,
		".bin":          true,
	}

	for _, dir := range searchDirs {
		// Skip directories that don't exist
		info, err := os.Stat(dir)
		if err != nil || !info.IsDir() {
			continue
		}

		// Walk the directory tree looking for model files
		filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
			if err != nil {
				return nil // skip inaccessible files
			}
			// Respect context cancellation
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			if d.IsDir() {
				// Skip node_modules and hidden directories to keep the scan fast
				name := d.Name()
				if name == "node_modules" || (len(name) > 0 && name[0] == '.') {
					return filepath.SkipDir
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(p))
			if !knownExts[ext] {
				return nil
			}

			fInfo, err := d.Info()
			if err != nil {
				return nil
			}

			sizeMB := fInfo.Size() / (1024 * 1024)
			// Skip tiny files that are clearly not models (< 10 MB)
			if sizeMB < 10 {
				return nil
			}

			models = append(models, ModelFile{
				Name:     d.Name(),
				Path:     p,
				Format:   strings.TrimPrefix(ext, "."),
				SizeMB:   sizeMB,
				Runnable: runnableExts[ext],
			})
			return nil
		})
	}

	return models
}

// getDefaultModelDirs returns platform-appropriate directories where local AI models are commonly stored.
func getDefaultModelDirs(homeDir string) []string {
	dirs := []string{}

	switch runtime.GOOS {
	case "windows":
		// Ollama default model storage on Windows
		dirs = append(dirs, filepath.Join(homeDir, ".ollama", "models"))
		// LM Studio default model directory
		dirs = append(dirs, filepath.Join(homeDir, ".cache", "lm-studio", "models"))
		// Hugging Face cache
		dirs = append(dirs, filepath.Join(homeDir, ".cache", "huggingface", "hub"))
		// Common llama.cpp model folders
		dirs = append(dirs, filepath.Join(homeDir, "llama.cpp", "models"))

	case "darwin":
		dirs = append(dirs, filepath.Join(homeDir, ".ollama", "models"))
		dirs = append(dirs, filepath.Join(homeDir, ".cache", "lm-studio", "models"))
		dirs = append(dirs, filepath.Join(homeDir, ".cache", "huggingface", "hub"))
		dirs = append(dirs, filepath.Join(homeDir, "llama.cpp", "models"))

	case "linux":
		dirs = append(dirs, filepath.Join(homeDir, ".ollama", "models"))
		dirs = append(dirs, filepath.Join(homeDir, ".cache", "lm-studio", "models"))
		xdgCache := os.Getenv("XDG_CACHE_HOME")
		if xdgCache == "" {
			xdgCache = filepath.Join(homeDir, ".cache")
		}
		dirs = append(dirs, filepath.Join(xdgCache, "huggingface", "hub"))
		dirs = append(dirs, filepath.Join(homeDir, "llama.cpp", "models"))
	}

	return dirs
}
