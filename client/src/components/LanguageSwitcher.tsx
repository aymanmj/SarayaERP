import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(nextLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/50 bg-slate-800/40 text-slate-300 hover:text-white hover:bg-slate-700/50 hover:border-slate-600/50 active:scale-95 transition-all cursor-pointer font-medium text-xs select-none"
      title={i18n.language === "ar" ? "Switch to English" : "التحويل إلى الإنجليزية"}
    >
      <Languages className="w-3.5 h-3.5 text-sky-400" />
      <span>{i18n.language === "ar" ? "English" : "العربية"}</span>
    </button>
  );
}
