#!/bin/bash

# ClipCraft Installation Script

echo "🎥 ClipCraft - Installation Script"
echo "=================================="
echo ""

# Detect OS
OS="Unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
else
    OS="Windows/Other"
fi

echo "📍 Detected OS: $OS"
echo ""

# Install system dependencies based on OS
if [ "$OS" == "macOS" ]; then
    echo "📦 Installing macOS dependencies..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        echo "Installing FFmpeg..."
        brew install ffmpeg
    else
        echo "✓ FFmpeg already installed"
    fi
    
    # Install yt-dlp
    if ! command -v yt-dlp &> /dev/null; then
        echo "Installing yt-dlp..."
        brew install yt-dlp
    else
        echo "✓ yt-dlp already installed"
    fi

elif [ "$OS" == "Linux" ]; then
    echo "📦 Installing Linux dependencies..."
    
    # Update package list
    sudo apt update
    
    # Install FFmpeg
    if ! command -v ffmpeg &> /dev/null; then
        echo "Installing FFmpeg..."
        sudo apt install -y ffmpeg
    else
        echo "✓ FFmpeg already installed"
    fi
    
    # Install Python pip
    if ! command -v pip3 &> /dev/null; then
        echo "Installing pip..."
        sudo apt install -y python3-pip
    fi
    
    # Install yt-dlp
    if ! command -v yt-dlp &> /dev/null; then
        echo "Installing yt-dlp..."
        pip3 install yt-dlp
    else
        echo "✓ yt-dlp already installed"
    fi

else
    echo "⚠️  Please install the following manually:"
    echo "1. FFmpeg: https://ffmpeg.org/download.html"
    echo "2. Python 3.8+: https://www.python.org/downloads/"
    echo "3. After installing Python, run: pip install yt-dlp"
fi

# Install Python dependencies
echo ""
echo "📚 Installing Python dependencies..."

# Check if pip is available
if command -v pip3 &> /dev/null; then
    pip3 install -r requirements.txt
elif command -v pip &> /dev/null; then
    pip install -r requirements.txt
else
    echo "❌ pip not found. Please install Python 3 and pip."
    exit 1
fi

# Create necessary directories
echo ""
echo "📁 Creating project directories..."
mkdir -p uploads outputs temp static/css static/js templates

# Check for .env file
if [ ! -f ".env" ]; then
    echo ""
    echo "⚠️  No .env file found!"
    echo "Creating .env file template..."
    cat > .env << EOL
GEMINI_API_KEY=your_api_key_here
MAX_VIDEO_ANALYSIS_MINUTES=3
MAX_OUTPUT_CLIPS=10
TEMP_FILE_CLEANUP_HOURS=1
MAX_CLIP_DURATION_SECONDS=90
EOL
    echo "✓ Created .env file"
    echo ""
    echo "⚠️  IMPORTANT: Please edit the .env file and add your Gemini API key!"
    echo "   You can get an API key from: https://makersuite.google.com/app/apikey"
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "To start the application, run:"
echo "  ./start.sh"
echo "OR"
echo "  python3 app.py"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:5000"
echo ""
echo "=================================="
