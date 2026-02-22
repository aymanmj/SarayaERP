import React from 'react';
import { motion } from 'framer-motion';
import { MonitorSmartphone, Download, TabletSmartphone } from 'lucide-react';

export default function DownloadPage() {
  return (
    <section className="min-h-[85vh] flex items-center justify-center bg-slate-50 py-16">
      <div className="container px-4">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-16 bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-8 lg:p-16 border border-slate-100">
          
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex-1 space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-5 py-2 bg-saraya-blue/10 text-saraya-blue font-bold rounded-full mb-2">
              <MonitorSmartphone className="w-5 h-5" />
              تطبيق المنظومة الطبي
            </div>
            
            <h1 className="text-4xl lg:text-5xl font-black text-slate-900 leading-tight">
              حمّل <span className="text-saraya-gold">Saraya ERP</span> <br/> وابقَ متصلاً بمشفاك!
            </h1>
            
            <p className="text-slate-600 text-lg leading-relaxed max-w-xl">
              النسخة الرسمية والمخصصة للطواقم الطبية والممرضين. تتيح لك إدارة شئون المرضى، متابعة العلامات الحيوية، صرف الأدوية، والإشراف على الجولات السريرية بكل سهولة وموثوقية من هاتفك المحمول المحمول أو جهاز التابلت.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-slate-100">
              <a 
                href="https://expo.dev/artifacts/eas/qmYidwi8oXq68z5ygWNvrk.apk"
                download="saraya-erp.apk"
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-1 items-center justify-center gap-3 px-8 py-5 bg-saraya-blue text-white rounded-2xl font-bold shadow-soft hover:bg-blue-900 transition-all transform hover:-translate-y-1 hover:shadow-xl"
              >
                <Download className="w-6 h-6" />
                <div className="text-right">
                   <div className="text-sm font-normal opacity-80">تحميل مباشر</div>
                   <div className="text-lg">Android APK</div>
                </div>
              </a>
              
              <button disabled className="flex flex-1 items-center justify-center gap-3 px-8 py-5 bg-slate-50 text-slate-400 rounded-2xl font-bold border-2 border-slate-200 cursor-not-allowed">
                <TabletSmartphone className="w-6 h-6" />
                <div className="text-right">
                   <div className="text-sm font-normal opacity-80">قريباً على متجر</div>
                   <div className="text-lg">App Store</div>
                </div>
              </button>
            </div>
            
            <p className="text-sm text-slate-400 mt-4 font-semibold">
              * الإصدار v1.0.0 | يجب تنزيل الملف وحفظه ثم تثبيته يدوياً مع تفعيل خاصية "تثبيت التطبيقات من مصادر غير معروفة" في إعدادات الأندرويد.
            </p>
          </motion.div>

          {/* Right side Illustration / Mockup */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="flex-1 hidden lg:flex justify-end"
          >
            <div className="relative w-80 h-[600px] bg-slate-800 rounded-[3rem] p-3 shadow-2xl border-4 border-slate-700 transform rotate-[-2deg] hover:rotate-0 transition-transform duration-500">
              <div className="w-full h-full bg-slate-50 rounded-[2.5rem] overflow-hidden relative shadow-inner flex flex-col">
                 <div className="absolute top-0 inset-x-0 h-6 bg-slate-800 rounded-b-3xl mx-20 shadow-lg z-10"></div>
                 
                 {/* Mock App Interface */}
                 <div className="flex-1 p-6 pt-16 flex flex-col bg-gradient-to-b from-saraya-blue/5 to-white">
                    <div className="w-16 h-16 bg-white rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 p-2 transform rotate-3">
                      <img src="/logo.png" alt="App Logo" className="w-full h-full object-contain drop-shadow-md" />
                    </div>
                    <div className="h-4 bg-slate-200 rounded-full w-3/4 mx-auto mb-3"></div>
                    <div className="h-3 bg-slate-200 rounded-full w-1/2 mx-auto"></div>
                    
                    <div className="mt-8 space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className={`h-24 bg-white shadow-sm border border-slate-100 rounded-2xl p-4 flex items-center gap-4 ${i===3?'opacity-40':''}`}>
                          <div className={`w-12 h-12 rounded-full flex-shrink-0 ${i%2===0?'bg-saraya-gold/20':'bg-saraya-blue/10'}`}></div>
                          <div className="flex-1">
                            <div className="h-3 w-3/4 bg-slate-200 rounded-full mb-3"></div>
                            <div className="h-2 w-1/2 bg-slate-100 rounded-full mb-2"></div>
                            <div className="h-2 w-1/4 bg-slate-50 rounded-full"></div>
                          </div>
                        </div>
                      ))}
                    </div>
                 </div>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
