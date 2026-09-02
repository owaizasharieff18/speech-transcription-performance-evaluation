import os
import subprocess
import shutil
import wave
import imageio_ffmpeg

def get_ffmpeg_exe():
    """Get the path to ffmpeg executable (bundled or system)."""
    try:
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        sys_ffmpeg = shutil.which("ffmpeg")
        if sys_ffmpeg:
            return sys_ffmpeg
        raise RuntimeError("No ffmpeg executable found.")

def convert_to_wav(input_path: str, output_path: str, sample_rate: int = 16000) -> str:
    """
    Extracts or converts any audio or video file to a 16kHz mono WAV format
    required for optimal speech recognition.
    """
    ffmpeg_exe = get_ffmpeg_exe()
    
    # Target 16kHz mono 16-bit PCM WAV
    cmd = [
        ffmpeg_exe,
        "-y",
        "-i", input_path,
        "-vn", # Disable video if input is video
        "-acodec", "pcm_s16le",
        "-ar", str(sample_rate),
        "-ac", "1",
        output_path
    ]
    
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        err_msg = result.stderr.decode("utf-8", errors="ignore")
        raise RuntimeError(f"FFmpeg conversion failed: {err_msg}")
    
    return output_path

def get_audio_duration(wav_path: str) -> float:
    """Returns the duration of a standard WAV file in seconds."""
    try:
        with wave.open(wav_path, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            duration = frames / float(rate)
            return round(duration, 2)
    except Exception:
        return 0.0
