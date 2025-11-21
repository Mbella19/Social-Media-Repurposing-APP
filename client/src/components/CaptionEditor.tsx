import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Type, Palette, AlignCenter, Download, Eye, EyeOff, Loader2, RefreshCcw } from 'lucide-react';

interface Caption {
  text: string;
  start: number;
  end: number;
}

interface CaptionEditorProps {
  sessionId: string;
  filename: string;
  videoUrl: string;
  onCaptionsUpdate?: (captions: Caption[]) => void;
}

interface StyleOptions {
  fontFamily: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'top' | 'center' | 'bottom';
  positionY: number;
  textAlign: 'left' | 'center' | 'right';
  fontWeight: number;
  outlineColor: string;
  outlineWidth: number;
  animation: 'none' | 'pop' | 'fade' | 'slide' | 'bounce' | 'zoom' | 'rotate' | 'blur' | 'shake' | 'glow';
  letterSpacing: number;
}

const defaultStyles: StyleOptions = {
  fontFamily: 'Arial',
  fontSize: 24,
  fontColor: '#FFFFFF',
  backgroundColor: '#000000',
  backgroundOpacity: 0.5,
  position: 'bottom',
  positionY: 90,
  textAlign: 'center',
  fontWeight: 400,
  outlineColor: '#000000',
  outlineWidth: 0,
  animation: 'none',
  letterSpacing: 0,
};

const fontOptions = [
  // Standard fonts
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Verdana',
  
  // Bold/Impact fonts (great for captions)
  'Impact',
  'Arial Black',
  'Franklin Gothic Heavy',
  'Bebas Neue',
  'Anton',
  'Oswald',
  
  // Stylized/Modern fonts
  'Montserrat',
  'Raleway',
  'Poppins',
  'Roboto',
  'Open Sans',
  'Lato',
  'Playfair Display',
  'Merriweather',
  'Libre Caslon Text',
  
  // Fun/Creative fonts
  'Comic Sans MS',
  'Marker Felt',
  'Brush Script MT',
  'Pacifico',
  'Lobster',
  'Righteous',
];

const colorPresets = [
  '#FFFFFF', // White
  '#000000', // Black
  '#FF0000', // Red
  '#00FF00', // Green
  '#0000FF', // Blue
  '#FFFF00', // Yellow
  '#FF00FF', // Magenta
  '#00FFFF', // Cyan
  '#FFA500', // Orange
  '#800080', // Purple
];

export const CaptionEditor: React.FC<CaptionEditorProps> = ({
  sessionId,
  filename,
  videoUrl,
  onCaptionsUpdate,
}) => {
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showCaptions, setShowCaptions] = useState(true);
  const [styles, setStyles] = useState<StyleOptions>(defaultStyles);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [additionalText, setAdditionalText] = useState<string>('');
  const [additionalTextPosition, setAdditionalTextPosition] = useState({ x: 50, y: 10 });

  // Load existing captions on mount
  useEffect(() => {
    loadCaptions();
  }, [sessionId, filename]);

  // Update current time as video plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, []);

  const loadCaptions = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/captions/${sessionId}/${filename}`);
      const data = await response.json();
      if (data.captions && data.captions.length > 0) {
        setCaptions(data.captions);
        onCaptionsUpdate?.(data.captions);
      }
    } catch (error) {
      console.error('Error loading captions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateCaptions = async () => {
    try {
      setIsGenerating(true);
      const response = await fetch(`/api/generate-captions/${sessionId}/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: 'en' }),
      });

      if (response.ok) {
        const data = await response.json();
        setCaptions(data.captions);
        onCaptionsUpdate?.(data.captions);
      } else {
        console.error('Failed to generate captions');
      }
    } catch (error) {
      console.error('Error generating captions:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const updateCaption = (index: number, text: string) => {
    const updatedCaptions = [...captions];
    updatedCaptions[index].text = text;
    setCaptions(updatedCaptions);
    saveCaptions(updatedCaptions);
  };

  const saveCaptions = async (updatedCaptions: Caption[]) => {
    try {
      await fetch(`/api/update-captions/${sessionId}/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captions: updatedCaptions }),
      });
      onCaptionsUpdate?.(updatedCaptions);
    } catch (error) {
      console.error('Error saving captions:', error);
    }
  };

  const downloadWithCaptions = async () => {
    try {
      const response = await fetch(`/api/download-with-captions/${sessionId}/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleOptions: styles }),
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `captioned_${filename}`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error downloading with captions:', error);
    }
  };

  const downloadWithoutCaptions = () => {
    const a = document.createElement('a');
    a.href = `/api/download/${sessionId}/${filename}`;
    a.download = filename;
    a.click();
  };

  const getCurrentCaption = () => {
    return captions.find(
      (caption) => currentTime >= caption.start && currentTime <= caption.end
    );
  };

  const jumpToCaption = (caption: Caption) => {
    if (videoRef.current) {
      videoRef.current.currentTime = caption.start;
      videoRef.current.play();
    }
  };

  return (
    <div className="caption-editor bg-gray-900 rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-white">Caption Editor</h3>
        <div className="flex gap-2">
          {captions.length === 0 ? (
            <button
              onClick={generateCaptions}
              disabled={isGenerating}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  Generate Captions
                </>
              )}
            </button>
          ) : (
            <>
              <button
                onClick={generateCaptions}
                disabled={isGenerating}
                className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                title="Regenerate captions from scratch"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" />
                    Regenerate
                  </>
                )}
              </button>
              <button
                onClick={() => setShowCaptions(!showCaptions)}
                className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
              >
                {showCaptions ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                {showCaptions ? 'Hide' : 'Show'}
              </button>
              <button
                onClick={() => setIsStylePanelOpen(!isStylePanelOpen)}
                className="px-3 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
              >
                <Palette className="h-4 w-4" />
                Style
                <ChevronDown className={`h-4 w-4 transition-transform ${isStylePanelOpen ? 'rotate-180' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Video Preview with Captions */}
      <div className="relative mb-4 rounded-lg overflow-hidden">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          className="w-full rounded-lg"
        />
        
        {/* Caption Overlay */}
        {showCaptions && getCurrentCaption() && (
          <div
            className="absolute left-0 right-0 px-4 py-2 pointer-events-none"
            style={{
              top: `${styles.positionY}%`,
              transform: 'translateY(-50%)',
            }}
          >
            <div
              className={`inline-block px-3 py-2 rounded ${
                styles.animation === 'pop' ? 'animate-pop' :
                styles.animation === 'fade' ? 'animate-fade' :
                styles.animation === 'slide' ? 'animate-slide' :
                styles.animation === 'bounce' ? 'animate-bounce-in' :
                styles.animation === 'zoom' ? 'animate-zoom' :
                styles.animation === 'rotate' ? 'animate-rotate' :
                styles.animation === 'blur' ? 'animate-blur' :
                styles.animation === 'shake' ? 'animate-shake' :
                styles.animation === 'glow' ? 'animate-glow' : ''
              }`}
              style={{
                fontFamily: styles.fontFamily,
                fontSize: `${styles.fontSize}px`,
                fontWeight: styles.fontWeight,
                color: styles.fontColor,
                backgroundColor: `${styles.backgroundColor}${Math.round(styles.backgroundOpacity * 255).toString(16).padStart(2, '0')}`,
                textAlign: styles.textAlign,
                width: '100%',
                letterSpacing: `${styles.letterSpacing}px`,
                textShadow: styles.outlineWidth > 0 ? `
                  -${styles.outlineWidth}px -${styles.outlineWidth}px 0 ${styles.outlineColor},
                  ${styles.outlineWidth}px -${styles.outlineWidth}px 0 ${styles.outlineColor},
                  -${styles.outlineWidth}px ${styles.outlineWidth}px 0 ${styles.outlineColor},
                  ${styles.outlineWidth}px ${styles.outlineWidth}px 0 ${styles.outlineColor}
                ` : 'none',
              }}
            >
              {getCurrentCaption()?.text}
            </div>
          </div>
        )}

        {/* Additional Text Overlay */}
        {additionalText && showCaptions && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${additionalTextPosition.x}%`,
              top: `${additionalTextPosition.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="px-3 py-1 rounded"
              style={{
                fontFamily: styles.fontFamily,
                fontSize: `${styles.fontSize * 0.8}px`,
                color: styles.fontColor,
                backgroundColor: `${styles.backgroundColor}${Math.round(styles.backgroundOpacity * 255).toString(16).padStart(2, '0')}`,
              }}
            >
              {additionalText}
            </div>
          </div>
        )}
      </div>

      {/* Style Panel */}
      {isStylePanelOpen && captions.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Font Family */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Font</label>
              <select
                value={styles.fontFamily}
                onChange={(e) => setStyles({ ...styles, fontFamily: e.target.value })}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
              >
                {fontOptions.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Size</label>
              <input
                type="range"
                min="12"
                max="48"
                value={styles.fontSize}
                onChange={(e) => setStyles({ ...styles, fontSize: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-xs text-gray-400">{styles.fontSize}px</span>
            </div>

            {/* Font Color */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Text Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={styles.fontColor}
                  onChange={(e) => setStyles({ ...styles, fontColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <div className="flex gap-1">
                  {colorPresets.slice(0, 5).map((color) => (
                    <button
                      key={color}
                      onClick={() => setStyles({ ...styles, fontColor: color })}
                      className="w-6 h-6 rounded border border-gray-600"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Background Color */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Background</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={styles.backgroundColor}
                  onChange={(e) => setStyles({ ...styles, backgroundColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={styles.backgroundOpacity}
                  onChange={(e) => setStyles({ ...styles, backgroundOpacity: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400">{Math.round(styles.backgroundOpacity * 100)}%</span>
              </div>
            </div>

            {/* Position */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Position</label>
              <div className="flex gap-2 mb-3">
                {(['top', 'center', 'bottom'] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => {
                      const yPositions = { top: 10, center: 50, bottom: 90 };
                      setStyles({ ...styles, position: pos, positionY: yPositions[pos] });
                    }}
                    className={`px-3 py-1 rounded ${
                      styles.position === pos
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {pos.charAt(0).toUpperCase() + pos.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <label className="text-xs text-gray-400 whitespace-nowrap">Fine Tune Y:</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={styles.positionY}
                  onChange={(e) => setStyles({ ...styles, positionY: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12">{styles.positionY}%</span>
              </div>
            </div>

            {/* Text Align */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Alignment</label>
              <div className="flex gap-2">
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    onClick={() => setStyles({ ...styles, textAlign: align })}
                    className={`px-3 py-1 rounded ${
                      styles.textAlign === align
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {align.charAt(0).toUpperCase() + align.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Weight */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Font Weight</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="100"
                  max="900"
                  step="100"
                  value={styles.fontWeight}
                  onChange={(e) => setStyles({ ...styles, fontWeight: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12">{styles.fontWeight}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>Thin</span>
                <span>Regular</span>
                <span>Black</span>
              </div>
            </div>

            {/* Text Outline */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Text Outline</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={styles.outlineColor}
                  onChange={(e) => setStyles({ ...styles, outlineColor: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  value={styles.outlineWidth}
                  onChange={(e) => setStyles({ ...styles, outlineWidth: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12">{styles.outlineWidth}px</span>
              </div>
            </div>

            {/* Animation */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Animation</label>
              <select
                value={styles.animation}
                onChange={(e) => setStyles({ ...styles, animation: e.target.value as StyleOptions['animation'] })}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
              >
                <option value="none">None</option>
                <option value="pop">Pop</option>
                <option value="fade">Fade In</option>
                <option value="slide">Slide Up</option>
                <option value="bounce">Bounce</option>
                <option value="zoom">Zoom In</option>
                <option value="rotate">Rotate In</option>
                <option value="blur">Blur Focus</option>
                <option value="shake">Shake</option>
                <option value="glow">Glow Pulse</option>
              </select>
            </div>

            {/* Letter Spacing */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Letter Spacing</label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="-2"
                  max="10"
                  step="0.5"
                  value={styles.letterSpacing}
                  onChange={(e) => setStyles({ ...styles, letterSpacing: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12">{styles.letterSpacing}px</span>
              </div>
            </div>
          </div>

          {/* Additional Text */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Additional Text</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={additionalText}
                onChange={(e) => setAdditionalText(e.target.value)}
                placeholder="Add watermark or additional text..."
                className="flex-1 px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
              />
              <input
                type="number"
                value={additionalTextPosition.x}
                onChange={(e) => setAdditionalTextPosition({ ...additionalTextPosition, x: Number(e.target.value) })}
                placeholder="X%"
                className="w-20 px-2 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
                min="0"
                max="100"
              />
              <input
                type="number"
                value={additionalTextPosition.y}
                onChange={(e) => setAdditionalTextPosition({ ...additionalTextPosition, y: Number(e.target.value) })}
                placeholder="Y%"
                className="w-20 px-2 py-2 bg-gray-700 text-white rounded-lg border border-gray-600"
                min="0"
                max="100"
              />
            </div>
          </div>
        </div>
      )}

      {/* Caption List */}
      {captions.length > 0 && (
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          <h4 className="text-sm font-medium text-gray-400 mb-2">Captions ({captions.length})</h4>
          {captions.map((caption, index) => (
            <div
              key={index}
              className={`bg-gray-800 rounded-lg p-3 cursor-pointer transition-colors ${
                getCurrentCaption() === caption ? 'ring-2 ring-purple-500' : ''
              }`}
              onClick={() => jumpToCaption(caption)}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-xs text-gray-500">
                  {formatTime(caption.start)} - {formatTime(caption.end)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingIndex(editingIndex === index ? null : index);
                  }}
                  className="text-xs text-purple-400 hover:text-purple-300"
                >
                  {editingIndex === index ? 'Save' : 'Edit'}
                </button>
              </div>
              {editingIndex === index ? (
                <textarea
                  value={caption.text}
                  onChange={(e) => updateCaption(index, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 text-sm"
                  rows={2}
                />
              ) : (
                <p className="text-white text-sm">{caption.text}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Download Options */}
      {captions.length > 0 && (
        <div className="flex gap-2">
          <button
            onClick={downloadWithCaptions}
            className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download with Captions
          </button>
          <button
            onClick={downloadWithoutCaptions}
            className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" />
            Download without Captions
          </button>
        </div>
      )}
    </div>
  );
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
