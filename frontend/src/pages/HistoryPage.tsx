import React, { useState, useEffect } from 'react';
import { 
  History, Trash2, Download, ExternalLink, Calendar, 
  Layers, Search, FileSpreadsheet, Eye, Play 
} from 'lucide-react';
import { Experiment, Sample } from '../types';
import { fetchExperiments, getExperiment, deleteExperiment, deleteSample, getExportCsvUrl } from '../services/api';

interface HistoryPageProps {
  setSelectedExpId: (id: number) => void;
  setActiveTab: (tab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history') => void;
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  setSelectedExpId,
  setActiveTab,
}) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewExp, setPreviewExp] = useState<Experiment | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const exps = await fetchExperiments();
      setExperiments(exps);
    } catch (e) {
      console.error('Failed to load history:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (expId: number, title: string) => {
    if (window.confirm(`Are you sure you want to delete experiment '${title}' and its associated audio samples?`)) {
      try {
        await deleteExperiment(expId);
        if (previewExp?.id === expId) {
          setPreviewExp(null);
        }
        await loadData();
      } catch (err: any) {
        alert(err.message || 'Could not delete experiment');
      }
    }
  };

  const handlePreview = async (expId: number) => {
    try {
      const exp = await getExperiment(expId);
      setPreviewExp(exp);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteSample = async (sampleId: number, sampleName: string) => {
    if (!window.confirm(`Are you sure you want to delete sample "${sampleName}"? This will also remove any transcriptions and its audio file.`)) {
      return;
    }
    try {
      await deleteSample(sampleId);
      if (previewExp) {
        const updated = await getExperiment(previewExp.id);
        setPreviewExp(updated);
      }
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete sample');
    }
  };

  const filteredExperiments = experiments.filter((exp) =>
    exp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (exp.description && exp.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header & Global Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Experiment History & Local Storage</h1>
          <p className="text-sm text-slate-400">
            Persisted experiments in SQLite database with full transcript & metric records
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href={getExportCsvUrl()}
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-emerald-900/30 transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export All to CSV</span>
          </a>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search experiments by title or notes..."
          className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : filteredExperiments.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-dashed border-slate-800 rounded-xl space-y-3">
          <History className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Saved Experiments Found</h3>
          <p className="text-xs text-slate-500">
            Run an experiment to save audio samples and benchmark metrics locally.
          </p>
          <button
            onClick={() => setActiveTab('new-experiment')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-md"
          >
            Create Experiment
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filteredExperiments.map((exp) => (
            <div
              key={exp.id}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-xs text-slate-500 font-bold">#{exp.id}</span>
                  <h3 className="text-base font-bold text-slate-100">{exp.title}</h3>
                </div>
                {exp.description && (
                  <p className="text-xs text-slate-400 max-w-2xl">{exp.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-500 font-mono">
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{new Date(exp.created_at).toLocaleString()}</span>
                  </span>
                  <span>•</span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {exp.sample_count || 0} sample{exp.sample_count !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-end md:self-auto">
                <button
                  onClick={() => handlePreview(exp.id)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 flex items-center space-x-1"
                  title="Inspect Samples"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Inspect</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedExpId(exp.id);
                    setActiveTab('transcription');
                  }}
                  className="px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-300 rounded-lg text-xs font-semibold border border-brand-500/30 flex items-center space-x-1"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Transcribe</span>
                </button>

                <button
                  onClick={() => {
                    setSelectedExpId(exp.id);
                    setActiveTab('results');
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 flex items-center space-x-1"
                >
                  <span>Results</span>
                </button>

                <a
                  href={getExportCsvUrl(exp.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg border border-slate-700"
                  title="Export Experiment CSV"
                >
                  <Download className="w-4 h-4" />
                </a>

                <button
                  onClick={() => handleDelete(exp.id, exp.title)}
                  className="p-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-400 rounded-lg border border-rose-500/30"
                  title="Delete Experiment"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal / Flyout Preview for Selected Experiment Samples */}
      {previewExp && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">{previewExp.title}</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {previewExp.samples?.length || 0} samples loaded in this experiment
                </p>
              </div>
              <button
                onClick={() => setPreviewExp(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {previewExp.samples && previewExp.samples.length > 0 ? (
                previewExp.samples.map((s, idx) => (
                  <div key={s.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-200">
                        #{idx + 1} {s.sample_name}
                      </span>
                      <div className="flex items-center space-x-1.5 text-[10px] font-mono">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {s.speaking_condition}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {s.speech_quality}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {s.speaker_category}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSample(s.id, s.sample_name)}
                          title="Delete sample"
                          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-950/60 rounded border border-transparent hover:border-rose-500/30 transition-colors ml-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs font-mono text-slate-400 bg-slate-900 p-2.5 rounded border border-slate-850">
                      <b>Ref:</b> "{s.reference_transcript}"
                    </p>

                    {/* Transcripts Summary */}
                    {s.transcriptions && (
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 text-[11px] font-mono">
                        {['ts1', 'ts2', 'ts3', 'ts4', 'ts5', 'ts6'].map((m) => {
                          const ev = s.evaluations?.[m];
                          return (
                            <div key={m} className="p-1.5 rounded bg-slate-900/60 border border-slate-800 text-center">
                              <span className="text-slate-500 uppercase block text-[9px] font-bold">{m}</span>
                              <span className="font-bold text-slate-200 text-xs">
                                {ev ? `${(ev.wer * 100).toFixed(0)}%` : '—'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500 text-center py-6">No samples attached to this experiment yet.</p>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end space-x-2">
              <button
                onClick={() => {
                  setSelectedExpId(previewExp.id);
                  setActiveTab('transcription');
                  setPreviewExp(null);
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold"
              >
                Open in Transcription
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
