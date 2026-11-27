import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Moon, Palette, Stethoscope, Sun } from "lucide-react";
import {
  CLINICAL_THEMES,
  useThemeStore,
  type ClinicalThemeId,
} from "../stores/themeStore";

function ThemeIcon({ themeId }: { themeId: ClinicalThemeId }) {
  if (themeId === "clinical-light") {
    return <Sun className="w-3.5 h-3.5 text-sky-400" />;
  }
  if (themeId === "clinical-emerald") {
    return <Stethoscope className="w-3.5 h-3.5 text-teal-500" />;
  }
  return <Moon className="w-3.5 h-3.5 text-sky-400" />;
}

export function ThemeSwitcher() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const currentMeta =
    CLINICAL_THEMES.find((item) => item.id === theme) ?? CLINICAL_THEMES[1];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("theme.label", "المظهر السريري")}
        aria-expanded={open}
        data-testid="theme-switcher-trigger"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 text-slate-300 hover:text-white hover:bg-slate-700/50 hover:border-slate-600/50 active:scale-95 transition-all cursor-pointer font-medium text-xs select-none"
        title={t("theme.label", "المظهر السريري")}
      >
        <ThemeIcon themeId={currentMeta.id} />
        <span className="hidden sm:inline">
          {t(currentMeta.labelKey, currentMeta.fallbackLabel)}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute ${isRtl ? "left-0" : "right-0"} top-full mt-2 w-52 bg-slate-900 border border-slate-700/70 rounded-xl shadow-xl z-50 overflow-hidden`}
        >
          <div className="px-3 py-2 border-b border-slate-800 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
            <Palette className="w-3.5 h-3.5 text-sky-400" />
            <span>{t("theme.label", "المظهر السريري")}</span>
          </div>
          <div className="py-1">
            {CLINICAL_THEMES.map((item) => {
              const isSelected = item.id === theme;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isSelected}
                  data-testid={`theme-option-${item.id}`}
                  onClick={() => {
                    setTheme(item.id);
                    setOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? "bg-sky-900/30 text-sky-300 font-semibold"
                      : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      className="w-3 h-3 rounded-full border border-slate-500/40 shrink-0"
                      style={{ backgroundColor: item.swatchHex }}
                    />
                    <span>{t(item.labelKey, item.fallbackLabel)}</span>
                  </span>
                  {isSelected && <Check className="w-3.5 h-3.5 text-sky-400" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
