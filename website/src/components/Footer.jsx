import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-saraya-dark text-white py-12 border-t-4 border-saraya-gold">
      <div className="container grid grid-cols-1 md:grid-cols-3 gap-8">
        <div>
          <div className="bg-white inline-block px-6 py-3 rounded-2xl mb-6 shadow-md">
            <img src="/logo-full.png" alt="السرايا للتقنية" className="h-[80px] object-contain" />
          </div>
          <p className="text-slate-300 text-sm leading-relaxed">
            نقدم حلولاً تكنولوجية متكاملة تجمع بين الأمان والموثوقية والابتكار، لتمكين أعمالك من النمو والازدهار في العصر الرقمي.
          </p>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-4 text-saraya-gold">روابط سريعة</h3>
          <ul className="space-y-2 text-slate-300 text-sm">
            <li><a href="/" className="hover:text-white transition-colors">الرئيسية</a></li>
            <li><a href="/#services" className="hover:text-white transition-colors">خدماتنا</a></li>
            <li><a href="/download" className="hover:text-white transition-colors">تحميل تطبيق Saraya ERP</a></li>
          </ul>
        </div>
        <div>
          <h3 className="text-xl font-bold mb-4 text-saraya-gold">تواصل معنا</h3>
          <ul className="space-y-2 text-slate-300 text-sm">
            <li>طرابلس، ليبيا</li>
            <li>info@alsarayatech.ly</li>
          </ul>
        </div>
      </div>
      <div className="container mt-12 pt-8 border-t border-slate-700 text-center text-slate-400 text-xs">
        © {new Date().getFullYear()} شركة السرايا للتقنية. جميع الحقوق محفوظة.
      </div>
    </footer>
  );
}
