#!/usr/bin/env python3
"""
Advanced Smart Cropping Module with Smooth Tracking
Implements intelligent face/subject tracking with smoothing and multi-face handling
"""

import cv2
import numpy as np
import subprocess
import json
import os
import logging
from collections import deque

logger = logging.getLogger(__name__)

class AdvancedSmartCropper:
    def __init__(self):
        """Initialize advanced face detection and tracking"""
        # Load face detection classifier
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.profile_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_profileface.xml'
        )
        self.body_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_upperbody.xml'
        )
        
        # Tracking parameters
        self.tracking_history = deque(maxlen=10)  # Keep last 10 focus points
        self.face_tracker = None
        self.last_faces = []
        
    def detect_all_faces(self, frame):
        """Detect faces using multiple methods and angles"""
        all_faces = []
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Enhance contrast
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))
        gray = clahe.apply(gray)
        
        # Frontal faces - more sensitive detection
        frontal = self.face_cascade.detectMultiScale(
            gray, scaleFactor=1.05, minNeighbors=3, minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE
        )
        all_faces.extend([(x, y, w, h, 1.0) for x, y, w, h in frontal])
        
        # Profile faces (left)
        try:
            profile = self.profile_cascade.detectMultiScale(
                gray, scaleFactor=1.05, minNeighbors=3, minSize=(30, 30)
            )
            all_faces.extend([(x, y, w, h, 0.8) for x, y, w, h in profile])
        except:
            pass
        
        # Profile faces (right) - flip and detect
        gray_flip = cv2.flip(gray, 1)
        try:
            profile_flip = self.profile_cascade.detectMultiScale(
                gray_flip, scaleFactor=1.05, minNeighbors=3, minSize=(30, 30)
            )
            h, w = gray.shape
            for x, y, fw, fh in profile_flip:
                # Convert flipped coordinates back
                all_faces.append((w - x - fw, y, fw, fh, 0.8))
        except:
            pass
        
        # Upper body detection as fallback
        if len(all_faces) == 0:  # Only if no faces found
            bodies = self.body_cascade.detectMultiScale(
                gray, scaleFactor=1.1, minNeighbors=3, minSize=(50, 50)
            )
            for x, y, w, h in bodies:
                # Estimate face position from upper body (top 30% of body detection)
                face_y = y + int(h * 0.1)
                face_h = int(h * 0.3)
                all_faces.append((x + w//4, face_y, w//2, face_h, 0.6))
        
        # Remove duplicate/overlapping detections
        return self.non_max_suppression(all_faces)
    
    def non_max_suppression(self, faces, overlap_thresh=0.3):
        """Remove overlapping face detections"""
        if len(faces) == 0:
            return []
        
        # Convert to numpy array
        faces = np.array(faces)
        x1 = faces[:, 0]
        y1 = faces[:, 1]
        x2 = faces[:, 0] + faces[:, 2]
        y2 = faces[:, 1] + faces[:, 3]
        scores = faces[:, 4]
        
        # Sort by confidence
        idxs = np.argsort(scores)[::-1]
        keep = []
        
        while len(idxs) > 0:
            i = idxs[0]
            keep.append(i)
            
            # Calculate IoU
            xx1 = np.maximum(x1[i], x1[idxs[1:]])
            yy1 = np.maximum(y1[i], y1[idxs[1:]])
            xx2 = np.minimum(x2[i], x2[idxs[1:]])
            yy2 = np.minimum(y2[i], y2[idxs[1:]])
            
            w = np.maximum(0, xx2 - xx1)
            h = np.maximum(0, yy2 - yy1)
            
            overlap = (w * h) / ((x2[i] - x1[i]) * (y2[i] - y1[i]))
            
            idxs = np.delete(idxs, np.concatenate(([0], np.where(overlap > overlap_thresh)[0] + 1)))
        
        return faces[keep].tolist()
    
    def calculate_smooth_focus(self, faces, frame_width, frame_height):
        """Calculate smooth focus point with temporal filtering"""
        if not faces:
            # Use last known position if available
            if self.tracking_history:
                return self.tracking_history[-1]
            return frame_width // 2, frame_height // 2
        
        # Calculate weighted center of all faces
        total_x = 0
        total_y = 0
        total_weight = 0
        
        for face in faces:
            x, y, w, h = face[:4]
            confidence = face[4] if len(face) > 4 else 1.0
            
            # Weight by area and confidence
            weight = w * h * confidence
            center_x = x + w // 2
            center_y = y + h // 2
            
            total_x += center_x * weight
            total_y += center_y * weight
            total_weight += weight
        
        if total_weight > 0:
            new_x = int(total_x / total_weight)
            new_y = int(total_y / total_weight)
        else:
            new_x = frame_width // 2
            new_y = frame_height // 2
        
        # Apply temporal smoothing
        self.tracking_history.append((new_x, new_y))
        
        if len(self.tracking_history) >= 3:
            # Use median filter for stability
            xs = [p[0] for p in self.tracking_history]
            ys = [p[1] for p in self.tracking_history]
            
            # Apply Gaussian smoothing
            smooth_x = int(np.mean(xs[-3:]))  # Average of last 3 points
            smooth_y = int(np.mean(ys[-3:]))
            
            return smooth_x, smooth_y
        
        return new_x, new_y
    
    def calculate_dynamic_crop(self, faces, frame_width, frame_height, target_aspect_ratio):
        """Calculate dynamic crop that adapts to number of faces"""
        if not faces:
            return None
        
        # Parse aspect ratio
        aspect_parts = target_aspect_ratio.split(':')
        target_aspect = float(aspect_parts[0]) / float(aspect_parts[1])
        
        # Get smooth focus point first
        focus_x, focus_y = self.calculate_smooth_focus(faces, frame_width, frame_height)
        
        # For vertical output (9:16) - check for multiple faces ONLY
        # Letterbox should ONLY activate for 2+ faces spread horizontally
        if target_aspect < 1 and len(faces) >= 2:
            # Multiple faces detected - analyze their layout
            logger.info(f"🎭 Detected {len(faces)} faces, analyzing layout...")
            
            # Find bounding box that contains all faces
            min_x = min(f[0] for f in faces)
            min_y = min(f[1] for f in faces)
            max_x = max(f[0] + f[2] for f in faces)
            max_y = max(f[1] + f[3] for f in faces)
            
            face_group_width = max_x - min_x
            face_group_height = max_y - min_y
            
            # Check if faces are actually spread horizontally
            # Require significant horizontal separation (not just slightly side by side)
            if face_group_height > 0:
                face_aspect = face_group_width / face_group_height
                
                # Only use letterbox if faces are CLEARLY side-by-side
                # AND separated by significant distance
                horizontal_separation = face_group_width / frame_width
                
                if face_aspect > 1.5 and horizontal_separation > 0.4:
                    logger.info(f"📹 Faces clearly spread horizontally (aspect: {face_aspect:.2f}, separation: {horizontal_separation:.1%})")
                    logger.info("   Using letterbox mode with blurred background")
                    
                    # Calculate letterbox dimensions
                    letterbox_height = frame_height
                    letterbox_width = int(letterbox_height * 16 / 9)
                    
                    if letterbox_width > frame_width:
                        letterbox_width = frame_width
                        letterbox_height = int(letterbox_width * 9 / 16)
                    
                    # Center on the focus point
                    crop_x = focus_x - letterbox_width // 2
                    crop_y = focus_y - letterbox_height // 2
                    
                    crop_x = max(0, min(crop_x, frame_width - letterbox_width))
                    crop_y = max(0, min(crop_y, frame_height - letterbox_height))
                    
                    return {
                        'mode': 'letterbox',
                        'crop_x': crop_x,
                        'crop_y': crop_y,
                        'crop_w': letterbox_width,
                        'crop_h': letterbox_height,
                        'letterbox': True,
                        'face_count': len(faces)
                    }
                else:
                    logger.info(f"   Faces not spread enough (aspect: {face_aspect:.2f}, separation: {horizontal_separation:.1%})")
                    logger.info("   Using standard smart crop instead")
        
        # Single face or vertically stacked faces - standard smart crop
        logger.info(f"📐 Standard smart crop (faces: {len(faces)})")
        
        # Calculate target dimensions based on aspect ratio
        current_aspect = frame_width / frame_height
        
        if target_aspect > current_aspect:
            # Target is wider - crop height
            target_width = frame_width
            target_height = int(frame_width / target_aspect)
        else:
            # Target is taller - crop width
            target_height = frame_height
            target_width = int(frame_height * target_aspect)
        
        # Calculate crop centered on smooth focus point
        crop_x = focus_x - target_width // 2
        crop_y = focus_y - target_height // 2
        
        # Keep within bounds
        crop_x = max(0, min(crop_x, frame_width - target_width))
        crop_y = max(0, min(crop_y, frame_height - target_height))
        
        logger.info(f"   Focus point: ({focus_x}, {focus_y}), Crop: ({crop_x}, {crop_y}) {target_width}x{target_height}")
        
        return {
            'mode': 'smart',
            'crop_x': crop_x,
            'crop_y': crop_y,
            'crop_w': target_width,
            'crop_h': target_height,
            'letterbox': False,
            'face_count': len(faces)
        }
    
    def analyze_video_smooth(self, video_path, target_aspect_ratio, num_samples=15):
        """Analyze video with smooth tracking"""
        logger.info(f"🔍 Analyzing video with smooth tracking: {video_path}")
        
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
        
        # Sample more frames for smoother tracking
        sample_interval = max(1, total_frames // num_samples)
        
        all_crops = []
        face_counts = []
        
        for i in range(num_samples):
            frame_pos = min(i * sample_interval, total_frames - 1)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
            
            ret, frame = cap.read()
            if not ret:
                break
            
            # Detect faces
            faces = self.detect_all_faces(frame)
            face_counts.append(len(faces))
            
            if faces:
                crop = self.calculate_dynamic_crop(faces, frame_width, frame_height, target_aspect_ratio)
                if crop:
                    all_crops.append(crop)
                    logger.info(f"Frame {i+1}/{num_samples}: {len(faces)} faces, mode: {crop['mode']}")
        
        cap.release()
        
        if not all_crops:
            logger.info("No suitable crops found")
            return None
        
        # Determine best crop strategy
        avg_faces = np.mean(face_counts) if face_counts else 0
        max_faces = max(face_counts) if face_counts else 0
        
        # Count how many samples triggered letterbox
        letterbox_crops = [c for c in all_crops if c.get('letterbox')]
        letterbox_rate = len(letterbox_crops) / len(all_crops) if all_crops else 0
        
        # Only use letterbox if:
        # 1. Average faces >= 2 (consistently multiple people)
        # 2. More than 60% of samples triggered letterbox
        if avg_faces >= 2.0 and letterbox_rate > 0.6:
            logger.info(f"📹 Letterbox mode confirmed: avg {avg_faces:.1f} faces, {letterbox_rate:.0%} letterbox samples")
            return letterbox_crops[len(letterbox_crops)//2]  # Use median
        elif letterbox_crops:
            logger.info(f"⚠️ Letterbox detected but inconsistent (avg: {avg_faces:.1f} faces, {letterbox_rate:.0%} samples)")
            logger.info("   Using standard smart crop for stability")
        
        # Otherwise use smoothed smart crop with median (more stable than mean)
        # Use median for all values to reduce outlier influence
        crop_xs = sorted([c['crop_x'] for c in all_crops])
        crop_ys = sorted([c['crop_y'] for c in all_crops])
        crop_ws = sorted([c['crop_w'] for c in all_crops])
        crop_hs = sorted([c['crop_h'] for c in all_crops])
        
        median_idx = len(all_crops) // 2
        
        avg_x = crop_xs[median_idx]
        avg_y = crop_ys[median_idx]
        crop_w = crop_ws[median_idx]
        crop_h = crop_hs[median_idx]
        
        logger.info(f"✓ Smooth crop position: ({avg_x}, {avg_y}) size: {crop_w}x{crop_h}")
        
        return {
            'mode': 'smart_smooth',
            'crop_x': avg_x,
            'crop_y': avg_y,
            'crop_w': crop_w,
            'crop_h': crop_h,
            'letterbox': False,
            'face_count': 1
        }
    
    def generate_smooth_ffmpeg_filter(self, crop_data, input_width, input_height, 
                                     target_width, target_height):
        """Generate FFmpeg filter for smooth cropping"""
        if not crop_data:
            return None
        
        if crop_data.get('letterbox'):
            # Letterbox mode: wider crop with BLURRED BACKGROUND (not black bars)
            logger.info(f"🎬 Letterbox mode: {crop_data['face_count']} faces detected")
            logger.info(f"   Crop region: {crop_data['crop_w']}x{crop_data['crop_h']} at ({crop_data['crop_x']},{crop_data['crop_y']})")
            logger.info("   Using blurred background instead of black bars")
            
            # Create a complex filter with blurred background
            # [0:v] = main input
            # Step 1: Create blurred background - scale to fill target, then blur
            # Step 2: Create sharp foreground - crop and scale the main content
            # Step 3: Overlay sharp foreground on blurred background
            
            filter_str = (
                # Background: scale to fill target, then apply strong blur
                f"[0:v]scale={target_width}:{target_height}:force_original_aspect_ratio=increase,"
                f"crop={target_width}:{target_height},gblur=sigma=20[bg];"
                
                # Foreground: crop the main content area with faces
                f"[0:v]crop={crop_data['crop_w']}:{crop_data['crop_h']}:{crop_data['crop_x']}:{crop_data['crop_y']},"
                f"scale={target_width}:-1[fg];"
                
                # Overlay foreground on background (centered), force SAR
                f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1"
            )
            
            logger.info(f"   Using blurred background overlay")
            
        else:
            # Standard smart crop - properly centered
            logger.info(f"📐 Smart crop mode: {crop_data.get('face_count', 0)} face(s)")
            logger.info(f"   Source crop: {crop_data['crop_w']}x{crop_data['crop_h']} at ({crop_data['crop_x']},{crop_data['crop_y']})")
            
            # Direct crop from source video at calculated position
            # No scaling needed if dimensions match, just crop
            filter_str = f"crop={crop_data['crop_w']}:{crop_data['crop_h']}:{crop_data['crop_x']}:{crop_data['crop_y']}"
            
            # Scale to target resolution if needed
            if crop_data['crop_w'] != target_width or crop_data['crop_h'] != target_height:
                filter_str += f",scale={target_width}:{target_height}"
            
            # Force correct aspect ratio metadata
            filter_str += f",setsar=1,setdar={target_width}/{target_height}"
            
            logger.info(f"   Filter: {filter_str}")
        
        return filter_str


# Global instance
advanced_cropper = AdvancedSmartCropper()

def smooth_smart_crop_video(input_path, output_path, aspect_ratio, resolution):
    """
    Apply smooth smart cropping with multi-face handling
    """
    try:
        # Analyze video
        crop_data = advanced_cropper.analyze_video_smooth(input_path, aspect_ratio, num_samples=15)
        
        if not crop_data:
            logger.info("Advanced analysis suggests center crop")
            return False
        
        # Get video dimensions
        probe_cmd = ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                    '-show_entries', 'stream=width,height', '-of', 'json', input_path]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
        input_width = data['streams'][0]['width']
        input_height = data['streams'][0]['height']
        
        # Resolution settings
        resolution_map = {
            "1080p": {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)},
            "720p": {"9:16": (720, 1280), "16:9": (1280, 720), "1:1": (720, 720)},
            "480p": {"9:16": (480, 854), "16:9": (854, 480), "1:1": (480, 480)}
        }
        
        target_w, target_h = resolution_map[resolution][aspect_ratio]
        
        # Generate filter
        filter_str = advanced_cropper.generate_smooth_ffmpeg_filter(
            crop_data, input_width, input_height, target_w, target_h
        )
        
        if not filter_str:
            return False
        
        # Bitrate settings
        bitrates = {"1080p": "3M", "720p": "2M", "480p": "1M"}
        bitrate = bitrates[resolution]
        
        # Build FFmpeg command
        # Use -filter_complex for letterbox (complex filter), -vf for simple crop
        if crop_data.get('letterbox'):
            cmd = [
                'ffmpeg',
                '-i', input_path,
                '-filter_complex', filter_str,  # Complex filter for blurred background
                '-c:v', 'libx264',
                '-b:v', bitrate,
                '-c:a', 'aac',
                '-preset', 'medium',
                '-movflags', '+faststart',
                '-y',
                output_path
            ]
        else:
            cmd = [
                'ffmpeg',
                '-i', input_path,
                '-vf', filter_str,  # Simple filter for regular crop
                '-c:v', 'libx264',
                '-b:v', bitrate,
                '-c:a', 'aac',
                '-preset', 'medium',
                '-movflags', '+faststart',
                '-y',
                output_path
            ]
        
        logger.info(f"🎬 Applying smooth smart crop (mode: {crop_data['mode']})")
        if crop_data.get('letterbox'):
            logger.info(f"   Using complex filter with blurred background")
        
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        
        if result.returncode == 0:
            logger.info(f"✓ Smooth smart crop complete: {output_path}")
            return True
        else:
            logger.error(f"FFmpeg error: {result.stderr.decode()}")
            return False
            
    except Exception as e:
        logger.error(f"Smooth smart crop error: {e}")
        return False
