import React from "react";
import {
  ShieldCheck,
  Server,
  Activity,
  Globe,
  Mail,
  Phone,
  Database,
  Layout,
} from "lucide-react";

export const AboutPage = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-sky-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-5%] w-[500px] h-[500px] bg-emerald-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10 container mx-auto px-4 py-16 lg:py-24">
        {/* Header / Hero */}
        <div className="text-center mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-sky-400 text-sm font-medium mb-4">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
            </span>
            v1.0.1 Production Ready
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
            Saraya ERP
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
            نظام إدارة مستشفيات متكامل، صُمم بمعايير عالمية ليوفر دقة مالية،
            كفاءة تشغيلية، وتجربة مستخدم لا تضاهى.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20">
          <FeatureCard
            icon={<Activity className="w-6 h-6 text-emerald-400" />}
            title="دقة سريرية"
            desc="إدارة كاملة للمرضى، التمريض، والأطباء مع دعم Triage و ADT."
          />
          <FeatureCard
            icon={<ShieldCheck className="w-6 h-6 text-sky-400" />}
            title="أمان وموثوقية"
            desc="حماية بيانات متقدمة، صلاحيات دقيقة (RBAC)، وسجلات تدقيق شاملة."
          />
          <FeatureCard
            icon={<Server className="w-6 h-6 text-indigo-400" />}
            title="قوة مالية"
            desc="محاسبة مزدوجة القيد، فوترة تأمين معقدة، وإدارة مخزون صارمة."
          />
        </div>

        {/* Technical Architecture */}
        <div className="mb-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-sky-300 to-purple-300 inline-block">
              البنية التقنية - Technical Architecture
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <TechItem
              label="Frontend"
              value="React + Vite"
              icon={<Layout className="text-sky-400" />}
            />
            <TechItem
              label="Backend"
              value="NestJS Node.js"
              icon={<Server className="text-red-400" />}
            />
            <TechItem
              label="Database"
              value="PostgreSQL"
              icon={<Database className="text-blue-400" />}
            />
            <TechItem
              label="State"
              value="TanStack Query"
              icon={<Activity className="text-amber-400" />}
            />
          </div>
        </div>

        {/* Company Info */}
        <div className="max-w-4xl mx-auto rounded-3xl bg-slate-900/50 border border-slate-800 p-8 md:p-12 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-full h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent opacity-50"></div>

          <div className="flex flex-col md:flex-row items-center gap-8">
            <div className="w-32 h-32 bg-white rounded-full p-4 shadow-xl flex-shrink-0">
              <img
                src="/saraya-tech-logo.jpg"
                alt="Saraya Tech"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="flex-1 text-center md:text-right space-y-4">
              <h3 className="text-3xl font-bold text-white">
                شركة السرايا للتقنية
              </h3>
              <p className="text-slate-400">
                نبتكر حلولاً برمجية ذكية تعيد تعريف طريقة إدارة المؤسسات الصحية.
                نلتزم بالجودة، السرعة، والدعم المستمر.
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 pt-4">
                <a
                  href="https://alsarayatech.ly"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <Globe size={18} /> alsarayatech.ly
                </a>
                <a
                  href="mailto:info@alsarayatech.ly"
                  className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
                >
                  <Mail size={18} /> info@alsarayatech.ly
                </a>
                <span className="flex items-center gap-2 text-slate-300">
                  <Phone size={18} /> 091-6523403
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-slate-600 text-sm">
          Developed with <span className="text-rose-500">❤</span> by Eng. Ayman
          Jaballa & Saraya Team <br />© {new Date().getFullYear()} All Rights
          Reserved.
        </div>
      </div>
    </div>
  );
};

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-colors group">
      <div className="w-12 h-12 rounded-xl bg-slate-800/50 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}

function TechItem({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/30 border border-slate-800/50">
      <div className="p-2 bg-slate-800 rounded-lg">{icon}</div>
      <div className="text-right">
        <div className="text-xs text-slate-500 uppercase tracking-wider">
          {label}
        </div>
        <div className="font-mono text-sky-100 font-semibold">{value}</div>
      </div>
    </div>
  );
}
