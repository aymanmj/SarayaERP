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
    if (totalScore === 0) return { label: 'INCOMPLETE', color: 'text-slate-400 bg-slate-800 border-slate-700' };
    if (totalScore <= 8) return { label: 'Severe (Coma)', color: 'text-rose-400 bg-rose-500/15 border-rose-500/30' };
    if (totalScore <= 12) return { label: 'Moderate', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' };
    return { label: 'Minor', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30' };
  };

  const severity = getSeverity();

  return (
    <div className="bg-slate-950/50 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-5 py-4 border-b border-slate-800 bg-slate-950/80">
        <h3 className="text-base font-extrabold text-white flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-indigo-400" />
          Glasgow Coma Scale (GCS)
        </h3>
        <div className={`px-4 py-1.5 rounded-xl border font-bold flex items-center gap-3 text-sm ${severity.color}`}>
          <span className="text-2xl font-black">{totalScore || '—'}</span>
          <span className="text-[10px] uppercase tracking-widest hidden sm:inline-block">{severity.label}</span>
        </div>
      </div>

      {/* 3 Columns */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* EYE RESPONSE */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-slate-300 text-sm flex items-center gap-2 border-b border-slate-800 pb-2 mb-1">
            <Eye className="w-4 h-4 text-sky-400" /> Eye Opening (E)
          </h4>
          {[
            { score: 4, label: 'Spontaneous', desc: 'Opens eyes on own' },
            { score: 3, label: 'To Speech', desc: 'Opens eyes when asked' },
            { score: 2, label: 'To Pain', desc: 'Opens eyes on pain' },
            { score: 1, label: 'None', desc: 'Does not open eyes' },
          ].map(item => (
            <button
              key={item.score}
              type="button"
              disabled={readonly}
              onClick={() => setEye(item.score)}
              className={`w-full flex justify-between items-center p-3 rounded-xl border text-right transition-all ${
                eye === item.score
                  ? 'bg-sky-500/10 border-sky-500/50 ring-1 ring-sky-500/30'
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
              } ${readonly ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${eye === item.score ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-500'}`}>{item.score}</div>
              <div className="text-right mr-3">
                <div className={`font-bold text-sm ${eye === item.score ? 'text-sky-300' : 'text-slate-300'}`}>{item.label}</div>
                <div className="text-[11px] text-slate-500">{item.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* VERBAL RESPONSE */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-slate-300 text-sm flex items-center gap-2 border-b border-slate-800 pb-2 mb-1">
            <MessageCircle className="w-4 h-4 text-emerald-400" /> Verbal Response (V)
          </h4>
          {[
            { score: 5, label: 'Oriented', desc: 'Converses normally' },
            { score: 4, label: 'Confused', desc: 'Disoriented conversation' },
            { score: 3, label: 'Inappropriate', desc: 'Words but no conversation' },
            { score: 2, label: 'Incomprehensible', desc: 'Sounds only' },
            { score: 1, label: 'None', desc: 'No sounds' },
          ].map(item => (
            <button
              key={item.score}
              type="button"
              disabled={readonly}
              onClick={() => setVerbal(item.score)}
              className={`w-full flex justify-between items-center p-3 rounded-xl border text-right transition-all ${
                verbal === item.score
                  ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
              } ${readonly ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${verbal === item.score ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>{item.score}</div>
              <div className="text-right mr-3">
                <div className={`font-bold text-sm ${verbal === item.score ? 'text-emerald-300' : 'text-slate-300'}`}>{item.label}</div>
                <div className="text-[11px] text-slate-500">{item.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* MOTOR RESPONSE */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-slate-300 text-sm flex items-center gap-2 border-b border-slate-800 pb-2 mb-1">
            <Activity className="w-4 h-4 text-rose-400" /> Motor Response (M)
          </h4>
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
              type="button"
              disabled={readonly}
              onClick={() => setMotor(item.score)}
              className={`w-full flex justify-between items-center p-3 rounded-xl border text-right transition-all ${
                motor === item.score
                  ? 'bg-rose-500/10 border-rose-500/50 ring-1 ring-rose-500/30'
                  : 'bg-slate-900/50 border-slate-800 hover:bg-slate-800 hover:border-slate-700'
              } ${readonly ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${motor === item.score ? 'bg-rose-500/20 text-rose-300' : 'bg-slate-800 text-slate-500'}`}>{item.score}</div>
              <div className="text-right mr-3">
                <div className={`font-bold text-sm ${motor === item.score ? 'text-rose-300' : 'text-slate-300'}`}>{item.label}</div>
                <div className="text-[11px] text-slate-500">{item.desc}</div>
              </div>
            </button>
          ))}
        </div>

      </div>
    </div>
  );
};
