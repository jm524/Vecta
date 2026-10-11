// Status:: in-progress
// Day 9 (Step 3) & Sprint Plan §2U — Unified Model Catalog.
// Merges models from two sources:
// 1. Running local AI runtimes (Ollama, LM Studio, llama.cpp, GPT4All).
// 2. On-disk local AI model files (.gguf, .safetensors) found in default directories + user-added custom paths.
// Duplicates merge into a single catalog entry tagged with runtime and disk status.
package scanner

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

// CatalogItem represents a unified model available for Vecta roles to use.
type CatalogItem struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Source        string `json:"source"` // "runtime", "file", "runtime + file"
	RuntimeName   string `json:"runtimeName,omitempty"`
	Path          string `json:"path,omitempty"`
	Format        string `json:"format"` // "gguf", "safetensors", etc.
	SizeMB        int64  `json:"sizeMb"`
	ParameterSize string `json:"parameterSize,omitempty"`
	Quantization  string `json:"quantization,omitempty"`
	Family        string `json:"family,omitempty"`
	Runnable      bool   `json:"runnable"` // true for .gguf or runtime models
	Running       bool   `json:"running"`  // true if currently running in a server
}

// buildModelCatalog merges runtime models, scanned default disk files, and user-added custom paths.
func buildModelCatalog(ctx context.Context, runtimes []RuntimeStatus, defaultDiskModels []ModelFile, customPaths []string) []CatalogItem {
	var catalog []CatalogItem
	seen := make(map[string]int) // normalized name -> index in catalog

	// 1. Add all runtime models
	for _, rt := range runtimes {
		for _, m := range rt.Models {
			normKey := normalizeModelKey(m.Name)
			item := CatalogItem{
				ID:            m.ID,
				Name:          m.Name,
				Source:        "runtime",
				RuntimeName:   rt.Name,
				Format:        m.Format,
				SizeMB:        m.SizeMB,
				ParameterSize: m.ParameterSize,
				Quantization:  m.Quantization,
				Family:        m.Family,
				Runnable:      true, // Anything in a running server is runnable
				Running:       m.CurrentlyRunning,
			}
			if item.ID == "" {
				item.ID = m.Name
			}

			seen[normKey] = len(catalog)
			catalog = append(catalog, item)
		}
	}

	// 2. Process on-disk models (default scanned + any user-specified paths)
	allDiskModels := make([]ModelFile, 0, len(defaultDiskModels))
	allDiskModels = append(allDiskModels, defaultDiskModels...)

	// Scan any custom user-added paths
	if len(customPaths) > 0 {
		customDiskModels := scanCustomPaths(ctx, customPaths)
		allDiskModels = append(allDiskModels, customDiskModels...)
	}

	for _, file := range allDiskModels {
		normKey := normalizeModelKey(file.Name)
		paramSize, quant, family := ParseModelMetadata(file.Name)

		if idx, exists := seen[normKey]; exists {
			// Duplicate found: update existing runtime entry with disk path
			catalog[idx].Path = file.Path
			catalog[idx].Source = "runtime + file"
			if catalog[idx].SizeMB == 0 {
				catalog[idx].SizeMB = file.SizeMB
			}
		} else {
			// New on-disk entry
			item := CatalogItem{
				ID:            file.Path,
				Name:          file.Name,
				Source:        "file",
				Path:          file.Path,
				Format:        file.Format,
				SizeMB:        file.SizeMB,
				ParameterSize: paramSize,
				Quantization:  quant,
				Family:        family,
				Runnable:      file.Runnable, // true only for .gguf in v0.1.0
				Running:       false,
			}
			seen[normKey] = len(catalog)
			catalog = append(catalog, item)
		}
	}

	if catalog == nil {
		catalog = []CatalogItem{}
	}
	return catalog
}

// scanCustomPaths walks user-specified folders or single files.
func scanCustomPaths(ctx context.Context, customPaths []string) []ModelFile {
	var models []ModelFile
	runnableExts := map[string]bool{".gguf": true}
	knownExts := map[string]bool{
		".gguf":        true,
		".safetensors": true,
		".bin":         true,
	}

	for _, p := range customPaths {
		if strings.TrimSpace(p) == "" {
			continue
		}

		info, err := os.Stat(p)
		if err != nil {
			continue
		}

		if !info.IsDir() {
			// Single file pointed directly by user
			ext := strings.ToLower(filepath.Ext(p))
			if knownExts[ext] {
				models = append(models, ModelFile{
					Name:     filepath.Base(p),
					Path:     p,
					Format:   strings.TrimPrefix(ext, "."),
					SizeMB:   info.Size() / (1024 * 1024),
					Runnable: runnableExts[ext],
				})
			}
			continue
		}

		// Directory walk for custom folder
		filepath.WalkDir(p, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}

			if d.IsDir() {
				name := d.Name()
				if name == "node_modules" || (len(name) > 0 && name[0] == '.') {
					return filepath.SkipDir
				}
				return nil
			}

			ext := strings.ToLower(filepath.Ext(path))
			if !knownExts[ext] {
				return nil
			}

			fInfo, err := d.Info()
			if err != nil {
				return nil
			}

			sizeMB := fInfo.Size() / (1024 * 1024)
			if sizeMB < 10 {
				return nil
			}

			models = append(models, ModelFile{
				Name:     d.Name(),
				Path:     path,
				Format:   strings.TrimPrefix(ext, "."),
				SizeMB:   sizeMB,
				Runnable: runnableExts[ext],
			})
			return nil
		})
	}

	return models
}

// normalizeModelKey strips common extensions and tags for fuzzy deduplication.
func normalizeModelKey(name string) string {
	s := strings.ToLower(name)
	s = strings.TrimSuffix(s, ".gguf")
	s = strings.TrimSuffix(s, ".safetensors")
	s = strings.TrimSuffix(s, ":latest")
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, "_", "")
	return s
}
