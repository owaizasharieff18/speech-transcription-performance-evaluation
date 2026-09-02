import time
import torch
import soundfile as sf
import librosa
from typing import Dict, Any
from .base import BaseSTTModel

class WavLMBaseModel(BaseSTTModel):
    """
    Adapter 4: Microsoft WavLM Base+ (94M params).
    Pretrained checkpoint: patrickvonplaten/wavlm-libri-clean-100h-base-plus.
    Lazy-loads weights on first transcribe request.
    """
    def __init__(self, model_id: str = "ts4", name: str = "WavLM-Base (TS4)"):
        super().__init__(
            model_id=model_id,
            name=name,
            description="Microsoft WavLM Base+ (94M params) - Masked Speech CTC Model"
        )
        self.pretrained_path = "patrickvonplaten/wavlm-libri-clean-100h-base-plus"
        self._processor = None
        self._model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def _load_model(self):
        if self._model is None or self._processor is None:
            print(f"Lazy loading {self.name} ({self.pretrained_path}) on {self.device}...")
            from transformers import AutoProcessor, AutoModelForCTC
            self._processor = AutoProcessor.from_pretrained(self.pretrained_path)
            self._model = AutoModelForCTC.from_pretrained(self.pretrained_path).to(self.device)
            self._model.eval()

    def transcribe(self, audio_wav_path: str) -> Dict[str, Any]:
        start_time = time.time()
        try:
            self._load_model()
            speech, sr = sf.read(audio_wav_path)
            if sr != 16000:
                speech = librosa.resample(speech, orig_sr=sr, target_sr=16000)
            if speech.ndim > 1:
                speech = speech.mean(axis=1)

            with torch.no_grad():
                inputs = self._processor(speech, sampling_rate=16000, return_tensors="pt", padding=True)
                input_values = inputs.input_values.to(self.device)
                logits = self._model(input_values).logits
                predicted_ids = torch.argmax(logits, dim=-1)
                transcription = self._processor.batch_decode(predicted_ids)[0]

            elapsed = round(time.time() - start_time, 3)
            return {
                "text": transcription.strip(),
                "processing_time": elapsed,
                "language": "en",
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
