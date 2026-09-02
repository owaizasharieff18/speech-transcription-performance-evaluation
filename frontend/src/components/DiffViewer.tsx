import React from 'react';
import { DiffToken } from '../types';

interface DiffViewerProps {
  diff: DiffToken[];
  referenceText: string;
  generatedText: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff, referenceText, generatedText }) => {
  if (!diff || diff.length === 0) {
    return (
      <div className="space-y-3 font-mono text-sm">
        <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-sans">Reference:</div>
          <div className="text-slate-200">{referenceText || '—'}</div>
        </div>
        <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
          <div className="text-xs text-slate-500 mb-1 uppercase tracking-wider font-sans">Generated:</div>
          <div className="text-slate-200">{generatedText || '—'}</div>
        </div>
      </div>
    );
  }

  // Count error types
  const substitutions = diff.filter((d) => d.type === 'substitution').length;
  const deletions = diff.filter((d) => d.type === 'deletion').length;
  const insertions = diff.filter((d) => d.type === 'insertion').length;
  const matches = diff.filter((d) => d.type === 'match').length;

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
        <span className="px-2 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-500/30">
          ✓ Correct ({matches})
        </span>
        <span className="px-2 py-0.5 rounded bg-amber-950/50 text-amber-300 border border-amber-500/30">
          ↔ Substituted ({substitutions})
        </span>
        <span className="px-2 py-0.5 rounded bg-rose-950/50 text-rose-300 border border-rose-500/30 line-through">
          ✕ Deleted ({deletions})
        </span>
        <span className="px-2 py-0.5 rounded bg-sky-950/50 text-sky-300 border border-sky-500/30">
          + Inserted ({insertions})
        </span>
      </div>

      {/* Visual Token Diff */}
      <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 leading-relaxed font-mono text-sm overflow-x-auto">
        <div className="flex flex-wrap gap-1.5 items-center">
          {diff.map((token, idx) => {
            if (token.type === 'match') {
              return (
                <span key={idx} className="px-1.5 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-800">
                  {token.word}
                </span>
              );
            }
            if (token.type === 'substitution') {
              return (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-amber-950/70 text-amber-200 border border-amber-500/50"
                  title={`Substituted: '${token.ref_word}' -> '${token.word}'`}
                >
                  <span className="opacity-60 text-xs mr-1 line-through">{token.ref_word}</span>
                  <span className="font-bold underline">{token.word}</span>
                </span>
              );
            }
            if (token.type === 'deletion') {
              return (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-rose-950/70 text-rose-300 border border-rose-500/50 line-through"
                  title={`Omitted word: '${token.ref_word}'`}
                >
                  {token.ref_word}
                </span>
              );
            }
            if (token.type === 'insertion') {
              return (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-200 border border-sky-500/50 font-semibold"
                  title={`Extra hallucinated/inserted word: '${token.word}'`}
                >
                  +{token.word}
                </span>
              );
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
};
