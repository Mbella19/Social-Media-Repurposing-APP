#!/bin/bash

# ClipCraft Startup Script

echo "🎥 Starting ClipCraft - AI Video Repurposing Tool"
echo "================================================"

# Initialize pyenv if available
if command -v pyenv &> /dev/null; then
    export PYENV_ROOT="$HOME/.pyenv"
    export PATH="$PYENV_ROOT/bin:$PATH"
    eval "$(pyenv init --path)"
    eval "$(pyenv init -)"
    # Set a default Python version if not already set
    if ! pyenv version &> /dev/null; then
        pyenv global 3.11.14 2>/dev/null || pyenv global 3.11.9 2>/dev/null || pyenv global 3.10.14 2>/dev/null
    fi
fi

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check if FFmpeg is installed
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ FFmpeg is not installed."
    echo "Please install FFmpeg:"
    echo "  macOS: brew install ffmpeg"
    echo "  Linux: sudo apt install ffmpeg"
    echo "  Windows: Download from ffmpeg.org"
    exit 1
fi

# Check if yt-dlp is installed
if ! command -v yt-dlp &> /dev/null; then
    echo "⚠️  yt-dlp is not installed. Installing..."
    pip3 install yt-dlp
fi

# Install/Update dependencies directly with pyenv's Python
echo "📚 Installing dependencies..."
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p uploads outputs temp static/css static/js templates

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create a .env file with your Gemini API key."
    echo "Example:"
    echo "  GEMINI_API_KEY=your_api_key_here"
    exit 1
fi

# Start the application
echo ""
echo "✅ All checks passed!"
echo "🚀 Starting ClipCraft server..."
echo ""
echo "📱 Open your browser and navigate to:"
echo "   http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop the server"
echo "================================================"
echo ""

# Run the Flask application
python3 app.py
