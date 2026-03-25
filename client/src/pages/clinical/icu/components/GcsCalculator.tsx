import React, { useState, useEffect } from 'react';
import { BrainCircuit, Eye, MessageCircle, Activity } from 'lucide-react';

interface Props {
  initialScore?: number;
  onChange: (total: number, eye: number, verbal: number, motor: number) => void;
  readonly?: boolean;
}

export const GcsCalculator = ({ initialScore, onChange, readonly = false }: Props) => {
  const [eye, setEye] = useState<number>(0);
  const [verbal, setVerbal] = useState<number>(0);
  const [motor, setMotor] = useState<number>(0);

  useEffect(() => {
    if (eye > 0 && verbal > 0 && motor > 0) {
      onChange(eye + verbal + motor, eye, verbal, motor);
    }
  }, [eye, verbal, motor]);

  const totalScore = (eye || 0) + (verbal || 0) + (motor || 0);

  const getSeverity = () => {
    if (totalScore === 0) return { label: 'Incomplete', color: 'text-slate-400 bg-slate-100 dark:bg-slate-800' };
    if (totalScore <= 8) return { label: 'Severe Injury (Coma)', color: 'text-rose-700 bg-rose-100 border-rose-200 dark:bg-rose-900/30' };
    if (totalScore <= 12) return { label: 'Moderate Injury', color: 'text-amber-700 bg-amber-100 border-amber-200 dark:bg-amber-900/30' };
    return { label: 'Minor Injury', color: 'text-emerald-700 bg-emerald-100 border-emerald-200 dark:bg-emerald-900/30' };
  };

  const severity = getSeverity();

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 rounded-t-xl">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-white flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-indigo-500" /> 
          Glasgow Coma Scale (GCS)
        </h3>
        <div className={`px-4 py-1 rounded-lg border font-bold flex items-center gap-3 ${severity.color}`}>
          <span className="text-2xl">{totalScore || '-'}</span> 
          <span className="text-xs uppercase tracking-wider hidden sm:inline-block">{severity.label}</span>
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* EYE RESPONSE */}
        <div className="space-y-3">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
            <Eye className="w-4 h-4 text-sky-500" /> Eye Opening (E)
          </h4>
          <div className="flex flex-col gap-2">
            {[
              { score: 4, label: 'Spontaneous', desc: 'Opens eyes on own' },
              { score: 3, label: 'To Speech', desc: 'Opens eyes when asked' },
              { score: 2, label: 'To Pain', desc: 'Opens eyes on pain' },
              { score: 1, label: 'None', desc: 'Does not open eyes' },
            ].map(item => (
              <button
                key={item.score}
                disabled={readonly}
                onClick={() => setEye(item.score)}
                className={`flex justify-between items-center p-3 rounded-lg border text-left transition-colors ${
                  eye === item.score 
                    ? 'bg-sky-50 border-sky-500 ring-1 ring-sky-500 dark:bg-sky-900/30 dark:border-sky-400' 
                    : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                } ${readonly ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div>
                  <div className={`font-semibold ${eye === item.score ? 'text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-300'}`}>{item.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${eye === item.score ? 'bg-sky-100 text-sky-700 dark:bg-sky-800 dark:text-sky-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>{item.score}</div>
              </button>
            ))}
          </div>
        </div>

        {/* VERBAL RESPONSE */}
        <div className="space-y-3">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
            <MessageCircle className="w-4 h-4 text-emerald-500" /> Verbal Response (V)
          </h4>
          <div className="flex flex-col gap-2">
            {[
              { score: 5, label: 'Oriented', desc: 'Converses normally' },
              { score: 4, label: 'Confused', desc: 'Disoriented conversation' },
              { score: 3, label: 'Inappropriate', desc: 'Words but no conversation' },
              { score: 2, label: 'Incomprehensible', desc: 'Sounds only' },
              { score: 1, label: 'None', desc: 'No sounds' },
            ].map(item => (
              <button
                key={item.score}
                disabled={readonly}
                onClick={() => setVerbal(item.score)}
                className={`flex justify-between items-center p-3 rounded-lg border text-left transition-colors ${
                  verbal === item.score 
                    ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500 dark:bg-emerald-900/30 dark:border-emerald-400' 
                    : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                } ${readonly ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div>
                  <div className={`font-semibold ${verbal === item.score ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>{item.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${verbal === item.score ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>{item.score}</div>
              </button>
            ))}
          </div>
        </div>

        {/* MOTOR RESPONSE */}
        <div className="space-y-3">
          <h4 className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2">
            <Activity className="w-4 h-4 text-rose-500" /> Motor Response (M)
          </h4>
          <div className="flex flex-col gap-2">
            {[
              { score: 6, label: 'Obeys Commands', desc: 'Follows instructions' },
              { score: 5, label: 'Localizes Pain', desc: 'Moves to pain stimulus' },
              { score: 4, label: 'Withdraws', desc: 'Pulls away from pain' },
              { score: 3, label: 'Abnormal Flexion', desc: 'Decorticate posturing' },
              { score: 2, label: 'Extension', desc: 'Decerebrate posturing' },
              { score: 1, label: 'None', desc: 'No movement' },
            ].map(item => (
              <button
                key={item.score}
                disabled={readonly}
                onClick={() => setMotor(item.score)}
                className={`flex justify-between items-center p-2.5 rounded-lg border text-left transition-colors ${
                  motor === item.score 
                    ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-500 dark:bg-rose-900/30 dark:border-rose-400' 
                    : 'border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'
                } ${readonly ? 'opacity-70 cursor-not-allowed' : ''}`}
              >
                <div>
                  <div className={`font-semibold ${motor === item.score ? 'text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-300'}`}>{item.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0 ml-2 ${motor === item.score ? 'bg-rose-100 text-rose-700 dark:bg-rose-800 dark:text-rose-200' : 'bg-slate-100 text-slate-400 dark:bg-slate-700'}`}>{item.score}</div>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
