/**
 * Patient Portal — Login Page
 * 
 * Two-step OTP authentication:
 * 1. Enter MRN + Phone → Request OTP
 * 2. Enter OTP code → Verify → Login
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePortalAuthStore } from '../../stores/portalAuthStore';
import { portalAuthApi } from '../../api/portalApi';
import { toast } from 'sonner';
import { Phone, KeyRound, ArrowLeft, Loader2, MessageCircle } from 'lucide-react';

type Step = 'credentials' | 'otp';

export default function PortalLogin() {
  const navigate = useNavigate();
  const { login } = usePortalAuthStore();

  const [step, setStep] = useState<Step>('credentials');
  const [mrn, setMrn] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mrn.trim() || !phone.trim()) {
      toast.error('يرجى إدخال رقم الملف ورقم الهاتف');
      return;
    }

    setLoading(true);
    try {
      await portalAuthApi.post('/auth/request-otp', { mrn, phone });
      toast.success('تم إرسال رمز التحقق');
      setStep('otp');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'فشل إرسال رمز التحقق');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim() || otp.length !== 6) {
      toast.error('يرجى إدخال رمز التحقق المكون من 6 أرقام');
      return;
    }

    setLoading(true);
    try {
      const { data } = await portalAuthApi.post('/auth/verify-otp', { mrn, code: otp });
      login(data.patient, data.accessToken, data.refreshToken);
      toast.success(`مرحباً ${data.patient.fullName}`);
      navigate('/portal');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'رمز التحقق غير صحيح');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="portal-login-page">
      <div className="portal-login-bg" />

      <div className="portal-login-container">
        {/* Logo */}
        <div className="portal-login-logo">
          <div className="portal-login-logo-icon">🏥</div>
          <h1>بوابة المريض</h1>
          <p>نظام السرايا الطبي</p>
        </div>

        {/* Card */}
        <div className="portal-login-card">
          {step === 'credentials' ? (
            <form onSubmit={handleRequestOtp}>
              <h2 className="portal-login-title">تسجيل الدخول</h2>
              <p className="portal-login-desc">أدخل رقم ملفك الطبي ورقم هاتفك المسجل</p>

              <div className="portal-input-group">
                <label>رقم الملف الطبي (MRN)</label>
                <div className="portal-input-wrapper">
                  <input
                    id="portal-mrn"
                    type="text"
                    value={mrn}
                    onChange={(e) => setMrn(e.target.value)}
                    placeholder="MRN-0001"
                    autoFocus
                  />
                </div>
              </div>

              <div className="portal-input-group">
                <label>رقم الهاتف</label>
                <div className="portal-input-wrapper">
                  <Phone size={18} />
                  <input
                    id="portal-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09XXXXXXXX"
                  />
                </div>
              </div>

              <button
                id="portal-request-otp"
                type="submit"
                className="portal-submit-btn"
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'إرسال رمز التحقق'}
              </button>
              
              <div className="portal-telegram-promo mt-6 p-4 bg-blue-50/50 rounded-xl border border-blue-100/50 text-center">
                <div className="flex items-center justify-center gap-2 text-blue-600 mb-2">
                  <MessageCircle size={20} />
                  <span className="font-semibold text-sm">استلم رموز التحقق عبر تيليجرام</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  لضمان وصول رمز التحقق (OTP) بشكل فوري، يرجى تفعيل بوت السرايا الطبي قبل تسجيل الدخول.
                </p>
                <a
                  href={import.meta.env.VITE_TELEGRAM_BOT_URL || 'https://t.me/SarayaMedical_Bot'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center w-full gap-2 px-4 py-2.5 bg-[#0088cc] hover:bg-[#0077b3] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <MessageCircle size={18} />
                  تشغيل بوت تيليجرام 
                </a>
              </div>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <button
                type="button"
                onClick={() => { setStep('credentials'); setOtp(''); }}
                className="portal-back-btn"
              >
                <ArrowLeft size={18} />
                رجوع
              </button>

              <h2 className="portal-login-title">رمز التحقق</h2>
              <p className="portal-login-desc">
                تم إرسال رمز مكون من 6 أرقام إلى رقمك المسجل
              </p>

              <div className="portal-input-group">
                <label>رمز التحقق (OTP)</label>
                <div className="portal-input-wrapper otp">
                  <KeyRound size={18} />
                  <input
                    id="portal-otp"
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    style={{ letterSpacing: '0.5em', textAlign: 'center', fontSize: '1.5rem' }}
                  />
                </div>
              </div>

              <button
                id="portal-verify-otp"
                type="submit"
                className="portal-submit-btn"
                disabled={loading}
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : 'تأكيد الدخول'}
              </button>
            </form>
          )}
        </div>

        <p className="portal-login-footer">
          © 2026 نظام السرايا الطبي — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  );
}
