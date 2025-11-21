# ClipCraft - AI-Powered Video Repurposing Tool

Transform long videos into engaging social media shorts using Google's Gemini AI. ClipCraft intelligently identifies the best moments in your videos and automatically creates perfectly formatted clips for TikTok, Instagram Reels, YouTube Shorts, and more.

## Features

- 🎥 **YouTube & Local Video Support**: Process videos directly from YouTube URLs or upload your own files
- 🤖 **AI-Powered Analysis**: Uses Gemini 2.5 Pro to identify the most engaging moments
- ⚡ **Stream Processing**: Extracts clips without downloading entire videos (YouTube)
- 📐 **Multiple Aspect Ratios**: 9:16 (Vertical), 1:1 (Square), 16:9 (Horizontal)
- 🎨 **Resolution Options**: 1080p, 720p, 480p
- 📦 **Batch Processing**: Generate multiple clips at once
- 💾 **Easy Download**: Download individual clips or all at once as a ZIP

## Prerequisites

Before running the application, ensure you have the following installed:

1. **Python 3.8+**
2. **FFmpeg** - Required for video processing
3. **yt-dlp** - Required for YouTube video processing

### Installing Prerequisites

#### macOS:
```bash
# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install FFmpeg
brew install ffmpeg

# Install yt-dlp
brew install yt-dlp
```

#### Windows:
```bash
# Install FFmpeg
# Download from: https://ffmpeg.org/download.html
# Add to system PATH

# Install yt-dlp
pip install yt-dlp
```

#### Linux:
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# Install yt-dlp
pip install yt-dlp
```

## Installation

1. **Clone or download the project files**

2. **Install Python dependencies:**
```bash
pip install -r requirements.txt
```

3. **Verify your .env file contains your API key:**
```
GEMINI_API_KEY=AIzaSyD1wNvSm46c3s8qv6nsTB9niTRpdxLQja0
```

## Running the Application

1. **Start the Flask server:**
```bash
python app.py
```

2. **Open your browser and navigate to:**
```
http://localhost:5000
```

## How to Use

### Step 1: Choose Your Video Source

**Option A: YouTube URL**
1. Select "YouTube URL" tab
2. Paste the YouTube video URL
3. The app will stream-process the video without downloading

**Option B: Upload File**
1. Select "Upload File" tab
2. Drag and drop or click to browse
3. Supported formats: MP4, MOV, WebM (max 500MB)

### Step 2: Configure Output Settings

1. **Clip Duration**: Choose between 30, 60, or 90 seconds
2. **Number of Clips**: Select how many clips to generate (1-10)
3. **Aspect Ratio**: 
   - 9:16 for TikTok, Instagram Reels, YouTube Shorts
   - 1:1 for Instagram Feed
   - 16:9 for YouTube, Twitter
4. **Resolution**: Choose quality (1080p, 720p, or 480p)

### Step 3: Generate Clips

Click "Generate Clips with AI" and wait while the app:
1. Analyzes your video with Gemini AI
2. Identifies the most engaging moments
3. Extracts and formats the clips
4. Prepares them for download

### Step 4: Download Your Clips

- Preview each clip directly in the browser
- Download individual clips
- Download all clips as a ZIP file

## Architecture

### Frontend
- **HTML5/CSS3**: Beautiful, responsive design
- **JavaScript**: Interactive UI with real-time updates
- **Mobile-Optimized**: Works seamlessly on all devices

### Backend
- **Flask**: Python web framework
- **Gemini AI**: Video analysis and content identification
- **FFmpeg**: Video processing and formatting
- **yt-dlp**: YouTube video streaming

### Key Features Implementation

1. **No Full Download for YouTube**: Uses yt-dlp to get streaming URLs and FFmpeg to extract specific segments
2. **AI Analysis**: Gemini analyzes video content to identify engaging moments
3. **Smart Extraction**: Only downloads necessary portions of the video
4. **Auto Cleanup**: Temporary files are automatically deleted after 1 hour

## Troubleshooting

### Common Issues

1. **"Failed to get video stream"**
   - Check if the YouTube URL is valid
   - Video might be geo-restricted or private
   - Try updating yt-dlp: `pip install --upgrade yt-dlp`

2. **"FFmpeg not found"**
   - Ensure FFmpeg is installed and in your system PATH
   - Restart your terminal after installation

3. **"Gemini API error"**
   - Verify your API key is correct in .env
   - Check API usage limits

4. **"File too large"**
   - Maximum upload size is 500MB
   - Consider using YouTube URL for larger videos

### Performance Tips

- For faster processing, use shorter clip durations
- Limit the number of clips for quicker results
- Use lower resolution for faster processing

## API Limits

- Gemini API has rate limits - avoid processing too many videos simultaneously
- Each video analysis uses API credits
- Monitor your usage in the Google AI Studio dashboard

## Security Note

The provided API key should be kept secure. For production use:
1. Never commit API keys to version control
2. Use environment variables
3. Implement proper authentication
4. Set up API key rotation

## Support

If you encounter any issues:
1. Check the console for error messages
2. Verify all prerequisites are installed
3. Ensure your internet connection is stable
4. Try with a different video or shorter duration

## Future Enhancements

Potential features for future versions:
- Face detection for smart cropping
- Custom branding/watermarks
- Automatic caption generation
- Multi-language support
- Cloud storage integration
- Batch URL processing
- Advanced editing features

## License

This project is for educational and personal use. Please respect copyright laws when processing videos.
