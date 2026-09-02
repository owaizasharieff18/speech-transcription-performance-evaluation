import React, { useState, useEffect } from 'react';
import { 
  UploadCloud, CheckCircle2, Plus, Trash2, 
  ArrowRight, AlertCircle, Layers, Tag, Volume2, FolderPlus, FileText, Sparkles
} from 'lucide-react';
import { Experiment, Sample } from '../types';
import { fetchExperiments, createExperiment, uploadSample, getExperiment } from '../services/api';
import { AudioRecorder } from '../components/AudioRecorder';

interface NewExperimentPageProps {
  selectedExpId: number | null;
  setSelectedExpId: (id: number) => void;
  setActiveTab: (tab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history') => void;
}

export const PREDEFINED_CLASSES = [
  'Educational',
  'Science & Technology',
  'Mathematics',
  'History',
  'Geography',
  'Languages',
  'Tutorials / How-to',
  'Lectures',
  'Entertainment',
  'Gaming',
  'News & Information',
  'Politics',
  'Geopolitics',
  'Business',
  'Music',
  'Technology',
  'AI/ML',
  'Programming',
  'Lifestyle',
  'Fitness',
  'Cooking',
  'Travel',
  'Sports',
  'Documentary / Storytelling',
  'Interviews',
  'Other'
];

interface PendingSampleDraft {
  id: string; // local draft id
  sampleName: string;
  referenceTranscript: string;
  selectedFile: File | null;
  uploadedSampleId?: number; // if already saved to backend
  isUploading?: boolean;
  uploadError?: string | null;
  uploadSuccess?: boolean;
}

export const NewExperimentPage: React.FC<NewExperimentPageProps> = ({
  selectedExpId,
  setSelectedExpId,
  setActiveTab,
}) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [currentExp, setCurrentExp] = useState<Experiment | null>(null);
  
  // Experiment Metadata Form
  const [isCreatingNewExp, setIsCreatingNewExp] = useState(!selectedExpId);
  const [expTitle, setExpTitle] = useState('');
  const [expDesc, setExpDesc] = useState('');
  
  // 1. Number of classes to compare (default: 3)
  const [numClasses, setNumClasses] = useState<number>(3);
  
  // 2. Selected classes/domains (e.g. ['Educational', 'Technology', 'Sports'])
  const [selectedClasses, setSelectedClasses] = useState<string[]>(['Educational', 'Technology', 'Sports']);
  
  // Custom name map for slots that chose "Other" (key: slot index, value: custom name)
  const [customClassNames, setCustomClassNames] = useState<Record<number, string>>({});

  // 3. Number of samples per class & sample drafts (key: class name, value: list of drafts)
  const [classDrafts, setClassDrafts] = useState<Record<string, PendingSampleDraft[]>>({
    'Educational': [
      { id: 'edu-1', sampleName: 'Educational Lecture 1', referenceTranscript: '', selectedFile: null },
      { id: 'edu-2', sampleName: 'Educational Lecture 2', referenceTranscript: '', selectedFile: null }
    ],
    'Technology': [
      { id: 'tech-1', sampleName: 'Tech Keynote 1', referenceTranscript: '', selectedFile: null },
      { id: 'tech-2', sampleName: 'Tech Podcast 2', referenceTranscript: '', selectedFile: null },
      { id: 'tech-3', sampleName: 'Tech Tutorial 3', referenceTranscript: '', selectedFile: null }
    ],
    'Sports': [
      { id: 'spo-1', sampleName: 'Sports Commentary 1', referenceTranscript: '', selectedFile: null },
      { id: 'spo-2', sampleName: 'Sports Broadcast 2', referenceTranscript: '', selectedFile: null }
    ]
  });

  // Active tab for class inspection
  const [activeClassTab, setActiveClassTab] = useState<string>('Educational');

  const [globalUploadStatus, setGlobalUploadStatus] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const exps = await fetchExperiments();
      setExperiments(exps);
      if (selectedExpId) {
        const exp = await getExperiment(selectedExpId);
        setCurrentExp(exp);
        syncClassesFromExp(exp);
      } else if (exps.length > 0) {
        setSelectedExpId(exps[0].id);
        const exp = await getExperiment(exps[0].id);
        setCurrentExp(exp);
        setIsCreatingNewExp(false);
        syncClassesFromExp(exp);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const syncClassesFromExp = (exp: Experiment | null) => {
    if (!exp || !exp.samples || exp.samples.length === 0) return;
    const existing = Array.from(new Set(exp.samples.map(s => s.domain_class || s.predicted_domain).filter(Boolean))) as string[];
    if (existing.length > 0) {
      setNumClasses(existing.length);
      setSelectedClasses(existing);
      if (!existing.includes(activeClassTab)) {
        setActiveClassTab(existing[0]);
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedExpId]);

  // Helper to resolve effective class name
  const getEffectiveClassName = (selection: string, slotIndex: number): string => {
    if (selection === 'Other') {
      return customClassNames[slotIndex]?.trim() || `Custom Class ${slotIndex + 1}`;
    }
    return selection;
  };

  const effectiveClassList = selectedClasses.map((c, idx) => getEffectiveClassName(c, idx));

  // Initialize draft slots for a class if not present
  const ensureClassDrafts = (className: string, initialCount = 2) => {
    setClassDrafts(prev => {
      if (prev[className] && prev[className].length > 0) return prev;
      const initial: PendingSampleDraft[] = [];
      for (let i = 0; i < initialCount; i++) {
        initial.push({
          id: `${className.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${i + 1}`,
          sampleName: `${className} Sample ${i + 1}`,
          referenceTranscript: '',
          selectedFile: null
        });
      }
      return { ...prev, [className]: initial };
    });
  };

  // Handle Changing Number of Classes
  const handleNumClassesChange = (count: number) => {
    const validCount = Math.max(1, Math.min(10, count));
    setNumClasses(validCount);
    
    const updated: string[] = [];
    const used = new Set<string>();

    for (let i = 0; i < validCount; i++) {
      if (selectedClasses[i] && !used.has(selectedClasses[i])) {
        updated.push(selectedClasses[i]);
        used.add(selectedClasses[i]);
      } else {
        const nextAvail = PREDEFINED_CLASSES.find(c => c !== 'Other' && !used.has(c)) || `Class ${i + 1}`;
        updated.push(nextAvail);
        used.add(nextAvail);
      }
    }

    setSelectedClasses(updated);
    const resolvedActive = getEffectiveClassName(updated[0], 0);
    setActiveClassTab(resolvedActive);
    ensureClassDrafts(resolvedActive, 2);
  };

  // Handle changing class for a slot
  const handleSlotClassChange = (slotIndex: number, newSelection: string) => {
    const oldName = getEffectiveClassName(selectedClasses[slotIndex], slotIndex);
    const updated = [...selectedClasses];
    updated[slotIndex] = newSelection;
    setSelectedClasses(updated);

    const newName = getEffectiveClassName(newSelection, slotIndex);
    if (oldName !== newName) {
      setClassDrafts(prev => {
        const copy = { ...prev };
        if (copy[oldName] && !copy[newName]) {
          copy[newName] = copy[oldName].map((d, i) => ({
            ...d,
            sampleName: d.sampleName.replace(oldName, newName) || `${newName} Sample ${i + 1}`
          }));
        } else if (!copy[newName]) {
          copy[newName] = [
            { id: `${newName}-1`, sampleName: `${newName} Sample 1`, referenceTranscript: '', selectedFile: null },
            { id: `${newName}-2`, sampleName: `${newName} Sample 2`, referenceTranscript: '', selectedFile: null }
          ];
        }
        return copy;
      });
    }

    if (activeClassTab === oldName || !effectiveClassList.includes(activeClassTab)) {
      setActiveClassTab(newName);
    }
  };

  // Handle custom class name
  const handleCustomNameChange = (slotIndex: number, customName: string) => {
    setCustomClassNames(prev => ({ ...prev, [slotIndex]: customName }));
    if (selectedClasses[slotIndex] === 'Other') {
      const eff = customName.trim() || `Custom Class ${slotIndex + 1}`;
      setActiveClassTab(eff);
      ensureClassDrafts(eff, 2);
    }
  };

  // Adjust sample count for a specific class
  const handleSetClassSampleCount = (className: string, targetCount: number) => {
    const count = Math.max(1, Math.min(20, targetCount));
    setClassDrafts(prev => {
      const currentList = prev[className] || [];
      const updated: PendingSampleDraft[] = [...currentList];

      if (updated.length < count) {
        for (let i = updated.length; i < count; i++) {
          updated.push({
            id: `${className.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${i + 1}`,
            sampleName: `${className} Sample ${i + 1}`,
            referenceTranscript: '',
            selectedFile: null
          });
        }
      } else if (updated.length > count) {
        updated.splice(count);
      }
      return { ...prev, [className]: updated };
    });
  };

  // Add a single sample to a class
  const handleAddSampleSlot = (className: string) => {
    setClassDrafts(prev => {
      const currentList = prev[className] || [];
      const nextIdx = currentList.length + 1;
      return {
        ...prev,
        [className]: [
          ...currentList,
          {
            id: `${className.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${nextIdx}`,
            sampleName: `${className} Sample ${nextIdx}`,
            referenceTranscript: '',
            selectedFile: null
          }
        ]
      };
    });
  };

  // Remove a sample slot
  const handleRemoveSampleSlot = (className: string, draftId: string) => {
    setClassDrafts(prev => {
      const currentList = prev[className] || [];
      if (currentList.length <= 1) return prev; // keep at least 1
      return {
        ...prev,
        [className]: currentList.filter(d => d.id !== draftId)
      };
    });
  };

  // Update a single field on a sample draft
  const handleUpdateDraft = (
    className: string, 
    draftId: string, 
    field: keyof PendingSampleDraft, 
    value: any
  ) => {
    setClassDrafts(prev => {
      const currentList = prev[className] || [];
      return {
        ...prev,
        [className]: currentList.map(d => (d.id === draftId ? { ...d, [field]: value } : d))
      };
    });
  };

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expTitle.trim()) return;
    try {
      const created = await createExperiment(expTitle.trim(), expDesc.trim());
      setSelectedExpId(created.id);
      setIsCreatingNewExp(false);
      setExpTitle('');
      setExpDesc('');
      await loadData();
    } catch (err: any) {
      setGlobalError(err.message || 'Could not create experiment');
    }
  };

  // Upload an individual sample draft
  const handleUploadSingleDraft = async (className: string, draft: PendingSampleDraft) => {
    if (!selectedExpId) {
      setGlobalError('Please select or create an experiment first.');
      return;
    }
    if (!draft.selectedFile) {
      handleUpdateDraft(className, draft.id, 'uploadError', 'Please choose an audio/video file.');
      return;
    }
    if (!draft.referenceTranscript.trim()) {
      handleUpdateDraft(className, draft.id, 'uploadError', 'Please enter the ground truth reference transcript.');
      return;
    }

    try {
      handleUpdateDraft(className, draft.id, 'isUploading', true);
      handleUpdateDraft(className, draft.id, 'uploadError', null);

      const formData = new FormData();
      formData.append('file', draft.selectedFile);
      formData.append('sample_name', draft.sampleName || draft.selectedFile.name);
      formData.append('reference_transcript', draft.referenceTranscript.trim());
      formData.append('domain_class', className);
      formData.append('actual_domain_class', className);
      formData.append('speaker_category', 'General');

      const resp = await uploadSample(selectedExpId, formData);
      handleUpdateDraft(className, draft.id, 'uploadedSampleId', resp.sample_id);
      handleUpdateDraft(className, draft.id, 'uploadSuccess', true);
      
      const updated = await getExperiment(selectedExpId);
      setCurrentExp(updated);
    } catch (err: any) {
      handleUpdateDraft(className, draft.id, 'uploadError', err.message || 'Upload failed');
    } finally {
      handleUpdateDraft(className, draft.id, 'isUploading', false);
    }
  };

  // Batch upload all pending samples for the active class
  const handleUploadAllForClass = async (className: string) => {
    if (!selectedExpId) {
      setGlobalError('Please select or create an experiment first.');
      return;
    }
    const drafts = classDrafts[className] || [];
    setGlobalError(null);
    setGlobalUploadStatus(`Uploading all samples for '${className}'...`);

    let successCount = 0;
    for (const draft of drafts) {
      if (!draft.uploadSuccess && draft.selectedFile && draft.referenceTranscript.trim()) {
        await handleUploadSingleDraft(className, draft);
        successCount++;
      }
    }
    setGlobalUploadStatus(`Finished uploading ${successCount} sample(s) for '${className}'.`);
  };

  // Group existing samples in experiment
  const samplesByClass: Record<string, Sample[]> = {};
  if (currentExp && currentExp.samples) {
    currentExp.samples.forEach((s) => {
      const cls = s.domain_class || s.predicted_domain || 'Uncategorized';
      if (!samplesByClass[cls]) {
        samplesByClass[cls] = [];
      }
      samplesByClass[cls].push(s);
    });
  }

  const activeDrafts = classDrafts[activeClassTab] || [];

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Multi-Class Dataset Creation
          </h1>
          <p className="text-sm text-slate-400">
            Define comparative classes, set sample counts per class, and upload audio files with ground-truth reference transcripts.
          </p>
        </div>

        {currentExp && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setActiveTab('transcription')}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-purple-600 to-brand-600 hover:from-purple-500 hover:to-brand-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all"
            >
              <span>Run STT Pipeline (TS1 - TS6)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 1. Experiment Selector / Creator */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FolderPlus className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-semibold text-white">Target Benchmark Experiment</h2>
          </div>
          <button
            onClick={() => setIsCreatingNewExp(!isCreatingNewExp)}
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold"
          >
            {isCreatingNewExp ? '← Select Existing Experiment' : '+ Create New Experiment'}
          </button>
        </div>

        {isCreatingNewExp ? (
          <form onSubmit={handleCreateExperiment} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Experiment Title *</label>
              <input
                type="text"
                required
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="e.g. Multi-Domain Evaluation: Educational (2) vs Technology (3) vs Sports (2)"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Description / Academic Notes</label>
              <input
                type="text"
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="e.g. Class-wise STT evaluation across independent audio sample counts with ground truth reference transcripts."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-md transition-all"
            >
              Save & Initialize Experiment
            </button>
          </form>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-400 mb-1">Active Experiment:</label>
              <select
                value={selectedExpId || ''}
                onChange={(e) => setSelectedExpId(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-500"
              >
                {experiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    #{exp.id} - {exp.title} ({exp.sample_count || 0} samples)
                  </option>
                ))}
              </select>
            </div>
            {currentExp && (
              <div className="text-xs text-slate-400 sm:self-end pb-2">
                Created: <span className="text-slate-200 font-mono">{new Date(currentExp.created_at).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. DYNAMIC CLASS CONFIGURATION */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
        <div className="space-y-1 border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-2 text-purple-400 text-xs font-bold uppercase tracking-wider mb-1">
            <Layers className="w-4 h-4" />
            <span>Step 1: Dataset Classes & Sample Counts Configuration</span>
          </div>
          <h2 className="text-lg font-bold text-white">
            Configure Classes and Sample Counts
          </h2>
          <p className="text-xs text-slate-400">
            Choose the number of classes, select domain categories, and assign the desired number of audio/reference sample pairs for each.
          </p>
        </div>

        {/* Question 1: How many classes do you want to compare? */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <label className="text-sm font-bold text-white flex items-center space-x-2">
                <span>1. How many classes do you want to compare?</span>
                <span className="text-xs text-purple-400 font-mono font-normal">({numClasses} Classes)</span>
              </label>
              <p className="text-xs text-slate-400">
                Select or enter the number of comparative classes
              </p>
            </div>

            {/* Quick Count Selectors */}
            <div className="flex items-center space-x-2">
              {[2, 3, 4, 5].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => handleNumClassesChange(cnt)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all border ${
                    numClasses === cnt
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/30'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  {cnt} Classes
                </button>
              ))}
              
              <div className="flex items-center space-x-1 pl-2 border-l border-slate-800">
                <span className="text-xs text-slate-400 font-mono">Custom:</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={numClasses}
                  onChange={(e) => handleNumClassesChange(parseInt(e.target.value) || 1)}
                  className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono text-center focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Question 2: Selected Classes & Independent Sample Counts */}
        <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
          <div className="space-y-0.5 border-b border-slate-800/80 pb-2.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-200 block">
              2. Select Domains & Set Sample Counts for Each Class
            </label>
            <p className="text-xs text-slate-400">
              Each class can have its own independent number of audio/reference pairs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedClasses.map((selectedOption, slotIdx) => {
              const effectiveName = getEffectiveClassName(selectedOption, slotIdx);
              const drafts = classDrafts[effectiveName] || [];
              const savedCount = samplesByClass[effectiveName]?.length || 0;

              return (
                <div key={slotIdx} className="p-3.5 bg-slate-900 border border-slate-700/80 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-purple-400">
                      Class {slotIdx + 1}:
                    </span>
                    {savedCount > 0 && (
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                        {savedCount} saved
                      </span>
                    )}
                  </div>

                  {/* Dropdown Selector */}
                  <select
                    value={selectedOption}
                    onChange={(e) => handleSlotClassChange(slotIdx, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 font-medium focus:outline-none focus:border-purple-400"
                  >
                    {PREDEFINED_CLASSES.map((opt) => {
                      const isChosenInOtherSlot = selectedClasses.some((other, oIdx) => oIdx !== slotIdx && other === opt && opt !== 'Other');
                      return (
                        <option 
                          key={opt} 
                          value={opt}
                          disabled={isChosenInOtherSlot}
                        >
                          {opt} {isChosenInOtherSlot ? '(Selected in another class)' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Custom Text Field when "Other" is selected */}
                  {selectedOption === 'Other' && (
                    <div className="space-y-1">
                      <input
                        type="text"
                        required
                        value={customClassNames[slotIdx] || ''}
                        onChange={(e) => handleCustomNameChange(slotIdx, e.target.value)}
                        placeholder="Enter Custom Class Name..."
                        className="w-full bg-slate-950 border border-purple-500/60 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  )}

                  {/* Number of Samples for this Class */}
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300">
                      Number of Samples:
                    </label>
                    <div className="flex items-center space-x-1.5">
                      {[1, 2, 3, 4].map((cnt) => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleSetClassSampleCount(effectiveName, cnt)}
                          className={`w-7 h-6 rounded text-xs font-mono font-bold transition-all border ${
                            drafts.length === cnt
                              ? 'bg-purple-600 text-white border-purple-400'
                              : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
                          }`}
                        >
                          {cnt}
                        </button>
                      ))}
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={drafts.length}
                        onChange={(e) => handleSetClassSampleCount(effectiveName, parseInt(e.target.value) || 1)}
                        className="w-10 bg-slate-950 border border-slate-700 rounded px-1 py-0.5 text-xs text-white font-mono text-center focus:outline-none focus:border-purple-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. DYNAMIC AUDIO/REFERENCE PAIRS UPLOAD UNDER EACH CLASS */}
        <div className="space-y-4 pt-2">
          <div className="space-y-0.5 border-b border-slate-800 pb-3">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Tag className="w-4 h-4 text-purple-400" />
              <span>Step 2: Upload Audio & Corresponding Reference Transcripts for Each Class</span>
            </h3>
            <p className="text-xs text-slate-400">
              Each audio file must have its corresponding reference transcript.
            </p>
          </div>

          {/* Class Navigation Tabs */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
            {effectiveClassList.map((cName, idx) => {
              const isActive = activeClassTab === cName;
              const drafts = classDrafts[cName] || [];
              const savedCount = samplesByClass[cName]?.length || 0;
              return (
                <button
                  key={cName + idx}
                  type="button"
                  onClick={() => setActiveClassTab(cName)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all border ${
                    isActive
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-900/30'
                      : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  <span>Class {idx + 1}: <b>{cName}</b></span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-purple-800 text-purple-100' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {drafts.length} {drafts.length === 1 ? 'pair' : 'pairs'}
                  </span>
                  {savedCount > 0 && (
                    <span className="text-[10px] text-emerald-400 font-mono">
                      (✓{savedCount})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {globalError && (
            <div className="p-3.5 rounded-lg bg-rose-950/60 border border-rose-500/50 flex items-center space-x-2.5 text-rose-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{globalError}</span>
            </div>
          )}

          {globalUploadStatus && (
            <div className="p-3.5 rounded-lg bg-purple-950/60 border border-purple-500/50 flex items-center space-x-2.5 text-purple-300 text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-purple-400" />
              <span>{globalUploadStatus}</span>
            </div>
          )}

          {/* Dynamic Sample Pair Slots for Active Class */}
          <div className="p-5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="space-y-0.5">
                <h4 className="text-sm font-bold text-white font-mono flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-purple-400" />
                  <span>{activeClassTab}: {activeDrafts.length} Audio / Reference Pairs</span>
                </h4>
                <p className="text-xs text-slate-400">
                  Fill in the audio recording and matching reference transcript for each pair below.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => handleAddSampleSlot(activeClassTab)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Another Pair</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleUploadAllForClass(activeClassTab)}
                  className="flex items-center space-x-1.5 px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded-lg shadow-md transition-all"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Upload All for {activeClassTab}</span>
                </button>
              </div>
            </div>

            {/* List of Dynamic Pairs */}
            <div className="space-y-5">
              {activeDrafts.map((draft, dIdx) => (
                <div 
                  key={draft.id} 
                  className={`p-4 rounded-xl border transition-all ${
                    draft.uploadSuccess
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                  } space-y-4`}
                >
                  {/* Pair Header */}
                  <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-300 font-mono font-bold text-xs flex items-center justify-center border border-purple-500/40">
                        {dIdx + 1}
                      </span>
                      <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                        {activeClassTab} • Pair #{dIdx + 1}
                      </span>
                      {draft.uploadSuccess && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Saved to Database</span>
                        </span>
                      )}
                    </div>

                    {activeDrafts.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveSampleSlot(activeClassTab, draft.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        title="Remove this pair slot"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {draft.uploadError && (
                    <div className="p-2.5 rounded bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center space-x-2">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>{draft.uploadError}</span>
                    </div>
                  )}

                  {/* Inputs Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Audio / Video File Selection */}
                    <div className="lg:col-span-5 space-y-2">
                      <label className="block text-xs font-semibold text-slate-300">
                        Audio / Video File #{dIdx + 1} *
                      </label>
                      
                      <div className="flex flex-col gap-2">
                        <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-700 hover:border-purple-500/80 rounded-lg cursor-pointer bg-slate-950 hover:bg-slate-900/50 transition-colors">
                          <UploadCloud className="w-6 h-6 text-slate-400 mb-1" />
                          <span className="text-xs font-medium text-slate-200 text-center truncate max-w-full">
                            {draft.selectedFile ? draft.selectedFile.name : 'Select or drop audio/video file'}
                          </span>
                          <span className="text-[10px] text-slate-500 mt-0.5">WAV, MP3, MP4, M4A, WEBM, FLAC</span>
                          <input
                            type="file"
                            accept="audio/*,video/*,.wav,.mp3,.mp4,.m4a,.flac,.ogg,.webm,.mov"
                            onChange={(e) => {
                              if (e.target.files && e.target.files[0]) {
                                const f = e.target.files[0];
                                handleUpdateDraft(activeClassTab, draft.id, 'selectedFile', f);
                                if (!draft.sampleName || draft.sampleName.startsWith(`${activeClassTab} Sample`)) {
                                  handleUpdateDraft(activeClassTab, draft.id, 'sampleName', f.name.replace(/\.[^/.]+$/, ''));
                                }
                              }
                            }}
                            className="hidden"
                          />
                        </label>

                        {/* Live Microphone Recording Option */}
                        <div className="pt-1">
                          <AudioRecorder 
                            onAudioRecorded={(_, file) => {
                              handleUpdateDraft(activeClassTab, draft.id, 'selectedFile', file);
                            }} 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Sample Name & Corresponding Reference Transcript */}
                    <div className="lg:col-span-7 space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Sample Name / Identifier *
                        </label>
                        <input
                          type="text"
                          required
                          value={draft.sampleName}
                          onChange={(e) => handleUpdateDraft(activeClassTab, draft.id, 'sampleName', e.target.value)}
                          placeholder={`e.g. ${activeClassTab} Sample ${dIdx + 1}`}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-400"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-300">
                            Corresponding Reference Transcript (Ground Truth) *
                          </label>
                          <span className="text-[10px] font-mono text-slate-500">
                            {draft.referenceTranscript.trim().split(/\s+/).filter(Boolean).length} words
                          </span>
                        </div>
                        <textarea
                          required
                          rows={3}
                          value={draft.referenceTranscript}
                          onChange={(e) => handleUpdateDraft(activeClassTab, draft.id, 'referenceTranscript', e.target.value)}
                          placeholder={`Enter the ground truth reference text for this ${activeClassTab} audio sample (used to evaluate WER, CER, BLEU, ROUGE, METEOR)...`}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-400 font-mono leading-relaxed"
                        />
                      </div>

                      {/* Save Individual Pair Button */}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={draft.isUploading || draft.uploadSuccess}
                          onClick={() => handleUploadSingleDraft(activeClassTab, draft)}
                          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            draft.uploadSuccess
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 cursor-default'
                              : 'bg-brand-600 hover:bg-brand-500 text-white shadow-sm'
                          }`}
                        >
                          {draft.isUploading 
                            ? 'Saving...' 
                            : draft.uploadSuccess 
                              ? '✓ Saved to Dataset' 
                              : `Save Pair #${dIdx + 1}`}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. DATASET OVERVIEW: Grouped Samples by Selected Classes */}
      {currentExp && currentExp.samples && currentExp.samples.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white">
                Dataset Overview: {currentExp.samples.length} Samples Across {Object.keys(samplesByClass).length} Classes
              </h3>
              <p className="text-xs text-slate-400">
                All audio/video samples and linked ground-truth transcripts organized by class for STT benchmarking
              </p>
            </div>
            <button
              onClick={() => setActiveTab('transcription')}
              className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold rounded-lg shadow-md transition-all self-start sm:self-auto"
            >
              <span>Proceed to Transcription (TS1-TS6)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-6">
            {effectiveClassList.map((className, idx) => {
              const classSamples = samplesByClass[className] || [];
              return (
                <div key={className + idx} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                  <div className="p-3.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
                      <h4 className="text-sm font-bold text-white font-mono">
                        Class {idx + 1}: {className}
                      </h4>
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/30">
                        {classSamples.length} {classSamples.length === 1 ? 'sample' : 'samples'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setActiveClassTab(className);
                        window.scrollTo({ top: 350, behavior: 'smooth' });
                      }}
                      className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold rounded border border-slate-700 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Manage {className} Pairs</span>
                    </button>
                  </div>

                  <div className="p-3 space-y-2.5">
                    {classSamples.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 italic">
                        No samples added under '{className}' yet.
                      </div>
                    ) : (
                      classSamples.map((s, sIdx) => (
                        <div key={s.id} className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-brand-400 font-bold">#{sIdx + 1}</span>
                              <span className="font-semibold text-slate-200 text-xs">{s.sample_name}</span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-purple-950/80 text-purple-300 border border-purple-500/30">
                                {className}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 line-clamp-1 italic font-mono">
                              "{s.reference_transcript}"
                            </p>
                          </div>

                          <div className="flex items-center space-x-2 self-end md:self-auto flex-shrink-0">
                            {s.duration_seconds ? (
                              <span className="text-xs font-mono text-slate-500 mr-2">
                                {s.duration_seconds}s
                              </span>
                            ) : null}
                            {s.transcriptions && Object.keys(s.transcriptions).length > 0 ? (
                              <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-300 border border-emerald-500/40 text-[11px] rounded font-mono">
                                ✓ Transcribed ({Object.keys(s.transcriptions).length} models)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-950/60 text-amber-300 border border-amber-500/40 text-[11px] rounded font-mono">
                                Pending STT
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
