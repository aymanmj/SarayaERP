// client/src/components/ui/SarayaPrimitives.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

export type SarayaAccent =
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "indigo"
  | "purple"
  | "teal";

const KPI_TOP_BORDER_CLASS: Record<SarayaAccent, string> = {
  sky: "saraya-kpi-top-sky",
  emerald: "saraya-kpi-top-emerald",
  amber: "saraya-kpi-top-amber",
  rose: "saraya-kpi-top-rose",
  indigo: "saraya-kpi-top-indigo",
  purple: "saraya-kpi-top-purple",
  teal: "saraya-kpi-top-teal",
};

const KPI_ICON_TONE_CLASS: Record<SarayaAccent, string> = {
  sky: "bg-sky-500/12 text-sky-400 border-sky-500/25",
  emerald: "bg-emerald-500/12 text-emerald-400 border-emerald-500/25",
  amber: "bg-amber-500/12 text-amber-400 border-amber-500/25",
  rose: "bg-rose-500/12 text-rose-400 border-rose-500/25",
  indigo: "bg-indigo-500/12 text-indigo-400 border-indigo-500/25",
  purple: "bg-purple-500/12 text-purple-400 border-purple-500/25",
  teal: "bg-teal-500/12 text-teal-400 border-teal-500/25",
};

const KPI_VALUE_TONE_CLASS: Record<SarayaAccent, string> = {
  sky: "text-sky-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
  indigo: "text-indigo-400",
  purple: "text-purple-400",
  teal: "text-teal-400",
};

export interface SarayaPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function SarayaPageHeader({
  title,
  subtitle,
  icon,
  actions,
  className = "",
}: SarayaPageHeaderProps) {
  return (
    <div
      className={`flex flex-wrap justify-between items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/80 px-5 py-3.5 shadow-sm ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="p-2.5 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 shrink-0">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg md:text-xl font-extrabold tracking-tight text-slate-50 truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export interface SarayaKpiCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  accent?: SarayaAccent;
  icon?: React.ReactNode;
  ltrValue?: boolean;
  loading?: boolean;
  className?: string;
}

export function SarayaKpiCard({
  label,
  value,
  subtext,
  accent = "sky",
  icon,
  ltrValue = false,
  loading = false,
  className = "",
}: SarayaKpiCardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/80 p-4 shadow-sm hover:shadow-md transition-all flex items-center justify-between gap-3 ${KPI_TOP_BORDER_CLASS[accent]} ${className}`}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-slate-400 truncate">
          {label}
        </div>
        <div
          dir={ltrValue ? "ltr" : undefined}
          className={`text-2xl font-black mt-1 tabular-nums truncate ${
            ltrValue ? "text-right" : ""
          } ${KPI_VALUE_TONE_CLASS[accent]}`}
        >
          {loading ? "..." : value}
        </div>
        {subtext && (
          <div className="text-[11px] text-slate-500 mt-1 truncate">
            {subtext}
          </div>
        )}
      </div>

      {icon && (
        <div
          className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${KPI_ICON_TONE_CLASS[accent]}`}
        >
          {icon}
        </div>
      )}
    </div>
  );
}

export interface SarayaLtrBadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function SarayaLtrBadge({
  children,
  className = "",
}: SarayaLtrBadgeProps) {
  return (
    <span
      dir="ltr"
      className={`inline-flex items-center font-mono tabular-nums ${className}`}
    >
      {children}
    </span>
  );
}

export interface SarayaFilterOption {
  value: string;
  label: string;
}

export interface SarayaFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SarayaFilterOption[];
  placeholder?: string;
  allLabel?: string;
  searchPlaceholder?: string;
  className?: string;
  ariaLabel?: string;
}

export function SarayaFilterSelect({
  value,
  onChange,
  options,
  placeholder = "اختر...",
  allLabel = "الكل",
  searchPlaceholder = "بحث سريع...",
  className = "",
  ariaLabel,
}: SarayaFilterSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleOutside = (event: MouseEvent) => {
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
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel || placeholder}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center justify-between gap-2 bg-slate-950 border rounded-xl px-3 py-2 text-xs transition-all cursor-pointer ${
          open
            ? "border-sky-500 ring-1 ring-sky-500/40"
            : "border-slate-700 hover:border-slate-600"
        }`}
      >
        <span
          className={`truncate ${
            selectedOption ? "text-slate-100 font-semibold" : "text-slate-400"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={0}
              aria-label="مسح الاختيار"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                  setOpen(false);
                }
              }}
              className="p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="absolute right-0 left-0 top-full mt-1.5 min-w-[200px] bg-slate-900 border border-slate-700 rounded-xl shadow-xl z-40 overflow-hidden">
          {options.length > 5 && (
            <div className="p-2 border-b border-slate-800 bg-slate-950/60">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg pr-8 pl-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                !value
                  ? "bg-sky-500/15 text-sky-400 font-bold"
                  : "text-slate-300 hover:bg-slate-800/70"
              }`}
            >
              <span className="truncate">{allLabel}</span>
              {!value && <Check className="w-3.5 h-3.5 shrink-0" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-slate-500">
                لا توجد خيارات مطابقة
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value);
                      setOpen(false);
                    }}
                    className={`w-full text-right px-3 py-2 text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-sky-500/15 text-sky-400 font-bold"
                        : "text-slate-300 hover:bg-slate-800/70"
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
