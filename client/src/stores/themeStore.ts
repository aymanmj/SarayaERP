import { create } from "zustand";

export type ClinicalThemeId =
  | "clinical-light"
  | "clinical-dark"
  | "clinical-emerald";

export interface ClinicalThemeMeta {
  id: ClinicalThemeId;
  labelKey: string;
  fallbackLabel: string;
  swatchHex: string;
  isDark: boolean;
}

export const THEME_STORAGE_KEY = "saraya_clinical_theme";

export const CLINICAL_THEMES: ClinicalThemeMeta[] = [
  {
    id: "clinical-light",
    labelKey: "theme.clinicalLight",
    fallbackLabel: "النهاري السريري",
    swatchHex: "#0369a1",
    isDark: false,
  },
  {
    id: "clinical-dark",
    labelKey: "theme.clinicalDark",
    fallbackLabel: "ليلي للمناوبات",
    swatchHex: "#0284c7",
    isDark: true,
  },
  {
    id: "clinical-emerald",
    labelKey: "theme.clinicalEmerald",
    fallbackLabel: "سرايا الطبي",
    swatchHex: "#0f766e",
    isDark: false,
  },
];

function isValidThemeId(value: string | null): value is ClinicalThemeId {
  return (
    value === "clinical-light" ||
    value === "clinical-dark" ||
    value === "clinical-emerald"
  );
}

export function applyThemeToDocument(theme: ClinicalThemeId): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === "clinical-dark" ? "dark" : "light";
}

function readStoredTheme(): ClinicalThemeId {
  if (typeof window === "undefined") return "clinical-light";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isValidThemeId(raw) ? raw : "clinical-light";
  } catch {
    return "clinical-light";
  }
}

interface ThemeStoreState {
  theme: ClinicalThemeId;
  setTheme: (theme: ClinicalThemeId) => void;
  hydrateTheme: () => void;
}

export const useThemeStore = create<ThemeStoreState>((set) => ({
  theme: "clinical-light",
  setTheme: (theme) => {
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, theme);
      }
    } catch {
      // Ignore storage failures in restricted browsing modes
    }
    applyThemeToDocument(theme);
    set({ theme });
  },
  hydrateTheme: () => {
    const stored = readStoredTheme();
    applyThemeToDocument(stored);
    set({ theme: stored });
  },
}));
