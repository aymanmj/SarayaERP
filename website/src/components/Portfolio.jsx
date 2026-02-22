import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Smartphone, CheckCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const screenshots = [
  { id: 'dashboard', label: 'لوحة التحكم', src: '/screenshots/dashboard.png' },
  { id: 'patients', label: 'سجل المرضى', src: '/screenshots/patients.png' },
  { id: 'pharmacy', label: 'الصيدلية', src: '/screenshots/pharmacy.png' },
  { id: 'lab', label: 'المختبر', src: '/screenshots/lab.png' },
  { id: 'analytics', label: 'التحليلات', src: '/screenshots/analytics.png' },
  { id: 'login', label: 'تسجيل الدخول', src: '/screenshots/login.png' },
];

const highlights = [
  'إدارة شؤون المرضى والملفات الطبية (EMR)',
  'الصيدلية وصرف الوصفات الإلكترونية',
  'المختبرات والأشعة والتقارير الطبية',
  'المحاسبة المالية والفوترة والتأمين',
  'الموارد البشرية وجداول المناوبات',
  'تطبيق جوال للطواقم الطبية (Android & iOS)',
];

const tags = ['React', 'Node.js', 'PostgreSQL', 'React Native', 'Docker'];

export default function Portfolio() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <section id="portfolio" className="py-24 bg-white relative overflow-hidden">
      <div className="absolute top-20 -left-40 w-80 h-80 bg-saraya-blue/5 rounded-full blur-3xl"></div>

      <div className="container relative z-10 px-4">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-saraya-blue mb-4">أبرز إنجازاتنا</h2>
          <div className="w-24 h-1.5 bg-saraya-gold mx-auto rounded-full"></div>
          <p className="mt-6 text-slate-600 max-w-2xl mx-auto text-lg">
            مشاريع حقيقية تفتخر بها السرايا للتقنية، نفذت بأعلى معايير الجودة والاحترافية.
          </p>
        </div>

        {/* Project Card */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden"
        >
          {/* Screenshots Gallery */}
          <div className="bg-gradient-to-br from-saraya-blue to-saraya-dark p-6 md:p-10">
            {/* Tab Navigation */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {screenshots.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setActiveTab(idx)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                    activeTab === idx
                      ? 'bg-saraya-gold text-white shadow-lg shadow-saraya-gold/30'
                      : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Screenshot Display */}
            <div className="relative max-w-5xl mx-auto">
              <div className="bg-slate-800 rounded-xl overflow-hidden shadow-2xl border border-slate-600">
                {/* Browser Chrome Bar */}
                <div className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-700">
                  <span className="w-3 h-3 rounded-full bg-red-400"></span>
                  <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
                  <span className="w-3 h-3 rounded-full bg-green-400"></span>
                  <span className="text-xs text-slate-400 mr-4 font-mono" dir="ltr">
                    erp.alsarayatech.ly
                  </span>
                </div>

                {/* Animated Screenshot */}
                <AnimatePresence mode="wait">
                  <motion.img
                    key={activeTab}
                    src={screenshots[activeTab].src}
                    alt={screenshots[activeTab].label}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.3 }}
                    className="w-full h-auto block"
                  />
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Project Details */}
          <div className="p-8 md:p-12">
            <div className="flex flex-col lg:flex-row gap-10">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <Monitor className="w-6 h-6 text-saraya-blue" />
                  <Smartphone className="w-5 h-5 text-saraya-gold" />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Web + Mobile
                  </span>
                </div>
                <h3 className="text-3xl font-black text-slate-900 mb-3">منظومة Saraya ERP</h3>
                <p className="text-slate-500 font-semibold mb-2">
                  نظام إدارة المستشفيات والمنشآت الصحية المتكامل
                </p>
                <p className="text-slate-600 leading-relaxed mb-6">
                  منظومة شاملة تربط بين جميع أقسام المنشأة الصحية، من الاستقبال وحتى الصيدلية
                  والمختبرات والمحاسبة، ببنية مركزية موحدة وواجهات عصرية.
                </p>

                <div className="flex flex-wrap gap-2 mb-6">
                  {tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                <Link
                  to="/download"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-saraya-gold text-white rounded-xl font-bold hover:bg-saraya-goldLight transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                >
                  تحميل تطبيق الجوال
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>

              <div className="flex-1">
                <h4 className="text-lg font-bold text-slate-800 mb-4">أبرز المزايا والوحدات</h4>
                <ul className="space-y-3">
                  {highlights.map((item, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: idx * 0.08 }}
                      className="flex items-start gap-3 text-slate-700"
                    >
                      <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="font-medium">{item}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
