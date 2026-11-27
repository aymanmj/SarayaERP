import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFoundPage() {
  const { i18n } = useTranslation();
  const isEn = i18n.language?.startsWith("en");

  return (
    <div
      dir={isEn ? "ltr" : "rtl"}
      className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-8 text-center space-y-4">
        <div className="text-5xl font-black text-sky-500 tracking-tight">404</div>
        <h1 className="text-xl font-bold text-white">
          {isEn ? "Page Not Found" : "الصفحة غير موجودة"}
        </h1>
        <p className="text-sm text-slate-400">
          {isEn
            ? "The requested route does not exist or may have been moved."
            : "المسار المطلوب غير متاح أو تم نقله. يمكنك العودة إلى لوحة التحكم الرئيسية."}
        </p>
        <div className="pt-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition"
          >
            {isEn ? "Back to Dashboard" : "العودة للوحة التحكم"}
          </Link>
        </div>
      </div>
    </div>
  );
}
