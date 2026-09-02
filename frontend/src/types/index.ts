export interface ModelInfo {
  slot_id: string;
  name: string;
  description: string;
}

export interface DiffToken {
  type: 'match' | 'substitution' | 'deletion' | 'insertion';
  word: string;
  ref_word: string;
}

export interface EvaluationMetrics {
  wer: number;
  cer: number;
  bleu: number;
  bleu1: number;
  bleu2: number;
  bleu4: number;
  rouge1_f1: number;
  rouge2_f1: number;
  rougeL_f1: number;
  meteor: number;
  accuracy_pct: number;
  composite_score: number;
  diff: DiffToken[];
  ref_norm?: string;
  hyp_norm?: string;
}

export interface TranscriptionRecord {
  id?: number;
  sample_id?: number;
  model_id: string;
  model_name: string;
  raw_transcript: string;
  normalized_transcript: string;
  processing_time_sec: number;
  error_message?: string | null;
  created_at?: string;
}

export interface SpeakingStyleAnalysis {
  predicted: string;
  score: number;
  confidence: number;
  reason: string;
  evidence: string[];
  features?: {
    contractions_count?: number;
    fillers_count?: number;
    formal_words_count?: number;
    avg_word_len?: number;
    avg_sentence_len?: number;
  };
}

export interface AudioQualityAnalysis {
  predicted: string;
  quality_score: number;
  snr_db: number;
  reason: string;
  metrics?: {
    rms_db?: number;
    noise_floor_rms?: number;
    mean_zcr?: number;
    spectral_flatness?: number;
  };
}

export interface DomainPrediction {
  category: string;
  parent_domain: string;
  confidence: number;
  percentage: number;
  matched_keywords?: string[];
}

export interface DomainClassificationAnalysis {
  predicted: string;
  predicted_domain?: string;
  predicted_class?: string;
  confidence: number;
  percentage?: number;
  matched_keywords: string[];
  top_predictions?: DomainPrediction[];
  domain_scores?: Record<string, number>;
}

export interface AutomaticAnalysis {
  speaking_style: SpeakingStyleAnalysis;
  audio_quality: AudioQualityAnalysis;
  domain_classification: DomainClassificationAnalysis;
}

export interface Sample {
  id: number;
  experiment_id: number;
  sample_name: string;
  audio_filename: string;
  original_filename: string;
  duration_seconds: number;
  speaker_category: string;
  speaking_condition: string;
  speech_quality: string;
  domain_class: string;
  predicted_speaking_style?: string;
  predicted_speech_quality?: string;
  predicted_domain?: string;
  analysis_details?: AutomaticAnalysis;
  actual_speaking_condition?: string;
  actual_speech_quality?: string;
  actual_domain_class?: string;
  reference_transcript: string;
  created_at: string;
  transcriptions: Record<string, TranscriptionRecord>;
  evaluations: Record<string, EvaluationMetrics>;
}

export interface ModelRanking {
  model_id: string;
  model_name: string;
  sample_count: number;
  avg_wer: number;
  avg_cer: number;
  avg_bleu: number;
  avg_rougeL: number;
  avg_meteor: number;
  avg_composite: number;
  avg_latency_sec: number;
  rank: number;
}

export interface Insight {
  category: string;
  title: string;
  text: string;
}

export interface ClassMetricWinner {
  model_id: string;
  model_name: string;
  value: number;
  formatted: string;
}

export interface ClassAnalysisSummary {
  class_name: string;
  sample_count: number;
  best_by_wer: ClassMetricWinner;
  best_by_cer: ClassMetricWinner;
  best_by_bleu: ClassMetricWinner;
  best_by_rouge: ClassMetricWinner;
  best_by_meteor: ClassMetricWinner;
  overall_best: {
    model_id: string;
    model_name: string;
    avg_wer: number;
    avg_bleu: number;
  };
  explanation: string;
}

export interface ClassWiseFinalSummary {
  classes: ClassAnalysisSummary[];
  overall_best_model: ModelRanking | null;
  overall_explanation: string;
}

export interface AnalysisData {
  has_data: boolean;
  models_ranking: ModelRanking[];
  best_model: ModelRanking | null;
  condition_breakdown: Record<string, Record<string, any>>;
  quality_breakdown: Record<string, Record<string, any>>;
  domain_breakdown: Record<string, Record<string, any>>;
  class_model_averages?: Record<string, Record<string, {
    class_name: string;
    model_id: string;
    model_name: string;
    sample_count: number;
    avg_wer: number;
    avg_cer: number;
    avg_bleu: number;
    avg_rougeL: number;
    avg_meteor: number;
  }>>;
  class_wise_final_summary?: ClassWiseFinalSummary;
  auto_condition_breakdown?: {
    speaking_style: Record<string, Record<string, any>>;
    speech_quality: Record<string, Record<string, any>>;
    domain: Record<string, Record<string, any>>;
  };
  domain_classification_summary?: DomainClassificationAnalysis;
  speaker_breakdown?: Record<string, Record<string, any>>;
  insights: Insight[];
}

export interface Experiment {
  id: number;
  title: string;
  description: string;
  created_at: string;
  sample_count?: number;
  eval_count?: number;
  samples?: Sample[];
  analysis?: AnalysisData;
}

export interface DashboardStats {
  total_experiments: number;
  total_samples: number;
  total_models: number;
  models: ModelInfo[];
  best_model: ModelRanking | null;
  models_ranking: ModelRanking[];
  avg_wer: number;
  avg_cer: number;
  recent_experiments: Experiment[];
  has_data: boolean;
}
