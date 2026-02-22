import React, { useState } from 'react';
import { Mail, MapPin, Phone, MessageCircle, CheckCircle, AlertCircle } from 'lucide-react';

export default function Contact() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle');

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.message) {
      alert("الرجاء تعبئة الاسم والرسالة على الأقل.");
      return;
    }
    
    setStatus('loading');
    
    try {
      const response = await fetch("https://formsubmit.co/ajax/info@alsarayatech.ly", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          message: formData.message,
          _subject: `رسالة جديدة من الموقع: ${formData.name}`,
          _template: "table"
        })
      });

      if (response.ok) {
        setStatus('success');
        setFormData({ name: '', email: '', message: '' });
        // Return to idle state after 5 seconds
        setTimeout(() => setStatus('idle'), 5000);
      } else {
        setStatus('error');
        setTimeout(() => setStatus('idle'), 5000);
      }
    } catch (error) {
       setStatus('error');
       setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <section id="contact" className="py-24 bg-slate-50 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-saraya-gold/10 rounded-full blur-3xl"></div>
      
      <div className="container relative z-10 px-4">
        <div className="max-w-4xl mx-auto bg-white rounded-[3rem] shadow-xl border border-slate-100 overflow-hidden flex flex-col md:flex-row">
          
          <div className="flex-1 bg-saraya-blue p-12 text-white flex flex-col justify-center">
            <h2 className="text-4xl font-extrabold mb-4">آلية التواصل</h2>
            <p className="text-slate-300 leading-loose mb-10">
              مرحباً بك للتواصل مع فريق المبيعات والاستشارات للحصول على التسعيرات وتفاصيل المشاريع.
            </p>
            
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-saraya-gold" />
                </div>
                <div className="text-lg">طرابلس، ليبيا</div>
              </div>
              
              <a href="mailto:info@alsarayatech.ly" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                  <Mail className="w-5 h-5 text-saraya-gold" />
                </div>
                <div className="text-lg" dir="ltr">info@alsarayatech.ly</div>
              </a>
              
              <a href="tel:+218916523403" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
                <div className="w-12 h-12 bg-white/10 rounded-full flex items-center justify-center">
                  <Phone className="w-5 h-5 text-saraya-gold" />
                </div>
                <div className="text-lg font-mono" dir="ltr">+218 91 652 3403</div>
              </a>

              <a href="https://wa.me/218916523403" target="_blank" rel="noopener noreferrer" className="inline-flex mt-4 items-center gap-3 px-6 py-3 bg-[#25D366] text-white rounded-xl font-bold hover:bg-[#1ebd5b] transition-colors shadow-md w-max">
                <MessageCircle className="w-5 h-5" />
                محادثة واتساب مباشرة
              </a>
            </div>
          </div>
          
          <div className="flex-1 p-12 flex flex-col justify-center bg-white">
            <h3 className="text-2xl font-bold text-slate-800 mb-6">أرسل لنا استفسارك</h3>
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <input 
                  type="text" 
                  required
                  placeholder="الاسم الكريم / الجهة" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-saraya-gold/50 transition-shadow" 
                />
              </div>
              <div>
                <input 
                  type="email" 
                  placeholder="البريد الإلكتروني (اختياري)" 
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-saraya-gold/50 transition-shadow" 
                />
              </div>
              <div>
                <textarea 
                  rows="4" 
                  required
                  placeholder="التفاصيل أو طبيعة العمل الخاص بكم..." 
                  value={formData.message}
                  onChange={e => setFormData({...formData, message: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-saraya-gold/50 transition-shadow"
                ></textarea>
              </div>
              <button 
                type="submit" 
                disabled={status === 'loading'}
                className="w-full py-4 bg-saraya-blue text-white rounded-xl font-bold hover:bg-blue-900 transition-colors shadow-lg disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {status === 'loading' ? (
                   <span className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full"></span>
                ) : (
                   "إرسال الطلب الآن"
                )}
              </button>

              {status === 'success' && (
                <div className="p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center justify-center gap-3 font-semibold mt-4">
                  <CheckCircle className="w-5 h-5" />
                  تم الإرسال بنجاح! سنتواصل معك قريباً.
                </div>
              )}
              
              {status === 'error' && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200 flex items-center justify-center gap-3 font-semibold mt-4">
                  <AlertCircle className="w-5 h-5" />
                  عذراً، حدث خطأ. يرجى المحاولة لاحقاً.
                </div>
              )}
            </form>
          </div>
          
        </div>
      </div>
    </section>
  );
}
