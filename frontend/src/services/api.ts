import { DashboardStats, Experiment, Sample, AnalysisData, ModelInfo } from '../types';

const API_BASE = 'http://localhost:8000/api';

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  if (!res.ok) throw new Error('Failed to fetch dashboard stats');
  return res.json();
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/models`);
  if (!res.ok) throw new Error('Failed to fetch STT models');
  return res.json();
}

export async function fetchExperiments(): Promise<Experiment[]> {
  const res = await fetch(`${API_BASE}/experiments`);
  if (!res.ok) throw new Error('Failed to fetch experiments');
  return res.json();
}

export async function createExperiment(title: string, description: string = ''): Promise<{ id: number; title: string }> {
  const res = await fetch(`${API_BASE}/experiments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  });
  if (!res.ok) throw new Error('Failed to create experiment');
  return res.json();
}

export async function getExperiment(expId: number): Promise<Experiment> {
  const res = await fetch(`${API_BASE}/experiments/${expId}`);
  if (!res.ok) throw new Error('Failed to fetch experiment details');
  return res.json();
}

export async function deleteExperiment(expId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/experiments/${expId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete experiment');
}

export async function uploadSample(
  expId: number,
  formData: FormData
): Promise<{ sample_id: number; sample_name: string; audio_filename: string; duration_seconds: number }> {
  const res = await fetch(`${API_BASE}/experiments/${expId}/samples`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to upload sample');
  }
  return res.json();
}

export async function runTranscription(sampleId: number): Promise<{ sample: Sample; results: any }> {
  const res = await fetch(`${API_BASE}/samples/${sampleId}/transcribe`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to transcribe sample');
  }
  return res.json();
}

export async function transcribeClassSamples(expId: number, className: string): Promise<any> {
  const res = await fetch(`${API_BASE}/experiments/${expId}/classes/${encodeURIComponent(className)}/transcribe`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to transcribe class '${className}'`);
  }
  return res.json();
}

export async function transcribeAllExperimentSamples(expId: number): Promise<any> {
  const res = await fetch(`${API_BASE}/experiments/${expId}/transcribe-all`, {
    method: 'POST',
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || 'Failed to transcribe all samples');
  }
  return res.json();
}

export async function deleteSample(sampleId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/samples/${sampleId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete sample');
}

export async function fetchGlobalAnalysis(): Promise<AnalysisData> {
  const res = await fetch(`${API_BASE}/analysis`);
  if (!res.ok) throw new Error('Failed to fetch analysis');
  return res.json();
}

export async function loadDemoPreset(): Promise<{ experiment_id: number; message: string }> {
  const res = await fetch(`${API_BASE}/presets/load-demo`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to load demo dataset');
  return res.json();
}

export function getAudioUrl(filename: string): string {
  return `${API_BASE}/audio/${filename}`;
}

export function getExportCsvUrl(expId?: number): string {
  return expId ? `${API_BASE}/experiments/${expId}/export-csv` : `${API_BASE}/export-csv`;
}
