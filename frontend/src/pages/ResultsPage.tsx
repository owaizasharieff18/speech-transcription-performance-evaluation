import React, { useState, useEffect } from 'react';
import { 
  Award, Download, Filter, Sparkles, TrendingUp, 
  Volume2, ShieldAlert, BookOpen, Layers, BarChart2, CheckCircle2, Cpu 
} from 'lucide-react';
import { Experiment, AnalysisData, ModelRanking } from '../types';
import { fetchExperiments, getExperiment, getExportCsvUrl, fetchGlobalAnalysis } from '../services/api';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, 
  CartesianGrid, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar 
} from 'recharts';

interface ResultsPageProps {
  selectedExpId: number | null;
  setSelectedExpId: (id: number) => void;
  setActiveTab: (tab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history') => void;
}

export const ResultsPage: React.FC<ResultsPageProps> = ({
  selectedExpId,
  setSelectedExpId,
  setActiveTab,
}) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [currentExp, setCurrentExp] = useState<Experiment | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClassTab, setSelectedClassTab] = useState<string>('All');

  const loadData = async () => {
    try {
      setLoading(true);
      const exps = await fetchExperiments();
      setExperiments(exps);

      if (selectedExpId) {
        const exp = await getExperiment(selectedExpId);
        setCurrentExp(exp);
        setAnalysis(exp.analysis || null);
      } else {
        const globalAnalysis = await fetchGlobalAnalysis();
        setAnalysis(globalAnalysis);
      }
    } catch (e) {
      console.error('Failed to load results:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedExpId]);

  const handleExportCsv = () => {
    const url = getExportCsvUrl(selectedExpId || undefined);
    window.open(url, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-mono">Aggregating NLP benchmark results...</p>
        </div>
      </div>
    );
  }

  const ranking = analysis?.models_ranking || [];
  const bestModel = analysis?.best_model;

  // Prepare chart dataset for all 6 models
  const chartData = ranking.map((m) => ({
    name: m.model_name.replace(/\s*\(TS\d\)/, ''),
    slot: m.model_id.toUpperCase(),
    WER: Number((m.avg_wer * 100).toFixed(1)),
    CER: Number((m.avg_cer * 100).toFixed(1)),
    BLEU: Number((m.avg_bleu * 100).toFixed(1)),
    'ROUGE-L': Number((m.avg_rougeL * 100).toFixed(1)),
    METEOR: Number((m.avg_meteor * 100).toFixed(1)),
    Accuracy: Number(m.avg_composite.toFixed(1)),
    Latency: Number(m.avg_latency_sec.toFixed(2)),
  }));

  // Auto Condition Breakdowns
  const autoBreakdowns = analysis?.auto_condition_breakdown || {
    speaking_style: analysis?.condition_breakdown || {},
    speech_quality: analysis?.quality_breakdown || {},
    domain: analysis?.domain_breakdown || {}
  };

  const styleData = autoBreakdowns.speaking_style || {};
  const qualityData = autoBreakdowns.speech_quality || {};
  const domainData = autoBreakdowns.domain || {};
  const classAverages = analysis?.class_model_averages || {};

  // Compute Class-wise Comparison of all existing STT models
  const classNames = Array.from(new Set([
    ...Object.keys(classAverages),
    ...Object.keys(domainData)
  ]));

  const classComparisons = classNames.map((className) => {
    const fromAverages = classAverages[className] || {};
    const fromDomain = domainData[className]?.models || {};
    
    const modelKeys = Array.from(new Set([
      ...Object.keys(fromAverages),
      ...Object.keys(fromDomain)
    ]));

    const modelsList = modelKeys.map((mId) => {
      const avgData = fromAverages[mId];
      const domData = fromDomain[mId];
      
      const avgWer = avgData?.avg_wer !== undefined ? avgData.avg_wer : (domData?.wer ?? 1.0);
      const avgCer = avgData?.avg_cer !== undefined ? avgData.avg_cer : (domData?.cer ?? 1.0);
      const avgBleu = avgData?.avg_bleu !== undefined ? avgData.avg_bleu : (domData?.bleu ?? 0.0);
      const avgRougeL = avgData?.avg_rougeL !== undefined ? avgData.avg_rougeL : (domData?.rougeL ?? 0.0);
      const avgMeteor = avgData?.avg_meteor !== undefined ? avgData.avg_meteor : (domData?.meteor ?? 0.0);
      const sampleCount = avgData?.sample_count ?? domainData[className]?.sample_count ?? 1;
      const modelName = avgData?.model_name || mId.toUpperCase();

      return {
        modelId: mId,
        modelName,
        sampleCount,
        avgWer,
        avgCer,
        avgBleu,
        avgRougeL,
        avgMeteor
      };
    });

    // Sort models: lowest WER first, then highest BLEU
    modelsList.sort((a, b) => a.avgWer - b.avgWer || b.avgBleu - a.avgBleu);
    const bestModelInClass = modelsList.length > 0 ? modelsList[0] : null;

    return {
      className,
      models: modelsList,
      bestModel: bestModelInClass,
      totalSamples: domainData[className]?.sample_count || modelsList.reduce((acc, m) => Math.max(acc, m.sampleCount), 0)
    };
  });

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            ASR Model Performance Evaluation & Analysis
          </h1>
          <p className="text-sm text-slate-400">
            {currentExp ? `Displaying results for: ${currentExp.title}` : 'Aggregated results across all evaluated experiments and 6 STT models'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedExpId || ''}
            onChange={async (e) => {
              const val = e.target.value;
              const id = val ? Number(val) : null;
              setSelectedExpId(id as any);
            }}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 font-medium"
          >
            <option value="">Global (All Experiments)</option>
            {experiments.map((exp) => (
              <option key={exp.id} value={exp.id}>
                {exp.title}
              </option>
            ))}
          </select>

          <button
            onClick={handleExportCsv}
            className="flex items-center space-x-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold rounded-lg shadow-sm transition-all"
          >
            <Download className="w-4 h-4 text-brand-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {!analysis?.has_data ? (
        <div className="text-center py-16 bg-slate-900 border border-dashed border-slate-800 rounded-xl space-y-3">
          <BarChart2 className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Evaluation Data Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Upload audio samples and execute the STT transcription pipeline to generate comparative charts and linguistic analysis.
          </p>
          <button
            onClick={() => setActiveTab('new-experiment')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-md"
          >
            Add Samples
          </button>
        </div>
      ) : (
        <>
          {/* Top Model Ranking & Leaderboard Highlights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Best Performer Highlight Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/40 rounded-xl p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <Award className="w-4 h-4" />
                  <span>Overall Top-Performing STT Model</span>
                </div>
                <h3 className="text-xl font-extrabold text-white">
                  {bestModel ? bestModel.model_name : 'N/A'}
                </h3>
                <p className="text-xs text-slate-300">
                  Ranked #1 based on lowest Word Error Rate (WER) and highest semantic precision across test samples.
                </p>
              </div>

              {bestModel && (
                <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800/80 mt-4 text-center font-mono">
                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Mean WER</span>
                    <span className="text-sm font-bold text-rose-400">{(bestModel.avg_wer * 100).toFixed(1)}%</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Mean BLEU</span>
                    <span className="text-sm font-bold text-sky-400">{bestModel.avg_bleu.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-[10px] text-slate-500 uppercase block">Avg Latency</span>
                    <span className="text-sm font-bold text-emerald-400">{bestModel.avg_latency_sec}s</span>
                  </div>
                </div>
              )}
            </div>

            {/* Complete Ranking Leaderboard Card */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    6 STT Model Overall Leaderboard
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {ranking.length} models benchmarked
                </span>
              </div>

              <div className="space-y-2.5">
                {ranking.map((m) => {
                  const isTop = m.rank === 1;
                  return (
                    <div
                      key={m.model_id}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                        isTop
                          ? 'bg-amber-950/20 border-amber-500/40 shadow-sm'
                          : 'bg-slate-950/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                            m.rank === 1
                              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                              : m.rank === 2
                              ? 'bg-slate-300 text-slate-950'
                              : m.rank === 3
                              ? 'bg-amber-800 text-amber-100'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          #{m.rank}
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs font-mono font-bold text-brand-400 uppercase">
                              {m.model_id}
                            </span>
                            <span className="text-sm font-semibold text-slate-100">
                              {m.model_name}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            Evaluated on {m.sample_count} sample runs
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-4 font-mono text-xs">
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">WER</span>
                          <span className="font-bold text-rose-400">{(m.avg_wer * 100).toFixed(1)}%</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">BLEU</span>
                          <span className="font-bold text-sky-400">{m.avg_bleu.toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">METEOR</span>
                          <span className="font-bold text-emerald-400">{m.avg_meteor.toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400 block text-[10px]">Speed</span>
                          <span className="font-bold text-slate-300">{m.avg_latency_sec}s</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 6-Model Full Metrics Comparison Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  6-Model Comprehensive Metric Comparison Table
                </h3>
                <p className="text-xs text-slate-400">
                  Full NLP evaluation metrics: Word Error Rate, Character Error Rate, BLEU, ROUGE-L F1, METEOR, and latency
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Rank & Model</th>
                    <th className="px-4 py-3 text-rose-400">WER (↓)</th>
                    <th className="px-4 py-3 text-amber-400">CER (↓)</th>
                    <th className="px-4 py-3 text-sky-400">BLEU (↑)</th>
                    <th className="px-4 py-3 text-indigo-400">ROUGE-L (↑)</th>
                    <th className="px-4 py-3 text-emerald-400">METEOR (↑)</th>
                    <th className="px-4 py-3 text-teal-400">Accuracy %</th>
                    <th className="px-4 py-3 text-right text-slate-400">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {ranking.map((m) => (
                    <tr key={m.model_id} className="hover:bg-slate-850/50 transition-colors">
                      <td className="px-4 py-3.5 flex items-center space-x-2 font-semibold text-slate-200">
                        <span className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px]">
                          {m.rank}
                        </span>
                        <span>{m.model_name}</span>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-rose-400">
                        {(m.avg_wer * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-amber-300">
                        {(m.avg_cer * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-sky-300">
                        {m.avg_bleu.toFixed(3)}
                      </td>
                      <td className="px-4 py-3.5 text-indigo-300">
                        {m.avg_rougeL.toFixed(3)}
                      </td>
                      <td className="px-4 py-3.5 text-emerald-300">
                        {m.avg_meteor.toFixed(3)}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-teal-300">
                        {m.avg_composite.toFixed(1)}%
                      </td>
                      <td className="px-4 py-3.5 text-right text-slate-400">
                        {m.avg_latency_sec}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar Charts: Side-by-side Visual Benchmarks */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Error Rates (WER & CER) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Error Rates: WER vs. CER (Lower is Better)</h4>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">% Error</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} 
                      formatter={(val: any) => [`${val}%`, '']}
                    />
                    <Legend />
                    <Bar dataKey="WER" fill="#f43f5e" radius={[4, 4, 0, 0]} name="WER (%)" />
                    <Bar dataKey="CER" fill="#f59e0b" radius={[4, 4, 0, 0]} name="CER (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Overlap Metrics (BLEU, ROUGE, METEOR) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-white">Semantic Metrics: BLEU, ROUGE-L, METEOR (Higher is Better)</h4>
                <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded">0 - 100</span>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} 
                    />
                    <Legend />
                    <Bar dataKey="BLEU" fill="#38bdf8" radius={[4, 4, 0, 0]} name="BLEU" />
                    <Bar dataKey="ROUGE-L" fill="#818cf8" radius={[4, 4, 0, 0]} name="ROUGE-L" />
                    <Bar dataKey="METEOR" fill="#34d399" radius={[4, 4, 0, 0]} name="METEOR" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* CLASS-WISE COMPARISON OF ALL EXISTING STT MODELS */}
          {classComparisons.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center space-x-2 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
                    <Layers className="w-4 h-4" />
                    <span>Class-Wise STT Model Benchmark & Comparison</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Performance by Dataset Class / Domain
                  </h3>
                  <p className="text-xs text-slate-400">
                    Average WER, CER, BLEU, ROUGE-L, and METEOR metrics for all models per class with top performer identification
                  </p>
                </div>

                {/* Class Tabs */}
                {classComparisons.length > 1 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
                    <button
                      onClick={() => setSelectedClassTab('All')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                        selectedClassTab === 'All'
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      All Classes ({classComparisons.length})
                    </button>
                    {classComparisons.map((c) => (
                      <button
                        key={c.className}
                        onClick={() => setSelectedClassTab(c.className)}
                        className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                          selectedClassTab === c.className
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {c.className}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Class-wise Panels */}
              <div className="space-y-6">
                {classComparisons
                  .filter((c) => selectedClassTab === 'All' || selectedClassTab === c.className)
                  .map((c) => {
                    const classChartData = c.models.map((m) => ({
                      name: m.modelName.replace(/\s*\(TS\d\)/, ''),
                      WER: Number((m.avgWer * 100).toFixed(1)),
                      CER: Number((m.avgCer * 100).toFixed(1)),
                      BLEU: Number((m.avgBleu * 100).toFixed(1)),
                      'ROUGE-L': Number((m.avgRougeL * 100).toFixed(1)),
                      METEOR: Number((m.avgMeteor * 100).toFixed(1)),
                    }));

                    return (
                      <div key={c.className} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40 space-y-4 p-5">
                        {/* Class Header & Best Model Highlight */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center space-x-3">
                            <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                            <h4 className="text-base font-bold text-white font-mono">{c.className}</h4>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/30">
                              {c.totalSamples} {c.totalSamples === 1 ? 'sample' : 'samples'} evaluated
                            </span>
                          </div>

                          {c.bestModel && (
                            <div className="flex items-center space-x-2 px-3 py-1.5 bg-amber-950/40 border border-amber-500/40 rounded-lg text-xs self-start sm:self-auto">
                              <Award className="w-4 h-4 text-amber-400 flex-shrink-0" />
                              <span className="text-slate-300">Best Performer:</span>
                              <b className="text-amber-300 font-semibold">{c.bestModel.modelName}</b>
                              <span className="font-mono text-rose-300 text-[11px]">
                                (WER: {(c.bestModel.avgWer * 100).toFixed(1)}%)
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Grid: Table & Simple Chart */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                          {/* Table: Class x Model Metrics */}
                          <div className="lg:col-span-7 overflow-x-auto rounded-lg border border-slate-800/80">
                            <table className="w-full text-left text-xs font-mono">
                              <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                                <tr>
                                  <th className="px-3.5 py-2.5">STT Model</th>
                                  <th className="px-3.5 py-2.5 text-rose-400">Avg WER (↓)</th>
                                  <th className="px-3.5 py-2.5 text-amber-400">Avg CER (↓)</th>
                                  <th className="px-3.5 py-2.5 text-sky-400">Avg BLEU (↑)</th>
                                  <th className="px-3.5 py-2.5 text-indigo-400">Avg ROUGE-L (↑)</th>
                                  <th className="px-3.5 py-2.5 text-emerald-400">Avg METEOR (↑)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
                                {c.models.map((m, idx) => {
                                  const isClassBest = idx === 0 && m.avgWer === c.bestModel?.avgWer;
                                  return (
                                    <tr key={m.modelId} className={`hover:bg-slate-850/50 transition-colors ${isClassBest ? 'bg-amber-950/10' : ''}`}>
                                      <td className="px-3.5 py-2.5 flex items-center space-x-2 font-semibold text-slate-200">
                                        {isClassBest && <Award className="w-3.5 h-3.5 text-amber-400" />}
                                        <span className="truncate">{m.modelName}</span>
                                      </td>
                                      <td className="px-3.5 py-2.5 font-bold text-rose-400">
                                        {(m.avgWer * 100).toFixed(1)}%
                                      </td>
                                      <td className="px-3.5 py-2.5 text-amber-300">
                                        {(m.avgCer * 100).toFixed(1)}%
                                      </td>
                                      <td className="px-3.5 py-2.5 text-sky-300">
                                        {m.avgBleu.toFixed(3)}
                                      </td>
                                      <td className="px-3.5 py-2.5 text-indigo-300">
                                        {m.avgRougeL.toFixed(3)}
                                      </td>
                                      <td className="px-3.5 py-2.5 text-emerald-300">
                                        {m.avgMeteor.toFixed(3)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Simple Bar Chart for Class */}
                          <div className="lg:col-span-5 bg-slate-900/90 border border-slate-800/80 rounded-lg p-3.5 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-slate-300">Error Comparison for {c.className}</span>
                              <span className="text-[10px] font-mono text-slate-500">Lower is better</span>
                            </div>
                            <div className="h-44">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={classChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                  <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                  <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                                  <Tooltip 
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc', fontSize: '11px' }} 
                                    formatter={(val: any) => [`${val}%`, '']}
                                  />
                                  <Bar dataKey="WER" fill="#f43f5e" radius={[3, 3, 0, 0]} name="Avg WER (%)" />
                                  <Bar dataKey="CER" fill="#f59e0b" radius={[3, 3, 0, 0]} name="Avg CER (%)" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* PERFORMANCE BY AUTOMATICALLY DETECTED CONDITION SECTION */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2 text-brand-400 text-xs font-bold uppercase tracking-wider mb-1">
                <Cpu className="w-4 h-4" />
                <span>Performance by Automatically Detected Condition</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                Multi-Model Performance Across Automatically Inferred Conditions
              </h3>
              <p className="text-xs text-slate-400">
                Acoustic and linguistic benchmarks grouped by predicted speaking style, detected audio quality/noise floor, and inferred domain
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 1. Formal vs Informal Breakdown */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider">
                    1. Speaking Style (Formal vs Informal)
                  </h4>
                  <span className="text-[10px] font-mono bg-blue-950 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                    Syntax & Register
                  </span>
                </div>
                <div className="space-y-2 pt-1">
                  {Object.entries(styleData).map(([styleName, metrics]: [string, any]) => (
                    <div key={styleName} className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{styleName}</span>
                        <span className="font-mono text-rose-400 font-bold">
                          WER: {(metrics.overall_avg_wer * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400">
                        <span>BLEU: {(metrics.overall_avg_bleu || 0).toFixed(2)}</span>
                        <span>ROUGE: {(metrics.overall_avg_rougeL || 0).toFixed(2)}</span>
                        <span>METEOR: {(metrics.overall_avg_meteor || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Clear vs Noisy Quality Breakdown */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                    2. Audio Quality (Clear vs Noisy)
                  </h4>
                  <span className="text-[10px] font-mono bg-amber-950 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                    Acoustic SNR
                  </span>
                </div>
                <div className="space-y-2 pt-1">
                  {Object.entries(qualityData).map(([qualName, metrics]: [string, any]) => (
                    <div key={qualName} className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">{qualName}</span>
                        <span className="font-mono text-rose-400 font-bold">
                          WER: {(metrics.overall_avg_wer * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400">
                        <span>BLEU: {(metrics.overall_avg_bleu || 0).toFixed(2)}</span>
                        <span>ROUGE: {(metrics.overall_avg_rougeL || 0).toFixed(2)}</span>
                        <span>METEOR: {(metrics.overall_avg_meteor || 0).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Dataset Class / Domain Breakdown */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider">
                    3. Class / Domain Breakdown
                  </h4>
                  <span className="text-[10px] font-mono bg-purple-950 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                    Dataset Classes
                  </span>
                </div>
                <div className="space-y-2 pt-1 max-h-72 overflow-y-auto pr-1">
                  {Object.entries(domainData).length > 0 ? (
                    Object.entries(domainData).map(([domainName, metrics]: [string, any]) => (
                      <div key={domainName} className="p-3 bg-slate-900 rounded-lg border border-slate-800 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white font-mono">{domainName}</span>
                          <span className="font-mono text-rose-400 font-bold">
                            WER: {(metrics.overall_avg_wer * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-slate-400">
                          <span>BLEU: {(metrics.overall_avg_bleu || 0).toFixed(2)}</span>
                          <span>ROUGE: {(metrics.overall_avg_rougeL || 0).toFixed(2)}</span>
                          <span>METEOR: {(metrics.overall_avg_meteor || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-slate-500 text-center">No domain data available</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Deep Linguistic & Acoustic Analysis Breakdown */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
            <div className="border-b border-slate-800 pb-4">
              <div className="flex items-center space-x-2 text-brand-400 text-xs font-bold uppercase tracking-wider mb-1">
                <BookOpen className="w-4 h-4" />
                <span>Linguistic & Acoustic Impact Analysis</span>
              </div>
              <h3 className="text-lg font-bold text-white">
                Why Speech Performance Varies Across Conditions
              </h3>
              <p className="text-xs text-slate-400">
                Automated explanation of degradation factors across speaking styles, acoustic noise, and domain vocabulary
              </p>
            </div>

            {/* Dynamic Statistical Insights */}
            {analysis?.insights && analysis.insights.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Automated Benchmark Findings & Observations
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysis.insights.map((ins, i) => (
                    <div key={i} className="p-3.5 bg-slate-950/60 rounded-lg border border-slate-800/80 space-y-1">
                      <div className="flex items-center space-x-1.5 text-brand-300 text-xs font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                        <span>{ins.title}</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed pl-5">
                        {ins.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* CLASS-WISE FINAL ANALYSIS & DETERMINISTIC SYNTHESIS SECTION */}
          {analysis?.class_wise_final_summary && (
            <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950/20 border border-purple-500/30 rounded-xl p-6 shadow-xl space-y-6">
              <div className="border-b border-slate-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span>Class-Wise Final Analysis & Rule-Based Synthesis</span>
                  </div>
                  <h3 className="text-lg font-bold text-white">
                    Optimal STT Models by Class & Individual Metrics
                  </h3>
                  <p className="text-xs text-slate-400">
                    Deterministic evaluation of top performers for WER, CER, BLEU, ROUGE, and METEOR grounded strictly in computed metrics
                  </p>
                </div>
                {analysis.class_wise_final_summary.overall_best_model && (
                  <div className="flex items-center space-x-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs self-start md:self-auto">
                    <Award className="w-4 h-4 text-amber-400" />
                    <span className="text-slate-300">Overall Best Model:</span>
                    <span className="font-bold text-amber-300">
                      {analysis.class_wise_final_summary.overall_best_model.model_name}
                    </span>
                  </div>
                )}
              </div>

              {/* Overall Rule-Based Summary Banner */}
              {analysis.class_wise_final_summary.overall_explanation && (
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl flex items-start space-x-3">
                  <Award className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300 font-mono">
                      Overall Multi-Class Synthesis
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-sans">
                      {analysis.class_wise_final_summary.overall_explanation}
                    </p>
                  </div>
                </div>
              )}

              {/* Grid of Class-Wise Final Analysis Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {analysis.class_wise_final_summary.classes.map((cls) => (
                  <div
                    key={cls.class_name}
                    className="bg-slate-950/60 border border-slate-800/90 rounded-xl p-5 space-y-4 shadow-sm flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      {/* Class Header */}
                      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center space-x-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                          <h4 className="text-sm font-bold text-white font-mono">{cls.class_name}</h4>
                        </div>
                        <span className="text-[11px] font-mono text-purple-300 bg-purple-950/60 px-2 py-0.5 rounded border border-purple-500/20">
                          {cls.sample_count} {cls.sample_count === 1 ? 'sample' : 'samples'}
                        </span>
                      </div>

                      {/* 5 Metric Winners Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
                        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-lg">
                          <span className="text-[10px] text-rose-400 font-semibold block">Best WER (↓)</span>
                          <span className="font-bold text-white block truncate text-[11px]" title={cls.best_by_wer.model_name}>
                            {cls.best_by_wer.model_name.replace(/\s*\(TS\d\)/, '')}
                          </span>
                          <span className="text-rose-300 text-[10px]">{cls.best_by_wer.formatted}</span>
                        </div>

                        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-lg">
                          <span className="text-[10px] text-amber-400 font-semibold block">Best CER (↓)</span>
                          <span className="font-bold text-white block truncate text-[11px]" title={cls.best_by_cer.model_name}>
                            {cls.best_by_cer.model_name.replace(/\s*\(TS\d\)/, '')}
                          </span>
                          <span className="text-amber-300 text-[10px]">{cls.best_by_cer.formatted}</span>
                        </div>

                        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-lg">
                          <span className="text-[10px] text-sky-400 font-semibold block">Best BLEU (↑)</span>
                          <span className="font-bold text-white block truncate text-[11px]" title={cls.best_by_bleu.model_name}>
                            {cls.best_by_bleu.model_name.replace(/\s*\(TS\d\)/, '')}
                          </span>
                          <span className="text-sky-300 text-[10px]">{cls.best_by_bleu.formatted}</span>
                        </div>

                        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-lg">
                          <span className="text-[10px] text-indigo-400 font-semibold block">Best ROUGE (↑)</span>
                          <span className="font-bold text-white block truncate text-[11px]" title={cls.best_by_rouge.model_name}>
                            {cls.best_by_rouge.model_name.replace(/\s*\(TS\d\)/, '')}
                          </span>
                          <span className="text-indigo-300 text-[10px]">{cls.best_by_rouge.formatted}</span>
                        </div>

                        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-lg sm:col-span-2">
                          <span className="text-[10px] text-emerald-400 font-semibold block">Best METEOR (↑)</span>
                          <span className="font-bold text-white block truncate text-[11px]" title={cls.best_by_meteor.model_name}>
                            {cls.best_by_meteor.model_name.replace(/\s*\(TS\d\)/, '')}
                          </span>
                          <span className="text-emerald-300 text-[10px]">{cls.best_by_meteor.formatted}</span>
                        </div>
                      </div>
                    </div>

                    {/* Short Rule-Based Explanation */}
                    <div className="pt-2 border-t border-slate-800/80">
                      <p className="text-[11px] text-slate-400 leading-relaxed italic">
                        "{cls.explanation}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
