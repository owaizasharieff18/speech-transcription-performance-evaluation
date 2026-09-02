import time
import torch
import soundfile as sf
import librosa
from typing import Dict, Any
from .base import BaseSTTModel

class SpeechT5Model(BaseSTTModel):
    """
    Adapter 6: Microsoft SpeechT5 ASR (150M params).
    Pretrained checkpoint: microsoft/speecht5_asr.
    Lazy-loads weights on first transcribe request.
    """
    def __init__(self, model_id: str = "ts6", name: str = "SpeechT5 (TS6)"):
        super().__init__(
            model_id=model_id,
            name=name,
            description="Microsoft SpeechT5 ASR (150M params) - Unified-Modal Sequence-to-Sequence Model"
        )
        self.pretrained_path = "microsoft/speecht5_asr"
        self._processor = None
        self._model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def _load_model(self):
        if self._model is None or self._processor is None:
            print(f"Lazy loading {self.name} ({self.pretrained_path}) on {self.device}...")
            from transformers import SpeechT5Processor, SpeechT5ForSpeechToText
            self._processor = SpeechT5Processor.from_pretrained(self.pretrained_path)
            self._model = SpeechT5ForSpeechToText.from_pretrained(self.pretrained_path).to(self.device)
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
                inputs = self._processor(audio=speech, sampling_rate=16000, return_tensors="pt")
                input_values = inputs["input_values"].to(self.device)
                predicted_ids = self._model.generate(input_values, max_length=256)
                transcription = self._processor.decode(predicted_ids[0], skip_special_tokens=True)

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
