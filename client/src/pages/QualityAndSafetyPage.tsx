import { useTranslation } from "react-i18next";
// src/pages/QualityAndSafetyPage.tsx
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { toast } from 'sonner';

type IncidentSeverity = 'NEAR_MISS' | 'MINOR' | 'MODERATE' | 'MAJOR' | 'SENTINEL';
type IncidentStatus = 'REPORTED' | 'UNDER_REVIEW' | 'INVESTIGATED' | 'CAPA_OPEN' | 'CAPA_VERIFIED' | 'CLOSED';
type IncidentType = 'PATIENT_FALL' | 'MEDICATION_ERROR' | 'PROCEDURE_COMPLICATION' | 'NEAR_MISS' | 'HEALTHCARE_ASSOCIATED_INFECTION' | 'DIAGNOSTIC_ERROR' | 'EQUIPMENT_FAILURE' | 'BLOOD_TRANSFUSION_REACTION' | 'PRESSURE_INJURY' | 'OTHER';

type Incident = {
  id: number;
  incidentNumber: string;
  incidentDate: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  description: string;
  location: string | null;
  isAnonymous: boolean;
  reportedAt: string;
  reporter: { id: number; fullName: string };
  patient: { id: number; mrn: string; fullName: string } | null;
  _count: { capaActions: number };
};

type DashboardStats = {
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
  openCapas: number;
  overdueCapas: number;
  recentIncidents: Incident[];
};

type ReportForm = {
  incidentDate: string;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  description: string;
  location: string;
  isAnonymous: boolean;
  immediateAction: string;
};

const SEVERITY_CONFIG: Record<IncidentSeverity, { label: string; labelAr: string; color: string; bg: string }> = {
  NEAR_MISS:  { label: 'Near Miss',  labelAr: 'حادثة وشيكة', color: 'text-blue-400',   bg: 'bg-blue-900/30 border-blue-700' },
  MINOR:      { label: 'Minor',      labelAr: 'طفيف',         color: 'text-green-400',  bg: 'bg-green-900/30 border-green-700' },
  MODERATE:   { label: 'Moderate',   labelAr: 'متوسط',        color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700' },
  MAJOR:      { label: 'Major',      labelAr: 'خطير',         color: 'text-orange-400', bg: 'bg-orange-900/30 border-orange-700' },
  SENTINEL:   { label: 'Sentinel',   labelAr: 'كارثي',        color: 'text-red-400',    bg: 'bg-red-900/30 border-red-700' },
};

const STATUS_CONFIG: Record<IncidentStatus, { labelAr: string; color: string }> = {
  REPORTED:      { labelAr: 'مُبلَّغ عنه',     color: 'bg-slate-700 text-slate-300' },
  UNDER_REVIEW:  { labelAr: 'قيد المراجعة',    color: 'bg-blue-900 text-blue-300' },
  INVESTIGATED:  { labelAr: 'تحت التحقيق',     color: 'bg-purple-900 text-purple-300' },
  CAPA_OPEN:     { labelAr: 'CAPA مفتوح',      color: 'bg-yellow-900 text-yellow-300' },
  CAPA_VERIFIED: { labelAr: 'CAPA مُتحقَّق',    color: 'bg-teal-900 text-teal-300' },
  CLOSED:        { labelAr: 'مغلق',            color: 'bg-green-900 text-green-300' },
};

const TYPE_LABELS: Record<IncidentType, string> = {
  PATIENT_FALL: 'سقوط مريض',
  MEDICATION_ERROR: 'خطأ دوائي',
  PROCEDURE_COMPLICATION: 'مضاعفة إجراء',
  NEAR_MISS: 'حادثة وشيكة',
  HEALTHCARE_ASSOCIATED_INFECTION: 'عدوى مكتسبة',
  DIAGNOSTIC_ERROR: 'خطأ تشخيصي',
  EQUIPMENT_FAILURE: 'عطل معدات',
  BLOOD_TRANSFUSION_REACTION: 'تفاعل نقل دم',
  PRESSURE_INJURY: 'قرحة ضغط',
  OTHER: 'أخرى',
};

const defaultForm: ReportForm = {
  incidentDate: new Date().toISOString().split('T')[0],
  incidentType: 'OTHER',
  severity: 'MINOR',
  description: '',
  location: '',
  isAnonymous: false,
  immediateAction: '',
};

export default function QualityAndSafetyPage() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as 'dashboard' | 'incidents' | 'report' | 'my-capa') || 'dashboard';
  
  const setTab = (newTab: 'dashboard' | 'incidents' | 'report' | 'my-capa') => {
    setSearchParams({ tab: newTab });
  };

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
   
  const [myCapas, setMyCapas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<ReportForm>(defaultForm);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('');

  const loadDashboard = async () => {
    try {
      const res = await apiClient.get('/quality/dashboard');
      setStats(res.data);
    } catch {
      toast.error('تعذّر تحميل إحصائيات الجودة');
    } finally {
      setLoading(false);
    }
  };

  const loadIncidents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.append('status', filterStatus);
      if (filterSeverity) params.append('severity', filterSeverity);
      const res = await apiClient.get(`/quality/incidents?${params}`);
      setIncidents(res.data.items ?? []);
    } catch {
      toast.error('تعذّر تحميل قائمة الحوادث');
    } finally {
      setLoading(false);
    }
  };

  const loadMyCapas = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/quality/my-capa-tasks');
      setMyCapas(res.data);
    } catch {
      toast.error('تعذّر تحميل مهام CAPA');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'incidents') loadIncidents();
    if (tab === 'my-capa') loadMyCapas();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, filterStatus, filterSeverity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.description.length < 20) {
      toast.error('الوصف يجب أن يكون 20 حرفاً على الأقل');
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.post('/quality/incidents', form);
      toast.success('تم الإبلاغ عن الحادثة بنجاح');
      setForm(defaultForm);
      setTab('incidents');
    } catch {
      toast.error('فشل الإبلاغ عن الحادثة');
    } finally {
      setSubmitting(false);
    }
  };

  const totalIncidents = stats ? Object.values(stats.byStatus).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-white" dir={isRtl ? "rtl" : "ltr"}>
      {/* Header */}
      <div className="bg-gradient-to-r from-red-950 via-slate-900 to-slate-950 border-b border-red-900/40 px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-red-600/20 border border-red-500/40 rounded-xl flex items-center justify-center text-2xl">🛡️</div>
            <div>
              <h1 className="text-2xl font-bold text-white">الجودة وسلامة المريض</h1>
              <p className="text-slate-400 text-sm">إدارة الحوادث السريرية والـ CAPA</p>
            </div>
          </div>
          <button
            id="btn-report-incident"
            onClick={() => setTab('report')}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-500 rounded-xl font-semibold transition-all shadow-lg shadow-red-900/30"
          >
            <span>＋</span> الإبلاغ عن حادثة
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-800 px-6">
        <div className="max-w-7xl mx-auto flex gap-1">
          {([['dashboard', '📊 لوحة التحكم'], ['incidents', '📋 الحوادث'], ['my-capa', '✅ مهام CAPA'], ['report', '＋ إبلاغ']] as const).map(([key, label]) => (
            <button
              key={key}
              id={`tab-quality-${key}`}
               
              onClick={() => setTab(key as any)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-all ${
                tab === key ? 'border-red-500 text-red-400' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* ── Dashboard Tab ── */}
        {tab === 'dashboard' && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : stats ? (
              <>
                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <div className="text-3xl font-bold text-white">{totalIncidents}</div>
                    <div className="text-slate-400 text-sm mt-1">إجمالي الحوادث</div>
                  </div>
                  <div className={`border rounded-2xl p-5 ${(stats.byStatus['REPORTED'] || 0) > 0 ? 'bg-yellow-900/20 border-yellow-800' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="text-3xl font-bold text-yellow-400">{stats.byStatus['REPORTED'] ?? 0}</div>
                    <div className="text-slate-400 text-sm mt-1">تنتظر المراجعة</div>
                  </div>
                  <div className={`border rounded-2xl p-5 ${stats.openCapas > 0 ? 'bg-orange-900/20 border-orange-800' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="text-3xl font-bold text-orange-400">{stats.openCapas}</div>
                    <div className="text-slate-400 text-sm mt-1">CAPA مفتوحة</div>
                  </div>
                  <div className={`border rounded-2xl p-5 ${stats.overdueCapas > 0 ? 'bg-red-900/30 border-red-700' : 'bg-slate-900 border-slate-800'}`}>
                    <div className="text-3xl font-bold text-red-400">{stats.overdueCapas}</div>
                    <div className="text-slate-400 text-sm mt-1">CAPA متأخرة</div>
                  </div>
                </div>

                {/* Severity Breakdown */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold mb-4">توزيع الحوادث حسب الخطورة</h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {(Object.entries(SEVERITY_CONFIG) as [IncidentSeverity, typeof SEVERITY_CONFIG[IncidentSeverity]][]).map(([sev, cfg]) => (
                      <div key={sev} className={`border rounded-xl p-4 text-center ${cfg.bg}`}>
                        <div className={`text-2xl font-bold ${cfg.color}`}>{stats.bySeverity[sev] ?? 0}</div>
                        <div className="text-xs text-slate-400 mt-1">{cfg.labelAr}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Incidents */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-lg font-semibold mb-4">آخر الحوادث المُبلَّغ عنها</h3>
                  <div className="space-y-3">
                    {stats.recentIncidents.length === 0 && (
                      <p className="text-slate-500 text-center py-8">لا توجد حوادث حتى الآن</p>
                    )}
                    {stats.recentIncidents.map(i => (
                      <div key={i.id} className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${SEVERITY_CONFIG[i.severity].bg} ${SEVERITY_CONFIG[i.severity].color}`}>
                            {SEVERITY_CONFIG[i.severity].labelAr}
                          </span>
                          <div>
                            <div className="font-mono text-sm text-slate-300">{i.incidentNumber}</div>
                            <div className="text-xs text-slate-500">{TYPE_LABELS[i.incidentType]}</div>
                          </div>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-lg ${STATUS_CONFIG[i.status].color}`}>
                          {STATUS_CONFIG[i.status].labelAr}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        )}

        {/* ── Incidents Tab ── */}
        {tab === 'incidents' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <select
                id="filter-status"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
              >
                <option value="">جميع الحالات</option>
                {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.labelAr}</option>
                ))}
              </select>
              <select
                id="filter-severity"
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm text-white"
              >
                <option value="">جميع درجات الخطورة</option>
                {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.labelAr}</option>
                ))}
              </select>
            </div>

            {loading ? (
              <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {incidents.length === 0 && <p className="text-slate-500 text-center py-16">لا توجد حوادث مطابقة</p>}
                {incidents.map(incident => (
                  <div key={incident.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${SEVERITY_CONFIG[incident.severity].bg} ${SEVERITY_CONFIG[incident.severity].color}`}>
                          {SEVERITY_CONFIG[incident.severity].labelAr}
                        </span>
                        <span className="font-mono font-bold text-white">{incident.incidentNumber}</span>
                        <span className="text-slate-400 text-sm">{TYPE_LABELS[incident.incidentType]}</span>
                        {incident.isAnonymous && <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-lg">مجهول</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded-lg ${STATUS_CONFIG[incident.status].color}`}>
                          {STATUS_CONFIG[incident.status].labelAr}
                        </span>
                        {incident._count.capaActions > 0 && (
                          <span className="text-xs bg-slate-700 text-slate-300 px-2 py-1 rounded-lg">
                            {incident._count.capaActions} CAPA
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-slate-300 text-sm mt-3 leading-relaxed line-clamp-2">{incident.description}</p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                      {incident.location && <span>📍 {incident.location}</span>}
                      {incident.patient && <span>🧑‍⚕️ {incident.patient.fullName} ({incident.patient.mrn})</span>}
                      <span>📅 {new Date(incident.incidentDate).toLocaleDateString('ar-SA')}</span>
                      {!incident.isAnonymous && <span>👤 {incident.reporter.fullName}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── My CAPA Tab ── */}
        {tab === 'my-capa' && (
          <div className="space-y-4">
            {loading ? (
              <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="space-y-3">
                {myCapas.length === 0 && <p className="text-slate-500 text-center py-16">لا توجد مهام CAPA مسندة إليك</p>}
                {myCapas.map(capa => (
                  <div key={capa.id} className={`bg-slate-900 border rounded-2xl p-5 hover:border-slate-700 transition-all ${capa.isOverdue ? 'border-red-900/50' : 'border-slate-800'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-mono font-bold text-white">{capa.incident.incidentNumber}</span>
                        <span className="text-xs bg-slate-800 px-2 py-1 rounded-lg text-slate-300">
                          {capa.actionType === 'CORRECTIVE' ? 'إجراء تصحيحي' : 'إجراء وقائي'}
                        </span>
                        {capa.isOverdue && <span className="text-xs bg-red-900/50 text-red-300 px-2 py-1 rounded-lg">متأخر</span>}
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-lg ${
                        capa.status === 'OPEN' ? 'bg-yellow-900 text-yellow-300' :
                        capa.status === 'IN_PROGRESS' ? 'bg-blue-900 text-blue-300' :
                        'bg-green-900 text-green-300'
                      }`}>
                        {capa.status}
                      </span>
                    </div>
                    <p className="text-slate-300 text-sm mt-3 leading-relaxed">{capa.description}</p>
                    <div className="flex flex-wrap gap-4 mt-3 text-xs text-slate-500">
                      <span>🎯 تاريخ الاستحقاق: {new Date(capa.dueDate).toLocaleDateString('ar-SA')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Report Tab ── */}
        {tab === 'report' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <span className="text-2xl">📝</span> الإبلاغ عن حادثة / near miss
              </h2>
              <form id="form-report-incident" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">تاريخ الحادثة *</label>
                    <input id="input-incident-date" type="date" required value={form.incidentDate}
                      onChange={e => setForm(f => ({ ...f, incidentDate: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">الموقع</label>
                    <input id="input-incident-location" type="text" placeholder="الجناح / غرفة العمليات..." value={form.location}
                      onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">نوع الحادثة *</label>
                    <select id="select-incident-type" required value={form.incidentType}
                      onChange={e => setForm(f => ({ ...f, incidentType: e.target.value as IncidentType }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm">
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">درجة الخطورة *</label>
                    <select id="select-incident-severity" required value={form.severity}
                      onChange={e => setForm(f => ({ ...f, severity: e.target.value as IncidentSeverity }))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm">
                      {Object.entries(SEVERITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.labelAr}</option>)}
                    </select>
                  </div>
                </div>

                {/* Severity preview */}
                <div className={`border rounded-xl p-3 text-sm ${SEVERITY_CONFIG[form.severity].bg} ${SEVERITY_CONFIG[form.severity].color}`}>
                  <strong>{SEVERITY_CONFIG[form.severity].labelAr}</strong>
                  {form.severity === 'SENTINEL' && ' — يتطلب تحقيقاً فورياً خلال 24 ساعة'}
                  {form.severity === 'MAJOR' && ' — يتطلب مراجعة خلال 24 ساعة'}
                  {form.severity === 'MODERATE' && ' — يتطلب مراجعة خلال 3 أيام'}
                  {form.severity === 'MINOR' && ' — يتطلب مراجعة خلال أسبوع'}
                  {form.severity === 'NEAR_MISS' && ' — يتطلب مراجعة خلال أسبوعين'}
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">وصف الحادثة * (20 حرفاً على الأقل)</label>
                  <textarea id="textarea-incident-description" required rows={4} value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="اشرح ما حدث بدقة — من، ماذا، متى، وكيف..."
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm resize-none" />
                  <div className="text-xs text-slate-500 mt-1">{form.description.length} / 20 حرف كحد أدنى</div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">الإجراء الفوري المُتخذ</label>
                  <textarea id="textarea-immediate-action" rows={2} value={form.immediateAction}
                    onChange={e => setForm(f => ({ ...f, immediateAction: e.target.value }))}
                    placeholder="ما الذي تم فعله فور اكتشاف الحادثة؟"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm resize-none" />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input id="checkbox-anonymous" type="checkbox" checked={form.isAnonymous}
                    onChange={e => setForm(f => ({ ...f, isAnonymous: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-600 bg-slate-800" />
                  <span className="text-sm text-slate-300">الإبلاغ بشكل مجهول الهوية</span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button type="submit" id="btn-submit-incident" disabled={submitting}
                    className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl font-semibold transition-all">
                    {submitting ? 'جارٍ الإرسال...' : 'إرسال البلاغ'}
                  </button>
                  <button type="button" onClick={() => setTab('dashboard')}
                    className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-semibold transition-all">
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
