import { beforeEach, describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY, useThemeStore } from "./themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "";
    useThemeStore.setState({ theme: "clinical-light" });
  });

  it("defaults to clinical-light when storage is empty or invalid", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "neon-rainbow");
    useThemeStore.getState().hydrateTheme();

    expect(useThemeStore.getState().theme).toBe("clinical-light");
    expect(document.documentElement.dataset.theme).toBe("clinical-light");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });

  it("switches to clinical-dark and clinical-emerald and updates document attributes", () => {
    useThemeStore.getState().setTheme("clinical-dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("clinical-dark");
    expect(document.documentElement.dataset.theme).toBe("clinical-dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");

    useThemeStore.getState().setTheme("clinical-emerald");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("clinical-emerald");
    expect(document.documentElement.dataset.theme).toBe("clinical-emerald");
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
