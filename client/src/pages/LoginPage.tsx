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

  useEffect(() => {
    if (isAuthenticated) {
      // const redirectTo =
      //   location.state?.from?.pathname &&
      //   location.state.from.pathname !== "/login"
      //     ? location.state.from.pathname
      //     : "/";
      // navigate(redirectTo, { replace: true });
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
    <div className="min-h-screen flex bg-slate-950 text-slate-50">
      {/* اللوحة اليسار: هوية المنظومة */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 p-10 relative overflow-hidden">
        {/* خلفية زخرفية */}
        <div className="pointer-events-none absolute inset-0 opacity-40">
          <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full bg-sky-700 blur-3xl" />
          <div className="absolute top-40 -right-20 w-72 h-72 rounded-full bg-emerald-500 blur-3xl" />
          <div className="absolute bottom-[-6rem] right-10 w-64 h-64 rounded-full bg-cyan-400 blur-3xl" />
        </div>

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/70 border border-sky-500/40 text-[11px] tracking-[0.35em] uppercase text-sky-200">
            Hospital Suite
          </div>

          <h1 className="text-3xl xl:text-4xl font-extrabold leading-snug">
            منظومة إدارة العيادات
            <span className="text-sky-300"> والمستشفيات</span> المتكاملة
          </h1>

          <p className="text-sm text-slate-200/80 max-w-xl">
            نظام احترافي لإدارة ملفات المرضى، المواعيد، الدخول، الأسرة،
            العمليات، المختبر، الأشعة، الصيدلية والفوترة، مع سجل تدقيق كامل
            وامتثال للمعايير الطبية.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">العيادات</div>
              <div className="font-semibold text-sky-100 mt-1">
                Outpatient & ER & IPD
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                مسار كامل من الموعد إلى الدخول، مع ربط المعمل والأشعة والصيدلية
                والفواتير.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">المعامل والأشعة</div>
              <div className="font-semibold text-emerald-200 mt-1">
                Lab & Radiology
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                أوامر، نتائج، تقارير، وربط مباشر مع نظام الفوترة والخدمات.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">الأسرّة والدخول</div>
              <div className="font-semibold text-cyan-200 mt-1">
                Bed Management
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                حالة الأسرة في الوقت الحقيقي: متاح، مشغول، تنظيف، صيانة.
              </div>
            </div>

            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/60 p-3">
              <div className="text-[11px] text-slate-400">المحاسبة</div>
              <div className="font-semibold text-amber-200 mt-1">
                Billing & Audit
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                خدمات، فواتير، مدفوعات، وسجل تدقيق شامل لكل عملية.
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-slate-500">
          © {new Date().getFullYear()} — يمكن وضع شعار السرايا للتقنية هنا.
        </div>
      </div>

      {/* لوحة الدخول يمين */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center lg:text-right">
            <div className="inline-flex items-center justify-center lg:justify-end w-full mb-4">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/50 flex items-center justify-center">
                <div className="w-6 h-6 rounded-xl bg-sky-400/90 shadow-lg shadow-sky-500/50" />
              </div>
            </div>

            <h2 className="text-xl font-bold text-slate-50">
              تسجيل الدخول إلى المنظومة
            </h2>
            <p className="text-xs text-slate-400 mt-2">
              أدخل بيانات حسابك للوصول إلى لوحة إدارة المستشفى.
              <br />
              (تجريبيًا: admin / admin123 أو dr_ahmed / doctor123)
            </p>
          </div>

          {error && (
            <div className="mb-4 text-xs text-red-300 bg-red-900/40 border border-red-500/50 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-5 shadow-xl shadow-slate-950/60 backdrop-blur"
          >
            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs mb-1 text-slate-300">
                  اسم المستخدم
                </label>
                <input
                  name="username"
                  className="w-full bg-slate-950/60 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-xs mb-1 text-slate-300">
                  كلمة المرور
                </label>
                <input
                  name="password"
                  type="password"
                  className="w-full bg-slate-950/60 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                <span>بيانات الدخول خاصة وسرّية.</span>
                <span>نسخة تجريبية داخلية</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 inline-flex items-center justify-center rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm py-2.5 transition disabled:bg-slate-600 disabled:text-slate-300"
              >
                {loading ? "جاري التحقق..." : "تسجيل الدخول"}
              </button>
            </div>
          </form>

          <div className="mt-4 text-[11px] text-slate-500 text-center">
            سيتم لاحقاً إضافة خيارات مثل الدخول عبر LDAP / SSO أو ربطه ببريد
            المؤسسة.
          </div>
        </div>
      </div>
    </div>
  );
}
