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
from flask import Flask, render_template, request, jsonify, send_file, send_from_directory, url_for
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import google.generativeai as genai
from google import genai as genai_new
from google.genai import types
from apscheduler.schedulers.background import BackgroundScheduler
import threading
import logging

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import smart cropping modules (after logger is initialized)
try:
    from advanced_smart_crop import smooth_smart_crop_video
    SMART_CROP_AVAILABLE = True
    logger.info("✓ Advanced smart cropping loaded (smooth tracking + multi-face)")
except ImportError:
    try:
        from smart_crop import smart_crop_video
        smooth_smart_crop_video = smart_crop_video  # Fallback to basic
        SMART_CROP_AVAILABLE = True
        logger.info("✓ Basic smart cropping loaded (face tracking enabled)")
    except ImportError as e:
        SMART_CROP_AVAILABLE = False
        logger.warning(f"⚠️ Smart cropping not available: {e}")
        smooth_smart_crop_video = None

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max file size
CORS(app)

# Configure Gemini API (both old and new client)
# Use new API key to avoid rate limits
GEMINI_API_KEY = "AIzaSyDAwnL6D8Y18gxAx92FMYq5HZnMMbXPNwk"
genai.configure(api_key=GEMINI_API_KEY)
gemini_client = genai_new.Client(api_key=GEMINI_API_KEY)

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
            return clean_url
    
    # If no pattern matches, return original
    return url

def get_video_stream_url(youtube_url):
    """Extract direct stream URL from YouTube"""
    try:
        result = subprocess.run(
            ['yt-dlp', '-f', 'best', '-g', youtube_url],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            return result.stdout.strip()
        else:
            logger.error(f"yt-dlp error: {result.stderr}")
            return None
    except subprocess.TimeoutExpired:
        return None
    except Exception as e:
        logger.error(f"Stream URL extraction error: {e}")
        return None

def download_sample_for_analysis(youtube_url, max_duration_minutes=10):
    """Download a sample of the video for Gemini analysis (increased to 10 minutes for better coverage)"""
    try:
        temp_file = os.path.join(TEMP_FOLDER, f"sample_{uuid.uuid4()}.mp4")
        
        # Download first 10 minutes for better analysis coverage
        logger.info(f"Downloading first {max_duration_minutes} minutes for AI analysis...")
        
        subprocess.run(
            [
                'yt-dlp',
                '--download-sections', f'*00:00:00-00:{max_duration_minutes:02d}:00',
                '-f', 'worst',  # Use worst quality for faster download
                '-o', temp_file,
                youtube_url
            ],
            check=True,
            timeout=180,
            capture_output=True
        )
        
        logger.info(f"Sample downloaded: {temp_file}")
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
        logger.info("=" * 60)
        
        # Create analysis prompt based on whether custom prompt is provided
        if custom_prompt and custom_prompt.strip():
            # Use ONLY the custom prompt - no mixing with default
            prompt = f"""Analyze this video based on the following user request: "{custom_prompt}"
            
            Identify the {num_clips} most relevant moments that match the user's request.
            For each moment, provide:
            1) Start timestamp in format MM:SS
            2) End timestamp in format MM:SS
            3) A brief description of what happens in this segment related to the user's request
            
            Each segment should be approximately {clip_duration} seconds long.
            
            IMPORTANT: Focus ONLY on what the user requested. If they ask for "goals" only return goal moments.
            If they ask for "funny moments" only return funny moments. Be very specific to their request.
            
            Return results in valid JSON format with an array of objects, each having keys: 'start_time', 'end_time', 'description'.
            Example format:
            [
                {{
                    "start_time": "00:30",
                    "end_time": "01:00",
                    "description": "Description of what happens related to user request"
                }}
            ]
            """
        else:
            # Use default prompt for general engaging moments
            prompt = f"""Analyze this video and identify the {num_clips} most engaging, self-contained moments that would work well as social media shorts. 
            For each moment, provide: 
            1) Start timestamp in format MM:SS
            2) End timestamp in format MM:SS  
            3) A brief description of why this segment is engaging
            
            Each segment should be approximately {clip_duration} seconds long and capture a complete thought or action.
            
            Return results in valid JSON format with an array of objects, each having keys: 'start_time', 'end_time', 'description'.
            Example format:
            [
                {{
                    "start_time": "00:30",
                    "end_time": "01:00",
                    "description": "Engaging moment description"
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
                    response = gemini_client.models.generate_content(
                        model='gemini-2.5-pro',
                        contents=types.Content(
                            parts=[
                                types.Part(
                                    file_data=types.FileData(
                                        file_uri=video_source
                                    )
                                ),
                                types.Part(text=prompt)
                            ]
                        )
                    )
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
                model = genai.GenerativeModel(model_name="gemini-2.5-pro")
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
    """Generate evenly spaced timestamps as fallback"""
    timestamps = []
    for i in range(num_clips):
        start_seconds = i * (clip_duration + 10)  # Add 10 second spacing
        start_time = f"{start_seconds // 60:02d}:{start_seconds % 60:02d}"
        end_seconds = start_seconds + clip_duration
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
                    response = gemini_client.models.generate_content(
                        model='gemini-2.5-pro',
                        contents=[
                            types.Content(
                                role='user',
                                parts=[
                                    types.Part(
                                        file_data=types.FileData(
                                            mime_type='video/*',
                                            file_uri=video_path
                                        )
                                    ),
                                    types.Part(text=prompt)
                                ]
                            )
                        ]
                    )
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
    """Extract a clip from video stream without downloading full video"""
    try:
        cmd = [
            'ffmpeg',
            '-ss', start_time,
            '-i', stream_url,
            '-t', str(duration),
            '-c', 'copy',
            '-y',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        
        if result.returncode == 0:
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
        bitrates = {"4K": "8M", "1080p": "3M", "720p": "2M", "480p": "1M"}
        
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
        
        # Use faster preset for 4K to avoid timeout
        preset = 'ultrafast' if resolution == "4K" else 'fast'
        
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-filter_complex', filter_complex,
            '-c:v', 'libx264',
            '-b:v', bitrate,
            '-c:a', 'aac',
            '-preset', preset,
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        logger.info(f"   Letterbox: {letterbox_w}x{letterbox_h} in {target_w}x{target_h} frame")
        
        # Adjust timeout based on resolution (4K needs much more time)
        timeout = 300 if resolution == "4K" else 180
        logger.info(f"   Processing with {timeout}s timeout...")
        
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
    else:
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
        
        # Define bitrates
        bitrates = {
            "4K": "8M",
            "1080p": "3M",
            "720p": "2M", 
            "480p": "1M"
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
        
        # Use faster preset for 4K to avoid timeout
        preset = 'ultrafast' if resolution == "4K" else 'fast'
        
        # Build FFmpeg command
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-vf', filter_complex,
            '-c:v', 'libx264',
            '-b:v', bitrate,
            '-c:a', 'aac',
            '-preset', preset,
            '-movflags', '+faststart',
            '-y',
            output_path
        ]
        
        logger.info(f"Formatting video: {input_width}x{input_height} -> {target_width}x{target_height} ({aspect_ratio}) with center crop")
        
        # Adjust timeout based on resolution
        timeout = 300 if resolution == "4K" else 180
        logger.info(f"Processing with {timeout}s timeout...")
        
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

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/features', methods=['GET'])
def get_features():
    """Return available features"""
    return jsonify({
        'smart_crop': SMART_CROP_AVAILABLE,
        'face_tracking': SMART_CROP_AVAILABLE,
        'description': 'Smart cropping with face tracking' if SMART_CROP_AVAILABLE else 'Standard center cropping'
    })

@app.route('/process', methods=['POST'])
def process_video():
    """Main endpoint for video processing"""
    try:
        data = request.get_json()
        
        # Extract parameters
        video_source = data.get('source_type')
        youtube_url = data.get('youtube_url')
        clip_duration = int(data.get('clip_duration', 30))
        num_clips = min(int(data.get('num_clips', 3)), 10)
        aspect_ratio = data.get('aspect_ratio', '9:16')
        resolution = data.get('resolution', '1080p')
        custom_prompt = data.get('custom_prompt', '').strip()  # Get custom prompt
        
        # Create session folder
        session_id = str(uuid.uuid4())
        session_folder = os.path.join(OUTPUT_FOLDER, session_id)
        os.makedirs(session_folder, exist_ok=True)
        
        clips_info = []
        
        if video_source == 'youtube':
            if not validate_youtube_url(youtube_url):
                return jsonify({'error': 'Invalid YouTube URL'}), 400
            
            # Normalize the YouTube URL (remove extra parameters, clean format)
            normalized_url = normalize_youtube_url(youtube_url)
            
            # STEP 1: Send YouTube URL directly to Gemini for analysis (NO DOWNLOAD!)
            logger.info("=" * 60)
            logger.info("STEP 1: Analyzing YouTube video with Gemini 2.5 Pro")
            logger.info(f"Original URL: {youtube_url}")
            logger.info(f"Normalized URL: {normalized_url}")
            logger.info(f"Custom Prompt: {custom_prompt if custom_prompt else 'None (using default)'}")
            logger.info("Gemini will analyze the FULL video directly from YouTube")
            logger.info("=" * 60)
            
            timestamps = analyze_video_with_gemini(normalized_url, num_clips, clip_duration, custom_prompt, is_youtube=True)
            
            logger.info("=" * 60)
            logger.info("STEP 2: Gemini analysis complete! Received timestamps:")
            for i, ts in enumerate(timestamps):
                logger.info(f"  Clip {i+1}: {ts['start_time']} - {ts['end_time']} | {ts.get('description', 'N/A')}")
            logger.info("=" * 60)
            
            # STEP 3: Get stream URL for clip extraction
            logger.info("STEP 3: Getting video stream URL for clip extraction...")
            stream_url = get_video_stream_url(youtube_url)
            if not stream_url:
                return jsonify({'error': 'Failed to get video stream'}), 500
            logger.info(f"✓ Stream URL obtained")
            logger.info("=" * 60)
            
            # STEP 4: Extract clips from stream based on Gemini timestamps
            logger.info("STEP 4: Extracting and formatting clips...")
            for i, ts in enumerate(timestamps):
                logger.info(f"Processing clip {i + 1}/{len(timestamps)}: {ts['start_time']} - {ts['end_time']}")
                temp_clip = os.path.join(TEMP_FOLDER, f"temp_{session_id}_{i}.mp4")
                final_clip = os.path.join(session_folder, f"clip_{i + 1}.mp4")
                
                # Calculate duration
                start_parts = ts['start_time'].split(':')
                end_parts = ts['end_time'].split(':')
                start_seconds = int(start_parts[0]) * 60 + int(start_parts[1])
                end_seconds = int(end_parts[0]) * 60 + int(end_parts[1])
                duration = end_seconds - start_seconds
                
                # Extract clip from stream (no download, just the specific segment)
                logger.info(f"  → Extracting from stream at {ts['start_time']} ({duration}s duration)...")
                if extract_clip_from_stream(stream_url, ts['start_time'], duration, temp_clip):
                    # STEP 4.5: AI second-pass analysis for letterbox decision (only for 9:16)
                    use_letterbox = False
                    if aspect_ratio == "9:16":
                        logger.info(f"  → AI analyzing clip for letterbox needs...")
                        use_letterbox = analyze_clip_for_letterbox(
                            normalized_url,
                            ts['start_time'],
                            ts['end_time'],
                            ts.get('description', ''),
                            is_youtube=True
                        )
                    
                    # Format clip (crop to aspect ratio with AI-determined mode)
                    mode_str = "LETTERBOX" if use_letterbox else "STANDARD"
                    logger.info(f"  → Formatting to {aspect_ratio} @ {resolution} ({mode_str} mode)...")
                    if format_video_clip(temp_clip, final_clip, aspect_ratio, resolution, use_letterbox):
                        clips_info.append({
                            'filename': f"clip_{i + 1}.mp4",
                            'path': f"/download/{session_id}/clip_{i + 1}.mp4",
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
                    
                # Clean up temp file
                if os.path.exists(temp_clip):
                    os.remove(temp_clip)
            
            logger.info("=" * 60)
        
        else:
            # Handle file upload
            if 'video_file' not in request.files:
                return jsonify({'error': 'No video file provided'}), 400
            
            file = request.files['video_file']
            if file.filename == '':
                return jsonify({'error': 'No file selected'}), 400
            
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                upload_path = os.path.join(UPLOAD_FOLDER, f"{session_id}_{filename}")
                file.save(upload_path)
                
                # Analyze with Gemini (upload file)
                logger.info("Uploading local file to Gemini for analysis...")
                timestamps = analyze_video_with_gemini(upload_path, num_clips, clip_duration, custom_prompt, is_youtube=False)
                
                # Process uploaded video similarly
                for i, ts in enumerate(timestamps):
                    temp_clip = os.path.join(TEMP_FOLDER, f"temp_{session_id}_{i}.mp4")
                    final_clip = os.path.join(session_folder, f"clip_{i + 1}.mp4")
                    
                    # Calculate duration
                    start_parts = ts['start_time'].split(':')
                    end_parts = ts['end_time'].split(':')
                    start_seconds = int(start_parts[0]) * 60 + int(start_parts[1])
                    end_seconds = int(end_parts[0]) * 60 + int(end_parts[1])
                    duration = end_seconds - start_seconds
                    
                    # Extract clip from uploaded file
                    if extract_clip_from_stream(upload_path, ts['start_time'], duration, temp_clip):
                        # Format clip
                        if format_video_clip(temp_clip, final_clip, aspect_ratio, resolution):
                            clips_info.append({
                                'filename': f"clip_{i + 1}.mp4",
                                'path': f"/download/{session_id}/clip_{i + 1}.mp4",
                                'description': ts.get('description', f'Clip {i + 1}'),
                                'start_time': ts['start_time'],
                                'end_time': ts['end_time']
                            })
                        else:
                            logger.error(f"Failed to format clip {i + 1}")
                    else:
                        logger.error(f"Failed to extract clip {i + 1}")
                    
                    # Clean up temp file
                    if os.path.exists(temp_clip):
                        os.remove(temp_clip)
                
                # Clean up upload
                if os.path.exists(upload_path):
                    os.remove(upload_path)
        
        # Create ZIP file of all clips only if we have clips
        if clips_info:
            zip_path = os.path.join(session_folder, 'all_clips.zip')
            try:
                with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                    for clip in clips_info:
                        clip_path = os.path.join(session_folder, clip['filename'])
                        if os.path.exists(clip_path):
                            zipf.write(clip_path, clip['filename'])
                            logger.info(f"Added {clip['filename']} to ZIP")
                        else:
                            logger.warning(f"Clip file not found: {clip_path}")
                logger.info(f"Created ZIP file: {zip_path}")
            except Exception as e:
                logger.error(f"Failed to create ZIP: {e}")
        else:
            logger.warning("No clips generated, skipping ZIP creation")
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'clips': clips_info
        })
        
    except Exception as e:
        logger.error(f"Processing error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/download/<session_id>/<filename>')
def download_clip(session_id, filename):
    """Download individual clip"""
    try:
        file_path = os.path.join(OUTPUT_FOLDER, session_id, filename)
        if os.path.exists(file_path):
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download_all/<session_id>')
def download_all(session_id):
    """Download all clips as ZIP"""
    try:
        zip_path = os.path.join(OUTPUT_FOLDER, session_id, 'all_clips.zip')
        if os.path.exists(zip_path):
            return send_file(zip_path, as_attachment=True, download_name=f'clips_{session_id}.zip')
        else:
            return jsonify({'error': 'ZIP file not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

if __name__ == '__main__':
    app.run(debug=True, port=5555, host='0.0.0.0')
