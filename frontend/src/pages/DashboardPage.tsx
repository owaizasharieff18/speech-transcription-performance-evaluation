import React, { useEffect, useState } from 'react';
import { 
  Activity, Layers, Award, ArrowDownRight, Plus, Sparkles, 
  CheckCircle2, ArrowRight, BarChart2, ShieldCheck, Database
} from 'lucide-react';
import { DashboardStats, AnalysisData } from '../types';
import { fetchDashboardStats, fetchGlobalAnalysis } from '../services/api';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';

interface DashboardPageProps {
  setActiveTab: (tab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history') => void;
  setSelectedExpId: (id: number) => void;
  onLoadDemo: () => void;
  isLoadingDemo: boolean;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  setActiveTab,
  setSelectedExpId,
  onLoadDemo,
  isLoadingDemo,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [s, a] = await Promise.all([fetchDashboardStats(), fetchGlobalAnalysis()]);
      setStats(s);
      setAnalysis(a);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-sm text-slate-400 font-mono">Loading NLP evaluation statistics...</p>
        </div>
      </div>
    );
  }

  const modelRankingData = analysis?.models_ranking.map((m) => ({
    name: m.model_name.replace(/\s*\(TS\d\)/, ''),
    slot: m.model_id.toUpperCase(),
    WER: Number((m.avg_wer * 100).toFixed(1)),
    CER: Number((m.avg_cer * 100).toFixed(1)),
    BLEU: Number((m.avg_bleu * 100).toFixed(1)),
    ROUGE: Number((m.avg_rougeL * 100).toFixed(1)),
    METEOR: Number((m.avg_meteor * 100).toFixed(1)),
    Accuracy: Number(m.avg_composite.toFixed(1)),
  })) || [];

  const classAverages = analysis?.class_model_averages || {};
  const domainData = analysis?.domain_breakdown || {};
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
    <div className="space-y-8 pb-12">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 p-6 md:p-8 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-brand-500/10 border border-brand-500/30 text-brand-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Academic Speech Recognition Benchmarking Suite</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Speech Transcription & Performance Evaluation
          </h1>
          <p className="text-sm md:text-base text-slate-300 leading-relaxed">
            Multi-model STT pipeline (TS1, TS2, TS3) with automated NLP evaluation metrics (WER, CER, BLEU, ROUGE, METEOR) across speaking registers, noise conditions, and domain classes.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => setActiveTab('new-experiment')}
              className="flex items-center space-x-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-brand-600/30 transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Experiment</span>
            </button>
            <button
              onClick={onLoadDemo}
              disabled={isLoadingDemo}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-sm font-medium rounded-xl transition-all"
            >
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>{isLoadingDemo ? 'Transcribing Models...' : 'Load Demo Benchmark'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Headline Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Samples */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Audio Samples</span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-white font-mono">{stats?.total_samples || 0}</span>
            <span className="text-xs text-slate-400 ml-2">across {stats?.total_experiments || 0} runs</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center space-x-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>SQLite Local Persistence</span>
          </div>
        </div>

        {/* Active STT Models */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configured STT Pipeline</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-white font-mono">{stats?.total_models || 3} Models</span>
          </div>
          <div className="mt-2 text-xs text-slate-400 font-mono">
            TS1 (Whisper-Base) • TS2 (Tiny) • TS3
          </div>
        </div>

        {/* Best Performing Model */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Top-Ranked Model</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-xl font-bold text-amber-300 truncate block">
              {stats?.best_model ? stats.best_model.model_name.replace(/\s*\(TS\d\)/, '') : 'None Yet'}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {stats?.best_model ? `Score: ${stats.best_model.avg_composite}% (WER: ${(stats.best_model.avg_wer*100).toFixed(1)}%)` : 'Run pipeline to evaluate'}
          </div>
        </div>

        {/* Average WER / CER */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Mean Error Rates</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline space-x-3">
            <div>
              <span className="text-2xl font-extrabold text-white font-mono">{((stats?.avg_wer || 0) * 100).toFixed(1)}%</span>
              <span className="text-[10px] text-slate-400 block uppercase">Avg WER</span>
            </div>
            <div className="border-l border-slate-700 pl-3">
              <span className="text-2xl font-extrabold text-white font-mono">{((stats?.avg_cer || 0) * 100).toFixed(1)}%</span>
              <span className="text-[10px] text-slate-400 block uppercase">Avg CER</span>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-slate-500">
            Lower percentage indicates higher accuracy
          </div>
        </div>
      </div>

      {/* Comparative Charts Section */}
      {modelRankingData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: WER & CER (Lower is Better) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Error Rate Comparison (WER vs. CER)</h3>
                <p className="text-xs text-slate-400">Word Error Rate & Character Error Rate (Lower is Better)</p>
              </div>
              <span className="px-2 py-1 text-[11px] font-mono bg-slate-800 text-slate-300 rounded border border-slate-700">
                % Error
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelRankingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
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

          {/* Chart 2: BLEU, ROUGE, METEOR (Higher is Better) */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">Semantic Similarity & Overlap</h3>
                <p className="text-xs text-slate-400">BLEU, ROUGE-L & METEOR Scores (Higher is Better)</p>
              </div>
              <span className="px-2 py-1 text-[11px] font-mono bg-slate-800 text-slate-300 rounded border border-slate-700">
                0 - 100 Scale
              </span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelRankingData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="name" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} 
                  />
                  <Legend />
                  <Bar dataKey="BLEU" fill="#38bdf8" radius={[4, 4, 0, 0]} name="BLEU" />
                  <Bar dataKey="ROUGE" fill="#818cf8" radius={[4, 4, 0, 0]} name="ROUGE-L" />
                  <Bar dataKey="METEOR" fill="#34d399" radius={[4, 4, 0, 0]} name="METEOR" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Class-wise STT Comparison Section */}
      {classComparisons.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center space-x-2 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
                <Layers className="w-4 h-4" />
                <span>Class-Wise Performance Overview</span>
              </div>
              <h3 className="text-base font-semibold text-white">
                Best-Performing STT Model by Dataset Class / Domain
              </h3>
              <p className="text-xs text-slate-400">
                Average WER, CER, BLEU, ROUGE-L, and METEOR scores for each dataset class
              </p>
            </div>
            <button
              onClick={() => setActiveTab('results')}
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center space-x-1"
            >
              <span>Detailed Class Analysis</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {classComparisons.map((c) => (
              <div key={c.className} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                    <h4 className="text-sm font-bold text-white">{c.className}</h4>
                    <span className="text-[10px] font-mono text-slate-500">({c.totalSamples} samples)</span>
                  </div>
                  {c.bestModel && (
                    <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-950/40 border border-amber-500/30 rounded text-[11px] text-amber-300">
                      <Award className="w-3 h-3 text-amber-400" />
                      <span className="font-semibold">{c.bestModel.modelName.replace(/\s*\(TS\d\)/, '')}</span>
                      <span className="text-rose-300">({(c.bestModel.avgWer * 100).toFixed(1)}% WER)</span>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="text-slate-500 border-b border-slate-800/80">
                      <tr>
                        <th className="py-1">Model</th>
                        <th className="py-1 text-rose-400">WER</th>
                        <th className="py-1 text-amber-400">CER</th>
                        <th className="py-1 text-sky-400">BLEU</th>
                        <th className="py-1 text-indigo-400">ROUGE</th>
                        <th className="py-1 text-emerald-400">METEOR</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {c.models.slice(0, 4).map((m) => (
                        <tr key={m.modelId}>
                          <td className="py-1 text-slate-300 truncate max-w-[120px]">{m.modelName.replace(/\s*\(TS\d\)/, '')}</td>
                          <td className="py-1 font-semibold text-rose-400">{(m.avgWer * 100).toFixed(1)}%</td>
                          <td className="py-1 text-amber-300">{(m.avgCer * 100).toFixed(1)}%</td>
                          <td className="py-1 text-sky-300">{m.avgBleu.toFixed(2)}</td>
                          <td className="py-1 text-indigo-300">{m.avgRougeL.toFixed(2)}</td>
                          <td className="py-1 text-emerald-300">{m.avgMeteor.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Experiments Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-white">Recent Benchmark Experiments</h3>
            <p className="text-xs text-slate-400">Saved sessions and sample evaluation runs</p>
          </div>
          <button
            onClick={() => setActiveTab('history')}
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center space-x-1"
          >
            <span>View All History</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {stats?.recent_experiments && stats.recent_experiments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950/60 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">ID</th>
                  <th className="px-4 py-3">Experiment Title</th>
                  <th className="px-4 py-3">Samples</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {stats.recent_experiments.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-850/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">#{exp.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-200">{exp.title}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {exp.sample_count || 0} audio samples
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      {new Date(exp.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => {
                          setSelectedExpId(exp.id);
                          setActiveTab('transcription');
                        }}
                        className="px-2.5 py-1 text-xs bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 rounded border border-brand-500/30 transition-colors"
                      >
                        Transcribe
                      </button>
                      <button
                        onClick={() => {
                          setSelectedExpId(exp.id);
                          setActiveTab('results');
                        }}
                        className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                      >
                        Results
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
            <Database className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No experiments created yet.</p>
            <p className="text-xs text-slate-500 mt-1">Start by creating an experiment or loading the demo benchmark dataset.</p>
            <div className="mt-4 flex justify-center space-x-3">
              <button
                onClick={() => setActiveTab('new-experiment')}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold"
              >
                Create Experiment
              </button>
              <button
                onClick={onLoadDemo}
                disabled={isLoadingDemo}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700"
              >
                Load Demo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
