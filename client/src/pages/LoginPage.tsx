// src/pages/LoginPage.tsx

import { FormEvent, useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FlaskConical, Landmark, Smartphone, Stethoscope } from "lucide-react";

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
    <div className="min-h-screen flex bg-[#060e1f] text-slate-50 relative overflow-hidden">
      {/* Subtle architectural grid & clinical edge highlight */}
      <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: "radial-gradient(circle at 80% 15%, rgba(14, 165, 233, 0.12), transparent 45%), radial-gradient(circle at 15% 85%, rgba(197, 160, 68, 0.08), transparent 40%)" }} />

      {/* ───────── Showcase Panel (Mirrors order based on dir={isRtl ? "rtl" : "ltr"}/"ltr") ───────── */}
      <div className="hidden lg:flex flex-col w-[52%] p-10 xl:p-14 relative z-10">
        {/* Logo + Name */}
        <div className={`flex items-center gap-4 mb-auto ${isRtl ? 'flex-row' : 'flex-row-reverse text-left'}`}>
          <img
            src="/sarayalogo.png"
            alt={t("common.appName", "نظام السرايا الطبي")}
            className="w-14 h-14 object-contain rounded-xl drop-shadow-[0_0_12px_rgba(197,160,68,0.4)]"
          />
          <div>
            <div className="text-xl font-black tracking-tight text-white leading-tight">
              {isRtl ? "السرايا للتقنية" : "Al-Saraya Tech"}
            </div>
            <div className="text-[9px] font-semibold tracking-[0.25em] uppercase text-[#c5a044]/80">
              ALSARAYA TECHNOLOGY
            </div>
          </div>
        </div>

        {/* Middle Content */}
        <div className={`my-auto max-w-lg ${isRtl ? 'text-right' : 'text-left'}`}>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#c5a044]/10 border border-[#c5a044]/25 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c5a044] animate-pulse" />
            <span className="text-[10px] font-bold text-[#c5a044] tracking-wider uppercase">
              Saraya ERP — Hospital Suite
            </span>
          </div>

          <h1 className="text-4xl xl:text-[2.8rem] font-black leading-[1.2] mb-5">
            {t("login.titleIntegrated", "منظومة إدارة")}
            <br />
            <span className="bg-gradient-to-l from-[#c5a044] to-[#e8d48b] bg-clip-text text-transparent">
              {t("login.subtitleIntegrated", "المستشفيات المتكاملة")}
            </span>
          </h1>

          <p className="text-[15px] text-slate-400 leading-[1.8] mb-8">
            {t("login.brandDesc", "نظام شامل لإدارة ملفات المرضى، المواعيد، التنويم، العمليات، المختبر، الأشعة، الصيدلية، والمحاسبة مع سجل تدقيق كامل.")}
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-3.5 hover:bg-white/[0.05] transition-colors duration-300"
              >
                <div className="w-9 h-9 rounded-lg bg-[#c5a044]/10 flex items-center justify-center text-[#c5a044] flex-shrink-0 mt-0.5">
                  {f.icon}
                </div>
                <div className={isRtl ? "text-right" : "text-left"}>
                  <div className="text-[13px] font-bold text-slate-200 leading-tight">
                    {f.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    {f.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-auto flex items-center justify-between text-[10px] text-slate-600">
          <span>© {new Date().getFullYear()} {t("login.companyInfo", "شركة السرايا للتقنية — طرابلس، ليبيا")}</span>
          <span dir="ltr" className="font-mono">v1.0.0</span>
        </div>
      </div>

      {/* ───────── Form Panel ───────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only branding */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <img
              src="/sarayalogo.png"
              alt={t("common.appName", "نظام السرايا الطبي")}
              className="w-16 h-16 object-contain rounded-xl drop-shadow-[0_0_18px_rgba(197,160,68,0.5)] mb-3"
            />
            <div className="text-lg font-black text-[#c5a044]">
              {isRtl ? "السرايا للتقنية" : "Al-Saraya Tech"}
            </div>
            <div className="text-[10px] text-slate-500 tracking-widest uppercase">
              Hospital Suite
            </div>
          </div>

          {/* Header */}
          <div className={`mb-7 ${isRtl ? 'text-right' : 'text-left'}`}>
            <h2 className="text-[22px] font-black text-white mb-1.5">
              {t("login.title", "تسجيل الدخول")}
            </h2>
            <p className="text-[13px] text-slate-500">
              {t("login.description", "أدخل بيانات حسابك للوصول إلى لوحة إدارة المنظومة.")}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-5 flex items-center gap-3 text-[13px] text-red-200 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.03] backdrop-blur-sm p-6 shadow-2xl shadow-black/20"
          >
            <div className="space-y-5">
              {!mfaRequired ? (
                <>
                  {/* Username */}
                  <div className={isRtl ? "text-right" : "text-left"}>
                    <label className="block text-[12px] font-semibold mb-2 text-slate-400">
                      {t("login.username", "اسم المستخدم")}
                    </label>
                    <div className="relative">
                      <span className={`absolute top-1/2 -translate-y-1/2 text-slate-600 ${isRtl ? 'right-3' : 'left-3'}`}>
                        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </span>
                      <input
                        name="username"
                        className={`w-full bg-white/[0.04] border border-white/[0.08] rounded-xl py-3 text-[14px] text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#c5a044]/40 focus:border-[#c5a044]/40 transition-all ${isRtl ? 'pl-4 pr-10' : 'pl-10 pr-4'}`}
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
                    <label className="block text-[12px] font-semibold mb-2 text-slate-400">
                      {t("login.password", "كلمة المرور")}
                    </label>
                    <div className="relative">
                      <span className={`absolute top-1/2 -translate-y-1/2 text-slate-600 ${isRtl ? 'right-3' : 'left-3'}`}>
                        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </span>
                      <input
                        name="password"
                        type={showPassword ? "text" : "password"}
                        className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-10 py-3 text-[14px] text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#c5a044]/40 focus:border-[#c5a044]/40 transition-all"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        dir="ltr"
                        placeholder={t("login.passwordPlaceholder", "••••••••")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className={`absolute top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors ${isRtl ? 'left-3' : 'right-3'}`}
                      >
                        {showPassword ? (
                          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className={isRtl ? "text-right" : "text-left"}>
                  <div className="mb-3 flex items-center justify-between">
                    <label htmlFor="mfa-code" className="block text-[12px] font-semibold text-[#e8d48b]">
                      {t("login.mfaTitle", "رمز التحقق الثنائي (2FA)")}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setMfaRequired(false);
                        setMfaCode("");
                        setError(null);
                      }}
                      className="text-[11px] text-slate-400 hover:text-white underline"
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
                    className="w-full bg-white/[0.04] border border-[#c5a044]/40 rounded-xl px-4 py-3 text-center text-[18px] tracking-[0.4em] font-mono text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#c5a044]"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder={t("login.mfaPlaceholder", "000000")}
                  />
                </div>
              )}

              {/* Security note */}
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <svg className="w-3.5 h-3.5 text-[#c5a044]/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>{t("login.securityNote", "بيانات الدخول مشفرة ومحمية بالكامل.")}</span>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center rounded-xl font-bold text-[14px] py-3 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-l from-[#0f3460] to-[#184a8a] hover:from-[#184a8a] hover:to-[#1f5ea8] text-white shadow-lg shadow-[#0f3460]/25 hover:shadow-[#0f3460]/40 active:scale-[0.98]"
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
          <div className="mt-8 text-center text-[10px] text-slate-700 lg:hidden">
            © {new Date().getFullYear()} {t("login.companyInfo", "شركة السرايا للتقنية — طرابلس، ليبيا")} — Saraya ERP
          </div>
        </div>
      </div>
    </div>
  );
}
