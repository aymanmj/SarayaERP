import React, { useState, useRef, useEffect } from "react";
import { Search, X, ChevronDown } from "lucide-react";

/**
 * مكوّن بحث ذكي (Searchable Select)
 * يستخدم debounced search مع dropdown يعرض النتائج
 */

export interface SearchableOption {
  id: number;
  label: string;
  sublabel?: string;
  badge?: string;
  badgeColor?: string;
}

interface SearchableSelectProps {
  value: number | null;
  onChange: (id: number | null, option: SearchableOption | null) => void;
  onSearch: (query: string) => Promise<SearchableOption[]>;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export default function SearchableSelect({
  value,
  onChange,
  onSearch,
  placeholder = "ابحث...",
  label,
  required,
  disabled,
  icon,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<SearchableOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Initial load when opening
  useEffect(() => {
    if (open) {
      performSearch(query);
      inputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const performSearch = async (q: string) => {
    setLoading(true);
    try {
      const results = await onSearch(q);
      setOptions(results);
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(val), 300);
  };

  const handleSelect = (opt: SearchableOption) => {
    onChange(opt.id, opt);
    setSelectedLabel(opt.label);
    setQuery("");
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
    setSelectedLabel("");
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-2" ref={containerRef}>
      {label && (
        <label className="text-xs font-bold text-slate-400">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 bg-slate-950 border rounded-xl py-2.5 px-3 text-sm text-right transition-all
          ${open ? "border-sky-500 ring-1 ring-sky-500" : "border-slate-700 hover:border-slate-600"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
      >
        {icon && <span className="text-slate-500 flex-shrink-0">{icon}</span>}
        <span className={`flex-1 truncate ${value ? "text-slate-200" : "text-slate-500"}`}>
          {value ? selectedLabel || `#${value}` : placeholder}
        </span>
        {value ? (
          <span
            onClick={handleClear}
            className="p-0.5 rounded hover:bg-slate-800 text-slate-500 hover:text-rose-400 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        ) : (
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="relative z-50">
          <div className="absolute top-0 right-0 left-0 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
            {/* Search Input */}
            <div className="p-2 border-b border-slate-800">
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-2.5 text-slate-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleInputChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pr-9 pl-3 text-sm text-slate-200 focus:border-sky-500 outline-none"
                  placeholder="اكتب للبحث..."
                />
              </div>
            </div>

            {/* Results */}
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <div className="animate-spin w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full" />
                </div>
              ) : options.length === 0 ? (
                <div className="text-center py-6 text-slate-600 text-xs">
                  {query ? "لا توجد نتائج" : "اكتب للبحث..."}
                </div>
              ) : (
                options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={`w-full text-right flex items-center gap-3 px-3 py-2.5 hover:bg-sky-500/10 transition-colors ${
                      value === opt.id ? "bg-sky-500/5" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 font-medium truncate">
                        {opt.label}
                      </div>
                      {opt.sublabel && (
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {opt.sublabel}
                        </div>
                      )}
                    </div>
                    {opt.badge && (
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${
                          opt.badgeColor === "green"
                            ? "bg-emerald-900/30 text-emerald-400"
                            : opt.badgeColor === "red"
                              ? "bg-rose-900/30 text-rose-400"
                              : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {opt.badge}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
