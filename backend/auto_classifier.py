import os
import re
import math
import string
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import soundfile as sf
import librosa

# ==========================================
# 1. AUDIO QUALITY & NOISE ESTIMATOR
# ==========================================

def analyze_audio_quality(wav_path: str) -> Dict[str, Any]:
    """
    Analyzes physical acoustic properties of a 16kHz mono WAV file:
    - Root Mean Square (RMS) signal energy
    - Estimated noise floor energy (from quietest 15% frames / silent intervals)
    - Estimated Signal-to-Noise Ratio (SNR) in dB
    - Zero Crossing Rate (ZCR) for spectral roughness / high-frequency noise
    - Spectral flatness / silence ratio

    Returns:
    - speech_quality: 'Clear' or 'Background noise'
    - quality_score: 0 - 100
    - snr_db: float
    - reason: explainable diagnostic
    """
    try:
        y, sr = sf.read(wav_path, dtype="float32")
        if sr != 16000:
            y = librosa.resample(y, orig_sr=sr, target_sr=16000)
        if y.ndim > 1:
            y = y.mean(axis=1)

        total_samples = len(y)
        if total_samples == 0:
            return {
                "speech_quality": "Not confidently detected",
                "quality_score": 0.0,
                "snr_db": 0.0,
                "reason": "Audio file contains zero audio samples."
            }

        # Frame-level RMS energy (frame size = 25ms = 400 samples, hop = 10ms = 160 samples)
        frame_len = 400
        hop_len = 160
        frames = librosa.util.frame(y, frame_length=frame_len, hop_length=hop_len)
        frame_rms = np.sqrt(np.mean(frames**2, axis=0) + 1e-12)

        # Zero Crossing Rate
        zcr = librosa.feature.zero_crossing_rate(y, frame_length=frame_len, hop_length=hop_len)[0]
        mean_zcr = float(np.mean(zcr))

        # Overall RMS
        overall_rms = float(np.sqrt(np.mean(y**2) + 1e-12))
        overall_rms_db = 20 * math.log10(max(overall_rms, 1e-6))

        # Noise floor estimation: bottom 15th percentile of frame energies
        sorted_rms = np.sort(frame_rms)
        noise_cutoff_idx = max(1, int(0.15 * len(sorted_rms)))
        noise_floor_rms = float(np.mean(sorted_rms[:noise_cutoff_idx]))
        
        # Signal energy: top 60th percentile (active speech frames)
        signal_cutoff_idx = int(0.40 * len(sorted_rms))
        signal_rms = float(np.mean(sorted_rms[signal_cutoff_idx:]))

        # Estimated SNR (in dB)
        snr_ratio = (signal_rms + 1e-9) / (noise_floor_rms + 1e-9)
        snr_db = round(float(20 * math.log10(max(snr_ratio, 1.0))), 2)

        # Spectral flatness (measure of white noise vs tonal speech)
        spectral_flatness = float(np.mean(librosa.feature.spectral_flatness(y=y)))

        # Quality Classification Logic
        if snr_db >= 17.0 and spectral_flatness < 0.18:
            speech_quality = "Clear"
            quality_score = min(100.0, round(50.0 + (snr_db - 17.0) * 2.5, 1))
            reason = f"High signal-to-noise ratio ({snr_db:.1f} dB SNR) with low background noise floor."
        elif snr_db >= 12.0:
            speech_quality = "Clear"
            quality_score = round(60.0 + (snr_db - 12.0) * 3.0, 1)
            reason = f"Moderate SNR ({snr_db:.1f} dB) with intelligible speech and mild ambient level."
        else:
            speech_quality = "Background noise"
            quality_score = max(10.0, round(snr_db * 4.0, 1))
            reason = f"Elevated noise floor / low SNR ({snr_db:.1f} dB) and acoustic interference."

        return {
            "speech_quality": speech_quality,
            "quality_score": quality_score,
            "snr_db": snr_db,
            "reason": reason,
            "metrics": {
                "rms_db": round(overall_rms_db, 1),
                "noise_floor_rms": round(noise_floor_rms, 5),
                "mean_zcr": round(mean_zcr, 4),
                "spectral_flatness": round(spectral_flatness, 4)
            }
        }
    except Exception as e:
        return {
            "speech_quality": "Not confidently detected",
            "quality_score": 50.0,
            "snr_db": 0.0,
            "reason": f"Acoustic analysis failed: {str(e)}",
            "metrics": {}
        }


# ==========================================
# 2. SPEAKING STYLE CLASSIFIER (FORMAL vs INFORMAL)
# ==========================================

INFORMAL_CONTRACTIONS = {
    "don't", "can't", "won't", "i'm", "you're", "he's", "she's", "it's", "we're", "they're",
    "i've", "you've", "we've", "they've", "i'd", "you'd", "we'd", "they'd", "i'll", "you'll",
    "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't", "doesn't", "didn't",
    "gonna", "wanna", "gotta", "kinda", "sorta", "dunno", "lemme", "gimme", "ain't", "y'all"
}

INFORMAL_FILLERS_AND_SLANG = {
    "um", "uh", "er", "ah", "like", "you know", "i mean", "literally", "basically", "honestly",
    "actually", "yeah", "yep", "nope", "cool", "dude", "guy", "guys", "stuff", "thing", "things",
    "gosh", "wow", "okay", "ok", "hey", "hi", "bye", "kinda", "sorta", "awesome", "bucks",
    "sweet", "super", "crazy", "totally", "anyways", "so yeah", "lol"
}

FORMAL_LEXICON = {
    "furthermore", "therefore", "consequently", "specifically", "subsequently", "nevertheless",
    "notwithstanding", "moreover", "demonstrates", "indicates", "comprehend", "precision",
    "methodology", "objective", "implementation", "parameters", "significant", "preliminary",
    "established", "comprehensive", "computational", "architectural", "substantial", "investigation",
    "fundamental", "statistical", "empirical", "synthesize", "evaluation", "paradigm",
    "accordance", "pursuant", "legislation", "representative", "administration", "clinical",
    "therapeutic", "physiological", "pathology", "diagnosis", "academic", "institution",
    "constitutes", "facilitates", "derived", "disposition", "proceedings", "distinguished"
}

def analyze_speaking_style(text: str) -> Dict[str, Any]:
    if not text or len(text.strip()) == 0:
        return {
            "predicted_style": "Not confidently detected",
            "formality_score": 50.0,
            "confidence": 0.0,
            "reason": "Transcript is empty or insufficient for linguistic analysis.",
            "evidence": []
        }

    raw_text = text.lower()
    words = re.findall(r"\b[a-z']+\b", raw_text)
    total_words = len(words)

    if total_words < 4:
        return {
            "predicted_style": "Not confidently detected",
            "formality_score": 50.0,
            "confidence": 0.2,
            "reason": "Text sample too brief (< 4 words) for confident stylistic classification.",
            "evidence": ["Sample contains fewer than 4 tokens."]
        }

    detected_contractions = [w for w in words if w in INFORMAL_CONTRACTIONS or "'" in w]
    contraction_density = len(detected_contractions) / max(total_words, 1)

    detected_fillers = []
    for filler in INFORMAL_FILLERS_AND_SLANG:
        if " " in filler:
            if filler in raw_text:
                detected_fillers.append(filler)
        else:
            if filler in words:
                detected_fillers.append(filler)
    filler_density = len(detected_fillers) / max(total_words, 1)

    detected_formal_words = [w for w in words if w in FORMAL_LEXICON]
    formal_density = len(detected_formal_words) / max(total_words, 1)

    avg_word_len = sum(len(w.replace("'", "")) for w in words) / max(total_words, 1)
    sentences = [s for s in re.split(r"[.!?]+", text) if s.strip()]
    avg_sentence_len = total_words / max(len(sentences), 1)

    base_score = 50.0
    score_delta = (
        (formal_density * 180.0)
        - (contraction_density * 140.0)
        - (filler_density * 120.0)
        + ((avg_word_len - 4.5) * 12.0)
        + (min(avg_sentence_len, 25.0) - 10.0) * 1.2
    )
    formality_score = max(5.0, min(95.0, round(base_score + score_delta, 1)))

    evidence = []
    if detected_formal_words:
        evidence.append(f"Formal vocabulary: {', '.join(detected_formal_words[:4])}")
    if detected_contractions:
        evidence.append(f"Contractions: {', '.join(detected_contractions[:4])}")
    if detected_fillers:
        evidence.append(f"Informal markers/fillers: {', '.join(detected_fillers[:4])}")
    if avg_sentence_len >= 14:
        evidence.append(f"Complex syntactic structure (avg {avg_sentence_len:.1f} words/sentence)")
    elif avg_sentence_len < 7:
        evidence.append(f"Short colloquial phrases (avg {avg_sentence_len:.1f} words/sentence)")

    if formality_score >= 54.0:
        predicted_style = "Formal"
        confidence = round(min(0.95, 0.60 + (formality_score - 54.0) / 100.0), 2)
        reason = f"Formal register characterized by structured syntax (score: {formality_score}/100)."
    else:
        predicted_style = "Informal"
        confidence = round(min(0.95, 0.60 + (54.0 - formality_score) / 100.0), 2)
        reason = f"Conversational tone with casual markers or contractions (score: {formality_score}/100)."

    return {
        "predicted_style": predicted_style,
        "formality_score": formality_score,
        "confidence": confidence,
        "reason": reason,
        "evidence": evidence,
        "features": {
            "contractions_count": len(detected_contractions),
            "fillers_count": len(detected_fillers),
            "formal_words_count": len(detected_formal_words),
            "avg_word_len": round(avg_word_len, 2),
            "avg_sentence_len": round(avg_sentence_len, 1)
        }
    }


# ==========================================
# 3. HIERARCHICAL DOMAIN & CONTENT CLASSIFIER
# ==========================================

HIERARCHICAL_DOMAINS = {
    "EDUCATIONAL": {
        "Educational": [
            "education", "educational", "learning", "teach", "teaching", "student", "students",
            "teacher", "teachers", "pedagogy", "curriculum", "school", "academic", "concept", "knowledge",
            "study", "principles", "lesson", "fundamentals"
        ],
        "Science & Technology": [
            "science", "scientific", "dna", "mrna", "rna", "transcription", "biology", "biological",
            "cell", "cells", "nucleus", "molecule", "molecular", "gene", "genes", "genetics",
            "protein", "proteins", "synthesize", "synthesis", "enzyme", "enzymes", "chemistry",
            "physics", "chemical", "quantum", "laboratory", "organism", "photosynthesis",
            "biochemistry", "polymerase", "amino acid", "nucleotide", "chromosome", "ribosome",
            "cellular", "membrane", "genome", "biotechnology", "evolution", "hypothesis"
        ],
        "Mathematics": [
            "mathematics", "math", "algebra", "calculus", "geometry", "theorem", "theorems",
            "equation", "equations", "formula", "derivative", "integral", "matrix", "matrices",
            "arithmetic", "probability", "statistics", "vector", "vectors", "polynomial", "logarithm"
        ],
        "History": [
            "history", "historical", "ancient", "century", "war", "civilization", "civilizations",
            "empire", "dynasty", "revolution", "monarchy", "archaeological", "medieval", "president",
            "treaty", "historical event", "colonial", "monument", "artifacts"
        ],
        "Geography": [
            "geography", "geographic", "continent", "ocean", "mountains", "latitude", "longitude",
            "climate", "topography", "tectonic", "river", "ecosystem", "volcano", "equator", "glacier"
        ],
        "Languages": [
            "language", "languages", "grammar", "vocabulary", "syntax", "linguistics", "pronunciation",
            "accent", "translation", "phrases", "fluency", "phonetics", "dialect", "idiom"
        ],
        "Tutorials / How-to": [
            "how to", "step by step", "tutorial", "instructions", "guide", "walkthrough", "learn how",
            "demonstration", "tips and tricks", "beginner guide", "how-to"
        ],
        "Lectures": [
            "lecture", "lectures", "professor", "professors", "university", "faculty", "syllabus",
            "semester", "coursework", "classroom lecture", "department", "seminar"
        ],
        "Exam Preparation": [
            "exam", "exams", "test prep", "revision", "examination", "practice questions", "quiz",
            "past papers", "score", "grade", "test preparation", "mock exam"
        ]
    },
    "ENTERTAINMENT": {
        "Movies & Short Films": [
            "movie", "film", "cinema", "actor", "actress", "scene", "director", "hollywood",
            "trailer", "plot", "character", "screenplay", "cinematography"
        ],
        "Comedy": ["comedy", "funny", "laugh", "humor", "hilarious", "joke", "jokes", "comedian", "comic"],
        "Sketches": ["sketch", "skit", "acting", "parody", "satire", "sketch comedy"],
        "Memes": ["meme", "memes", "viral", "internet culture", "trending", "tiktok"],
        "Challenges": ["challenge", "try not to", "24 hours", "experiment challenge", "dare"],
        "Pranks": ["prank", "pranking", "hidden camera", "gotcha", "pranksters"],
        "Reactions": ["reaction", "reacting to", "first time watching", "reacts", "viewer reaction"],
        "Stand-up Comedy": ["stand-up", "stand up comedy", "punchline", "open mic", "crowd work"]
    },
    "GAMING": {
        "Gameplay": ["gameplay", "playing", "level", "boss", "controller", "quest", "mission", "ps5", "xbox"],
        "Walkthrough": ["walkthrough", "playthrough", "100% complete", "guide walkthrough", "secrets", "easter eggs"],
        "Game Reviews": ["game review", "rating", "graphics", "gameplay mechanics", "ign review", "metacritic"],
        "Esports": ["esports", "tournament", "pro player", "championship", "counter-strike", "valorant", "league of legends"],
        "Game Tutorials": ["game tutorial", "best loadout", "strategy", "meta", "build guide", "combo"],
        "Gaming Livestreams": ["livestream", "streamer", "twitch", "donation", "chat", "live gaming"]
    },
    "NEWS & INFORMATION": {
        "Current Affairs": ["current affairs", "breaking news", "headline", "report", "anchor", "investigative report", "bulletin"],
        "Politics": ["politics", "political", "government", "parliament", "congress", "senate", "minister", "election", "democracy", "legislation", "policy"],
        "Geopolitics": ["geopolitics", "international relations", "foreign policy", "diplomacy", "treaty", "sanctions", "united nations", "global conflict"],
        "Business News": ["business", "stock market", "economy", "inflation", "gdp", "finance", "wall street", "investors", "revenue", "quarterly earnings"],
        "Technology News": ["tech news", "silicon valley", "announcement", "launch event", "product release", "keynote"],
        "Sports News": ["sports news", "transfer window", "injury report", "match preview", "standings", "press conference"],
        "Documentaries": ["documentary", "investigative", "in-depth look", "archive footage", "narration", "chronicle"]
    },
    "MUSIC": {
        "Official Music Videos": ["music video", "official video", "single", "album", "vevo", "soundtrack"],
        "Lyrics Videos": ["lyrics", "sing along", "lyric video", "track", "verse", "chorus"],
        "Live Performances": ["live performance", "acoustic live", "unplugged", "stage performance"],
        "Covers": ["cover", "song cover", "acoustic cover", "rendition", "instrumental cover"],
        "Remixes": ["remix", "dj", "club mix", "beat", "edm", "drop", "bass boost"],
        "Concerts": ["concert", "tour", "festival", "stadium show", "crowd singing", "arena"],
        "Music Tutorials": ["music tutorial", "guitar lesson", "piano chords", "vocal training", "sheet music", "tabs"]
    },
    "TECHNOLOGY": {
        "Product Reviews": ["unboxing", "review", "specs", "pros and cons", "hands on", "worth buying", "benchmark"],
        "Programming": ["programming", "code", "coding", "python", "javascript", "developer", "syntax", "compiler", "debugging", "github", "software engineering"],
        "AI/ML": ["artificial intelligence", "machine learning", "neural network", "deep learning", "llm", "transformer", "nlp", "computer vision", "gpt", "model training"],
        "Software Tutorials": ["software tutorial", "install guide", "setup", "configuration", "how to code", "api tutorial"],
        "Gadgets": ["gadget", "smartphone", "smartwatch", "laptop", "processor", "chipset", "oled", "hardware review"],
        "Coding Projects": ["full stack", "building an app", "project from scratch", "backend api", "web development"],
        "Tech News": ["tech update", "semiconductor", "apple keynote", "ces", "tech trends", "innovation"]
    },
    "LIFESTYLE": {
        "Fitness": ["workout", "fitness", "gym", "exercise", "weight loss", "muscle", "cardio", "nutrition", "bodybuilding"],
        "Cooking": ["recipe", "cooking", "kitchen", "bake", "ingredient", "delicious", "chef", "food preparation", "dish"],
        "Travel": ["travel", "vlog", "trip", "destination", "explore", "flight", "hotel", "backpacking", "vacation"],
        "Fashion": ["fashion", "outfit", "style", "wardrobe", "haul", "trends", "clothing"],
        "Beauty": ["makeup", "skincare", "cosmetics", "haircare", "routine", "lipstick", "glow"],
        "Vlogs": ["day in the life", "vlog", "routine", "weekly vlog", "casual chat", "morning routine"],
        "Personal Development": ["self improvement", "mindset", "habits", "motivation", "success", "discipline", "mindfulness"],
        "Productivity": ["productivity", "time management", "focus", "notion", "study routine", "habits"]
    },
    "SPORTS": {
        "Match Highlights": ["highlights", "goals", "best moments", "recap", "all goals", "match highlights"],
        "Full Matches": ["full match", "replay", "extended match", "first half", "second half"],
        "Analysis": ["tactical analysis", "match review", "breakdown", "statistics", "formation", "tactics"],
        "Interviews": ["post-match interview", "press conference", "athlete interview"],
        "Training": ["drills", "skills training", "athletic training", "practice session"],
        "Commentary": ["commentary", "match commentary", "pundits", "discussion"],
        "Sports Documentaries": ["sports history", "athlete story", "championship documentary"]
    },
    "DOCUMENTARY / STORYTELLING": {
        "Science Documentaries": ["cosmos", "universe", "evolution", "space exploration", "documentary science"],
        "Historical Documentaries": ["ancient world", "world war", "historical archive", "untold history"],
        "Crime Documentaries": ["true crime", "investigation", "mystery", "case file", "detective"],
        "Biographies": ["biography", "life story", "documentary portrait", "rise to fame"],
        "Investigative Videos": ["exposed", "deep dive investigation", "journalism", "uncovering"],
        "Nature/Wildlife": ["nature", "wildlife", "safari", "rainforest", "ocean life", "national geographic"],
        "Fictional Storytelling": ["storytime", "narrative", "audio drama", "short story", "tale"]
    }
}

def classify_domain(text: str) -> Dict[str, Any]:
    """
    Classifies transcript text into hierarchical categories & subcategories.
    Calculates normalized, explainable class probabilities and confidence scores (0-100%).
    Returns:
    - predicted_domain: Primary Parent Domain (e.g. 'EDUCATIONAL')
    - predicted_class: Primary Specific Class (e.g. 'Science & Technology')
    - confidence: float (0.0 - 1.0)
    - percentage: float (0.0 - 100.0)
    - matched_keywords: List of matched terms
    - top_predictions: Top 5 predictions ranked by confidence
    """
    if not text or len(text.strip()) == 0:
        return {
            "predicted_domain": "EDUCATIONAL",
            "predicted_class": "Educational",
            "confidence": 0.50,
            "percentage": 50.0,
            "matched_keywords": [],
            "top_predictions": [
                {"category": "Educational", "parent_domain": "EDUCATIONAL", "confidence": 0.50, "percentage": 50.0},
                {"category": "Science & Technology", "parent_domain": "EDUCATIONAL", "confidence": 0.30, "percentage": 30.0},
                {"category": "Tutorials / How-to", "parent_domain": "EDUCATIONAL", "confidence": 0.20, "percentage": 20.0}
            ],
            "domain_scores": {}
        }

    raw_text = text.lower()
    words = set(re.findall(r"\b[a-z']+\b", raw_text))

    class_scores: Dict[str, float] = {}
    class_parents: Dict[str, str] = {}
    class_matches: Dict[str, List[str]] = {}

    for parent_domain, subcategories in HIERARCHICAL_DOMAINS.items():
        for subcat, vocab in subcategories.items():
            score = 0.0
            matches = []
            for term in vocab:
                if " " in term:
                    if term in raw_text:
                        score += 3.0  # Higher weight for exact multi-word phrases
                        matches.append(term)
                else:
                    if term in words:
                        score += 1.5  # Standard single-word domain token weight
                        matches.append(term)
            
            class_scores[subcat] = score
            class_parents[subcat] = parent_domain
            class_matches[subcat] = matches

    # Sort all subcategories by raw match score
    sorted_classes = sorted(class_scores.items(), key=lambda x: x[1], reverse=True)
    top_subcat, top_raw_score = sorted_classes[0]

    # Calculate calibrated confidence percentages across top classes
    # If top score is strong (e.g. >= 4.0), primary class gets high confidence (75%-95%)
    top_predictions = []
    
    if top_raw_score > 0:
        # Base calibrated confidence for top candidate
        primary_conf = min(0.95, max(0.65, 0.55 + (top_raw_score * 0.08)))
        
        # Build relative top predictions with natural calibrated percentages
        top_candidates = [c for c in sorted_classes if c[1] > 0][:5]
        
        # If fewer than 3 positive matches, add top parent subcategories with baseline distribution
        if len(top_candidates) < 3:
            parent = class_parents[top_subcat]
            other_subcats = [s for s in HIERARCHICAL_DOMAINS[parent].keys() if s != top_subcat][:3 - len(top_candidates)]
            for s in other_subcats:
                top_candidates.append((s, top_raw_score * 0.35))

        for idx, (subcat, raw_sc) in enumerate(top_candidates):
            ratio = raw_sc / (top_raw_score + 1e-9)
            if idx == 0:
                conf = primary_conf
            else:
                conf = round(max(0.05, min(0.90, primary_conf * ratio * 0.88)), 2)
            
            top_predictions.append({
                "category": subcat,
                "parent_domain": class_parents.get(subcat, "EDUCATIONAL"),
                "confidence": conf,
                "percentage": round(conf * 100.0, 1),
                "matched_keywords": class_matches.get(subcat, [])
            })
    else:
        # Default baseline if no specific domain terms exist in generic casual chat
        top_subcat = "Educational"
        top_predictions = [
            {"category": "Educational", "parent_domain": "EDUCATIONAL", "confidence": 0.50, "percentage": 50.0, "matched_keywords": []},
            {"category": "Science & Technology", "parent_domain": "EDUCATIONAL", "confidence": 0.30, "percentage": 30.0, "matched_keywords": []},
            {"category": "Vlogs", "parent_domain": "LIFESTYLE", "confidence": 0.25, "percentage": 25.0, "matched_keywords": []}
        ]

    primary_prediction = top_predictions[0]
    matched_kws = class_matches.get(primary_prediction["category"], [])

    return {
        "predicted_domain": primary_prediction["parent_domain"],
        "predicted_class": primary_prediction["category"],
        "confidence": primary_prediction["confidence"],
        "percentage": primary_prediction["percentage"],
        "matched_keywords": matched_kws[:8],
        "top_predictions": top_predictions,
        "domain_scores": {k: round(v, 2) for k, v in class_scores.items() if v > 0}
    }


# ==========================================
# 4. UNIFIED SPEECH SAMPLE ANALYZER
# ==========================================

def analyze_speech_sample(wav_path: Optional[str], transcript: str) -> Dict[str, Any]:
    """
    Executes full automatic analysis:
    1. Audio quality (Clear vs Background noise) from physical WAV acoustics
    2. Speaking style (Formal vs Informal) from lexical & syntactic features
    3. Domain/Content Classification (Hierarchical Domains & Subcategories with confidence %)
    """
    if wav_path and os.path.exists(wav_path):
        audio_quality_res = analyze_audio_quality(wav_path)
    else:
        audio_quality_res = {
            "speech_quality": "Not confidently detected",
            "quality_score": 50.0,
            "snr_db": 0.0,
            "reason": "WAV audio file not accessible."
        }

    style_res = analyze_speaking_style(transcript)
    domain_res = classify_domain(transcript)

    return {
        "speaking_style": {
            "predicted": style_res["predicted_style"],
            "score": style_res["formality_score"],
            "confidence": style_res["confidence"],
            "reason": style_res["reason"],
            "evidence": style_res["evidence"],
            "features": style_res.get("features", {})
        },
        "audio_quality": {
            "predicted": audio_quality_res["speech_quality"],
            "quality_score": audio_quality_res["quality_score"],
            "snr_db": audio_quality_res["snr_db"],
            "reason": audio_quality_res["reason"],
            "metrics": audio_quality_res.get("metrics", {})
        },
        "domain_classification": {
            "predicted": domain_res["predicted_domain"],
            "predicted_class": domain_res["predicted_class"],
            "confidence": domain_res["confidence"],
            "percentage": domain_res["percentage"],
            "matched_keywords": domain_res["matched_keywords"],
            "top_predictions": domain_res["top_predictions"],
            "domain_scores": domain_res["domain_scores"]
        }
    }
