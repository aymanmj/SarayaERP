import React from 'react';
import { motion } from 'framer-motion';
import { Monitor, Smartphone, CheckCircle, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const projects = [
  {
    id: 1,
    title: 'منظومة Saraya ERP',
    subtitle: 'نظام إدارة المستشفيات والمنشآت الصحية المتكامل',
    description: 'منظومة شاملة تربط بين جميع أقسام المنشأة الصحية، من الاستقبال وحتى الصيدلية والمختبرات والمحاسبة، ببنية مركزية موحدة وواجهات عصرية.',
    highlights: [
      'إدارة شؤون المرضى والملفات الطبية (EMR)',
      'الصيدلية وصرف الوصفات الإلكترونية',
      'المختبرات والأشعة والتقارير الطبية',
      'المحاسبة المالية والفوترة والتأمين',
      'الموارد البشرية وجداول المناوبات',
      'تطبيق جوال للطواقم الطبية (Android & iOS)',
    ],
    tags: ['React', 'Node.js', 'PostgreSQL', 'React Native', 'Docker'],
    color: 'saraya-blue',
    hasApp: true,
  },
];

function ProjectCard({ project }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7 }}
      className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden"
    >
      {/* Top: Bento Grid of Mockups */}
      <div className="bg-gradient-to-br from-saraya-blue to-saraya-dark p-8 md:p-12">
        <div className="grid grid-cols-12 gap-4 items-end max-w-4xl mx-auto">

          {/* Desktop Mockup */}
          <div className="col-span-8 bg-slate-800 rounded-xl overflow-hidden shadow-2xl border border-slate-600">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-700">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-green-400"></span>
              <span className="text-[10px] text-slate-400 mr-3 font-mono" dir="ltr">erp.alsarayatech.ly</span>
            </div>
            <div className="bg-slate-50 p-4 space-y-3">
              {/* Mock Dashboard */}
              <div className="flex gap-3 items-center">
                <div className="w-10 h-10 rounded-lg bg-saraya-blue/90 flex items-center justify-center">
                  <img src="/logo.png" alt="" className="w-8 h-8 object-contain brightness-[10]" />
                </div>
                <div className="flex-1">
                  <div className="h-3 bg-saraya-blue/20 rounded-full w-32 mb-1.5"></div>
                  <div className="h-2 bg-slate-200 rounded-full w-20"></div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['bg-saraya-blue/10', 'bg-saraya-gold/10', 'bg-green-50', 'bg-purple-50'].map((bg, i) => (
                  <div key={i} className={`${bg} rounded-lg p-3 h-16`}>
                    <div className="h-2 bg-slate-300 rounded-full w-3/4 mb-2"></div>
                    <div className="h-4 bg-slate-200 rounded-full w-1/2"></div>
                  </div>
                ))}
              </div>
              <div className="h-24 bg-slate-100 rounded-lg border border-slate-200 p-3">
                <div className="grid grid-cols-6 gap-1 h-full">
                  {[40, 65, 30, 80, 55, 70].map((h, i) => (
                    <div key={i} className="flex items-end justify-center">
                      <div style={{ height: `${h}%` }} className={`w-full rounded-t ${i % 2 === 0 ? 'bg-saraya-blue/60' : 'bg-saraya-gold/60'}`}></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Mockup */}
          <div className="col-span-4 bg-slate-800 rounded-2xl p-1.5 shadow-2xl border-2 border-slate-600 transform translate-y-4">
            <div className="bg-slate-50 rounded-xl overflow-hidden">
              <div className="bg-saraya-blue p-3 text-white text-center">
                <div className="h-2 w-16 bg-white/30 rounded-full mx-auto mb-2"></div>
                <img src="/logo.png" alt="" className="w-8 h-8 mx-auto object-contain brightness-[10]" />
              </div>
              <div className="p-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white border border-slate-100 rounded-lg p-2 flex items-center gap-2 shadow-sm">
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 ${i % 2 === 0 ? 'bg-saraya-gold/20' : 'bg-saraya-blue/10'}`}></div>
                    <div className="flex-1">
                      <div className="h-2 bg-slate-200 rounded-full w-3/4 mb-1"></div>
                      <div className="h-1.5 bg-slate-100 rounded-full w-1/2"></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom: Project Details */}
      <div className="p-8 md:p-12">
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <Monitor className="w-6 h-6 text-saraya-blue" />
              <Smartphone className="w-5 h-5 text-saraya-gold" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Web + Mobile</span>
            </div>
            <h3 className="text-3xl font-black text-slate-900 mb-3">{project.title}</h3>
            <p className="text-slate-500 font-semibold mb-2">{project.subtitle}</p>
            <p className="text-slate-600 leading-relaxed mb-6">{project.description}</p>

            <div className="flex flex-wrap gap-2 mb-6">
              {project.tags.map((tag) => (
                <span key={tag} className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200">
                  {tag}
                </span>
              ))}
            </div>

            {project.hasApp && (
              <Link to="/download" className="inline-flex items-center gap-2 px-6 py-3 bg-saraya-gold text-white rounded-xl font-bold hover:bg-saraya-goldLight transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                تحميل تطبيق الجوال
                <ArrowLeft className="w-4 h-4" />
              </Link>
            )}
          </div>

          <div className="flex-1">
            <h4 className="text-lg font-bold text-slate-800 mb-4">أبرز المزايا والوحدات</h4>
            <ul className="space-y-3">
              {project.highlights.map((item, idx) => (
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
  );
}

export default function Portfolio() {
  return (
    <section id="portfolio" className="py-24 bg-white relative overflow-hidden">
      <div className="absolute top-20 -left-40 w-80 h-80 bg-saraya-blue/5 rounded-full blur-3xl"></div>

      <div className="container relative z-10 px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-saraya-blue mb-4">أبرز إنجازاتنا</h2>
          <div className="w-24 h-1.5 bg-saraya-gold mx-auto rounded-full"></div>
          <p className="mt-6 text-slate-600 max-w-2xl mx-auto text-lg">
            مشاريع حقيقية تفتخر بها السرايا للتقنية، نفذت بأعلى معايير الجودة والاحترافية.
          </p>
        </div>

        <div className="space-y-12">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      </div>
    </section>
  );
}
