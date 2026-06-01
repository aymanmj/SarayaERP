import React from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldCheck,
  Server,
  Activity,
  Globe,
  Mail,
  Phone,
  Database,
  Layout,
  Stethoscope,
  HeartPulse,
} from "lucide-react";

export const AboutPage = () => {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.dir() === "rtl";
  
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 overflow-hidden relative">
      {/* Dynamic Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-sky-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-emerald-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDuration: '10s' }} />
        <div className="absolute top-[40%] left-[50%] -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[150px]" />
      </div>

      <div className="relative z-10 container mx-auto px-6 py-20 lg:py-32 flex flex-col items-center">
        {/* Header / Hero */}
        <div className="text-center mb-24 max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-10 duration-1000">
          <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-slate-900/80 border border-sky-500/30 text-sky-400 text-sm font-semibold shadow-[0_0_15px_rgba(14,165,233,0.15)] backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-sky-500"></span>
            </span>
            v1.1.0 Production Ready
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-sky-100 to-sky-300 drop-shadow-sm">
            Saraya Medical ERP
          </h1>
          <p className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed font-light">
            {t("about.description", "نظام إدارة مستشفيات متكامل، صُمم بمعايير عالمية ليوفر دقة مالية، كفاءة تشغيلية، وتجربة مستخدم لا تضاهى.")}
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl mb-32 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-150 fill-mode-both">
          <FeatureCard
            icon={<Stethoscope className="w-8 h-8 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />}
            title={t("about.features.clinical.title", "دقة سريرية متناهية")}
            desc={t("about.features.clinical.desc", "إدارة شاملة لسجلات المرضى، خطط العلاج، التمريض، والعيادات بدعم كامل لمعايير HL7 و ICD-10.")}
            gradient="from-emerald-500/10 to-emerald-500/5"
            border="border-emerald-500/20"
          />
          <FeatureCard
            icon={<ShieldCheck className="w-8 h-8 text-sky-400 drop-shadow-[0_0_8px_rgba(56,189,248,0.5)]" />}
            title={t("about.features.security.title", "أمان وموثوقية")}
            desc={t("about.features.security.desc", "حماية بيانات متقدمة، صلاحيات دقيقة (RBAC) متعددة المستأجرين، وسجلات تدقيق شاملة لكل حركة.")}
            gradient="from-sky-500/10 to-sky-500/5"
            border="border-sky-500/20"
          />
          <FeatureCard
            icon={<Activity className="w-8 h-8 text-indigo-400 drop-shadow-[0_0_8px_rgba(129,140,248,0.5)]" />}
            title={t("about.features.finance.title", "قوة مالية ولوجستية")}
            desc={t("about.features.finance.desc", "دورة إيرادات ذكية (RCM)، فوترة تأمين، وإدارة مستودعات طبية بتقنية التتبع اللحظي.")}
            gradient="from-indigo-500/10 to-indigo-500/5"
            border="border-indigo-500/20"
          />
        </div>

        {/* Technical Architecture */}
        <div className="w-full max-w-5xl mb-32 animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-300 fill-mode-both">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-200 to-slate-400 inline-block">
              {t("about.architecture.title", "البنية التقنية - Technical Architecture")}
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <TechItem
              label="Frontend"
              value="React 19 + Vite"
              icon={<Layout className="text-sky-400 w-6 h-6" />}
              glowColor="bg-sky-500/20"
            />
            <TechItem
              label="State & Caching"
              value="TanStack Query"
              icon={<Database className="text-amber-400 w-6 h-6" />}
              glowColor="bg-amber-500/20"
            />
            <TechItem
              label="Backend Engine"
              value="NestJS Node.js"
              icon={<Server className="text-rose-400 w-6 h-6" />}
              glowColor="bg-rose-500/20"
            />
            <TechItem
              label="Primary Database"
              value="PostgreSQL 16"
              icon={<Database className="text-indigo-400 w-6 h-6" />}
              glowColor="bg-indigo-500/20"
            />
          </div>
        </div>

        {/* Company Info */}
        <div className="w-full max-w-4xl rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 p-10 md:p-14 relative overflow-hidden group shadow-2xl animate-in fade-in slide-in-from-bottom-16 duration-1000 delay-500 fill-mode-both hover:border-slate-600/60 transition-colors">
          <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-r from-transparent via-sky-500 to-transparent opacity-70 group-hover:opacity-100 transition-opacity"></div>
          <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-sky-900/5 to-transparent pointer-events-none"></div>

          <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
            {/* Logo Container */}
            <div className="relative group flex-shrink-0">
              <div className="absolute -inset-2 bg-gradient-to-r from-sky-500 via-indigo-500 to-purple-600 rounded-full blur-lg opacity-40 group-hover:opacity-80 transition duration-500"></div>
              <div className="relative w-36 h-36 md:w-44 md:h-44 bg-white rounded-full p-2 shadow-2xl flex items-center justify-center overflow-hidden ring-4 ring-slate-800">
                <img
                  src="/saraya-tech-logo.jpg"
                  alt="Saraya Tech"
                  className="w-full h-full object-contain transform group-hover:scale-110 transition-transform duration-700 ease-out"
                />
              </div>
            </div>

            <div className="flex-1 text-center md:text-start space-y-5">
              <h3 className="text-3xl md:text-4xl font-bold text-white tracking-wide">
                {t("about.company.name", "شركة السرايا للتقنية")}
              </h3>
              <p className="text-slate-300 text-lg leading-relaxed">
                {t("about.company.desc", "نبتكر حلولاً برمجية ذكية تعيد تعريف طريقة إدارة المؤسسات الصحية. نلتزم بالجودة، السرعة، والدعم المستمر لضمان تفوق شركائنا.")}
              </p>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-8 gap-y-4 pt-6">
                <a
                  href="https://alsarayatech.ly"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 text-sky-400 hover:text-sky-300 transition-all hover:-translate-y-0.5 font-medium"
                >
                  <Globe className="w-5 h-5" /> alsarayatech.ly
                </a>
                <a
                  href="mailto:info@alsarayatech.ly"
                  className="flex items-center gap-2.5 text-slate-300 hover:text-white transition-all hover:-translate-y-0.5 font-medium"
                >
                  <Mail className="w-5 h-5" /> info@alsarayatech.ly
                </a>
                <span className="flex items-center gap-2.5 text-slate-200 font-semibold bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700">
                  <Phone className="w-5 h-5 text-emerald-400" /> 0916523434
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-24 text-slate-500 text-sm animate-in fade-in duration-1000 delay-700 fill-mode-both">
          <p className="mb-2">
            {t("about.footer.developedWith", "Developed with")} <HeartPulse className="inline-block w-4 h-4 text-rose-500 animate-bounce mx-1" /> by Eng. Ayman Jaballa & Saraya Team
          </p>
          <p>© {new Date().getFullYear()} Saraya Medical ERP. {t("about.footer.rights", "All Rights Reserved.")}</p>
        </div>
      </div>
    </div>
  );
};

function FeatureCard({
  icon,
  title,
  desc,
  gradient,
  border
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  gradient: string;
  border: string;
}) {
  return (
    <div className={`p-8 rounded-3xl bg-gradient-to-br ${gradient} backdrop-blur-sm border ${border} hover:border-slate-500/30 hover:bg-slate-800/50 hover:shadow-2xl transition-all duration-300 group cursor-default hover:-translate-y-1`}>
      <div className="w-16 h-16 rounded-2xl bg-slate-900/80 border border-slate-700/50 shadow-inner flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-100 mb-3 tracking-wide">{title}</h3>
      <p className="text-slate-400 text-base leading-relaxed">{desc}</p>
    </div>
  );
}

function TechItem({
  label,
  value,
  icon,
  glowColor,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  glowColor: string;
}) {
  return (
    <div className="relative group p-6 rounded-2xl bg-slate-900/40 backdrop-blur-sm border border-slate-800 hover:bg-slate-800/60 hover:border-slate-700 transition-all duration-300 hover:-translate-y-1">
      <div className={`absolute inset-0 ${glowColor} opacity-0 group-hover:opacity-10 blur-xl transition-opacity duration-300 rounded-2xl`}></div>
      <div className="relative z-10 flex flex-col items-center gap-4 text-center">
        <div className="p-3 bg-slate-950/80 rounded-xl shadow-inner border border-slate-800/50 group-hover:scale-110 transition-transform duration-300">
          {icon}
        </div>
        <div>
          <div className="text-xs text-slate-500 font-semibold uppercase tracking-widest mb-1.5">
            {label}
          </div>
          <div className="font-mono text-slate-200 font-bold">{value}</div>
        </div>
      </div>
    </div>
  );
}
