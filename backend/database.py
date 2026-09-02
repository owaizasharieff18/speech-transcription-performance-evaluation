import sqlite3
import os
import json
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "benchmark_nlp.db"))

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable foreign keys
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.executescript("""
    CREATE TABLE IF NOT EXISTS experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER NOT NULL,
        sample_name TEXT NOT NULL,
        audio_filename TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        duration_seconds REAL DEFAULT 0.0,
        speaker_category TEXT NOT NULL DEFAULT 'General',
        speaking_condition TEXT NOT NULL DEFAULT 'Formal',
        speech_quality TEXT NOT NULL DEFAULT 'Clear',
        domain_class TEXT NOT NULL DEFAULT 'General Conversation',
        predicted_speaking_style TEXT DEFAULT 'Formal',
        predicted_speech_quality TEXT DEFAULT 'Clear',
        predicted_domain TEXT DEFAULT 'General Conversation',
        analysis_json TEXT DEFAULT '{}',
        actual_speaking_condition TEXT,
        actual_speech_quality TEXT,
        actual_domain_class TEXT,
        reference_transcript TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (experiment_id) REFERENCES experiments (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sample_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        raw_transcript TEXT NOT NULL,
        normalized_transcript TEXT NOT NULL,
        processing_time_sec REAL DEFAULT 0.0,
        error_message TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (sample_id) REFERENCES samples (id) ON DELETE CASCADE,
        UNIQUE(sample_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transcription_id INTEGER NOT NULL,
        sample_id INTEGER NOT NULL,
        model_id TEXT NOT NULL,
        wer REAL NOT NULL,
        cer REAL NOT NULL,
        bleu REAL NOT NULL,
        bleu1 REAL NOT NULL,
        bleu2 REAL NOT NULL,
        bleu4 REAL NOT NULL,
        rouge1_f1 REAL NOT NULL,
        rouge2_f1 REAL NOT NULL,
        rougeL_f1 REAL NOT NULL,
        meteor REAL NOT NULL,
        accuracy_pct REAL NOT NULL,
        composite_score REAL NOT NULL,
        diff_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (transcription_id) REFERENCES transcriptions (id) ON DELETE CASCADE,
        FOREIGN KEY (sample_id) REFERENCES samples (id) ON DELETE CASCADE,
        UNIQUE(sample_id, model_id)
    );
    """)
    conn.commit()

    # Migration check for existing SQLite schema
    cursor.execute("PRAGMA table_info(samples)")
    cols = [r["name"] for r in cursor.fetchall()]
    new_cols = [
        ("predicted_speaking_style", "TEXT DEFAULT 'Formal'"),
        ("predicted_speech_quality", "TEXT DEFAULT 'Clear'"),
        ("predicted_domain", "TEXT DEFAULT 'General Conversation'"),
        ("analysis_json", "TEXT DEFAULT '{}'"),
        ("actual_speaking_condition", "TEXT"),
        ("actual_speech_quality", "TEXT"),
        ("actual_domain_class", "TEXT")
    ]
    for col_name, col_type in new_cols:
        if col_name not in cols:
            try:
                cursor.execute(f"ALTER TABLE samples ADD COLUMN {col_name} {col_type};")
                conn.commit()
            except Exception as e:
                print(f"Column migration warning ({col_name}): {e}")

    conn.close()

# --- Experiment CRUD ---

def create_experiment(title: str, description: str = "") -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute(
        "INSERT INTO experiments (title, description, created_at) VALUES (?, ?, ?)",
        (title, description, now)
    )
    conn.commit()
    exp_id = cursor.lastrowid
    conn.close()
    return exp_id

def get_experiments() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT e.*, 
               COUNT(DISTINCT s.id) as sample_count,
               COUNT(DISTINCT ev.id) as eval_count
        FROM experiments e
        LEFT JOIN samples s ON s.experiment_id = e.id
        LEFT JOIN evaluations ev ON ev.sample_id = s.id
        GROUP BY e.id
        ORDER BY e.id DESC
    """)
    rows = cursor.fetchall()
    result = [dict(row) for row in rows]
    conn.close()
    return result

def _format_sample_row(s_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Helper to parse JSON fields for sample dict."""
    if s_dict.get("analysis_json"):
        try:
            s_dict["analysis_details"] = json.loads(s_dict["analysis_json"])
        except Exception:
            s_dict["analysis_details"] = {}
    else:
        s_dict["analysis_details"] = {}
    return s_dict

def get_experiment_by_id(exp_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM experiments WHERE id = ?", (exp_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
    
    exp = dict(row)
    # Fetch samples
    cursor.execute("SELECT * FROM samples WHERE experiment_id = ? ORDER BY id ASC", (exp_id,))
    sample_rows = cursor.fetchall()
    samples = []
    
    for s_row in sample_rows:
        s_dict = _format_sample_row(dict(s_row))
        s_id = s_dict["id"]
        # Fetch transcriptions and evaluations for this sample
        cursor.execute("SELECT * FROM transcriptions WHERE sample_id = ?", (s_id,))
        t_rows = cursor.fetchall()
        s_dict["transcriptions"] = {r["model_id"]: dict(r) for r in t_rows}
        
        cursor.execute("SELECT * FROM evaluations WHERE sample_id = ?", (s_id,))
        e_rows = cursor.fetchall()
        evals = {}
        for r in e_rows:
            d = dict(r)
            if d.get("diff_json"):
                try:
                    d["diff"] = json.loads(d["diff_json"])
                except Exception:
                    d["diff"] = []
            evals[d["model_id"]] = d
        s_dict["evaluations"] = evals
        samples.append(s_dict)
        
    exp["samples"] = samples
    conn.close()
    return exp

def delete_experiment(exp_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    # Also fetch audio files to clean up from disk
    cursor.execute("SELECT audio_filename FROM samples WHERE experiment_id = ?", (exp_id,))
    audio_files = [r["audio_filename"] for r in cursor.fetchall()]
    
    cursor.execute("DELETE FROM experiments WHERE id = ?", (exp_id,))
    conn.commit()
    conn.close()
    
    # Remove files
    audio_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "audio"))
    for f in audio_files:
        try:
            f_path = os.path.join(audio_dir, f)
            if os.path.exists(f_path):
                os.remove(f_path)
        except Exception:
            pass
            
    return True

# --- Sample CRUD ---

def create_sample(
    experiment_id: int,
    sample_name: str,
    audio_filename: str,
    original_filename: str,
    speaker_category: str = "General",
    speaking_condition: str = "Formal",
    speech_quality: str = "Clear",
    domain_class: str = "General Conversation",
    predicted_speaking_style: str = "Formal",
    predicted_speech_quality: str = "Clear",
    predicted_domain: str = "General Conversation",
    analysis_json: str = "{}",
    actual_speaking_condition: Optional[str] = None,
    actual_speech_quality: Optional[str] = None,
    actual_domain_class: Optional[str] = None,
    reference_transcript: str = "",
    duration_seconds: float = 0.0
) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    cursor.execute("""
        INSERT INTO samples (
            experiment_id, sample_name, audio_filename, original_filename,
            duration_seconds, speaker_category, speaking_condition, speech_quality,
            domain_class, predicted_speaking_style, predicted_speech_quality,
            predicted_domain, analysis_json, actual_speaking_condition,
            actual_speech_quality, actual_domain_class, reference_transcript, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        experiment_id, sample_name, audio_filename, original_filename,
        duration_seconds, speaker_category, speaking_condition, speech_quality,
        domain_class, predicted_speaking_style, predicted_speech_quality,
        predicted_domain, analysis_json, actual_speaking_condition,
        actual_speech_quality, actual_domain_class, reference_transcript, now
    ))
    conn.commit()
    sample_id = cursor.lastrowid
    conn.close()
    return sample_id

def update_sample_analysis(
    sample_id: int,
    predicted_speaking_style: str,
    predicted_speech_quality: str,
    predicted_domain: str,
    analysis_json: str
) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE samples
        SET predicted_speaking_style = ?,
            predicted_speech_quality = ?,
            predicted_domain = ?,
            analysis_json = ?
        WHERE id = ?
    """, (
        predicted_speaking_style,
        predicted_speech_quality,
        predicted_domain,
        analysis_json,
        sample_id
    ))
    conn.commit()
    conn.close()
    return True

def get_sample_by_id(sample_id: int) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM samples WHERE id = ?", (sample_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return None
        
    s_dict = _format_sample_row(dict(row))
    
    # Fetch transcriptions and evaluations
    cursor.execute("SELECT * FROM transcriptions WHERE sample_id = ?", (sample_id,))
    t_rows = cursor.fetchall()
    s_dict["transcriptions"] = {r["model_id"]: dict(r) for r in t_rows}
    
    cursor.execute("SELECT * FROM evaluations WHERE sample_id = ?", (sample_id,))
    e_rows = cursor.fetchall()
    evals = {}
    for r in e_rows:
        d = dict(r)
        if d.get("diff_json"):
            try:
                d["diff"] = json.loads(d["diff_json"])
            except Exception:
                d["diff"] = []
        evals[d["model_id"]] = d
    s_dict["evaluations"] = evals
    
    conn.close()
    return s_dict

def delete_sample(sample_id: int) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT audio_filename FROM samples WHERE id = ?", (sample_id,))
    row = cursor.fetchone()
    
    cursor.execute("DELETE FROM samples WHERE id = ?", (sample_id,))
    conn.commit()
    conn.close()
    
    if row and row["audio_filename"]:
        audio_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "audio"))
        f_path = os.path.join(audio_dir, row["audio_filename"])
        try:
            if os.path.exists(f_path):
                os.remove(f_path)
        except Exception:
            pass
            
    return True

# --- Transcription CRUD ---

def save_transcription(
    sample_id: int,
    model_id: str,
    model_name: str,
    raw_transcript: str,
    normalized_transcript: str,
    processing_time_sec: float = 0.0,
    error_message: Optional[str] = None
) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT INTO transcriptions (
            sample_id, model_id, model_name, raw_transcript,
            normalized_transcript, processing_time_sec, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sample_id, model_id) DO UPDATE SET
            model_name=excluded.model_name,
            raw_transcript=excluded.raw_transcript,
            normalized_transcript=excluded.normalized_transcript,
            processing_time_sec=excluded.processing_time_sec,
            error_message=excluded.error_message,
            created_at=excluded.created_at
    """, (
        sample_id, model_id, model_name, raw_transcript,
        normalized_transcript, processing_time_sec, error_message, now
    ))
    conn.commit()
    
    cursor.execute("SELECT id FROM transcriptions WHERE sample_id = ? AND model_id = ?", (sample_id, model_id))
    row = cursor.fetchone()
    t_id = row["id"] if row else 0
    conn.close()
    return t_id

# --- Evaluation CRUD ---

def save_evaluation(
    transcription_id: int,
    sample_id: int,
    model_id: str,
    eval_metrics: Dict[str, Any]
) -> int:
    conn = get_db_connection()
    cursor = conn.cursor()
    now = datetime.utcnow().isoformat()
    
    diff_json = json.dumps(eval_metrics.get("diff", []))
    
    cursor.execute("""
        INSERT INTO evaluations (
            transcription_id, sample_id, model_id, wer, cer,
            bleu, bleu1, bleu2, bleu4, rouge1_f1, rouge2_f1, rougeL_f1,
            meteor, accuracy_pct, composite_score, diff_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(sample_id, model_id) DO UPDATE SET
            transcription_id=excluded.transcription_id,
            wer=excluded.wer,
            cer=excluded.cer,
            bleu=excluded.bleu,
            bleu1=excluded.bleu1,
            bleu2=excluded.bleu2,
            bleu4=excluded.bleu4,
            rouge1_f1=excluded.rouge1_f1,
            rouge2_f1=excluded.rouge2_f1,
            rougeL_f1=excluded.rougeL_f1,
            meteor=excluded.meteor,
            accuracy_pct=excluded.accuracy_pct,
            composite_score=excluded.composite_score,
            diff_json=excluded.diff_json,
            created_at=excluded.created_at
    """, (
        transcription_id, sample_id, model_id,
        eval_metrics.get("wer", 1.0),
        eval_metrics.get("cer", 1.0),
        eval_metrics.get("bleu", 0.0),
        eval_metrics.get("bleu1", 0.0),
        eval_metrics.get("bleu2", 0.0),
        eval_metrics.get("bleu4", 0.0),
        eval_metrics.get("rouge1_f1", 0.0),
        eval_metrics.get("rouge2_f1", 0.0),
        eval_metrics.get("rougeL_f1", 0.0),
        eval_metrics.get("meteor", 0.0),
        eval_metrics.get("accuracy_pct", 0.0),
        eval_metrics.get("composite_score", 0.0),
        diff_json,
        now
    ))
    conn.commit()
    
    cursor.execute("SELECT id FROM evaluations WHERE sample_id = ? AND model_id = ?", (sample_id, model_id))
    row = cursor.fetchone()
    e_id = row["id"] if row else 0
    conn.close()
    return e_id

def get_all_evaluations() -> List[Dict[str, Any]]:
    """Returns all evaluations joined with sample and experiment metadata for aggregate analysis."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT 
            ev.*,
            s.sample_name,
            s.speaker_category,
            s.speaking_condition,
            s.speech_quality,
            s.domain_class,
            s.predicted_speaking_style,
            s.predicted_speech_quality,
            s.predicted_domain,
            s.actual_speaking_condition,
            s.actual_speech_quality,
            s.actual_domain_class,
            s.reference_transcript,
            s.duration_seconds,
            t.model_name,
            t.raw_transcript,
            t.normalized_transcript,
            t.processing_time_sec,
            e.title as experiment_title
        FROM evaluations ev
        JOIN samples s ON s.id = ev.sample_id
        JOIN transcriptions t ON t.id = ev.transcription_id
        JOIN experiments e ON e.id = s.experiment_id
        ORDER BY ev.id ASC
    """)
    rows = cursor.fetchall()
    evals = [dict(r) for r in rows]
    conn.close()
    return evals
