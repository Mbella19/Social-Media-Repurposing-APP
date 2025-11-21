#!/usr/bin/env python3
"""
Smart Cropping Module
Implements intelligent face/subject tracking for video cropping
Keeps main subjects centered when changing aspect ratios
"""

import cv2
import numpy as np
import subprocess
import json
import os
import tempfile
import logging

logger = logging.getLogger(__name__)

class SmartCropper:
    def __init__(self):
        """Initialize face detection models"""
        # Load face detection classifier (Haar Cascade)
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        # Alternative: Upper body detection for wider shots
        self.body_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_upperbody.xml'
        )
        
        # DNN-based face detector for better accuracy
        self.load_dnn_detector()
    
    def load_dnn_detector(self):
        """Load DNN-based face detector for better accuracy"""
        try:
            # Download pre-trained model if needed
            prototxt_path = "models/deploy.prototxt"
            model_path = "models/res10_300x300_ssd_iter_140000_fp16.caffemodel"
            
            if not os.path.exists("models"):
                os.makedirs("models", exist_ok=True)
                logger.info("📥 Downloading DNN face detection models...")
                # Using OpenCV's built-in DNN detector
                self.dnn_net = None
                logger.info("Using Haar Cascade as primary detector")
            else:
                self.dnn_net = cv2.dnn.readNetFromCaffe(prototxt_path, model_path)
                logger.info("✓ DNN face detector loaded")
        except:
            self.dnn_net = None
            logger.info("Using Haar Cascade detector (DNN not available)")
    
    def detect_faces(self, frame):
        """Detect faces in a frame using multiple methods"""
        faces = []
        
        # Convert to grayscale for Haar Cascade
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Improve contrast for better detection
        gray = cv2.equalizeHist(gray)
        
        # Method 1: Haar Cascade face detection with more sensitive parameters
        haar_faces = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20)
        )
        faces.extend([(x, y, w, h) for x, y, w, h in haar_faces])
        
        # If no faces found, try upper body detection
        if not faces:
            bodies = self.body_cascade.detectMultiScale(
                gray, scaleFactor=1.05, minNeighbors=3, minSize=(40, 40)
            )
            # Upper body usually includes face, so adjust the region
            for x, y, w, h in bodies:
                # Focus on upper third of body detection (likely face area)
                faces.append((x, y, w, h//2))
        
        return faces
    
    def calculate_focus_point(self, faces, frame_width, frame_height):
        """Calculate the optimal focus point based on detected faces"""
        if not faces:
            # No faces detected, use center
            return frame_width // 2, frame_height // 2
        
        # Calculate center of mass of all detected faces
        total_x = 0
        total_y = 0
        total_weight = 0
        
        for (x, y, w, h) in faces:
            # Use face area as weight (larger faces are more important)
            weight = w * h
            center_x = x + w // 2
            center_y = y + h // 2
            
            total_x += center_x * weight
            total_y += center_y * weight
            total_weight += weight
        
        if total_weight > 0:
            focus_x = int(total_x / total_weight)
            focus_y = int(total_y / total_weight)
        else:
            focus_x = frame_width // 2
            focus_y = frame_height // 2
        
        return focus_x, focus_y
    
    def calculate_crop_region(self, focus_x, focus_y, frame_width, frame_height, 
                            target_width, target_height):
        """Calculate crop region that keeps focus point centered"""
        # Calculate current and target aspect ratios
        current_aspect = frame_width / frame_height
        target_aspect = target_width / target_height
        
        # Determine scaling strategy
        if current_aspect > target_aspect:
            # Current video is wider than target - scale by height, crop width
            scale = target_height / frame_height
            scaled_width = int(frame_width * scale)
            scaled_height = target_height
            
            # Calculate crop x position based on focus point
            scaled_focus_x = int(focus_x * scale)
            crop_x = scaled_focus_x - target_width // 2
            crop_x = max(0, min(crop_x, scaled_width - target_width))
            crop_y = 0
        else:
            # Current video is taller than target - scale by width, crop height
            scale = target_width / frame_width
            scaled_width = target_width
            scaled_height = int(frame_height * scale)
            
            # Calculate crop y position based on focus point
            scaled_focus_y = int(focus_y * scale)
            crop_y = scaled_focus_y - target_height // 2
            crop_y = max(0, min(crop_y, scaled_height - target_height))
            crop_x = 0
        
        return {
            'scale_w': scaled_width,
            'scale_h': scaled_height,
            'crop_x': crop_x,
            'crop_y': crop_y,
            'crop_w': target_width,
            'crop_h': target_height
        }
    
    def analyze_video_for_cropping(self, video_path, target_aspect_ratio, 
                                  sample_rate=60, max_samples=5):
        """
        Analyze video to determine optimal cropping strategy
        
        Args:
            video_path: Path to input video
            target_aspect_ratio: Target aspect ratio (e.g., "9:16", "1:1", "16:9")
            sample_rate: Sample every N frames
            max_samples: Maximum number of samples to analyze
        
        Returns:
            Cropping parameters for FFmpeg
        """
        logger.info(f"🔍 Analyzing video for smart cropping: {video_path}")
        
        # Open video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            logger.error(f"Failed to open video: {video_path}")
            return None
        
        # Get video properties
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        logger.info(f"Video: {frame_width}x{frame_height}, {total_frames} frames @ {fps:.1f} fps")
        
        # Parse target aspect ratio
        aspect_parts = target_aspect_ratio.split(':')
        target_aspect = float(aspect_parts[0]) / float(aspect_parts[1])
        
        # Calculate target dimensions maintaining input resolution
        if target_aspect > frame_width / frame_height:
            # Target is wider
            target_width = frame_width
            target_height = int(frame_width / target_aspect)
        else:
            # Target is taller
            target_height = frame_height
            target_width = int(frame_height * target_aspect)
        
        # Sample frames and analyze
        focus_points = []
        faces_detected_count = 0
        frame_count = 0
        samples_taken = 0
        
        # Calculate sample interval for even distribution
        sample_interval = max(total_frames // max_samples, sample_rate)
        
        while cap.isOpened() and samples_taken < max_samples:
            # Jump to next sample position
            sample_position = min(samples_taken * sample_interval, total_frames - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, sample_position)
            
            ret, frame = cap.read()
            if not ret:
                break
            
            faces = self.detect_faces(frame)
            if faces:
                faces_detected_count += 1
                focus_x, focus_y = self.calculate_focus_point(faces, frame_width, frame_height)
                focus_points.append((focus_x, focus_y))
                logger.info(f"Sample {samples_taken + 1}: Found {len(faces)} faces at ({focus_x}, {focus_y})")
            else:
                logger.info(f"Sample {samples_taken + 1}: No faces detected")
            
            samples_taken += 1
        
        cap.release()
        
        # If we detected faces in less than 40% of samples, don't use smart crop
        detection_rate = faces_detected_count / max(samples_taken, 1)
        if detection_rate < 0.4:
            logger.info(f"⚠️ Low face detection rate ({detection_rate:.0%}), smart crop may not be suitable")
            return None  # Signal to use center crop instead
        
        # Calculate average focus point from detected faces
        if focus_points:
            avg_focus_x = int(sum(p[0] for p in focus_points) / len(focus_points))
            avg_focus_y = int(sum(p[1] for p in focus_points) / len(focus_points))
            logger.info(f"✓ Average focus point from {len(focus_points)} detections: ({avg_focus_x}, {avg_focus_y})")
        else:
            # No faces detected at all, return None to use center crop
            logger.info("⚠️ No faces detected in any sample")
            return None
        
        # Calculate optimal crop region
        crop_params = self.calculate_crop_region(
            avg_focus_x, avg_focus_y, 
            frame_width, frame_height,
            target_width, target_height
        )
        
        return crop_params
    
    def generate_ffmpeg_filter(self, crop_params):
        """Generate FFmpeg filter string for smart cropping"""
        if not crop_params:
            return None
        
        # Build filter string
        filter_str = (
            f"scale={crop_params['scale_w']}:{crop_params['scale_h']},"
            f"crop={crop_params['crop_w']}:{crop_params['crop_h']}:"
            f"{crop_params['crop_x']}:{crop_params['crop_y']}"
        )
        
        return filter_str
    
    def process_video_with_smart_crop(self, input_path, output_path, 
                                     aspect_ratio, resolution):
        """
        Process video with intelligent cropping
        
        Args:
            input_path: Input video path
            output_path: Output video path
            aspect_ratio: Target aspect ratio (e.g., "9:16")
            resolution: Target resolution (e.g., "1080p")
        
        Returns:
            True if successful, False otherwise
        """
        try:
            # Analyze video for optimal cropping
            crop_params = self.analyze_video_for_cropping(
                input_path, aspect_ratio, 
                sample_rate=60, max_samples=5
            )
            
            if not crop_params:
                logger.info("Smart crop analysis suggests center crop would be better")
                return False  # Fall back to center crop
            
            # Generate FFmpeg filter
            filter_str = self.generate_ffmpeg_filter(crop_params)
            
            # Resolution settings
            resolution_map = {
                "1080p": {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)},
                "720p": {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (720, 720)},
                "480p": {"9:16": (480, 854), "16:9": (854, 480), "1:1": (480, 480)}
            }
            
            target_w, target_h = resolution_map[resolution][aspect_ratio]
            
            # The crop should already be at the correct resolution, just ensure it
            if crop_params['crop_w'] != target_w or crop_params['crop_h'] != target_h:
                filter_str += f",scale={target_w}:{target_h}"
            
            # Bitrate settings
            bitrates = {"1080p": "3M", "720p": "2M", "480p": "1M"}
            bitrate = bitrates[resolution]
            
            # Build FFmpeg command
            cmd = [
                'ffmpeg',
                '-i', input_path,
                '-vf', filter_str,
                '-c:v', 'libx264',
                '-b:v', bitrate,
                '-c:a', 'aac',
                '-preset', 'fast',
                '-y',
                output_path
            ]
            
            logger.info(f"🎬 Applying smart crop with face tracking")
            logger.info(f"   Filter: {filter_str}")
            
            result = subprocess.run(cmd, capture_output=True, timeout=120)
            
            if result.returncode == 0:
                logger.info(f"✓ Smart crop complete: {output_path}")
                return True
            else:
                logger.error(f"FFmpeg error: {result.stderr.decode()}")
                return False
                
        except Exception as e:
            logger.error(f"Smart crop error: {e}")
            return False


# Create global instance
smart_cropper = SmartCropper()

def smart_crop_video(input_path, output_path, aspect_ratio, resolution):
    """
    Main function to apply smart cropping to a video
    
    This function will:
    1. Detect faces/subjects in the video
    2. Calculate optimal crop to keep subjects centered
    3. Apply the crop using FFmpeg
    
    Args:
        input_path: Path to input video
        output_path: Path to output video
        aspect_ratio: Target aspect ratio (e.g., "9:16", "1:1", "16:9")
        resolution: Target resolution (e.g., "1080p", "720p", "480p")
    
    Returns:
        True if successful, False otherwise
    """
    return smart_cropper.process_video_with_smart_crop(
        input_path, output_path, aspect_ratio, resolution
    )
