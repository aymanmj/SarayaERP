import React from "react";

export const AboutPage = () => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl">
        {/* Background Glow Effects */}
        <div className="absolute -top-20 -left-20 w-72 h-72 bg-sky-500/20 rounded-full blur-[100px] animate-pulse"></div>
        <div className="absolute -bottom-20 -right-20 w-72 h-72 bg-blue-600/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>

        {/* Main Card */}
        <div className="relative bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-12 shadow-2xl overflow-hidden">
          {/* Decorative Shine */}
          <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-white/5 to-transparent pointer-events-none"></div>

          <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
            {/* Logo Section */}
            <div className="flex-shrink-0">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-br from-sky-400 to-blue-600 rounded-full blur opacity-40 group-hover:opacity-60 transition-opacity duration-500"></div>
                <div className="relative w-48 h-48 bg-white rounded-full p-6 shadow-2xl border-4 border-slate-700/50 flex items-center justify-center overflow-hidden transform group-hover:scale-105 transition-transform duration-500">
                  <img
                    src="/saraya-tech-logo.jpg"
                    alt="Al-Saraya Technology Company"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>

            {/* Content Section */}
            <div className="text-center md:text-right flex-1 space-y-6">
              <div>
                <h1 className="text-2xl md:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-2">
                  نظام السرايا الطبي - Saraya ERP
                </h1>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-mono">
                  <span>Version 1.0.1</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse"></span>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-700/50 md:text-right">
                  <p className="text-slate-400 text-left text-xs uppercase tracking-wider mb-1">
                    Developed By
                  </p>
                  <p className="text-white text-left font-medium text-lg">
                    Eng. Ayman Jaballa
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-slate-400 text-sm">Powered by</p>
                  <h3 className="text-2xl font-semibold text-sky-100">
                    شركة السرايا للتقنية
                  </h3>
                  <p className="text-slate-400 text-sm">Al-Saraya Technology</p>
                </div>
              </div>

              {/* Contact Info */}
              <div className="flex flex-col md:flex-row items-center justify-end gap-4 pt-4 border-t border-slate-700/50 text-sm">
                <a
                  href="https://alsarayatech.ly"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sky-400 hover:text-sky-300 transition-colors"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" x2="22" y1="12" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  alsarayatech.ly
                </a>
                <span className="hidden md:block text-slate-600">|</span>
                <span className="flex items-center gap-2 text-slate-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  091-6523403
                </span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Footer */}
        <div className="text-center mt-8 text-slate-500 text-xs">
          © {new Date().getFullYear()} All Rights Reserved.
        </div>
      </div>
    </div>
  );
};
