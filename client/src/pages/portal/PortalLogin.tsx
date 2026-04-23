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

type Step = 'credentials' | 'otp' | 'telegram_link';

export default function PortalLogin() {
  const navigate = useNavigate();
  const { login } = usePortalAuthStore();

  const [step, setStep] = useState<Step>('credentials');
  const [mrn, setMrn] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mrn.trim() || !phone.trim()) {
      toast.error('يرجى إدخال رقم الملف ورقم الهاتف');
      return;
    }

    setLoading(true);
    try {
      const response = await portalAuthApi.post('/auth/request-otp', { mrn, phone });
      
      if (response.data?.requiresTelegramLinking) {
        setLinkUrl(response.data.linkUrl);
        setStep('telegram_link');
        toast.info('يرجى ربط حسابك بتيليجرام لاستلام الرمز');
      } else {
        toast.success('تم إرسال رمز التحقق');
        setStep('otp');
      }
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
            </form>
          ) : step === 'telegram_link' ? (
            <div className="portal-login-telegram-link">
              <h2 className="portal-login-title">تفعيل حساب تيليجرام</h2>
              <p className="portal-login-desc" style={{ marginBottom: '1.5rem', lineHeight: '1.6', fontSize: '0.9rem', color: '#64748b' }}>
                لضمان الأمان، يتم إرسال رموز التحقق عبر تطبيق تيليجرام.<br/>
                يرجى الضغط على الزر أدناه لربط حسابك وتلقي الرمز فوراً.
              </p>
              
              <a 
                href={linkUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="portal-submit-btn"
                style={{ background: '#0088cc', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                onClick={() => {
                  toast.success('تم فتح تيليجرام. بعد بدء البوت، ستتلقى رمز الدخول هنا.');
                  setTimeout(() => setStep('otp'), 2000); // Auto move to OTP screen so they can paste it
                }}
              >
                <MessageCircle size={20} />
                تفعيل عبر تيليجرام
              </a>

              <button
                className="portal-back-btn"
                onClick={() => setStep('credentials')}
                disabled={loading}
                style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}
              >
                <ArrowLeft size={18} /> رجوع
              </button>
            </div>
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
