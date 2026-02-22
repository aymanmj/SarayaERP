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
        setError("تعذّر الاتصال بالسيرفر، تأكد أن الـ API شغّال.");
      } else if (err.response?.status === 401) {
        setError("بيانات الدخول غير صحيحة.");
      } else {
        setError("فشل تسجيل الدخول، حدث خطأ غير متوقع.");
      }
    } finally {
      setLoading(false);
    }
  }

  const features = [
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ),
      label: "العيادات والطوارئ",
      desc: "إدارة شاملة من الاستقبال حتى التخريج",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
        </svg>
      ),
      label: "المختبر والأشعة",
      desc: "أوامر ونتائج وتقارير متكاملة",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
        </svg>
      ),
      label: "المحاسبة والتأمين",
      desc: "فوترة ومطالبات تأمين وقيود محاسبية",
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      ),
      label: "تطبيق الجوال",
      desc: "جولات الأطباء وإدارة التنويم والأدوية",
    },
  ];

  return (
    <div className="min-h-screen flex bg-[#060e1f] text-slate-50 relative overflow-hidden">
      {/* Animated background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-[#0f3460]/25 blur-[150px]" />
        <div className="absolute bottom-[-10rem] left-[-5rem] w-[500px] h-[500px] rounded-full bg-[#c5a044]/10 blur-[120px]" />
      </div>

      {/* ───────── Right Panel: Brand Showcase ───────── */}
      <div className="hidden lg:flex flex-col w-[52%] p-10 xl:p-14 relative z-10">
        {/* Logo + Name */}
        <div className="flex items-center gap-4 mb-auto">
          <img
            src="/logo.png"
            alt="الشعار"
            className="w-12 h-12 object-contain drop-shadow-[0_0_12px_rgba(197,160,68,0.4)]"
          />
          <div>
            <div className="text-xl font-black tracking-tight text-white leading-tight">
              السرايا للتقنية
            </div>
            <div className="text-[9px] font-semibold tracking-[0.25em] uppercase text-[#c5a044]/80">
              ALSARAYA TECHNOLOGY
            </div>
          </div>
        </div>

        {/* Middle Content */}
        <div className="my-auto max-w-lg">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#c5a044]/10 border border-[#c5a044]/25 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#c5a044] animate-pulse" />
            <span className="text-[10px] font-bold text-[#c5a044] tracking-wider uppercase">
              Saraya ERP — Hospital Suite
            </span>
          </div>

          <h1 className="text-4xl xl:text-[2.8rem] font-black leading-[1.2] mb-5">
            منظومة إدارة
            <br />
            <span className="bg-gradient-to-l from-[#c5a044] to-[#e8d48b] bg-clip-text text-transparent">
              المستشفيات المتكاملة
            </span>
          </h1>

          <p className="text-[15px] text-slate-400 leading-[1.8] mb-8">
            نظام شامل لإدارة ملفات المرضى، المواعيد، التنويم، العمليات،
            المختبر، الأشعة، الصيدلية، والمحاسبة مع سجل تدقيق كامل.
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
                <div>
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
          <span>© {new Date().getFullYear()} شركة السرايا للتقنية — طرابلس، ليبيا</span>
          <span dir="ltr" className="font-mono">v1.0.0</span>
        </div>
      </div>

      {/* ───────── Left Panel: Login Form ───────── */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 relative z-10">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only branding */}
          <div className="lg:hidden flex flex-col items-center mb-10">
            <img
              src="/logo.png"
              alt="الشعار"
              className="w-14 h-14 object-contain drop-shadow-[0_0_18px_rgba(197,160,68,0.5)] mb-3"
            />
            <div className="text-lg font-black text-[#c5a044]">السرايا للتقنية</div>
            <div className="text-[10px] text-slate-500 tracking-widest uppercase">
              Hospital Suite
            </div>
          </div>

          {/* Header */}
          <div className="text-right mb-7">
            <h2 className="text-[22px] font-black text-white mb-1.5">
              تسجيل الدخول
            </h2>
            <p className="text-[13px] text-slate-500">
              أدخل بيانات حسابك للوصول إلى لوحة إدارة المنظومة.
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
              {/* Username */}
              <div>
                <label className="block text-[12px] font-semibold mb-2 text-slate-400">
                  اسم المستخدم
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600">
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    name="username"
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl pl-4 pr-10 py-3 text-[14px] text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#c5a044]/40 focus:border-[#c5a044]/40 transition-all"
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
                <label className="block text-[12px] font-semibold mb-2 text-slate-400">
                  كلمة المرور
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600">
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
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors"
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

              {/* Security note */}
              <div className="flex items-center gap-2 text-[11px] text-slate-600">
                <svg className="w-3.5 h-3.5 text-[#c5a044]/50 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span>بيانات الدخول مشفرة ومحمية بالكامل.</span>
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
                    جاري التحقق...
                  </span>
                ) : (
                  "تسجيل الدخول"
                )}
              </button>
            </div>
          </form>

          {/* Footer — single instance only */}
          <div className="mt-8 text-center text-[10px] text-slate-700 lg:hidden">
            © {new Date().getFullYear()} السرايا للتقنية — Saraya ERP
          </div>
        </div>
      </div>
    </div>
  );
}
