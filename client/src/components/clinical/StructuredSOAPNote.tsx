import React, { useState } from 'react';

interface SOAPNoteProps {
  note: any;
  onSave: (data: any) => Promise<void>;
  onSign: (noteId: number) => Promise<void>;
  onCoSign: (noteId: number) => Promise<void>;
  isReadOnly?: boolean;
}

export const StructuredSOAPNote: React.FC<SOAPNoteProps> = ({ note, onSave, onSign, onCoSign, isReadOnly = false }) => {
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
          الملاحظة السريرية
        </h4>

        {!disabled && (
          <div className="flex items-center space-x-2 space-x-reverse">
            <span className="text-sm text-slate-400">نص حر</span>
            <button
              onClick={() => setIsStructured(!isStructured)}
              className={`w-12 h-6 rounded-full transition-colors ${isStructured ? 'bg-indigo-600' : 'bg-gray-300'} relative`}
            >
              <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${isStructured ? 'left-1' : 'right-1'}`} />
            </button>
            <span className="text-sm text-slate-400">مهيكل (SOAP)</span>
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
                placeholder="شكوى المريض وما يذكره..."
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
                placeholder="العلامات الحيوية، الفحص السريري، نتائج المختبر..."
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
                placeholder="التقييم الطبي والمشكلة..."
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
                placeholder="الأدوية، التحاليل المطلوبة، المتابعة..."
                className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
                rows={2}
              />
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1">تفاصيل الملاحظة المفتوحة</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={disabled}
              placeholder="اكتب ملاحظاتك بحرية هنا..."
              className="w-full rounded-md border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 bg-slate-800 text-slate-100"
              rows={6}
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex space-x-2 space-x-reverse">
            {isSigned ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                ✅ وقعها الطبيب المعالج
              </span>
            ) : (
              !isReadOnly && (
                <button
                  onClick={() => onSign(note.id)}
                  disabled={!note?.id}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded transition disabled:opacity-50"
                  title="يمنع تعديل الملاحظة نهائياً بعد التوقيع"
                >
                  توقيع إلكتروني (Sign)
                </button>
              )
            )}

            {isCoSigned && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                ☑️ توقيع مشترك
              </span>
            )}

            {isSigned && !isCoSigned && !isReadOnly && (
              <button
                onClick={() => onCoSign(note.id)}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition"
              >
                توقيع مشترك (Co-Sign)
              </button>
            )}
          </div>

          {!disabled && (
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded shadow transition"
            >
              حفظ الملاحظة
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
