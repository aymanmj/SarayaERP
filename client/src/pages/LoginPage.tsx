// src/pages/LoginPage.tsx

import { FormEvent, useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  FlaskConical,
  Landmark,
  Lock,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  User,
} from "lucide-react";

export function LoginPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();

  const location = useLocation() as any;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, navigate, location.state]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(
        username.trim(),
        password,
        mfaRequired ? mfaCode.trim() : undefined,
      );
    } catch (err: any) {
      console.error(err);
      const serverMsg = err?.response?.data?.message;

      if (err.code === "ERR_NETWORK") {
        setError(t("login.errNetwork", "تعذّر الاتصال بالسيرفر، تأكد أن الـ API شغّال."));
      } else if (err.response?.status === 401 && serverMsg === "MFA_REQUIRED") {
        setMfaRequired(true);
        setMfaCode("");
        setError(null);
      } else if (err.response?.status === 401) {
        setError(
          typeof serverMsg === "string" && serverMsg.trim()
            ? serverMsg
            : t("login.errUnauthorized", "بيانات الدخول غير صحيحة."),
        );
      } else if (err.response?.status === 429) {
        setError(
          t(
            "login.errTooManyAttempts",
            "تم تجاوز الحد المسموح من المحاولات. يرجى الانتظار والمحاولة لاحقاً.",
          ),
        );
      } else {
        setError(t("login.errUnexpected", "فشل تسجيل الدخول، حدث خطأ غير متوقع."));
      }
    } finally {
      setLoading(false);
    }
  }

  const features = [
    {
      icon: <Stethoscope className="w-5 h-5" strokeWidth={1.75} />,
      label: t("login.triageTitle", "العيادات والطوارئ"),
      desc: t("login.triageDesc", "إدارة شاملة من الاستقبال حتى التخريج"),
    },
    {
      icon: <FlaskConical className="w-5 h-5" strokeWidth={1.75} />,
      label: t("login.labsTitle", "المختبر والأشعة"),
      desc: t("login.labsDesc", "أوامر ونتائج وتقارير متكاملة"),
    },
    {
      icon: <Landmark className="w-5 h-5" strokeWidth={1.75} />,
      label: t("login.financeTitle", "المحاسبة والتأمين"),
      desc: t("login.financeDesc", "فوترة ومطالبات تأمين وقيود محاسبية"),
    },
    {
      icon: <Smartphone className="w-5 h-5" strokeWidth={1.75} />,
      label: t("login.mobileTitle", "تطبيق الجوال"),
      desc: t("login.mobileDesc", "جولات الأطباء وإدارة التنويم والأدوية"),
    },
  ];

  return (
    <div
      dir={isRtl ? "rtl" : "ltr"}
      className="min-h-screen flex bg-slate-950 text-slate-100 relative overflow-hidden"
    >
      {/* ───────── Executive Brand Showcase Panel ───────── */}
      <div className="hidden lg:flex flex-col w-[52%] p-10 xl:p-14 relative z-10 saraya-login-showcase border-e border-slate-800/40 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 15%, rgba(14, 165, 233, 0.14), transparent 45%), radial-gradient(circle at 15% 85%, rgba(197, 160, 68, 0.1), transparent 40%)",
          }}
        />

        {/* Logo + Name */}
        <div className={`relative z-10 flex items-center gap-4 mb-auto ${isRtl ? "flex-row" : "flex-row-reverse text-left"}`}>
          <img
            src="/sarayalogo.png"
            alt={t("common.appName", "نظام السرايا الطبي")}
            className="w-14 h-14 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(197,160,68,0.4)]"
          />
          <div>
            <div className="text-xl font-black tracking-tight saraya-login-title leading-tight">
              {isRtl ? "السرايا للتقنية" : "Al-Saraya Tech"}
            </div>
            <div className="text-[9px] font-semibold tracking-[0.25em] uppercase text-[#c5a044]">
              ALSARAYA TECHNOLOGY
            </div>
          </div>
        </div>

        {/* Middle Content */}
        <div className={`relative z-10 my-auto max-w-lg ${isRtl ? "text-right" : "text-left"}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#c5a044]/10 border border-[#c5a044]/25 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c5a044]" />
            <span className="text-[10px] font-bold text-[#c5a044] tracking-wider uppercase">
              Saraya ERP — Hospital Suite
            </span>
          </div>

          <h1 className="text-4xl xl:text-[2.8rem] font-black leading-[1.2] mb-5 saraya-login-title">
            {t("login.titleIntegrated", "منظومة إدارة")}
            <br />
            <span className="bg-gradient-to-l from-[#c5a044] to-[#e8d48b] bg-clip-text text-transparent">
              {t("login.subtitleIntegrated", "المستشفيات المتكاملة")}
            </span>
          </h1>

          <p className="text-[15px] saraya-login-subtitle leading-[1.8] mb-8">
            {t(
              "login.brandDesc",
              "نظام شامل لإدارة ملفات المرضى، المواعيد، التنويم، العمليات، المختبر، الأشعة، الصيدلية، والمحاسبة مع سجل تدقيق كامل.",
            )}
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border p-3.5 transition-colors duration-300 saraya-login-card"
              >
                <div className="w-9 h-9 rounded-lg bg-[#c5a044]/15 flex items-center justify-center text-[#c5a044] flex-shrink-0 mt-0.5">
                  {f.icon}
                </div>
                <div className={isRtl ? "text-right" : "text-left"}>
                  <div className="text-[13px] font-bold saraya-login-title leading-tight">
                    {f.label}
                  </div>
                  <div className="text-[11px] saraya-login-muted mt-1 leading-relaxed">
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 mt-auto flex items-center justify-between text-[11px] saraya-login-muted">
          <span>
            © {new Date().getFullYear()}{" "}
            {t("login.companyInfo", "شركة السرايا للتقنية — طرابلس، ليبيا")}
          </span>
          <span dir="ltr" className="font-mono">
            v1.0.0
          </span>
        </div>
      </div>

      {/* ───────── Daylight-Safe Form Panel ───────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10 bg-slate-950">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only branding */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <img
              src="/sarayalogo.png"
              alt={t("common.appName", "نظام السرايا الطبي")}
              className="w-16 h-16 object-contain rounded-xl ring-2 ring-[#c5a044]/30 mb-3"
            />
            <div className="text-lg font-black text-slate-100">
              {isRtl ? "السرايا للتقنية" : "Al-Saraya Tech"}
            </div>
            <div className="text-[10px] text-slate-400 tracking-widest uppercase">
              Hospital Suite
            </div>
          </div>

          {/* Header */}
          <div className={`mb-6 ${isRtl ? "text-right" : "text-left"}`}>
            <h2 className="text-[22px] font-black text-slate-100 mb-1.5">
              {t("login.title", "تسجيل الدخول")}
            </h2>
            <p className="text-[13px] text-slate-400">
              {t("login.description", "أدخل بيانات حسابك للوصول إلى لوحة إدارة المنظومة.")}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-3 text-[13px] text-rose-300 bg-rose-950/40 border border-rose-500/30 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="saraya-card rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"
          >
            <div className="space-y-5">
              {!mfaRequired ? (
                <>
                  {/* Username */}
                  <div className={isRtl ? "text-right" : "text-left"}>
                    <label className="block text-[12px] font-semibold mb-2 text-slate-300">
                      {t("login.username", "اسم المستخدم")}
                    </label>
                    <div className="relative">
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 text-slate-500 ${
                          isRtl ? "right-3" : "left-3"
                        }`}
                      >
                        <User className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      </span>
                      <input
                        name="username"
                        className={`w-full bg-slate-950 border border-slate-700 rounded-xl py-3 text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-all ${
                          isRtl ? "pl-4 pr-10" : "pl-10 pr-4"
                        }`}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        dir="ltr"
                        placeholder={t("login.usernamePlaceholder", "اسم المستخدم")}
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div className={isRtl ? "text-right" : "text-left"}>
                    <label className="block text-[12px] font-semibold mb-2 text-slate-300">
                      {t("login.password", "كلمة المرور")}
                    </label>
                    <div className="relative">
                      <span
                        className={`absolute top-1/2 -translate-y-1/2 text-slate-500 ${
                          isRtl ? "right-3" : "left-3"
                        }`}
                      >
                        <Lock className="w-[18px] h-[18px]" strokeWidth={1.75} />
                      </span>
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-10 py-3 text-[14px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500 transition-all"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        dir="ltr"
                        placeholder={t("login.passwordPlaceholder", "••••••••")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={`absolute top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors ${
                          isRtl ? "left-3" : "right-3"
                        }`}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? (
                          <EyeOff className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        ) : (
                          <Eye className="w-[18px] h-[18px]" strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className={isRtl ? "text-right" : "text-left"}>
                  <div className="mb-3 flex items-center justify-between">
                    <label
                      htmlFor="mfa-code"
                      className="block text-[12px] font-semibold text-amber-400"
                    >
                      {t("login.mfaTitle", "رمز التحقق الثنائي (2FA)")}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMfaRequired(false);
                        setMfaCode("");
                        setError(null);
                      }}
                      className="text-[11px] text-slate-400 hover:text-sky-400 underline"
                    >
                      {t("login.mfaBack", "تغيير الحساب")}
                    </button>
                  </div>
                  <p className="mb-3 text-[12px] text-slate-400">
                    {t("login.mfaPrompt", "أدخل الرمز المكون من 6 أرقام من تطبيق المصادقة.")}
                  </p>
                  <input
                    id="mfa-code"
                    name="mfaCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    dir="ltr"
                    autoFocus
                    className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-4 py-3 text-center text-[18px] tracking-[0.4em] font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={t("login.mfaPlaceholder", "000000")}
                  />
                </div>
              )}

              {/* Security note */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <ShieldCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" strokeWidth={1.75} />
                <span>{t("login.securityNote", "بيانات الدخول مشفرة ومحمية بالكامل.")}</span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-xl font-bold text-[14px] py-3 transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-600/20 active:scale-[0.99]"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("login.checking", "جاري التحقق...")}
                  </span>
                ) : (
                  t("login.submit", "تسجيل الدخول")
                )}
              </button>
            </div>
          </form>

          {/* Footer — single instance only */}
          <div className="mt-8 text-center text-[11px] text-slate-500 lg:hidden">
            © {new Date().getFullYear()} {t("login.companyInfo", "شركة السرايا للتقنية — طرابلس، ليبيا")} — Saraya ERP
          </div>
        </div>
      </div>
    </div>
  );
}
