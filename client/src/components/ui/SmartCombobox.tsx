// src/components/ui/SmartCombobox.tsx

import { useState, useEffect, useRef } from "react";

type Option = {
  id: number;
  label: string;
  subLabel?: string;
  code?: string;
};

type Props = {
  placeholder: string;
  onSearch: (query: string) => Promise<Option[]>;
  onSelect: (option: Option) => void;
  autoFocus?: boolean;
};

export function SmartCombobox({
  placeholder,
  onSearch,
  onSelect,
  autoFocus,
}: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Debounce Search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length === 0) {
        setOptions([]);
        return;
      }
      setLoading(true);
      try {
        const results = await onSearch(query);
        setOptions(results);
        setHighlightedIndex(0);
        setIsOpen(true);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, onSearch]);

  // Keyboard Navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex(
        (prev) => (prev - 1 + options.length) % options.length,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (options[highlightedIndex]) {
        handleSelect(options[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (opt: Option) => {
    onSelect(opt);
    setQuery("");
    setIsOpen(false);
    // إبقاء التركيز في الحقل لإضافة المزيد
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 pl-10 text-sm focus:border-sky-500 outline-none transition-all shadow-sm"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setIsOpen(true)}
          autoFocus={autoFocus}
        />
        <div className="absolute left-3 top-3 text-slate-500">
          {loading ? (
            <span className="block w-4 h-4 border-2 border-slate-600 border-t-sky-500 rounded-full animate-spin"></span>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          )}
        </div>
      </div>

      {isOpen && options.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 w-full mt-2 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl max-h-64 overflow-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
        >
          {options.map((opt, idx) => (
            <div
              key={opt.id}
              onClick={() => handleSelect(opt)}
              className={`px-4 py-2.5 cursor-pointer border-b border-slate-800 last:border-0 flex justify-between items-center transition-colors ${
                idx === highlightedIndex
                  ? "bg-sky-600 text-white"
                  : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="flex flex-col">
                <span className="font-medium text-sm">{opt.label}</span>
                {opt.subLabel && (
                  <span
                    className={`text-xs ${idx === highlightedIndex ? "text-sky-200" : "text-slate-500"}`}
                  >
                    {opt.subLabel}
                  </span>
                )}
              </div>
              {opt.code && (
                <span
                  className={`font-mono text-xs px-2 py-0.5 rounded border ${
                    idx === highlightedIndex
                      ? "bg-sky-500/30 border-sky-400"
                      : "bg-slate-950 border-slate-700 text-emerald-400"
                  }`}
                >
                  {opt.code}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
