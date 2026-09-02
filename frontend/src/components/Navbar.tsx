import React from 'react';
import { Activity, PlusCircle, Mic, BarChart3, History, Sparkles, Volume2 } from 'lucide-react';

interface NavbarProps {
  activeTab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history';
  setActiveTab: (tab: 'dashboard' | 'new-experiment' | 'transcription' | 'results' | 'history') => void;
  onLoadDemo?: () => void;
  isLoadingDemo?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  onLoadDemo,
  isLoadingDemo = false,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Activity },
    { id: 'new-experiment', label: 'New Experiment', icon: PlusCircle },
    { id: 'transcription', label: 'Transcription (TS1-TS3)', icon: Mic },
    { id: 'results', label: 'Results & Analysis', icon: BarChart3 },
    { id: 'history', label: 'Experiment History', icon: History },
  ] as const;

  return (
    <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Volume2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base text-white tracking-tight">SpeechEval NLP</span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-brand-500/20 text-brand-300 rounded-full border border-brand-500/30">
                  ASR Benchmarking
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">Speech Transcription & Performance Evaluation</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30 shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right Action: Demo Dataset Loader */}
          <div className="flex items-center space-x-3">
            {onLoadDemo && (
              <button
                onClick={onLoadDemo}
                disabled={isLoadingDemo}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-md shadow-purple-900/30 transition-all disabled:opacity-50"
                title="Load realistic benchmark dataset across multiple speaking conditions"
              >
                <Sparkles className={`w-3.5 h-3.5 ${isLoadingDemo ? 'animate-spin' : ''}`} />
                <span>{isLoadingDemo ? 'Transcribing Demo...' : 'Load Research Demo'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* Mobile Bar */}
      <div className="md:hidden flex overflow-x-auto border-t border-slate-800/80 px-2 py-1 space-x-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs whitespace-nowrap ${
                isActive ? 'bg-brand-500/20 text-brand-300 font-semibold' : 'text-slate-400'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </header>
  );
};
