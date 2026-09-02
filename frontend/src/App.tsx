import React, { useState } from 'react';
import { Navbar } from './components/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { NewExperimentPage } from './pages/NewExperimentPage';
import { TranscriptionPage } from './pages/TranscriptionPage';
import { ResultsPage } from './pages/ResultsPage';
import { HistoryPage } from './pages/HistoryPage';
import { loadDemoPreset } from './services/api';

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history'>('dashboard');
  const [selectedExpId, setSelectedExpId] = useState<number | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

  const handleLoadDemo = async () => {
    try {
      setIsLoadingDemo(true);
      const res = await loadDemoPreset();
      setSelectedExpId(res.experiment_id);
      setActiveTab('results');
    } catch (err: any) {
      alert(`Could not load demo dataset: ${err.message}`);
    } finally {
      setIsLoadingDemo(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onLoadDemo={handleLoadDemo}
        isLoadingDemo={isLoadingDemo}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {activeTab === 'dashboard' && (
          <DashboardPage
            setActiveTab={setActiveTab}
            setSelectedExpId={setSelectedExpId}
            onLoadDemo={handleLoadDemo}
            isLoadingDemo={isLoadingDemo}
          />
        )}

        {activeTab === 'new-experiment' && (
          <NewExperimentPage
            selectedExpId={selectedExpId}
            setSelectedExpId={setSelectedExpId}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'transcription' && (
          <TranscriptionPage
            selectedExpId={selectedExpId}
            setSelectedExpId={setSelectedExpId}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'results' && (
          <ResultsPage
            selectedExpId={selectedExpId}
            setSelectedExpId={setSelectedExpId}
            setActiveTab={setActiveTab}
          />
        )}

        {activeTab === 'history' && (
          <HistoryPage
            setSelectedExpId={setSelectedExpId}
            setActiveTab={setActiveTab}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 mt-auto text-center text-xs text-slate-500 font-mono">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Speech Transcription and Performance Evaluation • NLP Research MVP</span>
          <span>WER • CER • BLEU • ROUGE • METEOR • Multi-Model Benchmark</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
