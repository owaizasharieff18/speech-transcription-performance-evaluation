import React, { useState, useEffect } from 'react';
import { 
  Play, Cpu, CheckCircle2, Clock, AlertTriangle, 
  ArrowRight, Layers, FileText, BarChart3, RefreshCw, Sparkles
} from 'lucide-react';
import { Experiment, Sample, ModelInfo } from '../types';
import { 
  fetchExperiments, getExperiment, runTranscription, fetchModels,
  transcribeClassSamples, transcribeAllExperimentSamples 
} from '../services/api';
import { AudioPlayer } from '../components/AudioPlayer';
import { MetricBadge } from '../components/MetricBadge';
import { DiffViewer } from '../components/DiffViewer';

interface TranscriptionPageProps {
  selectedExpId: number | null;
  setSelectedExpId: (id: number) => void;
  setActiveTab: (tab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history') => void;
}

export const TranscriptionPage: React.FC<TranscriptionPageProps> = ({
  selectedExpId,
  setSelectedExpId,
  setActiveTab,
}) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [currentExp, setCurrentExp] = useState<Experiment | null>(null);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedSampleIndex, setSelectedSampleIndex] = useState<number>(0);
  
  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribingSampleId, setTranscribingSampleId] = useState<number | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [activeModelTab, setActiveModelTab] = useState<string>('ts1');

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('All');

  const loadData = async () => {
    try {
      const [exps, modelList] = await Promise.all([fetchExperiments(), fetchModels()]);
      setExperiments(exps);
      setModels(modelList);

      if (selectedExpId) {
        const exp = await getExperiment(selectedExpId);
        setCurrentExp(exp);
      } else if (exps.length > 0) {
        setSelectedExpId(exps[0].id);
        const exp = await getExperiment(exps[0].id);
        setCurrentExp(exp);
      }
    } catch (e) {
      console.error('Error loading transcription page:', e);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedExpId]);

  const handleTranscribeSingle = async (sampleId: number) => {
    try {
      setIsTranscribing(true);
      setTranscribingSampleId(sampleId);
      setTranscribeError(null);

      await runTranscription(sampleId);
      
      // Reload current experiment
      if (selectedExpId) {
        const exp = await getExperiment(selectedExpId);
        setCurrentExp(exp);
      }
    } catch (err: any) {
      setTranscribeError(err.message || 'Transcription error occurred');
    } finally {
      setIsTranscribing(false);
      setTranscribingSampleId(null);
    }
  };

  const handleTranscribeClass = async (className: string) => {
    if (!currentExp) return;
    try {
      setIsTranscribing(true);
      setTranscribeError(null);
      await transcribeClassSamples(currentExp.id, className);
      const updated = await getExperiment(currentExp.id);
      setCurrentExp(updated);
    } catch (err: any) {
      setTranscribeError(err.message || `Failed to transcribe class '${className}'`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleTranscribeAll = async () => {
    if (!currentExp || !currentExp.samples) return;
    try {
      setIsTranscribing(true);
      setTranscribeError(null);
      await transcribeAllExperimentSamples(currentExp.id);
      const updated = await getExperiment(currentExp.id);
      setCurrentExp(updated);
    } catch (err: any) {
      setTranscribeError(err.message || 'Failed to transcribe all samples');
    } finally {
      setIsTranscribing(false);
    }
  };

  const allSamples = currentExp?.samples || [];
  
  // Extract distinct classes in this experiment
  const experimentClasses: string[] = Array.from(new Set(allSamples.map(s => s.domain_class || s.predicted_domain || 'General')));

  const filteredSamples = selectedClassFilter === 'All'
    ? allSamples
    : allSamples.filter(s => (s.domain_class || s.predicted_domain || 'General') === selectedClassFilter);

  const currentSample: Sample | undefined = filteredSamples[selectedSampleIndex] || filteredSamples[0] || allSamples[0];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Speech-to-Text Pipeline (TS1 - TS6)</h1>
          <p className="text-sm text-slate-400">
            Execute parallel STT inference across all models for every audio sample inside dataset classes
          </p>
        </div>

        {/* Experiment Selector & Batch Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {experiments.length > 0 && (
            <select
              value={selectedExpId || ''}
              onChange={async (e) => {
                const id = Number(e.target.value);
                setSelectedExpId(id);
                const exp = await getExperiment(id);
                setCurrentExp(exp);
                setSelectedSampleIndex(0);
              }}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 font-medium"
            >
              {experiments.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.title} ({exp.sample_count || 0} samples)
                </option>
              ))}
            </select>
          )}

          {selectedClassFilter !== 'All' && filteredSamples.length > 0 && (
            <button
              onClick={() => handleTranscribeClass(selectedClassFilter)}
              disabled={isTranscribing}
              className="flex items-center space-x-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-purple-900/30 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
              <span>Transcribe '{selectedClassFilter}' Class ({filteredSamples.length})</span>
            </button>
          )}

          {allSamples.length > 0 && (
            <button
              onClick={handleTranscribeAll}
              disabled={isTranscribing}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-brand-600 to-cyan-600 hover:from-brand-500 hover:to-cyan-500 text-white text-xs font-semibold rounded-lg shadow-md shadow-brand-900/30 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTranscribing ? 'animate-spin' : ''}`} />
              <span>{isTranscribing ? 'Running STT Pipeline...' : 'Transcribe All Classes'}</span>
            </button>
          )}
        </div>
      </div>

      {/* STT Model Pipeline Overview Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-start space-x-3 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center flex-shrink-0 font-mono font-bold text-xs">
            TS1
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-200">OpenAI Whisper (Base)</h4>
            <p className="text-[11px] text-slate-400 leading-tight">
              74M Params • Encoder-Decoder Architecture with multilingual acoustic alignment
            </p>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-start space-x-3 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center flex-shrink-0 font-mono font-bold text-xs">
            TS2
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-200">OpenAI Whisper (Tiny)</h4>
            <p className="text-[11px] text-slate-400 leading-tight">
              39M Params • Lightweight high-throughput sequence-to-sequence model
            </p>
          </div>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex items-start space-x-3 shadow-sm">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center flex-shrink-0 font-mono font-bold text-xs">
            TS3
          </div>
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-200">Google Speech Recognition / Whisper-Small</h4>
            <p className="text-[11px] text-slate-400 leading-tight">
              Acoustic HMM-DNN Cloud ASR & High-Precision Fallback
            </p>
          </div>
        </div>
      </div>

      {transcribeError && (
        <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-500/50 flex items-center space-x-2.5 text-rose-300 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{transcribeError}</span>
        </div>
      )}

      {allSamples.length === 0 ? (
        <div className="text-center py-16 bg-slate-900 border border-dashed border-slate-800 rounded-xl space-y-3">
          <FileText className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-300">No Samples Found in this Experiment</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Upload audio recordings or record your voice on the New Experiment page to run multi-model STT.
          </p>
          <button
            onClick={() => setActiveTab('new-experiment')}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-md"
          >
            Add Audio Samples
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Sample List Selection */}
          <div className="lg:col-span-4 space-y-3">
            {/* Class Filter Pills */}
            {experimentClasses.length > 1 && (
              <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/60 border border-slate-800 rounded-lg">
                <button
                  onClick={() => {
                    setSelectedClassFilter('All');
                    setSelectedSampleIndex(0);
                  }}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                    selectedClassFilter === 'All'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({allSamples.length})
                </button>
                {experimentClasses.map((cls) => {
                  const count = allSamples.filter(s => (s.domain_class || s.predicted_domain || 'General') === cls).length;
                  return (
                    <button
                      key={cls}
                      onClick={() => {
                        setSelectedClassFilter(cls);
                        setSelectedSampleIndex(0);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                        selectedClassFilter === cls
                          ? 'bg-purple-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cls} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Select Audio Sample ({filteredSamples.length})
              </span>
            </div>

            <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
              {filteredSamples.map((sample, idx) => {
                const isSelected = selectedSampleIndex === idx;
                const isTranscribed = sample.transcriptions && Object.keys(sample.transcriptions).length > 0;
                const isProcessingThis = transcribingSampleId === sample.id;

                return (
                  <div
                    key={sample.id}
                    onClick={() => setSelectedSampleIndex(idx)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-900 border-brand-500 shadow-md shadow-brand-500/10'
                        : 'bg-slate-900/60 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-1.5">
                          <span className="font-mono text-xs text-slate-500 font-bold">#{idx + 1}</span>
                          <span className="font-semibold text-sm text-slate-100 line-clamp-1">
                            {sample.sample_name}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-purple-950/80 text-purple-300 border border-purple-500/30">
                            {sample.domain_class || sample.predicted_domain || 'General'}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-800 text-slate-300">
                            {sample.speaking_condition}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-800 text-slate-300">
                            {sample.speech_quality}
                          </span>
                        </div>
                      </div>

                      {/* Status indicator */}
                      <div>
                        {isProcessingThis ? (
                          <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin"></div>
                        ) : isTranscribed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Sample Inspector & STT Output */}
          {currentSample && (
            <div className="lg:col-span-8 space-y-6">
              {/* Sample Meta Card & Audio Player */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-lg font-bold text-white tracking-tight">{currentSample.sample_name}</h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-xs text-slate-400">Class / Domain: <b className="text-purple-300">{currentSample.domain_class || currentSample.predicted_domain}</b></span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs text-slate-400">Style: <b className="text-blue-300">{currentSample.predicted_speaking_style || currentSample.speaking_condition}</b></span>
                      <span className="text-slate-600">•</span>
                      <span className="text-xs text-slate-400">Quality: <b className="text-amber-300">{currentSample.predicted_speech_quality || currentSample.speech_quality}</b></span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTranscribeSingle(currentSample.id)}
                    disabled={isTranscribing}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold rounded-lg shadow-md disabled:opacity-50 transition-all self-start sm:self-auto"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${transcribingSampleId === currentSample.id ? 'animate-spin' : ''}`} />
                    <span>{transcribingSampleId === currentSample.id ? 'Transcribing (TS1-TS6)...' : 'Run 6 STT Models'}</span>
                  </button>
                </div>

                {/* AUTOMATIC SPEECH & ACOUSTIC ANALYSIS CARD */}
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4 h-4 text-brand-400" />
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                        Automatic Speech & Acoustic Analysis
                      </h4>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                      Local Signal & NLP Analysis Active
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Speaking Style */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-1.5">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">Speaking Style</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-blue-400">
                          {currentSample.analysis_details?.speaking_style?.predicted || currentSample.predicted_speaking_style || currentSample.speaking_condition}
                        </span>
                        {currentSample.analysis_details?.speaking_style?.score !== undefined && (
                          <span className="text-[10px] font-mono text-slate-400">
                            ({currentSample.analysis_details.speaking_style.score}/100)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-tight">
                        {currentSample.analysis_details?.speaking_style?.reason || 'Linguistic syntax & lexical analysis'}
                      </p>
                      {currentSample.analysis_details?.speaking_style?.evidence && currentSample.analysis_details.speaking_style.evidence.length > 0 && (
                        <div className="pt-1 border-t border-slate-800 flex flex-wrap gap-1">
                          {currentSample.analysis_details.speaking_style.evidence.map((ev, i) => (
                            <span key={i} className="text-[9px] bg-slate-950 text-slate-400 px-1.5 py-0.5 rounded border border-slate-800">
                              {ev}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Audio Quality & Noise Floor */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-1.5">
                      <span className="text-[10px] uppercase font-mono text-slate-400 block font-semibold">Audio Quality (SNR)</span>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-bold text-amber-400">
                          {currentSample.analysis_details?.audio_quality?.predicted || currentSample.predicted_speech_quality || currentSample.speech_quality}
                        </span>
                        {currentSample.analysis_details?.audio_quality?.snr_db !== undefined && (
                          <span className="text-[10px] font-mono text-slate-400">
                            ({currentSample.analysis_details.audio_quality.snr_db} dB SNR)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-300 leading-tight">
                        {currentSample.analysis_details?.audio_quality?.reason || 'Acoustic energy & noise floor analysis'}
                      </p>
                      {currentSample.analysis_details?.audio_quality?.metrics && (
                        <div className="pt-1 border-t border-slate-800 text-[10px] font-mono text-slate-400 flex items-center justify-between">
                          <span>RMS: {currentSample.analysis_details.audio_quality.metrics.rms_db} dB</span>
                          <span>Flatness: {currentSample.analysis_details.audio_quality.metrics.spectral_flatness}</span>
                        </div>
                      )}
                    </div>

                    {/* Dataset Ground-Truth Class Label */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-mono text-slate-400 font-semibold">Dataset Class / Domain</span>
                        <span className="text-[10px] font-mono text-purple-300 font-bold bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-500/30">
                          Ground-Truth Label
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-bold text-purple-300 block">
                          {currentSample.domain_class || currentSample.predicted_domain || 'General'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 block pt-0.5">
                          Dataset grouping label for class-wise benchmarking
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Audio Player */}
                <AudioPlayer filename={currentSample.audio_filename} sampleName={currentSample.sample_name} />

                {/* Ground Truth Reference Transcript */}
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-slate-300">Ground Truth Reference Transcript:</span>
                    <span className="font-mono text-[11px] text-slate-500">
                      {currentSample.reference_transcript.split(/\s+/).filter(Boolean).length} words
                    </span>
                  </div>
                  <p className="font-mono text-sm text-slate-100 leading-relaxed bg-slate-900/50 p-2.5 rounded border border-slate-850">
                    "{currentSample.reference_transcript}"
                  </p>
                </div>
              </div>

              {/* STT Models Output & Comparison Tabs (TS1, TS2, TS3) */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Model Generated Transcripts & Token Alignment Diff
                  </h3>
                  <button
                    onClick={() => setActiveTab('results')}
                    className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center space-x-1"
                  >
                    <span>View Benchmark Charts</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* TS1 - TS6 Model Switcher Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(models.length > 0 ? models.map(m => m.slot_id) : ['ts1', 'ts2', 'ts3', 'ts4', 'ts5', 'ts6']).map((slotId) => {
                    const trans = currentSample.transcriptions?.[slotId];
                    const evalData = currentSample.evaluations?.[slotId];
                    const isActive = activeModelTab === slotId;
                    const modelObj = models.find(m => m.slot_id === slotId);

                    return (
                      <button
                        key={slotId}
                        onClick={() => setActiveModelTab(slotId)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          isActive
                            ? 'bg-slate-850 border-brand-500 shadow-md ring-1 ring-brand-500/50'
                            : 'bg-slate-950/60 border-slate-800 hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`font-mono text-xs font-bold uppercase ${isActive ? 'text-brand-400' : 'text-slate-400'}`}>
                            {slotId.toUpperCase()}
                          </span>
                          {trans ? (
                            <span className="text-[10px] font-mono text-emerald-400">
                              {trans.processing_time_sec}s
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-slate-500">—</span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-slate-200 mt-1 truncate">
                          {trans?.model_name || modelObj?.name || slotId.toUpperCase()}
                        </div>
                        {evalData && (
                          <div className="mt-2 flex flex-col space-y-0.5 text-[10px] font-mono">
                            <span className="text-slate-400">WER: <b className="text-rose-400">{(evalData.wer * 100).toFixed(1)}%</b></span>
                            <span className="text-slate-400">BLEU: <b className="text-sky-300">{evalData.bleu.toFixed(2)}</b></span>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Model Details */}
                {(() => {
                  const currentTrans = currentSample.transcriptions?.[activeModelTab];
                  const currentEval = currentSample.evaluations?.[activeModelTab];

                  if (!currentTrans && !isTranscribing) {
                    return (
                      <div className="text-center py-8 bg-slate-950/40 rounded-xl border border-dashed border-slate-800">
                        <Cpu className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                        <p className="text-xs text-slate-400 font-mono">This model has not processed this sample yet.</p>
                        <button
                          onClick={() => handleTranscribeSingle(currentSample.id)}
                          className="mt-3 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded text-xs font-semibold"
                        >
                          Run {activeModelTab.toUpperCase()} STT Now
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {/* Metric Badges for Selected Model */}
                      {currentEval && (
                        <div className="flex flex-wrap gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                          <MetricBadge label="WER" value={currentEval.wer} type="wer" size="md" />
                          <MetricBadge label="CER" value={currentEval.cer} type="cer" size="md" />
                          <MetricBadge label="BLEU-4" value={currentEval.bleu} type="bleu" size="md" />
                          <MetricBadge label="ROUGE-L" value={currentEval.rougeL_f1} type="rouge" size="md" />
                          <MetricBadge label="METEOR" value={currentEval.meteor} type="meteor" size="md" />
                          <MetricBadge label="Accuracy" value={currentEval.accuracy_pct} type="composite" size="md" />
                        </div>
                      )}

                      {/* Raw Generated Output */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold uppercase tracking-wider text-slate-300">
                            Generated Transcript ({currentTrans?.model_name}):
                          </span>
                          <span className="font-mono text-slate-500">
                            Latency: {currentTrans?.processing_time_sec}s
                          </span>
                        </div>
                        <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-sm text-slate-100 leading-relaxed">
                          {currentTrans?.raw_transcript || '(No transcript produced)'}
                        </div>
                      </div>

                      {/* Diff Alignment Viewer */}
                      {currentEval && (
                        <div className="space-y-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                            Word-by-Word Error Alignment (Insertion / Deletion / Substitution):
                          </span>
                          <DiffViewer
                            diff={currentEval.diff}
                            referenceText={currentSample.reference_transcript}
                            generatedText={currentTrans?.raw_transcript || ''}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
