import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Hero() {
  return (
    <section className="relative bg-saraya-dark min-h-[85vh] flex items-center justify-center overflow-hidden">
      {/* Dynamic Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <svg fill="none" viewBox="0 0 100 100" className="w-full h-full text-white" preserveAspectRatio="none">
          <path fill="currentColor" d="M0 100 C 20 0 50 0 100 100 Z"></path>
        </svg>
      </div>

      <div className="container relative z-10 text-center px-4">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-saraya-gold mb-8">
            <span className="w-2 h-2 rounded-full bg-saraya-gold animate-pulse"></span>
            <span className="text-sm font-semibold">حلول برمجية موثوقة</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-tight">
            حلول تقنية مبتكرة <br />
            <span className="text-gradient from-saraya-gold to-yellow-300">لمستقبل آمن</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-300 mb-12 leading-relaxed max-w-3xl mx-auto">
            في السرايا للتقنية، نقدم حلولاً تكنولوجية متكاملة تجمع بين الأمان والموثوقية والابتكار، لتمكين أعمالك من النمو والازدهار في العصر الرقمي.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <a href="#services" className="px-8 py-4 rounded-xl bg-saraya-gold text-white font-bold text-lg hover:bg-yellow-500 transition-all shadow-[0_0_20px_rgba(197,160,68,0.4)] flex items-center gap-2">
              اكتشف خدماتنا
              <ChevronLeft className="w-5 h-5" />
            </a>
            <Link to="/download" className="px-8 py-4 rounded-xl bg-white/10 text-white font-bold text-lg hover:bg-white/20 transition-all backdrop-blur-sm border border-white/10">
              تحميل تطبيق المنظومة
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
