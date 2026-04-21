import { useEffect, useState } from 'react';
import { portalApi } from '../../api/portalApi';
import { User, Loader2, Shield, AlertTriangle, Phone, Mail, MapPin, Calendar } from 'lucide-react';

export default function PortalProfile() {
  const [profile, setProfile] = useState<any>(null);
  const [insurance, setInsurance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      portalApi.get('/profile').then(r => setProfile(r.data)),
      portalApi.get('/financial/insurance').then(r => setInsurance(r.data)),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="portal-page-loader"><Loader2 className="animate-spin" size={40}/></div>;

  return (
    <div className="portal-page">
      <div className="portal-page-header"><h1><User size={28}/> الملف الشخصي</h1></div>

      {profile && (
        <div className="portal-profile-card">
          <div className="portal-profile-avatar">{profile.fullName?.charAt(0) || 'م'}</div>
          <h2>{profile.fullName}</h2>
          <span className="portal-profile-mrn">MRN: {profile.mrn}</span>

          <div className="portal-profile-details">
            {profile.dateOfBirth && <div className="portal-detail"><Calendar size={16}/><span>تاريخ الميلاد: {new Date(profile.dateOfBirth).toLocaleDateString('ar-LY')}</span></div>}
            {profile.gender && <div className="portal-detail"><User size={16}/><span>الجنس: {profile.gender === 'MALE' ? 'ذكر' : profile.gender === 'FEMALE' ? 'أنثى' : profile.gender}</span></div>}
            {profile.phone && <div className="portal-detail"><Phone size={16}/><span>{profile.phone}</span></div>}
            {profile.email && <div className="portal-detail"><Mail size={16}/><span>{profile.email}</span></div>}
            {profile.address && <div className="portal-detail"><MapPin size={16}/><span>{profile.address}</span></div>}
          </div>

          {profile.allergies?.length > 0 && (
            <div className="portal-profile-section">
              <h3><AlertTriangle size={18}/> الحساسية</h3>
              <div className="portal-tags">
                {profile.allergies.map((a: any) => (
                  <span key={a.id} className={`portal-tag ${a.severity === 'HIGH' ? 'danger' : 'warning'}`}>{a.allergen}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {insurance && (
        <div className="portal-info-card" style={{marginTop:'1.5rem'}}>
          <div className="portal-info-header"><Shield size={18} className="text-emerald-400"/><h4>التأمين الصحي</h4></div>
          {insurance.hasInsurance ? (
            <div>
              <p className="portal-info-value">{insurance.policy?.provider?.name}</p>
              <p className="portal-info-sub">الخطة: {insurance.policy?.plan?.name}</p>
              {insurance.memberId && <p className="portal-info-sub">رقم العضوية: {insurance.memberId}</p>}
            </div>
          ) : <p className="portal-info-empty">لا يوجد تأمين مسجل</p>}
        </div>
      )}
    </div>
  );
}
