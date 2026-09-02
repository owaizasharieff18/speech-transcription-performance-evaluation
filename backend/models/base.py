from abc import ABC, abstractmethod
from typing import Dict, Any

class BaseSTTModel(ABC):
    """
    Abstract Base Class for all Speech-to-Text models in the benchmark pipeline.
    Any new STT model (Whisper, Wav2Vec2, DeepSpeech, Kaldi, Google ASR, etc.)
    can be integrated simply by subclassing this and implementing `transcribe`.
    """
    def __init__(self, model_id: str, name: str, description: str):
        self.model_id = model_id
        self.name = name
        self.description = description

    @abstractmethod
    def transcribe(self, audio_wav_path: str) -> Dict[str, Any]:
        """
        Transcribe the audio file located at audio_wav_path.
        
        Returns:
            Dict containing:
                - "text": str (raw generated transcript)
                - "duration_seconds": float
                - "processing_time": float
                - "language": str (optional detected language)
                - "error": str or None
        """
        pass
