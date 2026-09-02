import re
import string
import difflib
from typing import Dict, Any, List, Tuple
import jiwer
from rouge_score import rouge_scorer
import nltk
from nltk.translate.bleu_score import sentence_bleu, SmoothingFunction
from nltk.translate.meteor_score import meteor_score

def _ensure_nltk_resources():
    try:
        nltk.data.find('corpora/wordnet')
    except LookupError:
        try:
            nltk.download('wordnet', quiet=True)
            nltk.download('punkt', quiet=True)
            nltk.download('omw-1.4', quiet=True)
        except Exception:
            pass

def normalize_text(text: str) -> str:
    """
    Standard text normalization for ASR benchmarking:
    - Lowercase
    - Remove punctuation (preserve apostrophes within words if needed, or strip standard punctuation)
    - Normalize whitespace
    - Remove unwanted control chars
    """
    if not text:
        return ""
    
    # Lowercase
    text = text.lower()
    
    # Replace hyphens/dashes with space
    text = re.sub(r'[-_]', ' ', text)
    
    # Remove punctuation
    text = text.translate(str.maketrans('', '', string.punctuation))
    
    # Collapse multiple whitespaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text

def calculate_word_error_rate(reference: str, hypothesis: str) -> float:
    """Calculate Word Error Rate (WER) using jiwer."""
    ref_norm = normalize_text(reference)
    hyp_norm = normalize_text(hypothesis)
    
    if not ref_norm and not hyp_norm:
        return 0.0
    if not ref_norm:
        return 1.0
    if not hyp_norm:
        return 1.0
        
    try:
        wer = jiwer.wer(ref_norm, hyp_norm)
        return round(float(wer), 4)
    except Exception:
        # Fallback using standard edit distance
        ref_words = ref_norm.split()
        hyp_words = hyp_norm.split()
        d = edit_distance(ref_words, hyp_words)
        return round(float(d / max(len(ref_words), 1)), 4)

def calculate_char_error_rate(reference: str, hypothesis: str) -> float:
    """Calculate Character Error Rate (CER) using jiwer."""
    ref_norm = normalize_text(reference)
    hyp_norm = normalize_text(hypothesis)
    
    if not ref_norm and not hyp_norm:
        return 0.0
    if not ref_norm:
        return 1.0
    if not hyp_norm:
        return 1.0
        
    try:
        cer = jiwer.cer(ref_norm, hyp_norm)
        return round(float(cer), 4)
    except Exception:
        ref_chars = list(ref_norm.replace(' ', ''))
        hyp_chars = list(hyp_norm.replace(' ', ''))
        d = edit_distance(ref_chars, hyp_chars)
        return round(float(d / max(len(ref_chars), 1)), 4)

def edit_distance(seq1: List[Any], seq2: List[Any]) -> int:
    """Standard Levenshtein distance."""
    m, n = len(seq1), len(seq2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
        
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if seq1[i - 1] == seq2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
                
    return dp[m][n]

def calculate_bleu_scores(reference: str, hypothesis: str) -> Dict[str, float]:
    """Calculate sentence BLEU scores (BLEU-1, BLEU-2, BLEU-4)."""
    ref_tokens = normalize_text(reference).split()
    hyp_tokens = normalize_text(hypothesis).split()
    
    if not ref_tokens or not hyp_tokens:
        return {"bleu1": 0.0, "bleu2": 0.0, "bleu4": 0.0, "bleu": 0.0}
        
    smooth = SmoothingFunction().method1
    
    try:
        bleu1 = sentence_bleu([ref_tokens], hyp_tokens, weights=(1.0, 0, 0, 0), smoothing_function=smooth)
        bleu2 = sentence_bleu([ref_tokens], hyp_tokens, weights=(0.5, 0.5, 0, 0), smoothing_function=smooth)
        bleu4 = sentence_bleu([ref_tokens], hyp_tokens, weights=(0.25, 0.25, 0.25, 0.25), smoothing_function=smooth)
        return {
            "bleu1": round(float(bleu1), 4),
            "bleu2": round(float(bleu2), 4),
            "bleu4": round(float(bleu4), 4),
            "bleu": round(float(bleu4), 4)
        }
    except Exception:
        return {"bleu1": 0.0, "bleu2": 0.0, "bleu4": 0.0, "bleu": 0.0}

def calculate_rouge_scores(reference: str, hypothesis: str) -> Dict[str, float]:
    """Calculate ROUGE-1, ROUGE-2, and ROUGE-L F1 scores."""
    ref_norm = normalize_text(reference)
    hyp_norm = normalize_text(hypothesis)
    
    if not ref_norm or not hyp_norm:
        return {
            "rouge1_f1": 0.0, "rouge1_precision": 0.0, "rouge1_recall": 0.0,
            "rouge2_f1": 0.0, "rouge2_precision": 0.0, "rouge2_recall": 0.0,
            "rougeL_f1": 0.0, "rougeL_precision": 0.0, "rougeL_recall": 0.0
        }
        
    try:
        scorer = rouge_scorer.RougeScorer(['rouge1', 'rouge2', 'rougeL'], use_stemmer=True)
        scores = scorer.score(ref_norm, hyp_norm)
        
        return {
            "rouge1_f1": round(float(scores['rouge1'].fmeasure), 4),
            "rouge1_precision": round(float(scores['rouge1'].precision), 4),
            "rouge1_recall": round(float(scores['rouge1'].recall), 4),
            "rouge2_f1": round(float(scores['rouge2'].fmeasure), 4),
            "rouge2_precision": round(float(scores['rouge2'].precision), 4),
            "rouge2_recall": round(float(scores['rouge2'].recall), 4),
            "rougeL_f1": round(float(scores['rougeL'].fmeasure), 4),
            "rougeL_precision": round(float(scores['rougeL'].precision), 4),
            "rougeL_recall": round(float(scores['rougeL'].recall), 4)
        }
    except Exception as e:
        print(f"Error computing ROUGE: {e}")
        return {
            "rouge1_f1": 0.0, "rouge1_precision": 0.0, "rouge1_recall": 0.0,
            "rouge2_f1": 0.0, "rouge2_precision": 0.0, "rouge2_recall": 0.0,
            "rougeL_f1": 0.0, "rougeL_precision": 0.0, "rougeL_recall": 0.0
        }

def calculate_meteor(reference: str, hypothesis: str) -> float:
    """Calculate METEOR score."""
    ref_tokens = normalize_text(reference).split()
    hyp_tokens = normalize_text(hypothesis).split()
    
    if not ref_tokens or not hyp_tokens:
        return 0.0
        
    try:
        score = meteor_score([ref_tokens], hyp_tokens)
        return round(float(score), 4)
    except Exception:
        # Fallback simple precision/recall token overlap
        ref_set = set(ref_tokens)
        hyp_set = set(hyp_tokens)
        overlap = len(ref_set.intersection(hyp_set))
        if not overlap:
            return 0.0
        p = overlap / len(hyp_set)
        r = overlap / len(ref_set)
        f = (10 * p * r) / (r + 9 * p) if (r + 9 * p) > 0 else 0.0
        return round(float(f), 4)

def generate_diff_tokens(reference: str, hypothesis: str) -> List[Dict[str, Any]]:
    """
    Generates word-level difference mapping between reference and hypothesis for UI diff rendering:
    Types: 'match', 'substitution', 'deletion' (in ref but missing in hyp), 'insertion' (in hyp but not in ref).
    """
    ref_words = reference.strip().split()
    hyp_words = hypothesis.strip().split()
    
    matcher = difflib.SequenceMatcher(None, [w.lower().strip(string.punctuation) for w in ref_words], 
                                            [w.lower().strip(string.punctuation) for w in hyp_words])
    diff_result = []
    
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            for w in hyp_words[j1:j2]:
                diff_result.append({"type": "match", "word": w, "ref_word": w})
        elif tag == 'replace':
            ref_sub = " ".join(ref_words[i1:i2])
            hyp_sub = " ".join(hyp_words[j1:j2])
            diff_result.append({"type": "substitution", "word": hyp_sub, "ref_word": ref_sub})
        elif tag == 'delete':
            ref_del = " ".join(ref_words[i1:i2])
            diff_result.append({"type": "deletion", "word": "", "ref_word": ref_del})
        elif tag == 'insert':
            hyp_ins = " ".join(hyp_words[j1:j2])
            diff_result.append({"type": "insertion", "word": hyp_ins, "ref_word": ""})
            
    return diff_result

def evaluate_transcript(reference: str, hypothesis: str) -> Dict[str, Any]:
    """
    Complete evaluation suite:
    - WER (Word Error Rate)
    - CER (Character Error Rate)
    - BLEU (1, 2, 4)
    - ROUGE (1, 2, L)
    - METEOR
    - Word diff tokens
    """
    wer = calculate_word_error_rate(reference, hypothesis)
    cer = calculate_char_error_rate(reference, hypothesis)
    bleu_data = calculate_bleu_scores(reference, hypothesis)
    rouge_data = calculate_rouge_scores(reference, hypothesis)
    meteor = calculate_meteor(reference, hypothesis)
    diff = generate_diff_tokens(reference, hypothesis)
    
    # Calculate an overall composite score (0-100 where 100 is best)
    # Higher BLEU/ROUGE/METEOR is better, lower WER is better
    accuracy_pct = max(0.0, min(100.0, (1.0 - wer) * 100.0))
    composite_quality = (
        (1.0 - min(wer, 1.0)) * 0.35 +
        (1.0 - min(cer, 1.0)) * 0.15 +
        bleu_data["bleu"] * 0.20 +
        rouge_data["rougeL_f1"] * 0.15 +
        meteor * 0.15
    ) * 100.0
    
    return {
        "wer": wer,
        "cer": cer,
        "bleu": bleu_data["bleu"],
        "bleu1": bleu_data["bleu1"],
        "bleu2": bleu_data["bleu2"],
        "bleu4": bleu_data["bleu4"],
        "rouge1_f1": rouge_data["rouge1_f1"],
        "rouge2_f1": rouge_data["rouge2_f1"],
        "rougeL_f1": rouge_data["rougeL_f1"],
        "meteor": meteor,
        "accuracy_pct": round(accuracy_pct, 2),
        "composite_score": round(composite_quality, 2),
        "diff": diff,
        "ref_norm": normalize_text(reference),
        "hyp_norm": normalize_text(hypothesis)
    }
