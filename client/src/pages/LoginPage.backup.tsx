// src/pages/LoginPage.tsx

import { FormEvent, useEffect, useState } from "react";
import { useAuthStore } from "../stores/authStore";
import { useLocation, useNavigate } from "react-router-dom";

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation() as any;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
      await login(username.trim(), password);
    } catch (err: any) {
      console.error(err);

      if (err.code === "ERR_NETWORK") {
        setError("تعذّر الاتصال بالسيرفر، تأكد أن الـ API شغّال (port 3000).");
      } else if (err.response?.status === 401) {
        setError("بيانات الدخول غير صحيحة.");
      } else {
        setError("فشل تسجيل الدخول، حدث خطأ غير متوقع.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-[#060e1f] text-slate-50 relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full bg-[#0f3460]/30 blur-[120px] animate-pulse" />
        <div className="absolute top-1/2 -right-32 w-[400px] h-[400px] rounded-full bg-[#c5a044]/15 blur-[100px]" />
        <div className="absolute bottom-[-8rem] left-1/3 w-[350px] h-[350px] rounded-full bg-[#0f3460]/20 blur-[100px]" />
      </div>

      {/* ───────── Left Panel: Brand Showcase ───────── */}
      <div className="hidden lg:flex flex-col justify-between w-[55%] p-12 relative z-10">
        {/* Top: Logo + Badge */}
        <div className="space-y-8">
          <div className="flex items-center gap-4">
            <img
              src="/logo.png"
              alt="الشعار"
              className="w-14 h-14 object-contain drop-shadow-[0_0_15px_rgba(197,160,68,0.4)]"
            />
            <div>
              <div className="text-2xl font-black tracking-tight text-white">
                السرايا للتقنية
              </div>
              <div className="text-[10px] font-semibold tracking-[0.3em] uppercase text-[#c5a044]">
                ALSARAYA TECHNOLOGY
              </div>
            </div>
          </div>

          <div className="space-y-5 max-w-xl">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#c5a044]/10 border border-[#c5a044]/30">
              <span className="w-2 h-2 rounded-full bg-[#c5a044] animate-pulse" />
              <span className="text-[11px] font-bold text-[#c5a044] tracking-wider uppercase">
                Saraya ERP — Hospital Suite
              </span>
            </div>

            <h1 className="text-4xl xl:text-5xl font-black leading-[1.25]">
              منظومة إدارة
              <br />
              <span className="bg-gradient-to-l from-[#c5a044] to-[#e8d48b] bg-clip-text text-transparent">
                المستشفيات المتكاملة
              </span>
            </h1>

            <p className="text-base text-slate-300/90 leading-relaxed max-w-lg">
              نظام احترافي لإدارة ملفات المرضى، المواعيد، الدخول، الأسرة،
              العمليات، المختبر، الأشعة، الصيدلية والفوترة، مع سجل تدقيق كامل
              وامتثال للمعايير الطبية.
            </p>
          </div>
        </div>

        {/* Middle: Feature Cards */}
        <div className="relative z-10 mt-8 grid grid-cols-2 gap-3">
          {[
            {
              label: "العيادات والطوارئ",
              en: "OPD · ER · IPD",
              desc: "مسار كامل من الوصول حتى الخروج مع ربط شامل بالخدمات.",
              accent: "from-[#0f3460] to-[#1a5296]",
              dot: "bg-sky-400",
            },
            {
              label: "المعامل والأشعة",
              en: "Lab · Radiology",
              desc: "أوامر فحص ونتائج وتقارير مع ربط مباشر بالفوترة.",
              accent: "from-emerald-700 to-emerald-500",
              dot: "bg-emerald-400",
            },
            {
              label: "الأسرّة والتنويم",
              en: "Bed Management",
              desc: "حالة الأسرة واللفليق الآلي في الوقت الحقيقي.",
              accent: "from-cyan-700 to-cyan-500",
              dot: "bg-cyan-400",
            },
            {
              label: "المحاسبة والتأمين",
              en: "Billing · Insurance",
              desc: "خدمات وفواتير ومطالبات تأمين وسجل تدقيق شامل.",
              accent: "from-[#c5a044] to-[#d4b35e]",
              dot: "bg-[#c5a044]",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="group rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-4 hover:bg-white/[0.06] transition-all duration-300"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${item.dot}`} />
                <span className="text-[11px] text-slate-400 font-medium">
                  {item.label}
                </span>
              </div>
              <div
                className={`font-bold text-sm bg-gradient-to-l ${item.accent} bg-clip-text text-transparent`}
              >
                {item.en}
              </div>
              <div className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: Legal */}
        <div className="relative z-10 mt-8 flex items-center justify-between text-[11px] text-slate-600">
          <span>
            © {new Date().getFullYear()} شركة السرايا للتقنية — طرابلس، ليبيا
          </span>
          <span dir="ltr" className="font-mono text-slate-700">
            v1.0.0
          </span>
        </div>
      </div>

      {/* ───────── Right Panel: Login Form ───────── */}
      <div className="flex-1 flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <img
              src="/logo.png"
              alt="الشعار"
              className="w-16 h-16 object-contain drop-shadow-[0_0_20px_rgba(197,160,68,0.5)]"
            />
          </div>

          {/* Header */}
          <div className="mb-8 text-center lg:text-right">
            <div className="lg:hidden text-lg font-bold text-[#c5a044] mb-1">
              السرايا للتقنية
            </div>
            <h2 className="text-2xl font-black text-white">
              تسجيل الدخول
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              أدخل بيانات حسابك للوصول إلى لوحة إدارة المنظومة.
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-5 flex items-center gap-3 text-sm text-red-200 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
              <svg
                className="w-5 h-5 text-red-400 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Login Card */}
          <form
            onSubmit={handleSubmit}
            className="rounded-3xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-md p-7 shadow-2xl shadow-black/30"
          >
            <div className="space-y-5">
              {/* Username */}
              <div>
                <label className="block text-xs font-semibold mb-2 text-slate-300">
                  اسم المستخدم
                </label>
                <div className="relative">
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                      />
                    </svg>
                  </div>
                  <input
                    name="username"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-4 pr-11 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#c5a044]/50 focus:border-[#c5a044]/50 transition-all"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    dir="ltr"
                    placeholder="admin"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold mb-2 text-slate-300">
                  كلمة المرور
                </label>
                <div className="relative">
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-11 pr-11 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#c5a044]/50 focus:border-[#c5a044]/50 transition-all"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    dir="ltr"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {showPassword ? (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Info line */}
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <svg
                  className="w-3.5 h-3.5 text-[#c5a044]/60"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                <span>بيانات الدخول مشفرة ومحمية بالكامل.</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 inline-flex items-center justify-center rounded-xl font-bold text-sm py-3.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-l from-[#0f3460] to-[#1a5296] hover:from-[#1a5296] hover:to-[#2068c0] text-white shadow-lg shadow-[#0f3460]/30 hover:shadow-[#0f3460]/50"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري التحقق...
                  </span>
                ) : (
                  "تسجيل الدخول"
                )}
              </button>
            </div>
          </form>

          {/* Bottom note */}
          <div className="mt-6 text-center">
            <div className="text-[11px] text-slate-600">
              © {new Date().getFullYear()} السرايا للتقنية — Saraya ERP
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
