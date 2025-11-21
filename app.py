import os
import re
import json
import uuid
import time
import requests
import subprocess
import tempfile
import zipfile
from pathlib import Path
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_file, send_from_directory, Response, after_this_request
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import google.generativeai as genai
from apscheduler.schedulers.background import BackgroundScheduler
import threading
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import smart cropping modules (after logger is initialized)
from whisper_service import whisper_service
try:
    from advanced_smart_crop import smooth_smart_crop_video
    SMART_CROP_AVAILABLE = True
    logger.info("✓ Advanced smart cropping loaded (smooth tracking + multi-face)")
except Exception as adv_error:
    logger.warning(f"Advanced smart cropping unavailable ({adv_error}); falling back to basic.")
    try:
        from smart_crop import smart_crop_video
        smooth_smart_crop_video = smart_crop_video  # Fallback to basic
        SMART_CROP_AVAILABLE = True
        logger.info("✓ Basic smart cropping loaded (face tracking enabled)")
    except Exception as basic_error:
        SMART_CROP_AVAILABLE = False
        smooth_smart_crop_video = None
        logger.warning(f"⚠️ Smart cropping not available: {basic_error}")

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-key-please-change-in-prod')
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size
CORS(app)

# Configure Gemini
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    raise ValueError("GEMINI_API_KEY not found in environment variables")
genai.configure(api_key=GEMINI_API_KEY)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'outputs'
TEMP_FOLDER = 'temp'
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'webm'}

# Create necessary directories
for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER, TEMP_FOLDER]:
    os.makedirs(folder, exist_ok=True)
    
# Cleanup scheduler
scheduler = BackgroundScheduler()

def cleanup_old_files():
    """Remove files older than specified hours"""
    try:
        cleanup_hours = int(os.getenv('TEMP_FILE_CLEANUP_HOURS', 1))
        cutoff_time = datetime.now() - timedelta(hours=cleanup_hours)
        
        for folder in [UPLOAD_FOLDER, OUTPUT_FOLDER, TEMP_FOLDER]:
            if not os.path.exists(folder):
                continue
                
            for file in Path(folder).glob('*'):
                if file.is_file():
                    file_time = datetime.fromtimestamp(file.stat().st_mtime)
                    if file_time < cutoff_time:
                        file.unlink()
                        logger.info(f"Deleted old file: {file}")
    except Exception as e:
        logger.error(f"Cleanup error: {e}")

# Schedule cleanup every hour
scheduler.add_job(cleanup_old_files, 'interval', hours=1)
scheduler.start()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_youtube_url(url):
    """Validate and normalize YouTube URL format"""
    pattern = r'^(https?://)?(www\.)?(youtube\.com|youtu\.be)/.+'
    return re.match(pattern, url) is not None

def normalize_youtube_url(url):
    """Normalize YouTube URL to standard format"""
    # Extract video ID
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com\/embed\/([a-zA-Z0-9_-]{11})',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            video_id = match.group(1)
            # Return clean YouTube URL
            clean_url = f"https://www.youtube.com/watch?v={video_id}"
            logger.info(f"Normalized URL: {url} → {clean_url}")
    
    # If no pattern matches, return original
    return url

def get_video_stream_url(youtube_url):
    """Get direct stream URL from YouTube with highest quality"""
    try:
        # First, check what formats are available
        logger.info("🔍 Checking available video formats...")
        list_result = subprocess.run(
            ['yt-dlp', '--cookies-from-browser', 'chrome', '-F', youtube_url],
            capture_output=True,
            text=True,
            timeout=30
        )
        if list_result.returncode == 0:
            logger.info("Available formats:\n" + list_result.stdout)
        
        # Format priority: Get highest quality video available
        # Try multiple format options to ensure we get the best quality
        format_options = [
            'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',  # Highest quality mp4
            'bestvideo+bestaudio/best'  # Fallback to any highest quality
        ]
        
        for format_opt in format_options:
            logger.info(f"🎬 Trying format: {format_opt}")
            result = subprocess.run(
                ['yt-dlp', '--cookies-from-browser', 'chrome', '-g', '-f', format_opt, youtube_url],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                urls = result.stdout.strip().split('\n')
                logger.info(f"✓ SUCCESS! Got {len(urls)} stream URL(s) with format: {format_opt}")
                
                # Get info about the selected format
                info_result = subprocess.run(
                    ['yt-dlp', '--cookies-from-browser', 'chrome', '--get-format', '-f', format_opt, youtube_url],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if info_result.returncode == 0:
                    logger.info(f"📊 Selected format details: {info_result.stdout.strip()}")
                
                # If we got 2 URLs, it's video and audio separately
                if len(urls) == 2:
                    logger.info(f"📹 Video URL: {urls[0][:100]}...")
                    logger.info(f"🔊 Audio URL: {urls[1][:100]}...")
                    return urls  # Return both URLs
                else:
                    return urls[0]  # Return single URL (combined video+audio)
            else:
                logger.warning(f"✗ Format {format_opt} failed: {result.stderr}")
        
        return None
    except subprocess.TimeoutExpired:
        logger.error("⏱️ Timeout while getting stream URL")
        return None
    except Exception as e:
        logger.error(f"Stream URL extraction error: {e}")
        return None

def parse_ts_to_seconds(ts):
    """Parse 'HH:MM:SS(.ms)', 'MM:SS(.ms)' or 'SS(.ms)' into seconds (float)."""
    try:
        if ts is None:
            return 0.0
        s = str(ts).strip()
        parts = s.split(':')
        if len(parts) == 3:
            h = int(parts[0])
            m = int(parts[1])
            sec = float(parts[2])
            return h * 3600 + m * 60 + sec
        elif len(parts) == 2:
            m = int(parts[0])
            sec = float(parts[1])
            return m * 60 + sec
        else:
            return float(parts[0])
    except Exception:
        try:
            # Extract numbers like 01:02:03.5 or 03.5
            import re
            nums = re.findall(r"\d+\.?\d*", str(ts))
            if not nums:
                return 0.0
            vals = list(map(float, nums))
            if len(vals) >= 3:
                return vals[0] * 3600 + vals[1] * 60 + vals[2]
            if len(vals) == 2:
                return vals[0] * 60 + vals[1]
            return vals[0]
        except Exception:
            return 0.0

def format_seconds_mmss(seconds: float) -> str:
    seconds = max(0.0, float(seconds))
    m = int(seconds // 60)
    s = int(round(seconds - m * 60))
    if s == 60:
        m += 1
        s = 0
    return f"{m:02d}:{s:02d}"

def get_google_drive_direct_url(drive_url):
    """Convert Google Drive URL to direct download URL"""
    import re
    
    # Extract file ID from various Google Drive URL formats
    patterns = [
        r'/file/d/([a-zA-Z0-9-_]+)',
        r'id=([a-zA-Z0-9-_]+)',
        r'/d/([a-zA-Z0-9-_]+)',
    ]
    
    file_id = None
    for pattern in patterns:
        match = re.search(pattern, drive_url)
        if match:
            file_id = match.group(1)
            break
    
    if file_id:
        # Return direct download URL
        return f"https://drive.google.com/uc?export=download&id={file_id}"
    return None

def get_dropbox_direct_url(dropbox_url):
    """Convert Dropbox URL to direct download URL"""
    # Replace dl=0 with dl=1 for direct download
    if 'dropbox.com' in dropbox_url:
        if '?dl=0' in dropbox_url:
            return dropbox_url.replace('?dl=0', '?dl=1')
        elif '?dl=1' not in dropbox_url:
            # Add dl=1 parameter
            separator = '&' if '?' in dropbox_url else '?'
            return f"{dropbox_url}{separator}dl=1"
    return dropbox_url

def download_cloud_video(url, url_type, output_path):
    """Download video from cloud storage service"""
    try:
        if url_type == 'google_drive':
            direct_url = get_google_drive_direct_url(url)
            if not direct_url:
                logger.error("Could not extract Google Drive file ID")
                return False
        elif url_type == 'dropbox':
            direct_url = get_dropbox_direct_url(url)
        else:
            direct_url = url
        
        logger.info(f"Downloading from {url_type}: {direct_url}")
        
        # Download using requests
        response = requests.get(direct_url, stream=True, timeout=300)
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
        
        logger.info(f"Downloaded successfully to {output_path}")
        return True
        
    except Exception as e:
        logger.error(f"Cloud download error: {e}")
        return False

def download_sample_for_analysis(youtube_url, max_duration_minutes=10):
    """Download a sample of the video for Gemini analysis with HIGH QUALITY"""
    try:
        temp_file = os.path.join(TEMP_FOLDER, f"sample_{uuid.uuid4()}.mp4")
        
        # Download first 10 minutes for analysis with GOOD QUALITY
        logger.info(f"Downloading first {max_duration_minutes} minutes for AI analysis...")
        
        subprocess.run(
            [
                'yt-dlp',
                '--cookies-from-browser', 'chrome',
                '--download-sections', f'*00:00:00-00:{max_duration_minutes:02d}:00',
                '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best',  # Use 1080p quality
                '-o', temp_file,
                youtube_url
            ],
            check=True,
            timeout=300,  # Extended timeout for higher quality download
            capture_output=True
        )
        
        logger.info(f"High-quality sample downloaded: {temp_file}")
        return temp_file
    except Exception as e:
        logger.error(f"Sample download error: {e}")
        return None

def analyze_video_with_gemini(video_source, num_clips, clip_duration, custom_prompt=None, is_youtube=False):
    """Analyze video with Gemini API to identify engaging moments or follow custom prompt"""
    try:
        logger.info("=" * 60)
        logger.info("🎬 Starting Gemini Video Analysis")
        logger.info(f"   Source: {'YouTube URL' if is_youtube else 'Uploaded File'}")
        logger.info(f"   Video: {video_source}")
        logger.info(f"   Clip Duration Mode: {clip_duration}")
        logger.info("=" * 60)
        
        # Handle auto modes
        is_auto_duration = str(clip_duration).lower() == "auto"
        is_auto_clips = isinstance(num_clips, str) and str(num_clips).lower() == "auto"
        duration_instruction = (
            "Determine the optimal duration for each clip based on the content (minimum 5 seconds, maximum 120 seconds)."
            if is_auto_duration
            else f"Each segment should be approximately {clip_duration} seconds long."
        )
        clips_instruction = (
            "Identify ALL distinct, self-contained moments suitable for social media shorts. Do not cap the number of results; if there are more than 50, include them all."
            if is_auto_clips
            else f"Identify the {int(num_clips)} most engaging, self-contained moments that would work well as social media shorts."
        )
        
        # Create analysis prompt based on whether custom prompt is provided
        if custom_prompt and custom_prompt.strip():
            # Use ONLY the custom prompt - no mixing with default
            prompt = f"""Analyze this video based on the following user request: "{custom_prompt}"
            
            {clips_instruction}
            For each moment, provide:
            1) Start timestamp in format MM:SS
            2) End timestamp in format MM:SS
            3) A brief description of what happens in this segment related to the user's request
            4) LETTERBOX MODE DECISION: Analyze the visual composition and decide if this clip should use letterbox mode (16:9 view with black bars in a 9:16 frame) or standard center crop, make sure your focus is always on the main thing in each frame:
               
               USE LETTERBOX (true) if cropping to 9:16 would lose important visual information:
               - Multiple people or subjects spread horizontally across the frame note the others or subjects in the frame have to be very important not too cut out
               - Wide landscape shots where the width is essential
               - Action or important elements happening on the sides it has to be essential to the clip
               - Important context on the left/right edges that can't be cut
               - Scenes where horizontal framing is crucial
               - Any moment where vertical crop would remove key visual elements
               
               USE STANDARD CROP (false) if the content works well in vertical 9:16:
               - Main subject is centered or can be centered without losing content even if multiple people or subjects spread horizontally across the frame
               - Vertical-friendly compositions even if multiple people or subjects spread horizontally across the frame
               - Content where sides aren't essential to understanding
               - Moments where 9:16 crop maintains all key visual elements
               
               Think: "If I crop this to vertical 9:16, will I lose important information?" → Yes = letterbox:true, No = letterbox:false
            
            {duration_instruction}
            
            IMPORTANT: Focus ONLY on what the user requested. If they ask for "goals" only return goal moments.
            If they ask for "funny moments" only return funny moments. Be very specific to their request.
            
            Return results in valid JSON format with an array of objects, each having keys: 'start_time', 'end_time', 'description', 'letterbox'.
            Example format:
            [
                {{
                    "start_time": "00:30",
                    "end_time": "01:00",
                    "description": "Description of what happens related to user request",
                    "letterbox": false
                }}
            ]
            """
        else:
            # Use default prompt for general engaging moments
            prompt = f"""Analyze this video and {clips_instruction}
            For each moment, provide: 
            1) Start timestamp in format MM:SS
            2) End timestamp in format MM:SS  
            3) A brief description of why this segment is engaging
            4) LETTERBOX MODE DECISION: Analyze the visual composition and decide if this clip should use letterbox mode (16:9 view with black bars in a 9:16 frame) or standard center crop, make sure your focus is always on the main thing in each frame:
               
               USE LETTERBOX (true) if cropping to 9:16 would lose important visual information:
               - Multiple people or subjects spread horizontally across the frame note the others or subjects in the frame have to be very important not too cut out
               - Wide landscape shots where the width is essential
               - Action or important elements happening on the sides it has to be essential to the clip
               - Important context on the left/right edges that can't be cut
               - Scenes where horizontal framing is crucial
               - Any moment where vertical crop would remove key visual elements
               
               USE STANDARD CROP (false) if the content works well in vertical 9:16:
               - Main subject is centered or can be centered without losing content even if multiple people or subjects spread horizontally across the frame
               - Vertical-friendly compositions even if multiple people or subjects spread horizontally across the frame
               - Content where sides aren't essential to understanding
               - Moments where 9:16 crop maintains all key visual elements
               
               Think: "If I crop this to vertical 9:16, will I lose important information?" → Yes = letterbox:true, No = letterbox:false
            
            {duration_instruction}
            Ensure each segment captures a complete thought or action.
            
            Return results in valid JSON format with an array of objects, each having keys: 'start_time', 'end_time', 'description', 'letterbox'.
            Example format:
            [
                {{
                    "start_time": "00:30",
                    "end_time": "01:00",
                    "description": "Engaging moment description",
                    "letterbox": false
                }}
            ]
            """
        
        logger.info(f"Using {'custom' if custom_prompt else 'default'} prompt for video analysis")
        logger.info(f"Prompt preview: {prompt[:200]}...")
        
        # Call Gemini API with CORRECT format based on source
        if is_youtube:
            # NEW API FORMAT: For YouTube URLs, use file_data with file_uri
            logger.info("📹 Using NEW Gemini API with file_uri for YouTube")
            logger.info(f"   file_uri: {video_source}")
            
            # Retry logic with up to 3 minutes total wait time
            max_retries = 5
            total_timeout = 180  # 3 minutes
            elapsed_time = 0
            
            for attempt in range(max_retries):
                try:
                    logger.info(f"   Attempt {attempt + 1}/{max_retries}...")
                    # Set temperature to 0.2 for custom prompts to ensure focused responses
                    generation_config = genai.GenerationConfig(
                        temperature=0.2 if custom_prompt and custom_prompt.strip() else 1.0
                    )
                    model = genai.GenerativeModel('gemini-2.5-pro', generation_config=generation_config)
                    response = model.generate_content([prompt, video_source])
                    logger.info("✓ Gemini API call successful - YouTube video analyzed!")
                    response_text = response.text
                    break  # Success, exit retry loop
                    
                except Exception as api_error:
                    error_str = str(api_error)
                    
                    # Check if rate limit or connection error
                    if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                        # Extract retry delay from error message
                        delay_match = re.search(r'retry in (\d+(?:\.\d+)?)', error_str.lower())
                        if delay_match:
                            wait_time = float(delay_match.group(1))
                        else:
                            # Default exponential backoff
                            wait_time = min(30 * (2 ** attempt), 60)  # Cap at 60s
                        
                        elapsed_time += wait_time
                        
                        if elapsed_time > total_timeout:
                            logger.error(f"Exceeded 3-minute timeout, giving up")
                            raise
                        
                        if attempt < max_retries - 1:
                            logger.warning(f"Rate limit hit, waiting {wait_time:.1f}s before retry...")
                            time.sleep(wait_time)
                            continue
                        else:
                            raise
                    
                    elif 'Connection' in error_str or 'RemoteDisconnected' in error_str:
                        wait_time = 10  # Wait 10s for connection issues
                        elapsed_time += wait_time
                        
                        if elapsed_time > total_timeout:
                            logger.error(f"Exceeded 3-minute timeout, giving up")
                            raise
                        
                        if attempt < max_retries - 1:
                            logger.warning(f"Connection error, waiting {wait_time}s before retry...")
                            time.sleep(wait_time)
                            continue
                        else:
                            raise
                    else:
                        # Other errors, fail immediately
                        logger.error(f"Gemini API call failed: {api_error}")
                        logger.error(f"Error details: {type(api_error).__name__}")
                        raise
        else:
            # OLD API FORMAT: For uploaded files, use upload_file method
            logger.info("📤 Uploading local file to Gemini")
            uploaded_file = genai.upload_file(path=video_source)
            logger.info(f"✓ File uploaded: {uploaded_file.name}")
            
            # Wait for file to be processed
            max_wait = 120
            wait_time = 0
            while uploaded_file.state.name == "PROCESSING" and wait_time < max_wait:
                logger.info(f"   Processing video... ({wait_time}s)")
                time.sleep(3)
                wait_time += 3
                uploaded_file = genai.get_file(uploaded_file.name)
            
            if uploaded_file.state.name != "ACTIVE":
                logger.error(f"Video state: {uploaded_file.state.name}")
                raise Exception(f"Video processing failed: {uploaded_file.state.name}")
            
            logger.info("✓ File ready for analysis")

            try:
                # Set temperature to 0.2 for custom prompts to ensure focused responses
                generation_config = genai.GenerationConfig(
                    temperature=0.2 if custom_prompt and custom_prompt.strip() else 1.0
                )
                model = genai.GenerativeModel(model_name="gemini-2.5-pro", generation_config=generation_config)
                response = model.generate_content([uploaded_file, prompt])
                logger.info("✓ Gemini API call successful - Uploaded file analyzed!")
                response_text = response.text
            except Exception as api_error:
                logger.error(f"Gemini API call failed: {api_error}")
                logger.error(f"Error details: {type(api_error).__name__}")
                raise
        
        # Parse JSON response (response_text already set above)
        logger.info(f"📥 Gemini response received, length: {len(response_text)} characters")
        logger.info(f"   First 300 chars of response: {response_text[:300]}...")
        
        # Clean up response to extract JSON
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if json_match:
            timestamps = json.loads(json_match.group())
            logger.info(f"✓ Successfully parsed {len(timestamps)} timestamps from Gemini")
            
            # Validate timestamps
            logger.info("📋 Extracted timestamps:")
            for i, ts in enumerate(timestamps):
                logger.info(f"   Clip {i+1}: {ts['start_time']} - {ts['end_time']}")
                logger.info(f"           Description: {ts.get('description', 'No description')}")
            
            return timestamps
        else:
            # Try to parse the entire response as JSON
            logger.warning("Could not find JSON array in response, trying full parse")
            return json.loads(response_text)
            
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini response as JSON: {e}")
        logger.error(f"Full response text: {response_text}")  # Log full response
        logger.warning("Falling back to default timestamps - VIDEO WAS NOT ANALYZED BY AI!")
        return generate_default_timestamps(num_clips, clip_duration)
    except Exception as e:
        logger.error(f"Gemini analysis error: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        logger.warning("Falling back to default timestamps - VIDEO WAS NOT ANALYZED BY AI!")
        # Return default timestamps if analysis fails
        return generate_default_timestamps(num_clips, clip_duration)

def generate_default_timestamps(num_clips, clip_duration):
    """Generate evenly spaced timestamps as fallback.
    Handles 'auto' for both parameters by picking sensible defaults.
    """
    try:
        # Defaults when AI analysis fails
        default_num = 10
        default_duration = 30  # seconds

        n = default_num if (isinstance(num_clips, str) and num_clips.lower() == 'auto') else int(num_clips)
        dur = default_duration if (isinstance(clip_duration, str) and str(clip_duration).lower() == 'auto') else int(clip_duration)
    except Exception:
        n, dur = 10, 30

    timestamps = []
    for i in range(max(1, n)):
        start_seconds = i * (dur + 10)  # Add 10s spacing
        start_time = f"{start_seconds // 60:02d}:{start_seconds % 60:02d}"
        end_seconds = start_seconds + dur
        end_time = f"{end_seconds // 60:02d}:{end_seconds % 60:02d}"
        timestamps.append({
            "start_time": start_time,
            "end_time": end_time,
            "description": f"Segment {i + 1}"
        })
    return timestamps

def analyze_clip_for_letterbox(video_path, start_time, end_time, clip_description="", is_youtube=False):
    """
    AI-powered second pass: Analyze a specific clip to determine if it needs letterbox mode
    
    Args:
        video_path: Path to video file or YouTube URL
        start_time: Start time string (e.g., "00:10")
        end_time: End time string (e.g., "00:25")
        clip_description: Description from first AI pass
        is_youtube: Whether video is from YouTube
    
    Returns:
        bool: True if letterbox mode should be used
    """
    try:
        logger.info(f"🤖 AI analyzing clip ({start_time}-{end_time}) for letterbox...")
        
        prompt = f"""You are analyzing a video clip from {start_time} to {end_time} that will be formatted for 9:16 vertical (portrait) social media.

Clip context: {clip_description}

Determine if this clip needs LETTERBOX MODE (wider horizontal view with blurred background bars top/bottom).

Use LETTERBOX when:
- Multiple people are clearly side-by-side (interview, panel discussion, conversation)
- Wide horizontal scenes where subjects are spread across the frame
- Group shots where important people would be cut off in vertical crop
- Two or more people sitting/standing next to each other

DO NOT use letterbox for:
- Single person (even if moving around)
- People stacked vertically
- Close-up shots
- Standard talking head or vlog content
- One person with background activity

Respond ONLY with valid JSON:
{{
    "needs_letterbox": true or false,
    "reason": "One sentence explaining why",
    "confidence": "high" or "medium" or "low"
}}"""

        if is_youtube:
            # Use new API for YouTube videos with retry logic
            max_retries = 3
            total_timeout = 180  # 3 minutes
            elapsed_time = 0
            
            for attempt in range(max_retries):
                try:
                    logger.info(f"   AI attempt {attempt + 1}/{max_retries}...")
                    # Upload the video file
                    video_file = genai.upload_file(path=video_path)
                    model = genai.GenerativeModel('gemini-2.5-pro')
                    response = model.generate_content([prompt, video_file])
                    response_text = response.text
                    break  # Success
                    
                except Exception as api_error:
                    error_str = str(api_error)
                    
                    if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str:
                        # Extract retry delay
                        delay_match = re.search(r'retry in (\d+(?:\.\d+)?)', error_str.lower())
                        wait_time = float(delay_match.group(1)) if delay_match else min(20 * (2 ** attempt), 45)
                        
                        elapsed_time += wait_time
                        
                        if elapsed_time > total_timeout or attempt >= max_retries - 1:
                            logger.warning(f"   Rate limit exhausted, defaulting to standard crop")
                            return False
                        
                        logger.warning(f"   Rate limit, waiting {wait_time:.1f}s...")
                        time.sleep(wait_time)
                        continue
                    
                    elif 'Connection' in error_str:
                        wait_time = 10
                        elapsed_time += wait_time
                        
                        if elapsed_time > total_timeout or attempt >= max_retries - 1:
                            logger.warning(f"   Connection failed, defaulting to standard crop")
                            return False
                        
                        logger.warning(f"   Connection error, waiting {wait_time}s...")
                        time.sleep(wait_time)
                        continue
                    else:
                        logger.error(f"   Error in letterbox analysis: {api_error}")
                        return False
        else:
            # Use old API for local files
            logger.info(f"   Uploading clip to Gemini for analysis...")
            uploaded_file = genai.upload_file(path=video_path)
            
            # Wait for processing (shorter timeout for clips)
            max_wait = 60
            wait_time = 0
            while uploaded_file.state.name == "PROCESSING" and wait_time < max_wait:
                time.sleep(2)
                wait_time += 2
                uploaded_file = genai.get_file(uploaded_file.name)
            
            if uploaded_file.state.name != "ACTIVE":
                logger.warning(f"   Clip processing timeout, defaulting to standard crop")
                return False
            
            model = genai.GenerativeModel(model_name="gemini-2.5-pro")
            response = model.generate_content([uploaded_file, prompt])
            response_text = response.text
        
        # Parse JSON response
        json_match = re.search(r'\{.*?\}', response_text, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            needs_letterbox = result.get('needs_letterbox', False)
            reason = result.get('reason', 'No reason provided')
            confidence = result.get('confidence', 'low')
            
            logger.info(f"   ✓ AI Decision: {'📹 LETTERBOX' if needs_letterbox else '📱 STANDARD'}")
            logger.info(f"   Reason: {reason} (confidence: {confidence})")
            
            return needs_letterbox
        else:
            logger.warning(f"   Could not parse AI response, defaulting to standard crop")
            return False
            
    except Exception as e:
        logger.error(f"   Error in letterbox analysis: {e}")
        logger.info(f"   Defaulting to standard crop")
        return False

def extract_clip_from_stream(stream_url, start_time, duration, output_path):
    """Extract a clip from video stream with high quality re-encoding"""
    try:
        # Check if we have separate video and audio streams
        is_dual_stream = isinstance(stream_url, list) and len(stream_url) == 2
        
        if is_dual_stream:
            video_url, audio_url = stream_url
            logger.info("🎬 Extracting from SEPARATE video and audio streams")
            
            # Build command for dual streams with high quality re-encoding
            cmd = [
                'ffmpeg',
                '-ss', start_time,
                '-i', video_url,          # Video stream
                '-ss', start_time,
                '-i', audio_url,          # Audio stream
                '-t', str(duration),
                '-map', '0:v:0',          # Map video from first input
                '-map', '1:a:0',          # Map audio from second input
                '-c:v', 'libx264',        # Re-encode video
                '-preset', 'slow',        # High quality preset
                '-crf', '18',             # High quality (18 = near lossless)
                '-c:a', 'aac',            # Re-encode audio
                '-b:a', '192k',           # High quality audio
                '-movflags', '+faststart',
                '-y',
                output_path
            ]
        else:
            # Single combined stream
            logger.info("🎬 Extracting from COMBINED stream")
            
            # Probe the stream to verify input quality
            probe_cmd = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height,bit_rate,codec_name',
                '-of', 'json',
                stream_url
            ]
            probe_result = subprocess.run(probe_cmd, capture_output=True, timeout=30, text=True)
            if probe_result.returncode == 0:
                logger.info(f"📊 Input stream info: {probe_result.stdout}")
            
            cmd = [
                'ffmpeg',
                '-ss', start_time,
                '-i', stream_url,
                '-t', str(duration),
                '-c:v', 'libx264',           # Re-encode video
                '-preset', 'slow',           # High quality preset
                '-crf', '18',                # High quality (18 = near lossless)
                '-c:a', 'aac',               # Re-encode audio
                '-b:a', '192k',              # High quality audio
                '-movflags', '+faststart',   # Fast streaming
                '-y',
                output_path
            ]
        
        # Extended timeout for high quality extraction (5 minutes)
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        
        if result.returncode == 0:
            logger.info(f"✓ Extraction successful: {output_path}")
            return True
        else:
            logger.error(f"FFmpeg extraction error: {result.stderr.decode()}")
            return False
    except Exception as e:
        logger.error(f"Clip extraction error: {e}")
        return False

def get_video_dimensions(video_path):
    """Get video dimensions using ffprobe"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'json',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            if data['streams']:
                return data['streams'][0]['width'], data['streams'][0]['height']
    except Exception as e:
        logger.error(f"Error getting video dimensions: {e}")
    return None, None

def format_video_with_letterbox(input_path, output_path, resolution):
    """Format video with letterbox mode (blurred background)"""
    try:
        logger.info("🎬 Creating letterbox with blurred background...")
        
        # Resolution settings
        resolution_map = {
            "4K": (2160, 3840),
            "1080p": (1080, 1920),
            "720p": (720, 1280),
            "480p": (480, 854)
        }
        # Ultra high bitrates for professional quality
        bitrates = {
            "4K": "100M",      # 80-140M range, using 100M for balance
            "1080p": "30M",    # 20-40M range, using 30M for balance
            "720p": "5M",
            "480p": "2M"
        }
        
        target_w, target_h = resolution_map[resolution]
        bitrate = bitrates[resolution]
        
        # Complex filter: blurred background + sharp foreground
        # Letterbox is 16:9 within 9:16 frame
        letterbox_w = target_w
        letterbox_h = int(target_w * 9 / 16)  # 16:9 aspect
        
        filter_complex = (
            # Background: scale to fill, then blur heavily
            f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=increase,"
            f"crop={target_w}:{target_h},gblur=sigma=25[bg];"
            
            # Foreground: scale to letterbox dimensions
            f"[0:v]scale={letterbox_w}:{letterbox_h}:force_original_aspect_ratio=decrease[fg];"
            
            # Overlay foreground on background, centered vertically
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,setdar={target_w}/{target_h}"
        )
        
        # Use quality-optimized presets
        preset_map = {
            "4K": "medium",
            "1080p": "slow",
            "720p": "slow",
            "480p": "medium"
        }
        preset = preset_map[resolution]
        
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-filter_complex', filter_complex,
            '-c:v', 'libx264',
            '-b:v', bitrate,
            '-maxrate', bitrate,
            '-bufsize', f"{int(bitrate[:-1]) * 2}M",
            '-c:a', 'aac',
            '-b:a', '192k',
            '-preset', preset,
            '-crf', '18',
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        logger.info(f"   Letterbox: {letterbox_w}x{letterbox_h} in {target_w}x{target_h} frame")
        
        # Adjust timeout based on resolution (ultra high quality needs extended time)
        timeout_map = {
            "4K": 1800,     # 30 minutes for 4K ultra high quality
            "1080p": 900,   # 15 minutes for 1080p ultra high quality
            "720p": 240,    # 4 minutes for 720p
            "480p": 180     # 3 minutes for 480p
        }
        timeout = timeout_map[resolution]
        logger.info(f"   Processing with {timeout}s timeout ({timeout//60} minutes)...")
        
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
        
        if result.returncode == 0:
            logger.info(f"✓ Letterbox formatting complete: {output_path}")
            return True
        else:
            logger.error(f"FFmpeg letterbox error: {result.stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"Letterbox formatting error: {e}")
        return False

def format_video_clip(input_path, output_path, aspect_ratio, resolution, use_letterbox=False):
    """Format video clip with specified aspect ratio and resolution"""

    if use_letterbox and aspect_ratio == "9:16":
        logger.info(f"📹 Using AI-recommended LETTERBOX mode for {aspect_ratio}")
        return format_video_with_letterbox(input_path, output_path, resolution)

    # Prefer smart cropping for vertical clips when AI stays in standard mode
    if (
        SMART_CROP_AVAILABLE
        and aspect_ratio == "9:16"
        and not use_letterbox
    ):
        logger.info("🤖 Smart crop enabled for standard 9:16 output (no letterbox).")
        try:
            if smooth_smart_crop_video(input_path, output_path, aspect_ratio, resolution):
                return True
            logger.warning("Smart crop did not produce output; falling back to center crop.")
        except Exception as smart_err:
            logger.error(f"Smart crop failure, falling back to center crop: {smart_err}")

    logger.info(f"📱 Using standard center crop for {aspect_ratio}")

    # Fallback to standard center crop
    try:
        logger.info("📐 Using standard center crop")
        # Get input video dimensions
        input_width, input_height = get_video_dimensions(input_path)
        if not input_width or not input_height:
            logger.error(f"Could not get dimensions for {input_path}")
            return False
            
        # Define target dimensions based on resolution
        resolution_targets = {
            "4K": {"9:16": (2160, 3840), "16:9": (3840, 2160), "1:1": (2160, 2160)},
            "1080p": {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)},
            "720p": {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (720, 720)},
            "480p": {"9:16": (480, 854), "16:9": (854, 480), "1:1": (480, 480)}
        }
        
        # Define bitrates (ultra high for professional quality)
        bitrates = {
            "4K": "100M",     # 80-140M range, using 100M for optimal balance
            "1080p": "30M",   # 20-40M range, using 30M for optimal balance
            "720p": "5M",     # 720p HD quality
            "480p": "2M"      # 480p standard quality
        }
        
        # Get target dimensions
        target_width, target_height = resolution_targets[resolution][aspect_ratio]
        bitrate = bitrates[resolution]
        
        # Calculate scaling and cropping (no black bars)
        target_aspect = target_width / target_height
        input_aspect = input_width / input_height
        
        # Scale the video to fill the target dimensions, then center crop
        if input_aspect > target_aspect:
            # Input is wider than target - scale by height and crop width
            scale_w = int(input_width * target_height / input_height)
            scale_h = target_height
            # Calculate crop position to center
            crop_x = int((scale_w - target_width) / 2)
            crop_y = 0
            filter_complex = f"scale={scale_w}:{scale_h},crop={target_width}:{target_height}:{crop_x}:{crop_y}"
        else:
            # Input is taller than target - scale by width and crop height
            scale_w = target_width
            scale_h = int(input_height * target_width / input_width)
            # Calculate crop position to center
            crop_x = 0
            crop_y = int((scale_h - target_height) / 2)
            filter_complex = f"scale={scale_w}:{scale_h},crop={target_width}:{target_height}:{crop_x}:{crop_y}"
        
        # Add aspect ratio metadata fix
        filter_complex += f",setsar=1,setdar={target_width}/{target_height}"
        
        # Use quality-optimized presets (slower = better quality)
        preset_map = {
            "4K": "medium",      # Balanced quality/speed for 4K
            "1080p": "slow",     # High quality for 1080p
            "720p": "slow",      # High quality for 720p
            "480p": "medium"     # Balanced for 480p
        }
        preset = preset_map[resolution]
        
        # Build FFmpeg command with high quality settings
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-vf', filter_complex,
            '-c:v', 'libx264',
            '-b:v', bitrate,
            '-maxrate', bitrate,          # Prevent quality drops
            '-bufsize', f"{int(bitrate[:-1]) * 2}M",  # Buffer for consistent quality
            '-c:a', 'aac',
            '-b:a', '192k',               # High quality audio
            '-preset', preset,
            '-crf', '18',                 # Constant Rate Factor (18 = high quality)
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        logger.info(f"Formatting video: {input_width}x{input_height} -> {target_width}x{target_height} ({aspect_ratio}) with center crop")
        
        # Adjust timeout based on resolution (ultra high quality needs extended time)
        timeout_map = {
            "4K": 1800,     # 30 minutes for 4K ultra high quality
            "1080p": 900,   # 15 minutes for 1080p ultra high quality
            "720p": 240,    # 4 minutes for 720p
            "480p": 180     # 3 minutes for 480p
        }
        timeout = timeout_map[resolution]
        logger.info(f"Processing with {timeout}s timeout ({timeout//60} minutes)...")
        
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
        
        if result.returncode == 0:
            logger.info(f"Successfully formatted video: {output_path}")
            return True
        else:
            logger.error(f"FFmpeg formatting error: {result.stderr.decode()}")
            return False
    except Exception as e:
        logger.error(f"Video formatting error: {e}")
        return False

# Session storage for processing status
processing_sessions = {}

@app.route('/')
def index():
    # Serve React app from dist
    return send_from_directory('dist', 'index.html')

@app.route('/api/features', methods=['GET'])
def get_features():
    """Return available features"""
    return jsonify({
        'smart_crop': SMART_CROP_AVAILABLE,
        'face_tracking': SMART_CROP_AVAILABLE,
        'description': 'Smart cropping with face tracking' if SMART_CROP_AVAILABLE else 'Standard center cropping'
    })

@app.route('/api/status/<session_id>')
def get_status(session_id):
    """Get processing status for a session"""
    if session_id in processing_sessions:
        return jsonify(processing_sessions[session_id])
    else:
        return jsonify({
            'status': 'not_found',
            'error': 'Session not found'
        }), 404

@app.route('/api/process', methods=['POST'])
def process_video():
    """Main endpoint for video processing - returns immediately"""
    try:
        # Handle both FormData and JSON
        if request.content_type and 'multipart/form-data' in request.content_type:
            # FormData from React
            youtube_url = request.form.get('youtube_url')
            google_drive_url = request.form.get('google_drive_url')
            dropbox_url = request.form.get('dropbox_url')
            clip_duration_raw = request.form.get('clip_duration', '30')
            clip_duration = clip_duration_raw if str(clip_duration_raw).lower() == 'auto' else int(clip_duration_raw)
            num_clips_raw = request.form.get('num_clips', '3')
            num_clips = num_clips_raw if str(num_clips_raw).lower() == 'auto' else min(int(num_clips_raw), 200)
            aspect_ratio = request.form.get('aspect_ratio', '9:16')
            resolution = request.form.get('resolution', '1080p')
            custom_prompt = request.form.get('custom_prompt', '')
        else:
            # JSON data
            data = request.get_json()
            youtube_url = data.get('youtube_url')
            google_drive_url = data.get('google_drive_url')
            dropbox_url = data.get('dropbox_url')
            clip_duration_raw = data.get('clip_duration', '30')
            clip_duration = clip_duration_raw if str(clip_duration_raw).lower() == 'auto' else int(clip_duration_raw)
            num_clips_raw = data.get('num_clips', '3')
            num_clips = num_clips_raw if str(num_clips_raw).lower() == 'auto' else min(int(num_clips_raw), 200)
            aspect_ratio = data.get('aspect_ratio', '9:16')
            resolution = data.get('resolution', '1080p')
            custom_prompt = data.get('custom_prompt', '')
        
        # Determine video URL and type
        video_url = None
        url_type = None
        if youtube_url:
            video_url = youtube_url
            url_type = 'youtube'
        elif google_drive_url:
            video_url = google_drive_url
            url_type = 'google_drive'
        elif dropbox_url:
            video_url = dropbox_url
            url_type = 'dropbox'
        else:
            return jsonify({'error': 'No video URL provided'}), 400
        
        # Create session folder
        session_id = str(uuid.uuid4())
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        # Initialize session status
        processing_sessions[session_id] = {
            'status': 'processing',
            'progress': 0,
            'step': 1,
            'message': 'Initializing...',
            'session_id': session_id
        }
        
        # Start background processing
        thread = threading.Thread(
            target=process_video_background,
            args=(session_id, video_url, url_type, clip_duration, num_clips, aspect_ratio, resolution, custom_prompt)
        )
        thread.daemon = True
        thread.start()
        
        # Return immediately with session ID
        return jsonify({
            'status': 'processing',
            'session_id': session_id
        })
        
    except Exception as e:
        logger.error(f"Processing error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/reformat-clip/<session_id>/<filename>', methods=['POST'])
def reformat_clip(session_id, filename):
    """Reformat a specific clip to letterbox or standard crop using saved temp clip and metadata.

    Request JSON:
      { "letterbox": true|false, "aspect_ratio": optional, "resolution": optional }
    """
    try:
        data = request.get_json(silent=True) or {}
        use_letterbox = bool(data.get('letterbox', False))
        override_aspect = data.get('aspect_ratio')
        override_resolution = data.get('resolution')

        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        if not os.path.exists(session_folder):
            return jsonify({ 'error': 'Session not found' }), 404

        final_clip_path = os.path.join(session_folder, filename)
        if not os.path.exists(final_clip_path):
            return jsonify({ 'error': 'Clip not found' }), 404

        meta_path = final_clip_path.replace('.mp4', '.meta.json')
        meta = None
        if os.path.exists(meta_path):
            try:
                with open(meta_path, 'r') as f:
                    meta = json.load(f)
            except Exception:
                meta = None

        input_path = final_clip_path  # fallback input
        aspect_ratio = '9:16'
        resolution = '1080p'

        if meta:
            temp_clip_name = meta.get('temp_clip')
            if temp_clip_name:
                temp_clip_path = os.path.join(TEMP_FOLDER, temp_clip_name)
                if os.path.exists(temp_clip_path):
                    input_path = temp_clip_path
            aspect_ratio = override_aspect or meta.get('aspect_ratio', aspect_ratio)
            resolution = override_resolution or meta.get('resolution', resolution)
        else:
            # create minimal metadata to avoid future errors
            try:
                with open(meta_path, 'w') as f:
                    json.dump({
                        'temp_clip': os.path.basename(final_clip_path),
                        'aspect_ratio': aspect_ratio,
                        'resolution': resolution,
                        'original_letterbox': False
                    }, f)
            except Exception:
                pass

        # Reformat using available input (prefer raw temp if present)
        ok = format_video_clip(input_path, final_clip_path, aspect_ratio, resolution, use_letterbox)
        if not ok:
            return jsonify({ 'error': 'Failed to reformat clip' }), 500

        # Update processing_sessions entry if present
        sess = processing_sessions.get(session_id)
        if sess and 'clips' in sess:
            for clip in sess['clips']:
                if clip.get('filename') == filename:
                    clip['letterbox'] = use_letterbox
                    break

        return jsonify({ 'success': True, 'letterbox': use_letterbox })
    except Exception as e:
        logger.error(f"Reformat clip error: {e}")
        return jsonify({ 'error': str(e) }), 500

def process_video_background(session_id, video_url, url_type, clip_duration, num_clips, aspect_ratio, resolution, custom_prompt):
    """Process video in background"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        clips_info = []
        
        # Process based on URL type
        if url_type == 'youtube':
            if not validate_youtube_url(video_url):
                processing_sessions[session_id] = {
                    'status': 'error',
                    'error': 'Invalid YouTube URL',
                    'session_id': session_id
                }
                return
            
            # Normalize the YouTube URL (remove extra parameters, clean format)
            normalized_url = normalize_youtube_url(video_url)
            
            # STEP 1: Send YouTube URL directly to Gemini for analysis (NO DOWNLOAD!)
            logger.info("=" * 60)
            logger.info("STEP 1: Analyzing YouTube video with Gemini 2.5 Pro")
            logger.info(f"Original URL: {video_url}")
            logger.info(f"Normalized URL: {normalized_url}")
            
            # Update status to analyzing
            processing_sessions[session_id] = {
                'status': 'processing',
                'progress': 10,
                'step': 1,
                'message': 'Analyzing video with Gemini AI...',
                'session_id': session_id
            }
            logger.info(f"Custom Prompt: {custom_prompt if custom_prompt else 'None (using default)'}")
            logger.info("Gemini will analyze the FULL video directly from YouTube")
            logger.info("=" * 60)
            
            timestamps = analyze_video_with_gemini(normalized_url, num_clips, clip_duration, custom_prompt, is_youtube=True)
            
            logger.info("=" * 60)
            logger.info("STEP 2: Gemini analysis complete! Received timestamps:")
            for i, ts in enumerate(timestamps):
                logger.info(f"  Clip {i+1}: {ts['start_time']} - {ts['end_time']} | {ts.get('description', 'N/A')}")
            logger.info("=" * 60)
            # Enforce requested number of clips when not in auto mode
            try:
                is_auto = isinstance(num_clips, str) and str(num_clips).lower() == 'auto'
                if not is_auto:
                    limit = max(1, int(num_clips))
                    timestamps = timestamps[:limit]
                    logger.info(f"Limiting to first {limit} clips per user request")
            except Exception:
                pass
            
            # STEP 3: Get stream URL for clip extraction
            logger.info("STEP 3: Getting video stream URL for clip extraction...")
            stream_url = get_video_stream_url(normalized_url)
            if not stream_url:
                processing_sessions[session_id] = {
                    'status': 'error',
                    'error': 'Failed to get video stream',
                    'session_id': session_id
                }
                return
            logger.info(f"✓ Stream URL obtained")
            logger.info("=" * 60)
            
            # Update status to extracting
            processing_sessions[session_id] = {
                'status': 'processing',
                'progress': 40,
                'step': 2,
                'message': 'Extracting clips from stream...',
                'session_id': session_id
            }
            
            # STEP 4: Extract clips from stream based on Gemini timestamps
            logger.info("STEP 4: Extracting and formatting clips...")
            for i, ts in enumerate(timestamps):
                logger.info(f"Processing clip {i + 1}/{len(timestamps)}: {ts['start_time']} - {ts['end_time']}")
                
                # Update progress for each clip
                clip_progress = 40 + int((i / len(timestamps)) * 40)  # 40-80% range
                processing_sessions[session_id] = {
                    'status': 'processing',
                    'progress': clip_progress,
                    'step': 3 if i > 0 else 2,
                    'message': f'Processing clip {i+1} of {len(timestamps)}...',
                    'session_id': session_id
                }
                temp_clip = os.path.join(TEMP_FOLDER, f"temp_{session_id}_{i}.mp4")
                final_clip = os.path.join(session_folder, f"clip_{i + 1}.mp4")
                
                # Calculate duration (robust parsing)
                start_seconds = parse_ts_to_seconds(ts['start_time'])
                end_seconds = parse_ts_to_seconds(ts['end_time'])
                duration = max(0.0, end_seconds - start_seconds)
                if duration < 0.4:
                    logger.warning(f"  ✗ Skipping near-zero duration clip ({duration:.3f}s) at {ts['start_time']} → {ts['end_time']}")
                    continue
                
                # Extract clip from stream (no download, just the specific segment)
                logger.info(f"  → Extracting from stream at {ts['start_time']} ({duration}s duration)...")
                if extract_clip_from_stream(stream_url, ts['start_time'], duration, temp_clip):
                    # Use letterbox decision from initial Gemini analysis (already decided in one pass)
                    use_letterbox = ts.get('letterbox', False) if aspect_ratio == "9:16" else False
                    
                    # Format clip (crop to aspect ratio with AI-determined mode)
                    mode_str = "LETTERBOX" if use_letterbox else "STANDARD"
                    logger.info(f"  → AI recommended: {mode_str} mode")
                    logger.info(f"  → Formatting to {aspect_ratio} @ {resolution} ({mode_str} mode)...")
                    if format_video_clip(temp_clip, final_clip, aspect_ratio, resolution, use_letterbox):
                        # Save metadata for reprocessing with different letterbox mode
                        metadata_file = final_clip.replace('.mp4', '.meta.json')
                        with open(metadata_file, 'w') as f:
                            json.dump({
                                'temp_clip': os.path.basename(temp_clip),
                                'aspect_ratio': aspect_ratio,
                                'resolution': resolution,
                                'original_letterbox': use_letterbox
                            }, f)
                        
                        clips_info.append({
                            'filename': f"clip_{i + 1}.mp4",
                            'url': f"/api/stream/{session_id}/clip_{i + 1}.mp4",
                            'description': ts.get('description', f'Clip {i + 1}'),
                            'start_time': ts['start_time'],
                            'end_time': ts['end_time'],
                            'letterbox': use_letterbox
                        })
                        logger.info(f"  ✓ Clip {i + 1} complete!")
                    else:
                        logger.error(f"  ✗ Failed to format clip {i + 1}")
                else:
                    logger.error(f"  ✗ Failed to extract clip {i + 1} from stream")
                    
                # Keep temp file for letterbox toggle functionality
                # (Do not delete temp_clip - it's needed for reprocessing)
            
            logger.info("=" * 60)
        
        elif url_type in ['google_drive', 'dropbox']:
            # Cloud storage processing (Google Drive or Dropbox)
            logger.info("=" * 60)
            logger.info(f"STEP 1: Downloading video from {url_type}")
            logger.info(f"URL: {video_url}")
            
            # Update status to downloading
            processing_sessions[session_id] = {
                'status': 'processing',
                'progress': 5,
                'step': 1,
                'message': f'Downloading from {url_type.replace("_", " ").title()}...',
                'session_id': session_id
            }
            
            # Download video from cloud storage
            temp_video_path = os.path.join(TEMP_FOLDER, f"{session_id}_cloud_video.mp4")
            if not download_cloud_video(video_url, url_type, temp_video_path):
                processing_sessions[session_id] = {
                    'status': 'error',
                    'error': f'Failed to download video from {url_type}',
                    'session_id': session_id
                }
                return
            
            # Update status to analyzing
            processing_sessions[session_id] = {
                'status': 'processing',
                'progress': 10,
                'step': 1,
                'message': 'Analyzing video with Gemini AI...',
                'session_id': session_id
            }
            
            # Analyze with Gemini (upload file)
            logger.info("Uploading cloud video to Gemini for analysis...")
            timestamps = analyze_video_with_gemini(temp_video_path, num_clips, clip_duration, custom_prompt, is_youtube=False)
            # Enforce requested number of clips when not in auto mode
            try:
                is_auto = isinstance(num_clips, str) and str(num_clips).lower() == 'auto'
                if not is_auto:
                    limit = max(1, int(num_clips))
                    timestamps = timestamps[:limit]
                    logger.info(f"Limiting to first {limit} clips per user request (cloud)")
            except Exception:
                pass
            
            # Update status to extracting
            processing_sessions[session_id] = {
                'status': 'processing',
                'progress': 40,
                'step': 2,
                'message': 'Extracting clips...',
                'session_id': session_id
            }
            
            # Process cloud video similarly
            logger.info("STEP 2: Extracting and formatting clips...")
            for i, ts in enumerate(timestamps):
                # Update progress for each clip
                clip_progress = 40 + int((i / len(timestamps)) * 40)  # 40-80% range
                processing_sessions[session_id] = {
                    'status': 'processing',
                    'progress': clip_progress,
                    'step': 3 if i > 0 else 2,
                    'message': f'Processing clip {i+1} of {len(timestamps)}...',
                    'session_id': session_id
                }
                
                temp_clip = os.path.join(TEMP_FOLDER, f"temp_{session_id}_{i}.mp4")
                final_clip = os.path.join(session_folder, f"clip_{i + 1}.mp4")
                
                # Calculate duration
                start_parts = ts['start_time'].split(':')
                end_parts = ts['end_time'].split(':')
                start_seconds = int(start_parts[0]) * 60 + int(start_parts[1])
                end_seconds = int(end_parts[0]) * 60 + int(end_parts[1])
                duration = end_seconds - start_seconds
                
                # Extract clip from cloud video file
                if extract_clip_from_stream(temp_video_path, ts['start_time'], duration, temp_clip):
                    # Use letterbox decision from initial Gemini analysis (already decided in one pass)
                    use_letterbox = ts.get('letterbox', False) if aspect_ratio == "9:16" else False
                    
                    # Format clip (crop to aspect ratio with AI-determined mode)
                    mode_str = "LETTERBOX" if use_letterbox else "STANDARD"
                    logger.info(f"  → AI recommended: {mode_str} mode")
                    logger.info(f"  → Formatting to {aspect_ratio} @ {resolution} ({mode_str} mode)...")
                    if format_video_clip(temp_clip, final_clip, aspect_ratio, resolution, use_letterbox):
                        # Save metadata for reprocessing with different letterbox mode
                        metadata_file = final_clip.replace('.mp4', '.meta.json')
                        with open(metadata_file, 'w') as f:
                            json.dump({
                                'temp_clip': os.path.basename(temp_clip),
                                'aspect_ratio': aspect_ratio,
                                'resolution': resolution,
                                'original_letterbox': use_letterbox
                            }, f)
                        
                        clips_info.append({
                            'filename': f"clip_{i + 1}.mp4",
                            'url': f"/api/stream/{session_id}/clip_{i + 1}.mp4",
                            'description': ts.get('description', f'Clip {i + 1}'),
                            'start_time': ts['start_time'],
                            'end_time': ts['end_time'],
                            'letterbox': use_letterbox
                        })
                        logger.info(f"  ✓ Clip {i + 1} complete!")
                    else:
                        logger.error(f"  ✗ Failed to format clip {i + 1}")
                else:
                    logger.error(f"Failed to extract clip {i + 1}")
                
                # Keep temp file for letterbox toggle functionality
                # (Do not delete temp_clip - it's needed for reprocessing)
            
            # Clean up downloaded cloud video  
            if os.path.exists(temp_video_path):
                os.remove(temp_video_path)
            
            logger.info("=" * 60)
        
        # Create ZIP of all clips
        if clips_info:
            zip_path = os.path.join(session_folder, 'all_clips.zip')
            with zipfile.ZipFile(zip_path, 'w') as zipf:
                for clip in clips_info:
                    clip_path = os.path.join(session_folder, clip['filename'])
                    if os.path.exists(clip_path):
                        zipf.write(clip_path, clip['filename'])
                        logger.info(f"Added {clip['filename']} to ZIP")
            logger.info(f"Created ZIP file: {zip_path}")
        
        # Update session status to completed
        processing_sessions[session_id] = {
            'status': 'completed',
            'progress': 100,
            'step': 4,
            'message': 'All clips ready!',
            'session_id': session_id,
            'clips': clips_info,
            'zip_path': f'/api/download/{session_id}/all'
        }
        logger.info(f"Processing completed for session {session_id}")
        
    except Exception as e:
        logger.error(f"Background processing error: {e}")
        # Update session status to error
        processing_sessions[session_id] = {
            'status': 'error',
            'error': str(e),
            'session_id': session_id
        }

@app.route('/api/stream/<session_id>/<filename>')
def stream_video(session_id, filename):
    """Stream video file for direct playback"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        video_path = os.path.join(session_folder, filename)
        
        if os.path.exists(video_path):
            # Return video with proper headers for streaming
            response = send_file(video_path, mimetype='video/mp4')
            response.headers['Accept-Ranges'] = 'bytes'
            response.headers['Cache-Control'] = 'no-cache'
            return response
        else:
            return jsonify({'error': 'Video not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<session_id>/<filename>')
def download_clip(session_id, filename):
    """Download individual clip or all clips"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        
        if filename == 'all':
            # Download all clips as ZIP
            zip_path = os.path.join(session_folder, 'all_clips.zip')
            if os.path.exists(zip_path):
                return send_file(zip_path, as_attachment=True, download_name=f'clips_{session_id}.zip')
            else:
                return jsonify({'error': 'ZIP file not found'}), 404
        else:
            # Download individual clip
            clip_path = os.path.join(session_folder, filename)
            if os.path.exists(clip_path):
                return send_file(clip_path, as_attachment=True, mimetype='video/mp4')
            else:
                return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download-edited-clips/<session_id>', methods=['POST'])
def download_edited_clips(session_id):
    """Download edited clips as ZIP (split, captioned, etc.)"""
    try:
        logger.info(f"Download edited clips request for session: {session_id}")
        
        # Get data from request
        data = request.get_json()
        if not data:
            logger.error("No JSON data in request")
            return jsonify({'error': 'No JSON data provided'}), 400
            
        filenames = data.get('filenames', [])
        logger.info(f"Requested filenames: {filenames}")
        
        if not filenames:
            logger.error("No filenames in request")
            return jsonify({'error': 'No files specified'}), 400
        
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        
        if not os.path.exists(session_folder):
            logger.error(f"Session folder not found: {session_folder}")
            return jsonify({'error': 'Session not found'}), 404
        
        # Create a temporary ZIP file
        zip_filename = f'edited_clips_{uuid.uuid4().hex[:8]}.zip'
        zip_path = os.path.join(session_folder, zip_filename)
        
        files_added = 0
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for item in filenames:
                # Handle both string filenames and dict format {'source': 'file.mp4', 'as': 'renamed.mp4'}
                if isinstance(item, dict):
                    filename = item.get('source', item.get('filename', ''))
                    arcname = item.get('as', filename)
                else:
                    filename = item
                    arcname = item
                
                file_path = os.path.join(session_folder, filename)
                if os.path.exists(file_path):
                    # Add file to ZIP with the specified archive name
                    zipf.write(file_path, arcname=arcname)
                    files_added += 1
                    logger.info(f"✓ Added {filename} to ZIP as {arcname}")
                else:
                    logger.warning(f"✗ File not found: {filename} at {file_path}")
        
        if files_added == 0:
            logger.error("No files were added to ZIP")
            if os.path.exists(zip_path):
                os.remove(zip_path)
            return jsonify({'error': 'No files found to download'}), 404
        
        logger.info(f"Created ZIP with {files_added} files: {zip_path}")
        
        # Send the ZIP file and then delete it
        @after_this_request
        def remove_zip(response):
            try:
                if os.path.exists(zip_path):
                    os.remove(zip_path)
                    logger.info(f"Cleaned up ZIP: {zip_path}")
            except Exception as e:
                logger.error(f"Error removing ZIP: {e}")
            return response
        
        return send_file(
            zip_path, 
            as_attachment=True, 
            download_name=f'clips_{session_id}.zip',
            mimetype='application/zip'
        )
        
    except Exception as e:
        logger.error(f"Download edited clips error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-captions/<session_id>/<filename>', methods=['POST'])
def generate_captions(session_id, filename):
    """Generate captions for a video clip using Whisper"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        video_path = os.path.join(session_folder, filename)
        
        if not os.path.exists(video_path):
            return jsonify({'error': 'Video not found'}), 404
        
        # Get language from request
        data = request.json or {}
        language = data.get('language', 'en')
        
        logger.info(f"🎙️ Generating captions for {filename}")
        
        # Transcribe video
        result = whisper_service.transcribe_video(video_path, language)
        
        if result:
            # Save captions to file
            captions_file = os.path.join(session_folder, f"{filename}.captions.json")
            with open(captions_file, 'w') as f:
                json.dump(result, f)
            
            return jsonify({
                'success': True,
                'captions': result['captions'],
                'fullText': result['full_text'],
                'language': result['language']
            })
        else:
            return jsonify({'error': 'Caption generation failed'}), 500
            
    except Exception as e:
        logger.error(f"Caption generation error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/update-captions/<session_id>/<filename>', methods=['POST'])
def update_captions(session_id, filename):
    """Update captions for a video"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        captions_file = os.path.join(session_folder, f"{filename}.captions.json")
        
        data = request.json
        captions = data.get('captions', [])
        
        # Save updated captions
        caption_data = {
            'captions': captions,
            'full_text': ' '.join([c['text'] for c in captions]),
            'language': data.get('language', 'en')
        }
        
        with open(captions_file, 'w') as f:
            json.dump(caption_data, f)
        
        return jsonify({'success': True})
        
    except Exception as e:
        logger.error(f"Caption update error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/generate-captioned-version/<session_id>/<filename>', methods=['POST'])
def generate_captioned_version(session_id, filename):
    """Generate a captioned version of the video for merging (not download)"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        video_path = os.path.join(session_folder, filename)
        captions_file = os.path.join(session_folder, f"{filename}.captions.json")
        
        if not os.path.exists(video_path):
            return jsonify({'error': 'Video not found'}), 404
        
        if not os.path.exists(captions_file):
            return jsonify({'error': 'No captions found'}), 404
        
        # Get style options and optionally captions from request
        data = request.json or {}
        style_options = data.get('styleOptions', {})
        logger.info(f"📝 Caption generation request for {filename}")
        logger.info(f"📝 Style options received: {json.dumps(style_options, indent=2)}")
        
        # Load captions (prefer POST body if provided)
        if 'captions' in data and isinstance(data['captions'], list) and len(data['captions']) > 0:
            captions = data['captions']
            logger.info(f"📝 Using captions from request body: {len(captions)} items")
        else:
            with open(captions_file, 'r') as f:
                caption_data = json.load(f)
            captions = caption_data.get('captions', [])
        
        logger.info(f"📝 Loaded {len(captions)} captions")
        if len(captions) == 0:
            logger.error("❌ No captions to burn - returning error")
            return jsonify({'error': 'No captions available'}), 404
        
        # Log first caption for debugging
        if captions:
            logger.info(f"📝 First caption: {captions[0]}")
        
        # Create output filename (replace original)
        output_filename = f"captioned_{filename}"
        output_path = os.path.join(session_folder, output_filename)
        
        # Check if already exists - if so, delete and regenerate with new styles
        if os.path.exists(output_path):
            logger.info(f"Captioned version already exists, removing to regenerate with new styles: {output_filename}")
            os.remove(output_path)
        
        # Burn captions using FFmpeg
        logger.info(f"🎬 Generating captioned version: {output_filename}")
        success = burn_captions_ffmpeg(video_path, output_path, captions, style_options)
        
        if success:
            logger.info(f"✅ Successfully created captioned version: {output_filename}")
        else:
            logger.error(f"❌ Failed to create captioned version: {output_filename}")
        
        if success:
            return jsonify({
                'success': True,
                'filename': output_filename
            })
        else:
            return jsonify({'error': 'Failed to generate captioned version'}), 500
            
    except Exception as e:
        logger.error(f"Generate captioned version error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/download-with-captions/<session_id>/<filename>', methods=['POST'])
def download_with_captions(session_id, filename):
    """Download video with burned-in captions"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        video_path = os.path.join(session_folder, filename)
        captions_file = os.path.join(session_folder, f"{filename}.captions.json")
        
        if not os.path.exists(video_path):
            return jsonify({'error': 'Video not found'}), 404
        
        # Get style options and optionally captions from request
        data = request.json or {}
        style_options = data.get('styleOptions', {})
        
        # Load captions (prefer POST body if provided)
        if 'captions' in data and isinstance(data['captions'], list) and len(data['captions']) > 0:
            captions = data['captions']
            logger.info(f"📝 Using captions from request body: {len(captions)} items")
        else:
            with open(captions_file, 'r') as f:
                caption_data = json.load(f)
            captions = caption_data.get('captions', [])
        
        # Create output path
        output_filename = f"captioned_{filename}"
        output_path = os.path.join(session_folder, output_filename)
        
        # Burn captions using FFmpeg
        success = burn_captions_ffmpeg(video_path, output_path, captions, style_options)
        
        if success:
            return send_file(output_path, as_attachment=True, download_name=output_filename)
        else:
            return jsonify({'error': 'Failed to add captions'}), 500
            
    except Exception as e:
        logger.error(f"Download with captions error: {e}")
        return jsonify({'error': str(e)}), 500

def burn_captions_ffmpeg(video_path, output_path, captions, style_options):
    """Burn captions into video using FFmpeg"""
    try:
        # Create temporary ASS file (better style support than SRT)
        temp_ass = os.path.join(tempfile.gettempdir(), f"captions_{uuid.uuid4()}.ass")
        
        logger.info(f"📝 Generating ASS subtitle file with {len(captions)} captions")
        
        # Extract style options with fallbacks for both naming conventions
        # Sanitize font family: CSS values like "Inter, sans-serif" break ASS parser
        raw_font = style_options.get('fontFamily', 'Arial')
        font = raw_font
        if isinstance(font, str):
            # Take the first family and strip quotes/spaces
            if ',' in font:
                font = font.split(',')[0]
            font = font.strip().strip('"').strip("'")
            # Map generic family names to concrete fonts
            generic = font.lower()
            if generic in ['sans-serif', 'system-ui', 'ui-sans-serif']:
                font = 'Arial'
            elif generic in ['serif', 'ui-serif']:
                font = 'Times New Roman'
            elif generic in ['monospace', 'ui-monospace']:
                font = 'Courier New'
            # Provide fallbacks for common web fonts that may not exist server-side
            fallback_map = {
                'inter': 'Arial',
                'montserrat': 'Arial',
                'helvetica': 'Arial',
                'libre caslon text': 'Georgia',
                'trebuchet ms': 'Trebuchet MS',
                'impact': 'Impact',
                'verdana': 'Verdana'
            }
            font = fallback_map.get(generic, font)
        else:
            font = 'Arial'
        font_size = style_options.get('fontSize', 24)
        # Support both 'color' and 'fontColor'
        font_color = style_options.get('color', style_options.get('fontColor', '#FFFFFF'))
        bg_color = style_options.get('backgroundColor', '#000000')
        # Support backgroundOpacity as decimal (0-1) or percentage (0-100)
        bg_opacity = style_options.get('backgroundOpacity', 80)
        if bg_opacity > 1:
            bg_opacity = bg_opacity / 100.0  # Convert percentage to decimal
        position = style_options.get('position', 'bottom')
        position_y = style_options.get('positionY', 90)
        # Support both string and numeric font weight
        font_weight_val = style_options.get('fontWeight', 400)
        if isinstance(font_weight_val, str):
            font_weight_lower = font_weight_val.lower()
            if font_weight_lower in ['bold', 'bolder']:
                font_weight = 700
            elif font_weight_lower == 'black':
                font_weight = 900
            elif font_weight_lower in ['light', 'lighter']:
                font_weight = 300
            elif font_weight_lower == 'normal':
                font_weight = 400
            else:
                font_weight = 400  # Default fallback
        else:
            font_weight = font_weight_val
        outline_color = style_options.get('outlineColor', '#000000')
        outline_width = style_options.get('outlineWidth', 0)
        letter_spacing = style_options.get('letterSpacing', 0)
        text_align = style_options.get('textAlign', 'center')
        position_x = style_options.get('positionX', 50)
        position_y = style_options.get('positionY', 85)
        animation = style_options.get('animation', 'none')
        line_height = style_options.get('lineHeight', 1.2)
        
        # Convert colors to FFmpeg ASS format (ABGR)
        # Extract RGB from hex
        font_r = int(font_color[1:3], 16)
        font_g = int(font_color[3:5], 16)
        font_b = int(font_color[5:7], 16)
        
        bg_r = int(bg_color[1:3], 16)
        bg_g = int(bg_color[3:5], 16)
        bg_b = int(bg_color[5:7], 16)
        
        # Calculate alpha value (ASS uses 0=opaque, 255=transparent)
        bg_alpha = int((1 - bg_opacity) * 255)
        
        # ASS format: &HAABBGGRR (hex, alpha-blue-green-red)
        font_color_ass = f"&H00{font_b:02X}{font_g:02X}{font_r:02X}"
        bg_color_ass = f"&H{bg_alpha:02X}{bg_b:02X}{bg_g:02X}{bg_r:02X}"
        
        # Parse outline color
        outline_r = int(outline_color[1:3], 16)
        outline_g = int(outline_color[3:5], 16)
        outline_b = int(outline_color[5:7], 16)
        outline_color_ass = f"&H00{outline_b:02X}{outline_g:02X}{outline_r:02X}"
        
        # Map position and text alignment to FFmpeg alignment
        # ASS Alignment: 1=bottom left, 2=bottom center, 3=bottom right
        #                4=middle left, 5=middle center, 6=middle right
        #                7=top left, 8=top center, 9=top right
        
        # Fix ASS positioning to match frontend preview exactly
        # Frontend positionY: 0=top, 50=center, 85=bottom
        # ASS Alignment: 1=bottom left, 2=bottom center, 3=bottom right
        #                4=middle left, 5=middle center, 6=middle right  
        #                7=top left, 8=top center, 9=top right
        
        # Determine horizontal alignment first
        horizontal = text_align.lower() if text_align else 'center'
        if horizontal == 'left':
            h_align = 'left'
        elif horizontal == 'right':
            h_align = 'right' 
        else:
            h_align = 'center'
        
        # Determine vertical position based on positionY with better thresholds
        if position_y <= 30:
            v_align = 'top'
        elif position_y >= 70:
            v_align = 'bottom'
        else:
            v_align = 'middle'
        
        # Map to ASS alignment numbers
        alignment_map = {
            'top_left': 7, 'top_center': 8, 'top_right': 9,
            'middle_left': 4, 'middle_center': 5, 'middle_right': 6,
            'bottom_left': 1, 'bottom_center': 2, 'bottom_right': 3
        }
        alignment = alignment_map.get(f"{v_align}_{h_align}", 5)  # Default middle center
        
        # Calculate MarginV based on exact positionY to match preview
        # MarginV is distance from reference edge in pixels
        if v_align == 'top':
            margin_v = max(10, int(position_y * 8))  # More responsive to position changes
        elif v_align == 'bottom':
            margin_v = max(10, int((100 - position_y) * 8))
        else:
            # For middle alignment, use MarginV to fine-tune vertical position
            # positionY=50 should be true center (MarginV=0)
            margin_v = int((position_y - 50) * 6)  # Allows offset from true center
        
        # Build force_style string
        # Convert font weight (100-900) to ASS Bold value
        # ASS Bold: 0=normal, -1=bold
        # Map: 100-400=0 (normal), 500-900=-1 (bold)
        ass_bold = -1 if font_weight >= 500 else 0
        
        # Fix background rendering
        # BorderStyle: 1=Outline+Shadow, 3=Opaque background box, 4=Opaque box + outline
        # For visible background (opacity > 0), use opaque box style
        has_background = (bg_opacity or 0) > 0.01
        if has_background:
            border_style = 3  # Opaque background box
        elif outline_width > 0:
            border_style = 1  # Outline only  
        else:
            border_style = 0  # No border/background
        
        # Spacing is added in pixels
        spacing = int(letter_spacing)
        
        # Build comprehensive force_style with proper background handling
        force_style = (
            f"FontName={font},"
            f"FontSize={font_size},"
            f"Bold={ass_bold},"
            f"PrimaryColour={font_color_ass},"
            f"BackColour={bg_color_ass},"
            f"OutlineColour={outline_color_ass},"
            f"Alignment={alignment},"
            f"MarginV={margin_v},"
            f"MarginL=20,MarginR=20,"  # Add horizontal margins
            f"BorderStyle={border_style},"
            f"Outline={max(0, outline_width)},"
            f"Shadow=0,"
            f"Spacing={spacing},"
            f"ScaleX=100,ScaleY=100"  # Ensure no scaling issues
        )
        # Generate ASS subtitle file with embedded styles
        ass_content = generate_ass_file(
            captions,
            style_options,
            font,
            font_size,
            font_color_ass,
            bg_color_ass,
            outline_color_ass,
            alignment,
            margin_v,
            border_style,
            outline_width,
            spacing,
            ass_bold,
            position_x,
            position_y,
            animation,
            line_height
        )
        
        with open(temp_ass, 'w', encoding='utf-8') as f:
            f.write(ass_content)
        
        logger.info(f"📝 ASS file created: {temp_ass}")
        logger.info(f"📝 ASS preview (first 300 chars): {ass_content[:300]}")
        
        # Build FFmpeg command with ASS subtitles
        ass_for_filter = temp_ass.replace('\\', '\\\\').replace(':', '\\:')
        
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-vf', f"ass={ass_for_filter}",
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'copy',
            '-y',
            output_path
        ]
        
        logger.info(f"🎬 Running FFmpeg with ASS subtitles")
        
        # Run FFmpeg with detailed error capture
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        # Log results
        if result.returncode != 0:
            logger.error(f"❌ FFmpeg failed with return code {result.returncode}")
            logger.error(f"FFmpeg stderr: {result.stderr[-500:]}")  # Last 500 chars
        else:
            logger.info(f"✅ FFmpeg succeeded - captioned video created: {output_path}")
            if os.path.exists(output_path):
                logger.info(f"✅ Output file size: {os.path.getsize(output_path)} bytes")
        
        # Clean up temp file
        if os.path.exists(temp_ass):
            os.remove(temp_ass)
        
        return result.returncode == 0
        
    except Exception as e:
        logger.error(f"FFmpeg caption burning error: {e}")
        return False

def generate_ass_file(
    captions,
    style_options,
    font,
    font_size,
    font_color_ass,
    bg_color_ass,
    outline_color_ass,
    alignment,
    margin_v,
    border_style,
    outline_width,
    spacing,
    bold,
    position_x_percent,
    position_y_percent,
    animation,
    line_height
):
    """Generate ASS subtitle file with embedded styles (square backgrounds only)"""
    
    logger.info(
        f"📝 ASS Style values: Font={font}, Size={font_size}, FgColor={font_color_ass}, "
        f"BgColor={bg_color_ass}, BorderStyle={border_style}, Alignment={alignment}, "
        f"Position=({position_x_percent}%, {position_y_percent}%), Animation={animation}"
    )
    
    play_res_x = 1920
    play_res_y = 1080
    
    # Clamp positions to viewport
    pos_x_percent = 50 if position_x_percent is None else position_x_percent
    pos_y_percent = 85 if position_y_percent is None else position_y_percent
    pos_x_percent = max(0, min(pos_x_percent, 100))
    pos_y_percent = max(0, min(pos_y_percent, 100))
    base_pos_x = int(play_res_x * (pos_x_percent / 100))
    base_pos_y = int(play_res_y * (pos_y_percent / 100))
    
    # Scale animation values
    animation = (animation or 'none').lower()
    
    # ASS does not directly support CSS-style line height;
    # keep vertical scale consistent to avoid stretching text.
    scale_y = 100
    
    # ASS header with proper background rendering
    # Note: ASS backgrounds are always rectangular boxes, no rounded corners
    ass_lines = [
        "[Script Info]",
        "Title: Generated Subtitles",
        "ScriptType: v4.00+",
        "WrapStyle: 0",
        f"PlayResX: {play_res_x}",
        f"PlayResY: {play_res_y}",
        "",
        "[V4+ Styles]",
        f"Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # BorderStyle 3 = opaque box, Outline value becomes the padding around text
        f"Style: Default,{font},{font_size},{font_color_ass},&H000000FF,{outline_color_ass},{bg_color_ass},{bold},0,0,0,100,{scale_y},{spacing},0,{border_style},{max(outline_width, 10)},0,{alignment},20,20,{margin_v},1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"
    ]
    
    slide_offset = int(play_res_y * 0.1)  # 10% of screen height
    
    def escape_ass_text(text: str) -> str:
        return text.replace('\\', r'\\').replace('{', r'\{').replace('}', r'\}')
    
    def build_animation_tags(anim: str, x: int, y: int):
        tags = []
        effect_field = ""
        if anim == 'fade':
            tags.append(r'\fad(150,150)')
            tags.append(rf'\pos({x},{y})')
        elif anim == 'slide-up':
            start_y = min(play_res_y, y + slide_offset)
            tags.append(rf'\move({x},{start_y},{x},{y})')
        elif anim == 'slide-down':
            start_y = max(0, y - slide_offset)
            tags.append(rf'\move({x},{start_y},{x},{y})')
        elif anim == 'zoom':
            tags.append(rf'\pos({x},{y})')
            tags.append(r'\t(0,200,\fscx115\fscy115)\t(200,400,\fscx100\fscy100)')
        elif anim == 'bounce':
            start_y = min(play_res_y, y + slide_offset)
            tags.append(rf'\move({x},{start_y},{x},{y})')
            tags.append(r'\t(0,200,\fscy115)\t(200,400,\fscy100)')
        elif anim == 'typewriter':
            effect_field = "Typewriter"
            tags.append(rf'\pos({x},{y})')
        else:
            tags.append(rf'\pos({x},{y})')
        
        return tags, effect_field
    
    # Add dialogue lines
    for caption in captions:
        start = format_time_for_ass(caption['start'])
        end = format_time_for_ass(caption['end'])
        text = escape_ass_text(str(caption.get('text', ''))).replace('\n', '\\N')
        
        tags, effect_field = build_animation_tags(animation, base_pos_x, base_pos_y)
        override = ''.join(tags)
        if override:
            text = f"{{{override}}}{text}"
        
        ass_lines.append(f"Dialogue: 0,{start},{end},Default,,0,0,0,{effect_field},{text}")
    
    return '\n'.join(ass_lines)

def format_time_for_ass(seconds):
    """Convert seconds to ASS time format (H:MM:SS.CC)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    centisecs = int((seconds % 1) * 100)
    return f"{hours}:{minutes:02d}:{secs:02d}.{centisecs:02d}"

def format_time_for_srt(seconds):
    """Convert seconds to SRT time format"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"

@app.route('/api/captions/<session_id>/<filename>')
def get_captions(session_id, filename):
    """Get captions for a video if they exist"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        captions_file = os.path.join(session_folder, f"{filename}.captions.json")
        
        if os.path.exists(captions_file):
            with open(captions_file, 'r') as f:
                caption_data = json.load(f)
            return jsonify(caption_data)
        else:
            return jsonify({'captions': [], 'fullText': '', 'language': 'en'})
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/clip-info/<session_id>/<filename>')
def get_clip_info(session_id, filename):
    """Get detailed information about a video clip including duration"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        video_path = os.path.join(session_folder, filename)
        
        if not os.path.exists(video_path):
            return jsonify({'error': 'Video not found'}), 404
            
        # Get video duration using ffprobe
        probe_cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height,duration',
            '-show_entries', 'format=duration',
            '-of', 'json',
            video_path
        ]
        
        probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
        video_info = json.loads(probe_result.stdout)
        
        # Get duration (try stream first, then format)
        duration = None
        if 'streams' in video_info and len(video_info['streams']) > 0:
            duration = video_info['streams'][0].get('duration')
        if not duration and 'format' in video_info:
            duration = video_info['format'].get('duration')
            
        width = video_info['streams'][0]['width'] if 'streams' in video_info else None
        height = video_info['streams'][0]['height'] if 'streams' in video_info else None
        
        return jsonify({
            'filename': filename,
            'duration': float(duration) if duration else 0,
            'width': width,
            'height': height
        })
            
    except Exception as e:
        logger.error(f"Get clip info error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/merge-clips/<session_id>', methods=['POST'])
def merge_clips(session_id):
    """Merge multiple clips into one video"""
    try:
        data = request.json
        clips_to_merge = data.get('clips', [])
        
        if len(clips_to_merge) < 2:
            return jsonify({'error': 'At least 2 clips required for merging'}), 400
            
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        
        # Create a text file with the list of videos to concatenate
        list_file = os.path.join(session_folder, 'merge_list.txt')
        output_filename = f'merged_{uuid.uuid4().hex[:8]}.mp4'
        output_path = os.path.join(session_folder, output_filename)
        
        # Create temporary trimmed clips if needed
        temp_clips = []
        with open(list_file, 'w') as f:
            for clip_info in clips_to_merge:
                filename = clip_info['filename']
                start_time = clip_info.get('startTime', 0)
                end_time = clip_info.get('endTime', None)
                input_path = os.path.join(session_folder, filename)
                
                # If trimming is needed
                if start_time > 0 or end_time is not None:
                    temp_filename = f'temp_{uuid.uuid4().hex[:8]}.mp4'
                    temp_path = os.path.join(session_folder, temp_filename)
                    temp_clips.append(temp_path)
                    
                    # Trim the clip
                    trim_cmd = ['ffmpeg', '-i', input_path]
                    if start_time > 0:
                        trim_cmd.extend(['-ss', str(start_time)])
                    if end_time is not None:
                        trim_cmd.extend(['-to', str(end_time)])
                    trim_cmd.extend(['-c', 'copy', '-y', temp_path])
                    
                    subprocess.run(trim_cmd, capture_output=True, check=True)
                    # Write absolute path to avoid path confusion
                    f.write(f"file '{os.path.abspath(temp_path)}'\n")
                else:
                    # Write absolute path to avoid path confusion
                    f.write(f"file '{os.path.abspath(input_path)}'\n")
        
        # Merge the clips using FFmpeg concat with re-encoding for compatibility
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', list_file,
            '-c:v', 'libx264',
            '-preset', 'medium',
            '-crf', '23',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        logger.info(f"Running merge command: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, timeout=300)
        
        # Clean up temporary files
        if os.path.exists(list_file):
            os.remove(list_file)
        for temp_clip in temp_clips:
            if os.path.exists(temp_clip):
                os.remove(temp_clip)
        
        if result.returncode == 0:
            logger.info(f"Successfully merged {len(clips_to_merge)} clips into {output_filename}")
            return jsonify({
                'success': True,
                'filename': output_filename,
                'url': f'/api/stream/{session_id}/{output_filename}'
            })
        else:
            error_msg = result.stderr.decode() if result.stderr else 'Unknown FFmpeg error'
            logger.error(f"FFmpeg merge error: {error_msg}")
            return jsonify({'error': f'Failed to merge clips: {error_msg}'}), 500
            
    except Exception as e:
        logger.error(f"Merge clips error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/toggle-letterbox/<session_id>/<filename>', methods=['POST'])
def toggle_letterbox(session_id, filename):
    """Re-process a clip with different letterbox settings by reprocessing from the original extracted temp clip"""
    try:
        data = request.json
        use_letterbox = data.get('use_letterbox', False)
        
        logger.info(f"Toggle letterbox: {filename}, use_letterbox={use_letterbox}")
        
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        final_clip_path = os.path.join(session_folder, filename)
        metadata_file = final_clip_path.replace('.mp4', '.meta.json')
        
        # Check if metadata exists
        if not os.path.exists(metadata_file):
            logger.error(f"No metadata file found for {filename}")
            return jsonify({'error': 'Cannot toggle - metadata not found. Please regenerate clips.'}), 404
        
        # Load metadata
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        # Temp clips are stored in TEMP_FOLDER, not session_folder
        temp_clip_path = os.path.join(TEMP_FOLDER, metadata['temp_clip'])
        
        # Check if temp clip still exists
        if not os.path.exists(temp_clip_path):
            logger.error(f"Temp clip not found: {temp_clip_path}")
            return jsonify({'error': 'Cannot toggle - original clip not found. Please regenerate clips.'}), 404
        
        aspect_ratio = metadata['aspect_ratio']
        resolution = metadata['resolution']
        
        logger.info(f"Reprocessing from temp clip: {metadata['temp_clip']}")
        logger.info(f"Settings: {aspect_ratio} @ {resolution}, letterbox={use_letterbox}")
        
        # Reprocess the clip with the new letterbox setting
        mode_str = "LETTERBOX" if use_letterbox else "STANDARD"
        logger.info(f"Applying {mode_str} mode...")
        
        if format_video_clip(temp_clip_path, final_clip_path, aspect_ratio, resolution, use_letterbox):
            # Update metadata
            metadata['original_letterbox'] = use_letterbox
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f)
            
            logger.info(f"Successfully reprocessed {filename} with {mode_str} mode")
            
            # Add cache-busting timestamp
            timestamp = int(time.time() * 1000)
            
            return jsonify({
                'success': True,
                'filename': filename,
                'url': f'/api/stream/{session_id}/{filename}?v={timestamp}',
                'letterbox': use_letterbox,
                'timestamp': timestamp
            })
        else:
            logger.error(f"Failed to reprocess {filename}")
            return jsonify({'error': 'Failed to reprocess video'}), 500
            
    except Exception as e:
        logger.error(f"Toggle letterbox error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/split-clip/<session_id>', methods=['POST'])
def split_clip(session_id):
    """Split a clip into two parts at the specified time"""
    try:
        data = request.json
        filename = data.get('filename')
        split_time = float(data.get('split_time'))  # Time in seconds from video start
        clip_start = float(data.get('clip_start', 0))
        clip_end = float(data.get('clip_end'))
        
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        original_clip_path = os.path.join(session_folder, filename)
        
        if not os.path.exists(original_clip_path):
            return jsonify({'error': 'Clip not found'}), 404
        
        # Calculate split point relative to the clip
        time_in_clip = split_time - clip_start
        
        # Generate unique filenames for the two parts
        timestamp = int(time.time() * 1000)
        base_name = filename.replace('.mp4', '')
        part1_filename = f"{base_name}_split{timestamp}_1.mp4"
        part2_filename = f"{base_name}_split{timestamp}_2.mp4"
        
        part1_path = os.path.join(session_folder, part1_filename)
        part2_path = os.path.join(session_folder, part2_filename)
        
        # Extract first part (from 0 to time_in_clip) - MAXIMUM QUALITY
        duration1 = time_in_clip
        cmd1 = [
            'ffmpeg', '-y',
            '-i', original_clip_path,
            '-t', str(duration1),
            '-c:v', 'libx264',
            '-preset', 'veryslow',  # Maximum quality compression
            '-crf', '18',  # Visually lossless quality
            '-c:a', 'aac',
            '-b:a', '320k',  # Maximum AAC audio quality
            '-avoid_negative_ts', 'make_zero',
            part1_path
        ]
        
        # Extract second part (from time_in_clip to end) - MAXIMUM QUALITY
        # Using -ss BEFORE -i for faster seeking, then re-encode for accuracy
        duration2 = clip_end - split_time
        cmd2 = [
            'ffmpeg', '-y',
            '-ss', str(time_in_clip),
            '-i', original_clip_path,
            '-t', str(duration2),
            '-c:v', 'libx264',
            '-preset', 'veryslow',  # Maximum quality compression
            '-crf', '18',  # Visually lossless quality
            '-c:a', 'aac',
            '-b:a', '320k',  # Maximum AAC audio quality
            '-avoid_negative_ts', 'make_zero',
            part2_path
        ]
        
        logger.info(f"Splitting {filename} at {time_in_clip}s")
        logger.info(f"Part 1: {clip_start}s -> {split_time}s ({duration1}s)")
        logger.info(f"Part 2: {split_time}s -> {clip_end}s ({duration2}s)")
        
        # Execute FFmpeg commands
        subprocess.run(cmd1, check=True, capture_output=True)
        subprocess.run(cmd2, check=True, capture_output=True)

        # If metadata exists for the original, also split its temp clip and create metas for parts
        original_meta_path = original_clip_path.replace('.mp4', '.meta.json')
        if os.path.exists(original_meta_path):
            try:
                with open(original_meta_path, 'r') as f:
                    orig_meta = json.load(f)
                temp_name = orig_meta.get('temp_clip')
                if temp_name:
                    source_temp_path = os.path.join(TEMP_FOLDER, temp_name)
                    if os.path.exists(source_temp_path):
                        # Create temp parts
                        part1_temp = os.path.join(TEMP_FOLDER, f"temp_{session_id}_{timestamp}_1.mp4")
                        part2_temp = os.path.join(TEMP_FOLDER, f"temp_{session_id}_{timestamp}_2.mp4")

                        # Build commands to split the temp clip at time_in_clip
                        cmd1t = [
                            'ffmpeg', '-y',
                            '-i', source_temp_path,
                            '-t', str(duration1),
                            '-c', 'copy',
                            part1_temp
                        ]
                        cmd2t = [
                            'ffmpeg', '-y',
                            '-ss', str(time_in_clip),
                            '-i', source_temp_path,
                            '-t', str(duration2),
                            '-c', 'copy',
                            part2_temp
                        ]

                        subprocess.run(cmd1t, check=True, capture_output=True)
                        subprocess.run(cmd2t, check=True, capture_output=True)

                        # Write meta for parts so reformat can use their temp clips
                        meta1 = {
                            'temp_clip': os.path.basename(part1_temp),
                            'aspect_ratio': orig_meta.get('aspect_ratio', '9:16'),
                            'resolution': orig_meta.get('resolution', '1080p'),
                            'original_letterbox': orig_meta.get('original_letterbox', False)
                        }
                        meta2 = {
                            'temp_clip': os.path.basename(part2_temp),
                            'aspect_ratio': orig_meta.get('aspect_ratio', '9:16'),
                            'resolution': orig_meta.get('resolution', '1080p'),
                            'original_letterbox': orig_meta.get('original_letterbox', False)
                        }
                        with open(part1_path.replace('.mp4', '.meta.json'), 'w') as f:
                            json.dump(meta1, f)
                        with open(part2_path.replace('.mp4', '.meta.json'), 'w') as f:
                            json.dump(meta2, f)
            except Exception as e:
                logger.warning(f"Could not create split metas: {e}")
        
        # Delete original clip (and its meta if present)
        os.remove(original_clip_path)
        try:
            if os.path.exists(original_meta_path):
                os.remove(original_meta_path)
        except Exception:
            pass
        
        logger.info(f"Successfully split {filename} into {part1_filename} and {part2_filename}")

        # Update processing_sessions so Studio reload reflects split
        try:
            sess = processing_sessions.get(session_id)
            if sess is not None:
                clips_list = sess.get('clips', [])
                # Find original entry
                idx = next((i for i, c in enumerate(clips_list) if c.get('filename') == filename), -1)
                # Load orig meta for letterbox flag
                orig_letterbox = False
                orig_desc = None
                try:
                    with open(original_meta_path, 'r') as f:
                        om = json.load(f)
                        orig_letterbox = bool(om.get('original_letterbox', False))
                except Exception:
                    pass
                if idx >= 0:
                    try:
                        orig_desc = clips_list[idx].get('description')
                    except Exception:
                        pass
                    # Build two new entries (start fresh from 0)
                    clips_list.pop(idx)
                    clips_list[idx:idx] = [
                        {
                            'filename': part1_filename,
                            'path': f"/api/stream/{session_id}/{part1_filename}",
                            'description': orig_desc or 'Split Part 1',
                            'start_time': format_seconds_mmss(0),
                            'end_time': format_seconds_mmss(duration1),
                            'letterbox': orig_letterbox
                        },
                        {
                            'filename': part2_filename,
                            'path': f"/api/stream/{session_id}/{part2_filename}",
                            'description': orig_desc or 'Split Part 2',
                            'start_time': format_seconds_mmss(0),
                            'end_time': format_seconds_mmss(duration2),
                            'letterbox': orig_letterbox
                        }
                    ]
                    sess['clips'] = clips_list
        except Exception as e:
            logger.warning(f"Could not update session clips after split: {e}")
        
        return jsonify({
            'success': True,
            'parts': [
                {
                    'filename': part1_filename,
                    'start': 0,  # New file starts at 0
                    'end': duration1,  # Ends at its duration
                    'duration': duration1,
                    'original_start': clip_start,  # Keep track of original position
                    'original_end': split_time
                },
                {
                    'filename': part2_filename,
                    'start': 0,  # New file starts at 0
                    'end': duration2,  # Ends at its duration
                    'duration': duration2,
                    'original_start': split_time,  # Keep track of original position
                    'original_end': clip_end
                }
            ]
        })
        
    except Exception as e:
        logger.error(f"Split clip error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/delete-clip/<session_id>/<filename>', methods=['DELETE'])
def delete_clip(session_id, filename):
    """Delete a clip file"""
    try:
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        clip_path = os.path.join(session_folder, filename)
        
        if not os.path.exists(clip_path):
            return jsonify({'error': 'Clip not found'}), 404
        
        # Delete the clip file
        os.remove(clip_path)
        
        # Also delete metadata if it exists
        metadata_file = clip_path.replace('.mp4', '.meta.json')
        if os.path.exists(metadata_file):
            os.remove(metadata_file)
        
        logger.info(f"Successfully deleted {filename}")

        # Update processing_sessions to remove the clip
        try:
            sess = processing_sessions.get(session_id)
            if sess and 'clips' in sess:
                sess['clips'] = [c for c in sess['clips'] if c.get('filename') != filename]
        except Exception as e:
            logger.warning(f"Could not update session clips after delete: {e}")
        
        return jsonify({
            'success': True,
            'filename': filename
        })
        
    except Exception as e:
        logger.error(f"Delete clip error: {e}")
        return jsonify({'error': str(e)}), 500

# Serve static files from React build
@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join('dist', path)):
        return send_from_directory('dist', path)
    else:
        # Serve index.html for client-side routing
        return send_from_directory('dist', 'index.html')

if __name__ == '__main__':
    debug_mode = os.getenv("FLASK_DEBUG", "0") == "1"
    app.run(debug=debug_mode, port=5555, host='0.0.0.0')
