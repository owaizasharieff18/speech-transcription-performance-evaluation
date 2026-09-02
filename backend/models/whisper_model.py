import os
import time
import torch
import whisper
import soundfile as sf
import librosa
import numpy as np
from typing import Dict, Any
from .base import BaseSTTModel

_WHISPER_SMALL_CACHE = None

def _load_audio_waveform(file_path: str) -> np.ndarray:
    """Load audio as 16kHz float32 mono array without requiring system ffmpeg."""
    audio, sr = sf.read(file_path, dtype="float32")
    if sr != 16000:
        audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)
    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    return audio

class WhisperSmallModel(BaseSTTModel):
    """
    Adapter 1: OpenAI Whisper Small (244M params).
    Lazy-loads weights on first transcribe request.
    """
    def __init__(self, model_id: str = "ts1", name: str = "Whisper-Small (TS1)"):
        super().__init__(
            model_id=model_id,
            name=name,
            description="OpenAI Whisper Small - Sequence-to-Sequence Multilingual Model"
        )
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def _get_model(self):
        global _WHISPER_SMALL_CACHE
        if _WHISPER_SMALL_CACHE is None:
            print(f"Lazy loading {self.name} on {self.device}...")
            _WHISPER_SMALL_CACHE = whisper.load_model("small", device=self.device)
        return _WHISPER_SMALL_CACHE

    def transcribe(self, audio_wav_path: str) -> Dict[str, Any]:
        start_time = time.time()
        try:
            model = self._get_model()
            audio_array = _load_audio_waveform(audio_wav_path)
            result = model.transcribe(audio_array, fp16=False)
            elapsed = round(time.time() - start_time, 3)
            return {
                "text": result.get("text", "").strip(),
                "processing_time": elapsed,
                "language": result.get("language", "en"),
                "error": None
            }
        except Exception as e:
            elapsed = round(time.time() - start_time, 3)
            return {
                "text": "",
                "processing_time": elapsed,
                "language": "en",
                "error": str(e)
            }
