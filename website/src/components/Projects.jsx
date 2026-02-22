import React from 'react';
import { motion } from 'framer-motion';

export default function Projects() {
  return (
    <section id="about" className="py-24 bg-white relative">
      <div className="container px-4 flex flex-col lg:flex-row items-center gap-16">
        
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="flex-1"
        >
          <h2 className="text-4xl font-extrabold text-saraya-blue mb-4">من نحن</h2>
          <div className="w-24 h-1.5 bg-saraya-gold mb-8 rounded-full"></div>
          
          <p className="text-lg text-slate-700 leading-loose mb-6 font-medium">
            شركة السرايا للتقنية هي مؤسسة دمج هندسية ليبيّة رائدة مقرها طرابلس. تأسست على يد نخبة من المبرمجين ومهندسي النظم الأمنية لتقديم حلول متطورة تتوافق مع المعايير الاستثنائية للأسواق الإقليمية والدولية.
          </p>
          <p className="text-lg text-slate-700 leading-loose mb-10 font-medium">
            تتلخص رؤيتنا في أن نكون الذراع التقني الآمن للمؤسسات، والمحرك الأساسي في مرحلة التحول الرقمي للقطاعين العام والخاص في البلاد وخارجها.
          </p>

          <div className="flex flex-wrap gap-8">
            <div className="bg-slate-50 px-8 py-6 rounded-2xl border border-slate-100 flex flex-col items-center shadow-sm">
              <span className="text-4xl font-black text-saraya-gold mb-2">+30</span>
              <span className="text-saraya-blue font-bold">مشروعاً تقنياً</span>
            </div>
            <div className="bg-slate-50 px-8 py-6 rounded-2xl border border-slate-100 flex flex-col items-center shadow-sm">
              <span className="text-4xl font-black text-saraya-gold mb-2">+20</span>
              <span className="text-saraya-blue font-bold">شريكاً وعميلاً</span>
            </div>
            <div className="bg-slate-50 px-8 py-6 rounded-2xl border border-slate-100 flex flex-col items-center shadow-sm">
              <span className="text-4xl font-black text-saraya-gold mb-2">%100</span>
              <span className="text-saraya-blue font-bold">أمان وموثوقية</span>
            </div>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="flex-1 flex justify-center lg:justify-end w-full"
        >
          <div className="relative w-full max-w-lg aspect-square bg-slate-100 rounded-full overflow-hidden shadow-2xl border-8 border-white">
            <div className="absolute inset-0 bg-saraya-blue/10 flex items-center justify-center p-12">
               <div className="w-full h-full border-4 border-dashed border-saraya-gold/40 rounded-full animate-[spin_60s_linear_infinite] flex items-center justify-center">
                  <div className="w-3/4 h-3/4 bg-white rounded-full shadow-lg flex items-center justify-center">
                      <svg className="w-1/2 h-1/2 text-saraya-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                  </div>
               </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
