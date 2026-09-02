import os
import io
import csv
import json
import uuid
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from database import (
    init_db, create_experiment, get_experiments, get_experiment_by_id,
    delete_experiment, create_sample, get_sample_by_id, delete_sample,
    save_transcription, save_evaluation, get_all_evaluations, update_sample_analysis
)
from models.registry import MODEL_PIPELINE, get_all_models, get_model
from metrics import evaluate_transcript, normalize_text
from audio_utils import convert_to_wav, get_audio_duration
from analysis import compute_comparative_analysis
from auto_classifier import analyze_speech_sample, analyze_audio_quality, analyze_speaking_style, classify_domain

# Initialize database schema on startup
init_db()

app = FastAPI(
    title="Speech-to-Text Benchmark & NLP Evaluation API",
    description="Backend service for transcribing audio/video across multiple STT models and computing NLP metrics (WER, CER, BLEU, ROUGE, METEOR).",
    version="2.0.0"
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "uploads"))
AUDIO_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "audio"))
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

# Pydantic Schemas
class ExperimentCreate(BaseModel):
    title: str
    description: Optional[str] = ""

class EvaluationRequest(BaseModel):
    reference_transcript: str
    model_transcripts: dict

# --- Dashboard & Model Metadata ---

@app.get("/api/dashboard/stats")
def get_dashboard_stats():
    """Returns high-level statistics and recent evaluations for the dashboard overview."""
    evals = get_all_evaluations()
    experiments = get_experiments()
    models = get_all_models()

    total_evals = len(evals)
    total_samples = sum(exp.get("sample_count", 0) for exp in experiments)

    # Calculate average WER and CER
    avg_wer = round(sum(e["wer"] for e in evals) / total_evals, 4) if total_evals > 0 else 0.0
    avg_cer = round(sum(e["cer"] for e in evals) / total_evals, 4) if total_evals > 0 else 0.0
    avg_composite = round(sum(e["composite_score"] for e in evals) / total_evals, 2) if total_evals > 0 else 0.0

    analysis = compute_comparative_analysis(evals)

    return {
        "total_experiments": len(experiments),
        "total_samples": total_samples,
        "total_evaluations": total_evals,
        "average_wer": avg_wer,
        "average_cer": avg_cer,
        "average_composite_score": avg_composite,
        "best_model": analysis.get("best_model"),
        "models_ranking": analysis.get("models_ranking", []),
        "available_models": models,
        "recent_experiments": experiments[:5]
    }

@app.get("/api/models")
def list_models():
    """List all registered STT models."""
    return get_all_models()

# --- Experiment Endpoints ---

@app.post("/api/experiments")
def create_new_experiment(exp: ExperimentCreate):
    exp_id = create_experiment(exp.title, exp.description or "")
    return {"id": exp_id, "title": exp.title, "message": "Experiment created successfully"}

@app.get("/api/experiments")
def list_experiments():
    return get_experiments()

@app.get("/api/experiments/{exp_id}")
def get_experiment_details(exp_id: int):
    exp = get_experiment_by_id(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    # Compute per-experiment comparative analysis
    exp_evals = []
    for s in exp.get("samples", []):
        for m_id, ev in s.get("evaluations", {}).items():
            ev_copy = dict(ev)
            ev_copy["sample_name"] = s["sample_name"]
            ev_copy["speaker_category"] = s["speaker_category"]
            ev_copy["speaking_condition"] = s.get("speaking_condition", "Formal")
            ev_copy["speech_quality"] = s.get("speech_quality", "Clear")
            ev_copy["domain_class"] = s.get("domain_class", "General Conversation")
            ev_copy["predicted_speaking_style"] = s.get("predicted_speaking_style", "Formal")
            ev_copy["predicted_speech_quality"] = s.get("predicted_speech_quality", "Clear")
            ev_copy["predicted_domain"] = s.get("predicted_domain", "General Conversation")
            ev_copy["actual_speaking_condition"] = s.get("actual_speaking_condition")
            ev_copy["actual_speech_quality"] = s.get("actual_speech_quality")
            ev_copy["actual_domain_class"] = s.get("actual_domain_class")
            ev_copy["model_name"] = s.get("transcriptions", {}).get(m_id, {}).get("model_name", m_id.upper())
            ev_copy["processing_time_sec"] = s.get("transcriptions", {}).get(m_id, {}).get("processing_time_sec", 0.0)
            exp_evals.append(ev_copy)
            
    exp["analysis"] = compute_comparative_analysis(exp_evals)
    return exp

@app.delete("/api/experiments/{exp_id}")
def remove_experiment(exp_id: int):
    success = delete_experiment(exp_id)
    if not success:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return {"message": "Experiment deleted successfully"}

# --- Sample Upload & Automatic Speech Analysis ---

@app.post("/api/experiments/{exp_id}/samples")
async def add_sample(
    exp_id: int,
    file: UploadFile = File(...),
    sample_name: str = Form(...),
    reference_transcript: str = Form(...),
    domain_class: Optional[str] = Form("Educational"),
    speaker_category: Optional[str] = Form("General"),
    actual_speaking_condition: Optional[str] = Form(None),
    actual_speech_quality: Optional[str] = Form(None),
    # Backwards compatibility parameters
    speaking_condition: Optional[str] = Form(None),
    speech_quality: Optional[str] = Form(None),
    actual_domain_class: Optional[str] = Form(None)
):
    exp = get_experiment_by_id(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    file_ext = os.path.splitext(file.filename)[1].lower()
    allowed_exts = {'.wav', '.mp3', '.m4a', '.ogg', '.flac', '.mp4', '.mov', '.mkv', '.webm', '.avi'}
    if file_ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{file_ext}'. Allowed formats: {', '.join(allowed_exts)}")

    raw_filename = f"{uuid.uuid4()}{file_ext}"
    raw_path = os.path.join(UPLOAD_DIR, raw_filename)

    with open(raw_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Convert to 16kHz WAV for STT & audio streaming
    wav_filename = f"{uuid.uuid4()}.wav"
    wav_path = os.path.join(AUDIO_DIR, wav_filename)

    try:
        convert_to_wav(raw_path, wav_path)
        duration = get_audio_duration(wav_path)
    except Exception as e:
        if os.path.exists(raw_path):
            os.remove(raw_path)
        raise HTTPException(status_code=500, detail=f"Audio processing/conversion failed: {str(e)}")

    # Clean up raw upload
    if os.path.exists(raw_path):
        os.remove(raw_path)

    # AUTOMATIC ACOUSTIC ANALYSIS (speaking style & quality)
    ref_text = reference_transcript.strip() if isinstance(reference_transcript, str) else ""
    auto_analysis = analyze_speech_sample(wav_path, ref_text)

    pred_style = auto_analysis["speaking_style"]["predicted"]
    pred_quality = auto_analysis["audio_quality"]["predicted"]

    def _val(v, default=None):
        if hasattr(v, 'default'):
            return v.default if v.default is not ... else default
        return v if v is not None else default

    s_cat = _val(speaker_category, "General") or "General"
    act_condition = _val(actual_speaking_condition) or _val(speaking_condition)
    act_quality = _val(actual_speech_quality) or _val(speech_quality)
    s_name = _val(sample_name, "Sample") or "Sample"
    # Class / Domain is the dataset label
    assigned_domain = _val(domain_class) or _val(actual_domain_class) or "Educational"
    assigned_domain = assigned_domain.strip()

    # Update analysis summary domain to match dataset class
    auto_analysis["domain_classification"]["predicted"] = assigned_domain
    analysis_json = json.dumps(auto_analysis)

    sample_id = create_sample(
        experiment_id=exp_id,
        sample_name=s_name,
        audio_filename=wav_filename,
        original_filename=file.filename,
        speaker_category=s_cat,
        speaking_condition=pred_style,
        speech_quality=pred_quality,
        domain_class=assigned_domain,
        predicted_speaking_style=pred_style,
        predicted_speech_quality=pred_quality,
        predicted_domain=assigned_domain,
        analysis_json=analysis_json,
        actual_speaking_condition=act_condition,
        actual_speech_quality=act_quality,
        actual_domain_class=assigned_domain,
        reference_transcript=ref_text,
        duration_seconds=duration
    )

    return {
        "sample_id": sample_id,
        "sample_name": sample_name,
        "audio_filename": wav_filename,
        "domain_class": assigned_domain,
        "duration_seconds": duration,
        "automatic_analysis": auto_analysis,
        "message": "Sample added successfully to class/domain dataset"
    }

@app.post("/api/samples/{sample_id}/analyze")
def run_sample_automatic_analysis(sample_id: int):
    """Re-analyzes an existing sample's audio and transcript characteristics."""
    sample = get_sample_by_id(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    wav_path = os.path.join(AUDIO_DIR, sample["audio_filename"])
    ref_text = sample.get("reference_transcript", "")
    
    # If reference text is empty, check if TS1 or another model produced transcript
    if not ref_text and sample.get("transcriptions"):
        for m in ["ts1", "ts5", "ts4", "ts3", "ts2", "ts6"]:
            if sample["transcriptions"].get(m, {}).get("raw_transcript"):
                ref_text = sample["transcriptions"][m]["raw_transcript"]
                break

    auto_analysis = analyze_speech_sample(wav_path, ref_text)
    pred_style = auto_analysis["speaking_style"]["predicted"]
    pred_quality = auto_analysis["audio_quality"]["predicted"]
    pred_domain = auto_analysis["domain_classification"]["predicted"]
    analysis_json = json.dumps(auto_analysis)

    update_sample_analysis(
        sample_id=sample_id,
        predicted_speaking_style=pred_style,
        predicted_speech_quality=pred_quality,
        predicted_domain=pred_domain,
        analysis_json=analysis_json
    )

    return {
        "sample_id": sample_id,
        "automatic_analysis": auto_analysis,
        "message": "Automatic speech analysis completed"
    }

@app.delete("/api/samples/{sample_id}")
def remove_sample(sample_id: int):
    success = delete_sample(sample_id)
    if not success:
        raise HTTPException(status_code=404, detail="Sample not found")
    return {"message": "Sample deleted successfully"}

# --- STT Transcription Pipeline ---

@app.post("/api/samples/{sample_id}/transcribe")
def run_transcription_pipeline(sample_id: int, model_id: Optional[str] = None):
    """
    Executes the pipeline for all models or a selected model (e.g. ts1):
    Audio -> STT -> Raw Transcripts -> Normalization -> Evaluation (WER, CER, BLEU, ROUGE, METEOR)
    """
    sample = get_sample_by_id(sample_id)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")

    wav_path = os.path.join(AUDIO_DIR, sample["audio_filename"])
    if not os.path.exists(wav_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    ref_text = sample["reference_transcript"]
    results = {}

    target_models = {model_id.lower(): MODEL_PIPELINE[model_id.lower()]} if model_id and model_id.lower() in MODEL_PIPELINE else MODEL_PIPELINE

    for slot_id, model in target_models.items():
        print(f"Transcribing sample #{sample_id} ({sample['sample_name']}) with {model.name}...")
        try:
            stt_out = model.transcribe(wav_path)
            model_name = model.name

            raw_transcript = stt_out.get("text", "")
            norm_transcript = normalize_text(raw_transcript)
            proc_time = stt_out.get("processing_time", 0.0)
            err_msg = stt_out.get("error")

            # Save transcription
            t_id = save_transcription(
                sample_id=sample_id,
                model_id=slot_id,
                model_name=model_name,
                raw_transcript=raw_transcript,
                normalized_transcript=norm_transcript,
                processing_time_sec=proc_time,
                error_message=err_msg
            )

            # Calculate NLP evaluation metrics
            eval_metrics = evaluate_transcript(ref_text, raw_transcript)
            
            # Save evaluation
            save_evaluation(
                transcription_id=t_id,
                sample_id=sample_id,
                model_id=slot_id,
                eval_metrics=eval_metrics
            )

            results[slot_id] = {
                "transcription_id": t_id,
                "model_name": model_name,
                "raw_transcript": raw_transcript,
                "normalized_transcript": norm_transcript,
                "processing_time": proc_time,
                "metrics": eval_metrics,
                "error": err_msg
            }
        except Exception as e:
            print(f"Error during STT on {slot_id}: {e}")
            t_id = save_transcription(
                sample_id=sample_id,
                model_id=slot_id,
                model_name=model.name,
                raw_transcript="",
                normalized_transcript="",
                processing_time_sec=0.0,
                error_message=str(e)
            )
            eval_metrics = evaluate_transcript(ref_text, "")
            save_evaluation(t_id, sample_id, slot_id, eval_metrics)
            results[slot_id] = {
                "transcription_id": t_id,
                "model_name": model.name,
                "raw_transcript": "",
                "normalized_transcript": "",
                "processing_time": 0.0,
                "metrics": eval_metrics,
                "error": str(e)
            }

    return {
        "sample_id": sample_id,
        "sample_name": sample["sample_name"],
        "domain_class": sample.get("domain_class", "General"),
        "reference_transcript": ref_text,
        "results": results
    }

# --- Batch & Class Transcription Endpoints ---

@app.post("/api/experiments/{exp_id}/classes/{class_name}/transcribe")
def transcribe_experiment_class_samples(exp_id: int, class_name: str):
    """
    Runs all STT models for every audio sample belonging to a specific dataset class.
    Stores each generated transcript with its sample and class, retaining the reference transcript.
    """
    exp = get_experiment_by_id(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    target_class = class_name.strip().lower()
    samples = [
        s for s in exp.get("samples", [])
        if (s.get("domain_class") or s.get("predicted_domain") or "").strip().lower() == target_class
    ]

    if not samples:
        raise HTTPException(status_code=404, detail=f"No samples found for class '{class_name}' in experiment #{exp_id}")

    completed = []
    for s in samples:
        res = run_transcription_pipeline(s["id"])
        completed.append(res)

    return {
        "experiment_id": exp_id,
        "domain_class": class_name,
        "processed_samples": len(completed),
        "details": completed
    }

@app.post("/api/experiments/{exp_id}/transcribe-all")
def transcribe_all_experiment_samples(exp_id: int):
    """
    Runs all STT models for every audio sample across all classes in the experiment.
    """
    exp = get_experiment_by_id(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    samples = exp.get("samples", [])
    completed = []

    for s in samples:
        res = run_transcription_pipeline(s["id"])
        completed.append(res)

    return {
        "experiment_id": exp_id,
        "processed_samples": len(completed),
        "details": completed
    }

# --- Comparative Research Analysis Endpoint ---

@app.get("/api/analysis")
def get_global_analysis():
    """Computes aggregate analytics and research insights across all experiments and samples."""
    evals = get_all_evaluations()
    return compute_comparative_analysis(evals)

# --- CSV Export Endpoints ---

@app.get("/api/export-csv")
def export_all_csv():
    evals = get_all_evaluations()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Experiment", "Sample Name", "Dataset Class / Domain", "Speaker Category",
        "Predicted Speaking Style", "Predicted Audio Quality",
        "Duration (s)", "Model Slot", "Model Name", "Processing Time (s)",
        "WER", "CER", "BLEU", "BLEU-1", "BLEU-2", "BLEU-4",
        "ROUGE-1 F1", "ROUGE-2 F1", "ROUGE-L F1", "METEOR", "Accuracy %",
        "Reference Transcript", "Generated Transcript"
    ])

    for ev in evals:
        writer.writerow([
            ev.get("experiment_title", ""),
            ev.get("sample_name", ""),
            ev.get("domain_class") or ev.get("predicted_domain") or "General",
            ev.get("speaker_category", "General"),
            ev.get("predicted_speaking_style", "Formal"),
            ev.get("predicted_speech_quality", "Clear"),
            ev.get("duration_seconds", 0.0),
            ev.get("model_id", "").upper(),
            ev.get("model_name", ""),
            ev.get("processing_time_sec", 0.0),
            ev.get("wer", 0.0),
            ev.get("cer", 0.0),
            ev.get("bleu", 0.0),
            ev.get("bleu1", 0.0),
            ev.get("bleu2", 0.0),
            ev.get("bleu4", 0.0),
            ev.get("rouge1_f1", 0.0),
            ev.get("rouge2_f1", 0.0),
            ev.get("rougeL_f1", 0.0),
            ev.get("meteor", 0.0),
            ev.get("accuracy_pct", 0.0),
            ev.get("reference_transcript", ""),
            ev.get("raw_transcript", "")
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=nlp_stt_benchmark_results.csv"}
    )

@app.get("/api/experiments/{exp_id}/export-csv")
def export_experiment_csv(exp_id: int):
    exp = get_experiment_by_id(exp_id)
    if not exp:
        raise HTTPException(status_code=404, detail="Experiment not found")

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Sample Name", "Dataset Class / Domain", "Speaker Category",
        "Predicted Speaking Style", "Predicted Audio Quality",
        "Duration (s)", "Model Slot", "Model Name", "Processing Time (s)",
        "WER", "CER", "BLEU", "ROUGE-L F1", "METEOR", "Accuracy %",
        "Reference Transcript", "Generated Transcript"
    ])

    for s in exp.get("samples", []):
        for m_id, ev in s.get("evaluations", {}).items():
            t = s.get("transcriptions", {}).get(m_id, {})
            writer.writerow([
                s["sample_name"],
                s.get("domain_class") or s.get("predicted_domain") or "General",
                s.get("speaker_category", "General"),
                s.get("predicted_speaking_style", "Formal"),
                s.get("predicted_speech_quality", "Clear"),
                s.get("duration_seconds", 0.0),
                m_id.upper(),
                t.get("model_name", m_id.upper()),
                t.get("processing_time_sec", 0.0),
                ev.get("wer", 0.0),
                ev.get("cer", 0.0),
                ev.get("bleu", 0.0),
                ev.get("rougeL_f1", 0.0),
                ev.get("meteor", 0.0),
                ev.get("accuracy_pct", 0.0),
                s["reference_transcript"],
                t.get("raw_transcript", "")
            ])

    output.seek(0)
    filename = f"experiment_{exp_id}_{exp['title'].replace(' ', '_')}_metrics.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# --- Audio Streaming Endpoint ---

@app.get("/api/audio/{filename}")
def stream_audio(filename: str):
    file_path = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(file_path, media_type="audio/wav")

# --- Preset Research Demo Generator ---

@app.post("/api/presets/load-demo")
def load_research_demo():
    """
    Synthesizes and loads multi-class benchmark samples across domains:
    - Educational
    - Technology
    - News
    - Sports
    with multiple samples per class and reference transcripts.
    """
    exp_id = create_experiment(
        title="Multi-Domain Speech Benchmark Dataset",
        description="Dataset containing audio samples across Educational, Technology, News, and Sports domains with reference transcripts."
    )

    demo_data = [
        # Educational Domain Samples
        {
            "name": "Machine Learning Fundamentals Lecture",
            "domain": "Educational",
            "speaker": "Academic",
            "ref": "Natural language processing enables computational models to transcribe, analyze, and comprehend human speech patterns with statistical precision."
        },
        {
            "name": "Physics Quantum Mechanics Tutorial",
            "domain": "Educational",
            "speaker": "Professor",
            "ref": "Quantum entanglement demonstrates that pairs of particles remain connected such that actions performed on one affect the other."
        },
        # Technology Domain Samples
        {
            "name": "Cloud Computing Architecture Discussion",
            "domain": "Technology",
            "speaker": "Engineer",
            "ref": "Microservice architectures provide distributed scalability and containerized deployment across multi-region cloud infrastructures."
        },
        {
            "name": "Generative AI Hardware Keynote",
            "domain": "Technology",
            "speaker": "Keynote Speaker",
            "ref": "Neural processing units accelerate matrix multiplication pipelines allowing real time speech inference on edge devices."
        },
        # News Domain Samples
        {
            "name": "Global Economy & Markets Broadcast",
            "domain": "News",
            "speaker": "News Anchor",
            "ref": "International financial markets experienced steady growth today following updated employment metrics and central bank policy announcements."
        },
        {
            "name": "Renewable Energy Policy Report",
            "domain": "News",
            "speaker": "Correspondent",
            "ref": "The government is committed to modernizing our renewable power grid by accelerating solar and wind infrastructure investments across the country."
        },
        # Sports Domain Samples
        {
            "name": "Championship Football Commentary",
            "domain": "Sports",
            "speaker": "Commentator",
            "ref": "The striker dribbles past two defenders down the right wing and delivers a spectacular curling shot into the top corner."
        },
        {
            "name": "Olympic Track & Field Race Summary",
            "domain": "Sports",
            "speaker": "Sports Reporter",
            "ref": "The sprinter broke the world record in the one hundred meter final with an explosive start and remarkable acceleration."
        }
    ]

    import wave
    import math
    import struct

    for item in demo_data:
        filename = f"demo_{uuid.uuid4().hex[:8]}.wav"
        file_path = os.path.join(AUDIO_DIR, filename)
        
        sample_rate = 16000
        duration = 4.0
        n_samples = int(sample_rate * duration)
        
        with wave.open(file_path, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            
            freq1 = 220.0
            freq2 = 440.0
            
            for i in range(n_samples):
                t = float(i) / sample_rate
                val = 0.3 * math.sin(2.0 * math.pi * freq1 * t) + 0.2 * math.sin(2.0 * math.pi * freq2 * t)
                
                if item["domain"] in ["News", "Sports"]:
                    noise = (hash(i) % 1000 - 500) / 2500.0
                    val += noise
                    
                val = max(-1.0, min(1.0, val))
                sample_int = int(val * 32767.0)
                data = struct.pack('<h', sample_int)
                wav_file.writeframesraw(data)

        # Run automatic analysis
        auto_analysis = analyze_speech_sample(file_path, item["ref"])
        pred_style = auto_analysis["speaking_style"]["predicted"]
        pred_quality = auto_analysis["audio_quality"]["predicted"]
        auto_analysis["domain_classification"]["predicted"] = item["domain"]
        analysis_json = json.dumps(auto_analysis)

        sample_id = create_sample(
            experiment_id=exp_id,
            sample_name=item["name"],
            audio_filename=filename,
            original_filename=f"{item['name']}.wav",
            speaker_category=item["speaker"],
            speaking_condition=pred_style,
            speech_quality=pred_quality,
            domain_class=item["domain"],
            predicted_speaking_style=pred_style,
            predicted_speech_quality=pred_quality,
            predicted_domain=item["domain"],
            analysis_json=analysis_json,
            actual_domain_class=item["domain"],
            reference_transcript=item["ref"],
            duration_seconds=duration
        )

        # Run transcription on TS1 for quick demo
        run_transcription_pipeline(sample_id, model_id="ts1")

    return {"message": "Multi-class demo dataset loaded successfully", "experiment_id": exp_id}
