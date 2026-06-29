// src/components/quality/IncidentDetailsModal.tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Calendar, User, CheckCircle, ShieldCheck } from 'lucide-react';
import { apiClient } from '../../api/apiClient';
import { toast } from 'sonner';

interface IncidentDetailsModalProps {
  isOpen: boolean;
  incidentId: number | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function IncidentDetailsModal({ isOpen, incidentId, onClose, onUpdate }: IncidentDetailsModalProps) {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);

  // CAPA Form state
  const [showCapaForm, setShowCapaForm] = useState(false);
  const [submittingCapa, setSubmittingCapa] = useState(false);
  const [completingCapaId, setCompletingCapaId] = useState<number | null>(null);
  const [completedNotes, setCompletedNotes] = useState('');
  const [capaForm, setCapaForm] = useState({
    actionType: 'CORRECTIVE',
    description: '',
    assignedToId: '',
    dueDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (isOpen && incidentId) {
      loadIncident();
      loadStaff();
    } else {
      setIncident(null);
      setShowCapaForm(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, incidentId]);

  const loadIncident = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/quality/incidents/${incidentId}`);
      setIncident(res.data);
    } catch (err) {
      toast.error(t("quality.failedToLoadIncidentDetails", "فشل تحميل تفاصيل الحادثة"));
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const loadStaff = async () => {
    try {
      const res = await apiClient.get('/users/staff-list');
      setStaff(res.data || []);
    } catch (err) {
      console.error('Failed to load staff list', err);
    }
  };

  const handleAddCapa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (capaForm.description.length < 10) {
      toast.error(t("quality.capaDescriptionMinLength", "الوصف يجب أن يكون 10 أحرف على الأقل"));
      return;
    }
    if (!capaForm.assignedToId) {
      toast.error(t("quality.capaAssigneeRequired", "يرجى اختيار الموظف المسؤول"));
      return;
    }

    setSubmittingCapa(true);
    try {
      await apiClient.post('/quality/capa', {
        incidentId,
        actionType: capaForm.actionType,
        description: capaForm.description,
        assignedToId: Number(capaForm.assignedToId),
        dueDate: new Date(capaForm.dueDate).toISOString(),
      });
      toast.success(t("quality.capaAddedSuccessfully", "تم إضافة مهمة CAPA بنجاح"));
      setShowCapaForm(false);
      setCapaForm({
        actionType: 'CORRECTIVE',
        description: '',
        assignedToId: '',
        dueDate: new Date().toISOString().split('T')[0],
      });
      // Refresh local incident details
      await loadIncident();
      onUpdate();
    } catch (err) {
      toast.error(t("quality.failedToAddCapa", "فشل إضافة مهمة CAPA"));
    } finally {
      setSubmittingCapa(false);
    }
  };

  const handleCompleteCapa = async (capaId: number) => {
    if (!completedNotes.trim()) {
      toast.error(t("quality.pleaseEnterNotes", "الرجاء إدخال ملاحظات وملخص ما تم إنجازه"));
      return;
    }
    setSubmittingCapa(true);
    try {
      await apiClient.patch(`/quality/capa/${capaId}`, {
        status: 'COMPLETED',
        completedNotes
      });
      toast.success(t("quality.capaCompletedSuccessfully", "تم إغلاق المهمة بنجاح"));
      setCompletingCapaId(null);
      setCompletedNotes('');
      await loadIncident();
      onUpdate();
    } catch {
      toast.error(t("quality.errorCompletingCapa", "حدث خطأ أثناء إغلاق المهمة"));
    } finally {
      setSubmittingCapa(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="relative z-50">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={onClose} 
      />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div 
          className="mx-auto w-full max-w-4xl max-h-full rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl pointer-events-auto overflow-hidden flex flex-col" 
          dir={isRtl ? "rtl" : "ltr"}
        >
          {/* Header */}
          <div className="flex justify-between items-center bg-slate-900/80 px-6 py-4 border-b border-slate-800 shrink-0">
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-6 h-6 text-red-500" />
              {t("quality.incidentDetails", "تفاصيل الحادثة")} 
              {incident?.incidentNumber && <span className="text-slate-400 font-mono text-lg font-normal ml-2">({incident.incidentNumber})</span>}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar text-slate-300">
            {loading || !incident ? (
              <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Right/Main Column: Incident Info */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Summary Card */}
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                        incident.severity === 'SENTINEL' ? 'bg-red-900/30 border-red-700 text-red-400' : 
                        incident.severity === 'MAJOR' ? 'bg-orange-900/30 border-orange-700 text-orange-400' :
                        incident.severity === 'MODERATE' ? 'bg-yellow-900/30 border-yellow-700 text-yellow-400' :
                        'bg-blue-900/30 border-blue-700 text-blue-400'
                      }`}>
                        {incident.severity}
                      </span>
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded-lg">{incident.status}</span>
                      <span className="text-xs font-medium text-slate-400">{incident.incidentType}</span>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-slate-400 mb-1">{t("quality.description", "الوصف")}</h4>
                      <p className="text-slate-200 leading-relaxed">{incident.description}</p>
                    </div>

                    {incident.immediateAction && (
                      <div>
                        <h4 className="text-sm font-semibold text-slate-400 mb-1">{t("quality.immediateActionTaken", "الإجراء الفوري المتخذ")}</h4>
                        <p className="text-slate-300 leading-relaxed">{incident.immediateAction}</p>
                      </div>
                    )}
                  </div>

                  {/* CAPA Section */}
                  <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                        {t("quality.capaActions", "إجراءات CAPA")}
                      </h3>
                      {!showCapaForm && (
                        <button 
                          onClick={() => setShowCapaForm(true)}
                          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          + {t("quality.addCapa", "إضافة CAPA")}
                        </button>
                      )}
                    </div>

                    {/* Add CAPA Form */}
                    {showCapaForm && (
                      <form onSubmit={handleAddCapa} className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{t("quality.actionType", "نوع الإجراء")}</label>
                            <select
                              value={capaForm.actionType}
                              onChange={e => setCapaForm({...capaForm, actionType: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-red-500 outline-none"
                            >
                              <option value="CORRECTIVE">{t("quality.correctiveAction", "إجراء تصحيحي")}</option>
                              <option value="PREVENTIVE">{t("quality.preventiveMeasure", "إجراء وقائي")}</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-400 mb-1">{t("quality.dueDate", "تاريخ الاستحقاق")}</label>
                            <input
                              type="date"
                              required
                              value={capaForm.dueDate}
                              onChange={e => setCapaForm({...capaForm, dueDate: e.target.value})}
                              className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-red-500 outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t("quality.assignTo", "إسناد إلى")}</label>
                          <select
                            value={capaForm.assignedToId}
                            onChange={e => setCapaForm({...capaForm, assignedToId: e.target.value})}
                            required
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-red-500 outline-none"
                          >
                            <option value="">{t("quality.selectEmployee", "-- اختر الموظف --")}</option>
                            {staff.map(s => (
                              <option key={s.id} value={s.id}>{s.fullName}</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-400 mb-1">{t("quality.capaDescription", "وصف الإجراء")}</label>
                          <textarea
                            rows={3}
                            required
                            value={capaForm.description}
                            onChange={e => setCapaForm({...capaForm, description: e.target.value})}
                            className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:border-red-500 outline-none resize-none"
                            placeholder={t("quality.describeActionToBeTaken", "اشرح الإجراء المطلوب تنفيذه...")}
                          />
                        </div>

                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-700">
                          <button 
                            type="button" 
                            onClick={() => setShowCapaForm(false)}
                            className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg text-sm transition-colors"
                          >
                            {t("cancel", "إلغاء")}
                          </button>
                          <button 
                            type="submit" 
                            disabled={submittingCapa}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {submittingCapa ? t("quality.saving", "جاري الحفظ...") : t("quality.saveCapa", "حفظ الإجراء")}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* CAPA List */}
                    <div className="space-y-3">
                      {incident.capaActions?.length === 0 && !showCapaForm && (
                        <p className="text-center text-slate-500 text-sm py-4">{t("quality.noCapaActionsFound", "لا يوجد إجراءات CAPA مسجلة لهذه الحادثة")}</p>
                      )}
                      {incident.capaActions?.map((capa: any) => (
                        <div key={capa.id} className="bg-slate-900 border border-slate-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex gap-2">
                              <span className="text-xs font-semibold bg-slate-800 px-2 py-1 rounded">
                                {capa.actionType === 'CORRECTIVE' ? t("quality.correctiveAction", "تصحيحي") : t("quality.preventiveMeasure", "وقائي")}
                              </span>
                              <span className={`text-xs px-2 py-1 rounded ${
                                capa.status === 'OPEN' ? 'bg-yellow-900 text-yellow-300' :
                                capa.status === 'IN_PROGRESS' ? 'bg-blue-900 text-blue-300' :
                                'bg-green-900 text-green-300'
                              }`}>
                                {capa.status}
                              </span>
                            </div>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              👤 {capa.assignedTo?.fullName}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 mt-2">{capa.description}</p>
                          <div className="text-xs text-slate-500 mt-2">
                            📅 {t("quality.dueDate", "تاريخ الاستحقاق")}: {new Date(capa.dueDate).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}
                          </div>

                          {(capa.status === 'OPEN' || capa.status === 'IN_PROGRESS') && (
                            <div className="mt-4 pt-4 border-t border-slate-700/50">
                              {completingCapaId === capa.id ? (
                                <div className="space-y-3">
                                  <textarea
                                    value={completedNotes}
                                    onChange={(e) => setCompletedNotes(e.target.value)}
                                    placeholder={t("quality.enterCompletionNotes", "أدخل ملاحظات وملخص ما تم إنجازه...")}
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-white resize-none h-24 focus:border-emerald-500 outline-none"
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      onClick={() => {
                                        setCompletingCapaId(null);
                                        setCompletedNotes('');
                                      }}
                                      className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                      {t("cancel", "إلغاء")}
                                    </button>
                                    <button
                                      onClick={() => handleCompleteCapa(capa.id)}
                                      disabled={submittingCapa}
                                      className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {submittingCapa ? t("quality.saving", "جاري الحفظ...") : t("quality.completeTask", "إغلاق المهمة كمنجزة")}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-end">
                                  <button
                                    onClick={() => setCompletingCapaId(capa.id)}
                                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
                                  >
                                    {t("quality.closeTaskAsDone", "إغلاق المهمة كمنجزة")}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {capa.completedNotes && (
                            <div className="mt-3 p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-lg">
                              <h5 className="text-xs font-semibold text-emerald-400 mb-1">{t("quality.completionNotes", "ملاحظات الإنجاز")}</h5>
                              <p className="text-sm text-slate-300">{capa.completedNotes}</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Left/Sidebar Column: Meta Data */}
                <div className="space-y-6">
                  {/* Meta Details */}
                  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white border-b border-slate-700 pb-2">{t("quality.incidentInfo", "معلومات الحادثة")}</h3>
                    
                    <div>
                      <div className="text-xs text-slate-500 mb-1">{t("quality.dateOfIncident", "تاريخ الحادثة")}</div>
                      <div className="text-sm text-slate-200 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {new Date(incident.incidentDate).toLocaleDateString(isRtl ? 'ar-SA' : 'en-US')}
                      </div>
                    </div>

                    {incident.location && (
                      <div>
                        <div className="text-xs text-slate-500 mb-1">{t("quality.theSite", "الموقع")}</div>
                        <div className="text-sm text-slate-200">{incident.location}</div>
                      </div>
                    )}

                    <div>
                      <div className="text-xs text-slate-500 mb-1">{t("quality.reporter", "المُبلّغ")}</div>
                      <div className="text-sm text-slate-200 flex items-center gap-2">
                        <User className="w-4 h-4 text-slate-400" />
                        {incident.isAnonymous ? (
                          <span className="text-slate-500 italic">{t("quality.unknown", "مجهول")}</span>
                        ) : (
                          incident.reporter?.fullName
                        )}
                      </div>
                    </div>

                    {incident.patient && (
                      <div>
                        <div className="text-xs text-slate-500 mb-1">{t("quality.patient", "المريض المرتبط")}</div>
                        <div className="text-sm text-slate-200 flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          {incident.patient.fullName} <span className="text-slate-500">({incident.patient.mrn})</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Investigation Notes */}
                  {(incident.investigationNotes || incident.rootCause) && (
                    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5 space-y-4">
                      <h3 className="text-sm font-bold text-white border-b border-slate-700 pb-2">{t("quality.investigation", "التحقيق")}</h3>
                      
                      {incident.rootCause && (
                        <div>
                          <div className="text-xs text-slate-500 mb-1">{t("quality.rootCause", "السبب الجذري")}</div>
                          <div className="text-sm text-slate-200">{incident.rootCause}</div>
                        </div>
                      )}

                      {incident.investigationNotes && (
                        <div>
                          <div className="text-xs text-slate-500 mb-1">{t("quality.investigationNotes", "ملاحظات التحقيق")}</div>
                          <div className="text-sm text-slate-200 leading-relaxed">{incident.investigationNotes}</div>
                        </div>
                      )}

                      {incident.investigator && (
                        <div>
                          <div className="text-xs text-slate-500 mb-1">{t("quality.investigator", "المُحقق")}</div>
                          <div className="text-sm text-slate-200">{incident.investigator.fullName}</div>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
