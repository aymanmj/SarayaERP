import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Shield } from 'lucide-react';

export default function Header() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="py-4 shadow-sm bg-white sticky top-0 z-50">
      <div className="container flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="السرايا للتقنية" className="w-12 h-12 object-contain drop-shadow-sm" />
          <div>
            <div className="text-saraya-blue font-black text-xl tracking-tight">السرايا للتقنية</div>
            <div className="text-[10px] text-slate-500 font-semibold tracking-widest uppercase">ALSARAYA Technology</div>
          </div>
        </Link>
        <nav className="hidden md:flex gap-8 items-center text-slate-600 font-medium">
          <a href={isHome ? "#about" : "/#about"} className="hover:text-saraya-blue transition-colors">من نحن</a>
          <a href={isHome ? "#services" : "/#services"} className="hover:text-saraya-blue transition-colors">الخدمات</a>
          <a href={isHome ? "#portfolio" : "/#portfolio"} className="hover:text-saraya-blue transition-colors">المشاريع</a>
          <a href={isHome ? "#contact" : "/#contact"} className="hover:text-saraya-blue transition-colors">تواصل معنا</a>
          
          <Link to="/download" className="px-6 py-2.5 rounded-lg bg-saraya-gold text-white font-bold hover:bg-saraya-goldLight transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
            تحميل التطبيق
          </Link>
        </nav>
      </div>
    </header>
  );
}
