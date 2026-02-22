import React from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Code2, LineChart, Network } from 'lucide-react';

const services = [
  {
    icon: <ShieldCheck className="w-10 h-10 text-saraya-gold" />,
    title: 'الأمن السيبراني',
    desc: 'حماية متقدمة للبيانات والأنظمة ضد أحدث التهديدات الرقمية لضمان استمرارية أعمالك ونزاهتها.'
  },
  {
    icon: <Code2 className="w-10 h-10 text-saraya-gold" />,
    title: 'تطوير البرمجيات',
    desc: 'حلول برمجية وأنظمة ERP مخصصة تتوافق مع متطلبات مؤسساتك بدقة وكفاءة عالية.'
  },
  {
    icon: <LineChart className="w-10 h-10 text-saraya-gold" />,
    title: 'استشارات تقنية',
    desc: 'إشراف وتوجيه من نخبة الخبراء لتبسيط القرارات التكنولوجية المعقدة ورسم خطط التحول الرقمي.'
  },
  {
    icon: <Network className="w-10 h-10 text-saraya-gold" />,
    title: 'البنية التحتية للشبكات',
    desc: 'تصميم وإدارة شبكات ذات جودة وأداء عالي يضمن سرعة وأمن تبادل المعلومات داخل منشأتك.'
  }
];

export default function Services() {
  return (
    <section id="services" className="py-24 bg-slate-50 relative overflow-hidden">
      <div className="container relative z-10 px-4">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-extrabold text-saraya-blue mb-4">خدماتنا التقنية</h2>
          <div className="w-24 h-1.5 bg-saraya-gold mx-auto rounded-full"></div>
          <p className="mt-6 text-slate-600 max-w-2xl mx-auto text-lg">
            نطوع أحدث تقنيات العصر الحديث لبناء أنظمة وحلول حيوية ترتكز عليها كبرى المؤسسات.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {services.map((srv, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: idx * 0.1, duration: 0.5 }}
              whileHover={{ y: -10 }}
              className="bg-white p-8 rounded-3xl shadow-lg border border-slate-100 hover:shadow-2xl transition-all group"
            >
              <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-6 group-hover:bg-saraya-blue/5 transition-colors">
                {srv.icon}
              </div>
              <h3 className="text-2xl font-bold text-saraya-blue mb-4">{srv.title}</h3>
              <p className="text-slate-600 leading-relaxed font-medium">
                {srv.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
