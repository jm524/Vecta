// Status:: in-progress
// This hook manages whether Vecta is in Planning Mode or Implementation Mode.
// Pressing the Tab key switches modes instantly without asking for confirmation.
import { useState, useCallback } from "react";
import { useInput } from "ink";

export type AppMode = "PLANNING" | "IMPLEMENTATION";

export interface ModeTabState {
  // Current active mode
  mode: AppMode;
  // Function to toggle between modes manually
  toggleMode: () => void;
  // Function to set a specific mode directly
  setMode: (mode: AppMode) => void;
}

export function useModeTab(initialMode: AppMode = "IMPLEMENTATION"): ModeTabState {
  const [mode, setModeState] = useState<AppMode>(initialMode);

  // Toggle between Planning and Implementation
  const toggleMode = useCallback(() => {
    setModeState((current) => (current === "PLANNING" ? "IMPLEMENTATION" : "PLANNING"));
  }, []);

  const setMode = useCallback((newMode: AppMode) => {
    setModeState(newMode);
  }, []);

  // Listen for the Tab key globally
  useInput((_input, key) => {
    if (key.tab) {
      toggleMode();
    }
  });

  return {
    mode,
    toggleMode,
    setMode,
  };
}
