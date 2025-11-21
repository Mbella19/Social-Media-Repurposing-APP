import os
import json
import logging
import subprocess
import requests
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

class WhisperService:
    """Deepgram Nova-3 API service for fast and accurate caption generation"""
    
    def __init__(self):
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY not found in environment variables")
        self.api_url = "https://api.deepgram.com/v1/listen"
    
    def get_video_duration(self, video_path):
        """Get video duration in seconds using ffprobe"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                video_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                return float(result.stdout.strip())
            return 0.0
        except Exception as e:
            logger.error(f"Failed to get video duration: {e}")
            return 0.0
    
    def transcribe_video(self, video_path, language="en"):
        """Transcribe video to generate captions with precise timestamps"""
        try:
            if not self.api_key:
                return {"error": "DEEPGRAM_API_KEY is not set. Please add it to your environment."}

            logger.info(f"🎬 Starting Deepgram Nova-3 transcription for: {video_path}")
            
            # Get video duration
            video_duration = self.get_video_duration(video_path)
            logger.info(f"📹 Video duration: {video_duration:.2f}s")
            
            # Read video file
            with open(video_path, "rb") as video_file:
                audio_data = video_file.read()
            
            # Set up headers
            headers = {
                "Authorization": f"Token {self.api_key}",
                "Content-Type": "video/mp4"
            }
            
            # Set up parameters for Nova-3 model with word-level timestamps
            params = {
                "model": "nova-3",
                "language": language,
                "smart_format": "true",
                "punctuate": "true",
                "diarize": "false",
                "utterances": "false",
                "paragraphs": "false"
            }
            
            logger.info("🎙️ Sending to Deepgram Nova-3 API...")
            
            # Make API request
            response = requests.post(
                self.api_url,
                headers=headers,
                params=params,
                data=audio_data,
                timeout=120
            )
            
            if response.status_code != 200:
                logger.error(f"Deepgram API error: {response.status_code} - {response.text}")
                return {"error": f"Deepgram API error {response.status_code}: {response.text}"}
            
            # Parse JSON response
            result = response.json()
            
            # Extract results
            if "results" not in result:
                logger.error("No results in response")
                return None
            
            results = result["results"]
            if "channels" not in results or len(results["channels"]) == 0:
                logger.error("No channels in results")
                return None
            
            channel = results["channels"][0]
            if "alternatives" not in channel or len(channel["alternatives"]) == 0:
                logger.error("No alternatives in channel")
                return None
            
            alternative = channel["alternatives"][0]
            full_text = alternative.get("transcript", "")
            words = alternative.get("words", [])
            
            logger.info(f"✅ Received {len(words)} words with timestamps")
            logger.info(f"📝 Full transcript: {full_text[:100]}...")
            
            if not words:
                logger.warning("⚠️ No word-level timestamps available")
                return {
                    "captions": [{
                        "text": full_text,
                        "start": 0,
                        "end": video_duration
                    }],
                    "full_text": full_text,
                    "language": language
                }
            
            # Log first few words for debugging
            for i, word in enumerate(words[:5]):
                word_text = word.get("word", word.get("punctuated_word", ""))
                word_start = word.get("start", 0)
                word_end = word.get("end", 0)
                logger.info(f"    Word {i+1}: [{word_start:.2f}s - {word_end:.2f}s] '{word_text}'")
            
            # Create word-by-word captions (each word is a separate caption)
            captions = []
            
            for i, word in enumerate(words):
                word_text = word.get("word", word.get("punctuated_word", "")).strip()
                word_start = word.get("start", 0)
                word_end = word.get("end", 0)
                
                if not word_text:
                    continue
                
                # Each word becomes its own caption
                captions.append({
                    "text": word_text,
                    "start": word_start,
                    "end": word_end
                })
            
            logger.info(f"✅ Generated {len(captions)} captions")
            
            # Log first few captions for verification
            for i, cap in enumerate(captions[:3]):
                logger.info(f"  Caption {i+1}: [{cap['start']:.2f}s - {cap['end']:.2f}s] {cap['text'][:60]}")
            
            # Return transcription data
            return {
                "captions": captions,
                "full_text": full_text,
                "language": language
            }
            
        except Exception as e:
            logger.error(f"Deepgram transcription failed: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return {"error": str(e)}
    
    def generate_srt(self, captions):
        """Generate SRT subtitle file content from captions"""
        srt_content = []
        
        for i, caption in enumerate(captions, 1):
            # Format timestamps in SRT format (HH:MM:SS,mmm)
            start_time = self._seconds_to_srt_time(caption["start"])
            end_time = self._seconds_to_srt_time(caption["end"])
            
            # Add subtitle entry
            srt_content.append(f"{i}")
            srt_content.append(f"{start_time} --> {end_time}")
            srt_content.append(caption["text"])
            srt_content.append("")  # Empty line between entries
        
        return "\n".join(srt_content)
    
    def _seconds_to_srt_time(self, seconds):
        """Convert seconds to SRT timestamp format"""
        if seconds is None:
            seconds = 0
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int((seconds % 1) * 1000)
        return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

# Global instance
whisper_service = WhisperService()
