import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface SOAPNoteProps {
   
  note: any;
   
  onSave: (data: any) => Promise<void>;
  onSign?: (noteId: number) => Promise<void>;
  onCoSign?: (noteId: number) => Promise<void>;
  isReadOnly?: boolean;
   
  onAiAnalyze?: (data: any) => void;
  isAnalyzing?: boolean;
  isSaving?: boolean;
}

export const StructuredSOAPNote: React.FC<SOAPNoteProps> = ({ note, onSave, onSign, onCoSign, isReadOnly = false, onAiAnalyze, isAnalyzing, isSaving }) => {
  const { t } = useTranslation();
  const [isStructured, setIsStructured] = useState(!!note?.subjective || !!note?.objective);
  const [content, setContent] = useState(note?.content || '');
  const [subjective, setSubjective] = useState(note?.subjective || '');
  const [objective, setObjective] = useState(note?.objective || '');
  const [assessment, setAssessment] = useState(note?.assessment || '');
  const [plan, setPlan] = useState(note?.plan || '');

  const handleSave = async () => {
    if (isStructured) {
      await onSave({
        subjective,
        objective,
        assessment,
        plan,
      });
    } else {
      await onSave({ content });
    }
  };

  const isSigned = !!note?.signedById;
  const isCoSigned = !!note?.coSignedById;
  const disabled = isReadOnly || isSigned;

  return (
    <div className="bg-slate-900 rounded-lg shadow border border-slate-800 p-4 mb-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-lg font-bold text-slate-100">
          {t("soapNote.clinicalNote", "الملاحظة السريرية")}
        </h4>

        {!disabled && (
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="text-sm text-slate-400">{t("soapNote.freeText", "نص حر")}</span>
            <button
              onClick={() => setIsStructured(!isStructured)}
              className={`w-12 h-6 rounded-full transition-colors ${isStructured ? 'bg-indigo-600' : 'bg-gray-300'} relative`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${isStructured ? 'left-1' : 'right-1'}`} />
            </button>
            <span className="text-sm text-slate-400">{t("soapNote.structuredSOAP", "مهيكل (SOAP)")}</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {isStructured ? (
          <>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Subjective (S)</label>
              <textarea
                value={subjective}
                onChange={(e) => setSubjective(e.target.value)}
                disabled={disabled}
                placeholder={t("soapNote.subjectivePlaceholder", "شكوى المريض وما يذكره...")}
                className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Objective (O)</label>
              <textarea
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                disabled={disabled}
                placeholder={t("soapNote.objectivePlaceholder", "العلامات الحيوية، الفحص السريري، نتائج المختبر...")}
                className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Assessment (A)</label>
              <textarea
                value={assessment}
                onChange={(e) => setAssessment(e.target.value)}
                disabled={disabled}
                placeholder={t("soapNote.assessmentPlaceholder", "التقييم الطبي والمشكلة...")}
                className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
                rows={2}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Plan (P)</label>
              <textarea
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                disabled={disabled}
                placeholder={t("soapNote.planPlaceholder", "الأدوية، التحاليل المطلوبة، المتابعة...")}
                className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
                rows={2}
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">{t("soapNote.openNoteDetails", "تفاصيل الملاحظة المفتوحة")}</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={disabled}
              placeholder={t("soapNote.freeTextPlaceholder", "اكتب ملاحظاتك بحرية هنا...")}
              className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
              rows={6}
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="pt-4 border-t border-slate-700 mt-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex space-x-2 space-x-reverse">
              {isSigned ? (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-900/50 text-green-400 border border-green-800">
                  ✅ {t("soapNote.signedByDoctor", "وقعها الطبيب المعالج")}
                </span>
              ) : (
                !isReadOnly && onSign && (
                  <button
                    onClick={() => onSign(note.id)}
                    disabled={!note?.id}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg transition disabled:opacity-50 border border-slate-600"
                    title={t("soapNote.cannotEditAfterSign", "يمنع تعديل الملاحظة نهائياً بعد التوقيع")}
                  >
                    توقيع إلكتروني (Sign)
                  </button>
                )
              )}

              {isCoSigned && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900/50 text-blue-400 border border-blue-800">
                  ☑️ {t("soapNote.coSigned", "توقيع مشترك")}
                </span>
              )}
            </div>

            <div className="flex gap-2">
              {onAiAnalyze && !isSigned && (
                <button
                  onClick={() => {
                    const noteData = isStructured
                      ? { subjective, objective, assessment, plan }
                      : { content };
                    onAiAnalyze({ note: noteData });
                  }}
                  disabled={isAnalyzing}
                  className="bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isAnalyzing ? t("soapNote.analyzing", "جاري التحليل...") : t("soapNote.aiAnalyze", "تحليل بواسطة الذكاء الاصطناعي 🧠")}
                </button>
              )}

              {!isSigned && (
                <button
                  onClick={handleSave}
                  disabled={disabled || isSaving}
                  className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 font-bold text-sm shadow"
                >
                  {isSaving ? t("common.saving", "جاري الحفظ...") : t("soapNote.saveNote", "حفظ الملاحظة")}
                </button>
              )}

              {isSigned && !isCoSigned && onCoSign && (
                <button
                  onClick={() => onCoSign(note.id)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition"
                >
                  توقيع مشترك (Co-Sign)
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
