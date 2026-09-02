from typing import Dict, List, Any
from .base import BaseSTTModel
from .whisper_model import WhisperSmallModel
from .wav2vec2_model import Wav2Vec2BaseModel
from .hubert_model import HuBERTBaseModel
from .wavlm_model import WavLMBaseModel
from .distil_whisper_model import DistilWhisperModel
from .speecht5_model import SpeechT5Model

# 6 Local STT Model Adapters: TS1 to TS6
MODEL_PIPELINE: Dict[str, BaseSTTModel] = {
    "ts1": WhisperSmallModel(model_id="ts1", name="Whisper-Small (TS1)"),
    "ts2": Wav2Vec2BaseModel(model_id="ts2", name="Wav2Vec2-Base (TS2)"),
    "ts3": HuBERTBaseModel(model_id="ts3", name="HuBERT-Base (TS3)"),
    "ts4": WavLMBaseModel(model_id="ts4", name="WavLM-Base (TS4)"),
    "ts5": DistilWhisperModel(model_id="ts5", name="Distil-Whisper (TS5)"),
    "ts6": SpeechT5Model(model_id="ts6", name="SpeechT5 (TS6)"),
}

def get_model(slot_id: str) -> BaseSTTModel:
    """Get STT model instance by slot id (ts1, ts2, ts3, ts4, ts5, ts6)."""
    return MODEL_PIPELINE.get(slot_id.lower(), MODEL_PIPELINE["ts1"])

def get_all_models() -> List[Dict[str, Any]]:
    """Return metadata about all configured STT models in pipeline."""
    return [
        {
            "slot_id": key,
            "name": model.name,
            "description": model.description,
        }
        for key, model in MODEL_PIPELINE.items()
    ]
