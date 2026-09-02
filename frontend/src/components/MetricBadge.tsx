import React from 'react';

interface MetricBadgeProps {
  label: string;
  value: number;
  type: 'wer' | 'cer' | 'bleu' | 'rouge' | 'meteor' | 'composite';
  size?: 'sm' | 'md' | 'lg';
}

export const MetricBadge: React.FC<MetricBadgeProps> = ({
  label,
  value,
  type,
  size = 'md',
}) => {
  // Lower is better for WER & CER; Higher is better for BLEU, ROUGE, METEOR, COMPOSITE
  const isLowerBetter = type === 'wer' || type === 'cer';
  
  let colorClass = 'bg-slate-800 text-slate-300 border-slate-700';
  
  if (isLowerBetter) {
    if (value <= 0.15) {
      colorClass = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
    } else if (value <= 0.35) {
      colorClass = 'bg-amber-950/60 text-amber-300 border-amber-500/40';
    } else {
      colorClass = 'bg-rose-950/60 text-rose-300 border-rose-500/40';
    }
  } else {
    if (value >= 0.70 || (type === 'composite' && value >= 75)) {
      colorClass = 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
    } else if (value >= 0.45 || (type === 'composite' && value >= 50)) {
      colorClass = 'bg-amber-950/60 text-amber-300 border-amber-500/40';
    } else {
      colorClass = 'bg-rose-950/60 text-rose-300 border-rose-500/40';
    }
  }

  const formattedValue = type === 'composite' 
    ? `${value.toFixed(1)}%` 
    : (isLowerBetter ? `${(value * 100).toFixed(1)}%` : value.toFixed(3));

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  }[size];

  return (
    <div className={`inline-flex items-center space-x-1.5 rounded-md border font-mono font-medium ${sizeClasses} ${colorClass}`}>
      <span className="text-slate-400 font-sans font-normal uppercase tracking-wider text-[10px]">{label}:</span>
      <span className="font-bold">{formattedValue}</span>
    </div>
  );
};
