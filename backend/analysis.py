from typing import List, Dict, Any
import statistics
from auto_classifier import classify_domain

def compute_comparative_analysis(evaluations: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Analyzes aggregate performance across models, automatically detected conditions,
    speech qualities, and domains.
    """
    if not evaluations:
        return {
            "has_data": False,
            "models_ranking": [],
            "best_model": None,
            "condition_breakdown": {},
            "quality_breakdown": {},
            "domain_breakdown": {},
            "class_model_averages": {},
            "class_wise_final_summary": {
                "classes": [],
                "overall_best_model": None,
                "overall_explanation": ""
            },
            "auto_condition_breakdown": {
                "speaking_style": {},
                "speech_quality": {},
                "domain": {}
            },
            "domain_classification_summary": {
                "predicted_domain": "EDUCATIONAL",
                "predicted_class": "Educational",
                "confidence": 0.50,
                "percentage": 50.0,
                "top_predictions": []
            },
            "insights": []
        }

    # Group by model
    model_groups: Dict[str, List[Dict[str, Any]]] = {}
    for ev in evaluations:
        m_id = ev["model_id"]
        if m_id not in model_groups:
            model_groups[m_id] = []
        model_groups[m_id].append(ev)

    # 1. Model Summary & Ranking
    models_summary = []
    for m_id, ev_list in model_groups.items():
        wers = [e["wer"] for e in ev_list]
        cers = [e["cer"] for e in ev_list]
        bleus = [e["bleu"] for e in ev_list]
        rouges = [e["rougeL_f1"] for e in ev_list]
        meteors = [e["meteor"] for e in ev_list]
        composites = [e["composite_score"] for e in ev_list]
        latencies = [e.get("processing_time_sec", 0.0) for e in ev_list]

        avg_wer = round(statistics.mean(wers), 4) if wers else 0.0
        avg_cer = round(statistics.mean(cers), 4) if cers else 0.0
        avg_bleu = round(statistics.mean(bleus), 4) if bleus else 0.0
        avg_rouge = round(statistics.mean(rouges), 4) if rouges else 0.0
        avg_meteor = round(statistics.mean(meteors), 4) if meteors else 0.0
        avg_composite = round(statistics.mean(composites), 2) if composites else 0.0
        avg_latency = round(statistics.mean(latencies), 3) if latencies else 0.0

        model_name = ev_list[0].get("model_name", m_id.upper())

        models_summary.append({
            "model_id": m_id,
            "model_name": model_name,
            "sample_count": len(ev_list),
            "avg_wer": avg_wer,
            "avg_cer": avg_cer,
            "avg_bleu": avg_bleu,
            "avg_rougeL": avg_rouge,
            "avg_meteor": avg_meteor,
            "avg_composite": avg_composite,
            "avg_latency_sec": avg_latency,
        })

    # Sort ranking: higher Composite Score, lower WER, higher BLEU
    models_summary.sort(key=lambda x: (-x["avg_composite"], x["avg_wer"], -x["avg_bleu"]))
    for rank, m in enumerate(models_summary, start=1):
        m["rank"] = rank

    best_model = models_summary[0] if models_summary else None

    # Calculate average metrics for each Class × STT Model
    class_model_groups: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
    for ev in evaluations:
        cls_name = ev.get("domain_class") or ev.get("predicted_domain") or ev.get("actual_domain_class") or "General"
        cls_name = cls_name.strip().title() if cls_name else "General"
        m_id = ev["model_id"]
        
        if cls_name not in class_model_groups:
            class_model_groups[cls_name] = {}
        if m_id not in class_model_groups[cls_name]:
            class_model_groups[cls_name][m_id] = []
        class_model_groups[cls_name][m_id].append(ev)

    class_model_averages: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for cls_name, m_dict in class_model_groups.items():
        class_model_averages[cls_name] = {}
        for m_id, records in m_dict.items():
            wers = [r["wer"] for r in records]
            cers = [r["cer"] for r in records]
            bleus = [r["bleu"] for r in records]
            rouges = [r["rougeL_f1"] if "rougeL_f1" in r else r.get("rougeL", 0.0) for r in records]
            meteors = [r["meteor"] for r in records]
            m_name = records[0].get("model_name", m_id.upper())

            class_model_averages[cls_name][m_id] = {
                "class_name": cls_name,
                "model_id": m_id,
                "model_name": m_name,
                "sample_count": len(records),
                "avg_wer": round(statistics.mean(wers), 4) if wers else 0.0,
                "avg_cer": round(statistics.mean(cers), 4) if cers else 0.0,
                "avg_bleu": round(statistics.mean(bleus), 4) if bleus else 0.0,
                "avg_rougeL": round(statistics.mean(rouges), 4) if rouges else 0.0,
                "avg_meteor": round(statistics.mean(meteors), 4) if meteors else 0.0
            }

    # Deterministic Rule-Based Class-Wise Final Analysis
    class_final_analyses = []
    class_victory_counts: Dict[str, int] = {}

    for cls_name, models_dict in sorted(class_model_averages.items()):
        if not models_dict:
            continue
        models_list = list(models_dict.values())

        # Determine metric winners
        best_wer = min(models_list, key=lambda x: (x["avg_wer"], -x["avg_bleu"]))
        best_cer = min(models_list, key=lambda x: (x["avg_cer"], -x["avg_bleu"]))
        best_bleu = max(models_list, key=lambda x: (x["avg_bleu"], -x["avg_wer"]))
        best_rouge = max(models_list, key=lambda x: (x["avg_rougeL"], -x["avg_wer"]))
        best_meteor = max(models_list, key=lambda x: (x["avg_meteor"], -x["avg_wer"]))

        # Overall best for this class
        class_overall_best = min(models_list, key=lambda x: (x["avg_wer"], -x["avg_bleu"], -x["avg_meteor"]))
        m_best_id = class_overall_best["model_id"]
        class_victory_counts[m_best_id] = class_victory_counts.get(m_best_id, 0) + 1

        sample_cnt = max([m["sample_count"] for m in models_list]) if models_list else 0

        # Construct short rule-based explanation from actual data
        explanation_parts = []
        explanation_parts.append(
            f"In the {cls_name} domain, {best_wer['model_name']} achieved the lowest Word Error Rate ({best_wer['avg_wer']*100:.1f}%)"
        )
        if best_cer['model_id'] != best_wer['model_id']:
            explanation_parts.append(f" and {best_cer['model_name']} achieved the lowest Character Error Rate ({best_cer['avg_cer']*100:.1f}%)")
        else:
            explanation_parts.append(f" and lowest Character Error Rate ({best_cer['avg_cer']*100:.1f}%)")

        if best_bleu['model_id'] == best_rouge['model_id'] == best_meteor['model_id']:
            explanation_parts.append(
                f", with {best_bleu['model_name']} leading semantic overlap (BLEU: {best_bleu['avg_bleu']:.2f}, ROUGE-L: {best_rouge['avg_rougeL']:.2f}, METEOR: {best_meteor['avg_meteor']:.2f})"
            )
        else:
            explanation_parts.append(
                f", while {best_bleu['model_name']} led BLEU ({best_bleu['avg_bleu']:.2f}), {best_rouge['model_name']} led ROUGE-L ({best_rouge['avg_rougeL']:.2f}), and {best_meteor['model_name']} led METEOR ({best_meteor['avg_meteor']:.2f})"
            )
        explanation_parts.append(f" across {sample_cnt} sample{'s' if sample_cnt != 1 else ''}.")
        rule_based_explanation = "".join(explanation_parts)

        class_final_analyses.append({
            "class_name": cls_name,
            "sample_count": sample_cnt,
            "best_by_wer": {
                "model_id": best_wer["model_id"],
                "model_name": best_wer["model_name"],
                "value": best_wer["avg_wer"],
                "formatted": f"{best_wer['avg_wer']*100:.1f}%"
            },
            "best_by_cer": {
                "model_id": best_cer["model_id"],
                "model_name": best_cer["model_name"],
                "value": best_cer["avg_cer"],
                "formatted": f"{best_cer['avg_cer']*100:.1f}%"
            },
            "best_by_bleu": {
                "model_id": best_bleu["model_id"],
                "model_name": best_bleu["model_name"],
                "value": best_bleu["avg_bleu"],
                "formatted": f"{best_bleu['avg_bleu']:.3f}"
            },
            "best_by_rouge": {
                "model_id": best_rouge["model_id"],
                "model_name": best_rouge["model_name"],
                "value": best_rouge["avg_rougeL"],
                "formatted": f"{best_rouge['avg_rougeL']:.3f}"
            },
            "best_by_meteor": {
                "model_id": best_meteor["model_id"],
                "model_name": best_meteor["model_name"],
                "value": best_meteor["avg_meteor"],
                "formatted": f"{best_meteor['avg_meteor']:.3f}"
            },
            "overall_best": {
                "model_id": class_overall_best["model_id"],
                "model_name": class_overall_best["model_name"],
                "avg_wer": class_overall_best["avg_wer"],
                "avg_bleu": class_overall_best["avg_bleu"]
            },
            "explanation": rule_based_explanation
        })

    # Overall best model across all classes (highest victory count, then best ranking)
    if class_victory_counts and models_summary:
        overall_best = max(
            models_summary, 
            key=lambda m: (class_victory_counts.get(m["model_id"], 0), m.get("avg_composite", 0), -m.get("avg_wer", 1.0))
        )
    else:
        overall_best = models_summary[0] if models_summary else None

    overall_explanation = ""
    if overall_best and class_final_analyses:
        total_classes = len(class_final_analyses)
        wins = class_victory_counts.get(overall_best["model_id"], 0)
        overall_explanation = (
            f"Across all {total_classes} evaluated classes, {overall_best['model_name']} is identified as the overall best-performing model, "
            f"securing the top rank in {wins} of {total_classes} dataset classes with an average composite score of {overall_best.get('avg_composite', 0):.1f}%, "
            f"mean WER of {overall_best['avg_wer']*100:.1f}%, mean CER of {overall_best['avg_cer']*100:.1f}%, "
            f"BLEU of {overall_best['avg_bleu']:.2f}, ROUGE-L of {overall_best['avg_rougeL']:.2f}, and METEOR of {overall_best['avg_meteor']:.2f}."
        )

    class_wise_final_summary = {
        "classes": class_final_analyses,
        "overall_best_model": overall_best,
        "overall_explanation": overall_explanation
    }

    # Helper for multi-metric subgroup aggregations
    def group_by_dimension_detailed(key_name: str, fallback_key: str = None) -> Dict[str, Dict[str, Any]]:
        dim_groups: Dict[str, Dict[str, List[Dict[str, float]]]] = {}
        for ev in evaluations:
            dim_val = ev.get(key_name)
            if not dim_val and fallback_key:
                dim_val = ev.get(fallback_key)
            if not dim_val:
                dim_val = "Unknown"
            
            # Normalize display casing
            dim_val = dim_val.strip().title() if dim_val != "Unknown" else "Unknown"

            m_id = ev["model_id"]
            if dim_val not in dim_groups:
                dim_groups[dim_val] = {}
            if m_id not in dim_groups[dim_val]:
                dim_groups[dim_val][m_id] = []
                
            dim_groups[dim_val][m_id].append({
                "wer": ev["wer"],
                "cer": ev["cer"],
                "bleu": ev["bleu"],
                "rougeL": ev.get("rougeL_f1", ev.get("rougeL", 0.0)),
                "meteor": ev["meteor"]
            })

        result = {}
        for dim_val, m_dict in dim_groups.items():
            result[dim_val] = {
                "models": {},
                "sample_count": 0,
                "overall_avg_wer": 0.0,
                "overall_avg_cer": 0.0,
                "overall_avg_bleu": 0.0,
                "overall_avg_rougeL": 0.0,
                "overall_avg_meteor": 0.0
            }
            all_wers = []
            all_cers = []
            all_bleus = []
            all_rouges = []
            all_meteors = []

            for m_id, records in m_dict.items():
                m_wer = round(statistics.mean([r["wer"] for r in records]), 4)
                m_cer = round(statistics.mean([r["cer"] for r in records]), 4)
                m_bleu = round(statistics.mean([r["bleu"] for r in records]), 4)
                m_rouge = round(statistics.mean([r["rougeL"] for r in records]), 4)
                m_meteor = round(statistics.mean([r["meteor"] for r in records]), 4)

                result[dim_val]["models"][m_id] = {
                    "wer": m_wer,
                    "cer": m_cer,
                    "bleu": m_bleu,
                    "rougeL": m_rouge,
                    "meteor": m_meteor
                }
                result[dim_val][m_id] = m_wer

                all_wers.extend([r["wer"] for r in records])
                all_cers.extend([r["cer"] for r in records])
                all_bleus.extend([r["bleu"] for r in records])
                all_rouges.extend([r["rougeL"] for r in records])
                all_meteors.extend([r["meteor"] for r in records])

            result[dim_val]["sample_count"] = len(all_wers)
            result[dim_val]["overall_avg_wer"] = round(statistics.mean(all_wers), 4) if all_wers else 0.0
            result[dim_val]["overall_avg_cer"] = round(statistics.mean(all_cers), 4) if all_cers else 0.0
            result[dim_val]["overall_avg_bleu"] = round(statistics.mean(all_bleus), 4) if all_bleus else 0.0
            result[dim_val]["overall_avg_rougeL"] = round(statistics.mean(all_rouges), 4) if all_rouges else 0.0
            result[dim_val]["overall_avg_meteor"] = round(statistics.mean(all_meteors), 4) if all_meteors else 0.0

        return result

    auto_style_breakdown = group_by_dimension_detailed("predicted_speaking_style", fallback_key="speaking_condition")
    auto_quality_breakdown = group_by_dimension_detailed("predicted_speech_quality", fallback_key="speech_quality")
    auto_domain_breakdown = group_by_dimension_detailed("domain_class", fallback_key="predicted_domain")

    # Aggregate domain classification analysis from all sample texts
    unique_texts = []
    seen_samples = set()
    for ev in evaluations:
        s_name = ev.get("sample_name", "")
        if s_name not in seen_samples:
            seen_samples.add(s_name)
            txt = ev.get("reference_transcript", "") or ev.get("raw_transcript", "")
            if txt:
                unique_texts.append(txt)

    combined_corpus = " ".join(unique_texts) if unique_texts else ""
    domain_summary = classify_domain(combined_corpus)

    # Generate Dynamic Academic Insights
    insights = []

    # Speaking style insight
    if "Formal" in auto_style_breakdown and "Informal" in auto_style_breakdown:
        formal_wer = auto_style_breakdown["Formal"]["overall_avg_wer"]
        informal_wer = auto_style_breakdown["Informal"]["overall_avg_wer"]
        diff_pct = round(abs(informal_wer - formal_wer) * 100, 1)
        if informal_wer > formal_wer:
            insights.append({
                "category": "Speaking Style Analysis",
                "title": "Formal vs. Informal Speech Impact",
                "text": f"Automatically classified informal speech exhibited a {diff_pct}% higher average WER ({informal_wer * 100:.1f}% vs {formal_wer * 100:.1f}%). Casual elisions, contractions, and colloquial fillers increase acoustic and language modeling perplexity."
            })
        else:
            insights.append({
                "category": "Speaking Style Analysis",
                "title": "Speaking Style Uniformity",
                "text": f"Models demonstrated resilient transcription across detected formal ({formal_wer * 100:.1f}% WER) and informal ({informal_wer * 100:.1f}% WER) speaking styles."
            })

    # Quality insight
    if "Clear" in auto_quality_breakdown and any(k in auto_quality_breakdown for k in ["Background Noise", "Noisy"]):
        noisy_key = "Background Noise" if "Background Noise" in auto_quality_breakdown else "Noisy"
        clear_wer = auto_quality_breakdown["Clear"]["overall_avg_wer"]
        noisy_wer = auto_quality_breakdown[noisy_key]["overall_avg_wer"]
        deg_factor = round((noisy_wer - clear_wer) * 100, 1) if noisy_wer >= clear_wer else 0.0
        insights.append({
            "category": "Audio Quality Analysis",
            "title": "Acoustic Degradation from Noise Floor",
            "text": f"Acoustic noise (detected via low SNR / elevated RMS floor) caused an absolute error increase of {deg_factor}% ({noisy_wer * 100:.1f}% WER in noise vs {clear_wer * 100:.1f}% WER in clear audio). Additive noise smothers formant frequencies and phonetic transitions."
        })

    return {
        "has_data": True,
        "models_ranking": models_summary,
        "best_model": best_model,
        "condition_breakdown": auto_style_breakdown,
        "quality_breakdown": auto_quality_breakdown,
        "domain_breakdown": auto_domain_breakdown,
        "class_model_averages": class_model_averages,
        "class_wise_final_summary": class_wise_final_summary,
        "auto_condition_breakdown": {
            "speaking_style": auto_style_breakdown,
            "speech_quality": auto_quality_breakdown,
            "domain": auto_domain_breakdown
        },
        "domain_classification_summary": domain_summary,
        "insights": insights
    }
