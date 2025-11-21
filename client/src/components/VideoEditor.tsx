import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Merge, Download, Type, Maximize2, Minimize2, Loader2, X } from 'lucide-react';
import { CaptionEditor } from './CaptionEditor';

interface ClipData {
  sessionId: string;
  filename: string;
  duration: number;
  startTime: number;
  endTime: number;
  selected: boolean;
  path: string;
  description: string;
  letterbox?: boolean;
}

interface VideoEditorProps {
  clips: ClipData[];
  sessionId: string;
  onClose?: () => void;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ clips: initialClips, sessionId, onClose }) => {
  const [clips, setClips] = useState<ClipData[]>([]);
  const [selectedClips, setSelectedClips] = useState<number[]>([]);
  const [currentClipIndex, setCurrentClipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);
  const [isLoadingClipInfo, setIsLoadingClipInfo] = useState(true);
  const [isTogglingLetterbox, setIsTogglingLetterbox] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Load actual clip durations
  useEffect(() => {
    const loadClipInfo = async () => {
      const updatedClips = await Promise.all(
        initialClips.map(async (clip) => {
          try {
            const response = await fetch(`/api/clip-info/${sessionId}/${clip.filename}`);
            const data = await response.json();
            return {
              ...clip,
              duration: data.duration || 10,
              startTime: 0,
              endTime: data.duration || 10,
              selected: false,
            };
          } catch (error) {
            console.error('Error loading clip info:', error);
            return {
              ...clip,
              duration: 10,
              startTime: 0,
              endTime: 10,
              selected: false,
            };
          }
        })
      );
      setClips(updatedClips);
      setIsLoadingClipInfo(false);
    };

    loadClipInfo();
  }, [initialClips, sessionId]);

  // Update time as video plays
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const clip = clips[currentClipIndex];
      if (!clip) return;
      
      const relativeTime = video.currentTime;
      setCurrentTime(relativeTime);
      
      // Auto-pause at end time if trimmed
      if (relativeTime >= clip.endTime - clip.startTime) {
        video.pause();
        setIsPlaying(false);
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [currentClipIndex, clips]);

  const handleClipSelect = (index: number) => {
    setClips((prevClips) =>
      prevClips.map((clip, i) => ({
        ...clip,
        selected: i === index ? !clip.selected : clip.selected,
      }))
    );

    setSelectedClips((prev) => {
      if (prev.includes(index)) {
        return prev.filter((i) => i !== index);
      }
      return [...prev, index].sort((a, b) => a - b);
    });
  };

  const handleTrimClip = (index: number, startTime: number, endTime: number) => {
    setClips((prevClips) =>
      prevClips.map((clip, i) =>
        i === index ? { ...clip, startTime, endTime } : clip
      )
    );
  };

  const handlePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  const handleSelectClip = (index: number) => {
    setCurrentClipIndex(index);
    setCurrentTime(0);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.load();
    }
  };

  const handleMergeClips = async () => {
    if (selectedClips.length < 2) {
      alert('Please select at least 2 clips to merge');
      return;
    }

    setIsMerging(true);
    try {
      const clipsToMerge = selectedClips.map((index) => {
        const clip = clips[index];
        return {
          filename: clip.filename,
          startTime: clip.startTime,
          endTime: clip.endTime,
        };
      });

      const response = await fetch(`/api/merge-clips/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clips: clipsToMerge }),
      });

      if (!response.ok) throw new Error('Failed to merge clips');

      const data = await response.json();
      setMergedVideoUrl(data.url);
      
      // Switch to merged video
      setCurrentClipIndex(-1);
      if (videoRef.current) {
        videoRef.current.load();
      }
    } catch (error) {
      console.error('Error merging clips:', error);
      alert('Failed to merge clips. Please try again.');
    } finally {
      setIsMerging(false);
    }
  };

  const handleDownloadMerged = () => {
    if (!mergedVideoUrl) return;
    const filename = mergedVideoUrl.split('/').pop();
    window.open(`/api/download/${sessionId}/${filename}`, '_blank');
  };

  const handleToggleLetterbox = async (index: number) => {
    const clip = clips[index];
    setIsTogglingLetterbox(index);
    
    try {
      const response = await fetch(`/api/toggle-letterbox/${sessionId}/${clip.filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_letterbox: !clip.letterbox }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to toggle letterbox');
      }

      const data = await response.json();
      
      setClips((prevClips) =>
        prevClips.map((c, i) =>
          i === index ? { ...c, letterbox: data.letterbox, path: data.url } : c
        )
      );
      
      // Force reload video if it's currently playing
      if (index === currentClipIndex && videoRef.current) {
        const video = videoRef.current;
        video.src = data.url;
        video.load();
        video.play().catch(() => {}); // Auto-play if possible
      }
    } catch (error) {
      console.error('Failed to toggle letterbox:', error);
      alert(`Failed to toggle letterbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsTogglingLetterbox(null);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  if (isLoadingClipInfo) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        <span className="ml-2 text-white">Loading clips...</span>
      </div>
    );
  }

  const currentClip = mergedVideoUrl ? null : clips[currentClipIndex];
  const videoUrl = mergedVideoUrl || (currentClip ? currentClip.path : '');

  return (
    <div className="video-editor bg-gray-950 rounded-lg h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <h2 className="text-xl font-bold text-white">Edit & Merge</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Video Preview */}
        <div className="mb-6 bg-black rounded-lg overflow-hidden max-w-md mx-auto">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full aspect-[9/16] object-contain bg-black"
            key={videoUrl}
          />
          
          {/* Playback Controls */}
          <div className="bg-gray-900 p-3 flex items-center justify-center gap-4">
            <button
              onClick={handlePlayPause}
              className="p-3 bg-purple-600 hover:bg-purple-700 rounded-full transition-colors"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
            </button>
            <div className="text-sm text-gray-400">
              {currentClip ? `${formatTime(currentTime)} / ${formatTime(currentClip.endTime - currentClip.startTime)}` : '0:00.0 / 0:00.0'}
            </div>
          </div>
        </div>

        {/* Timeline Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-3">Timeline</h3>
          <div className="space-y-3" ref={timelineRef}>
            {clips.map((clip, index) => (
              <div
                key={index}
                className={`bg-gray-900 rounded-lg p-4 border-2 transition-all ${
                  clip.selected ? 'border-purple-600' : 'border-transparent'
                } ${index === currentClipIndex && !mergedVideoUrl ? 'ring-2 ring-blue-500' : ''}`}
              >
                {/* Clip Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={clip.selected}
                      onChange={() => handleClipSelect(index)}
                      className="w-5 h-5 rounded text-purple-600 cursor-pointer"
                    />
                    <div>
                      <p className="text-white font-medium">Clip {index + 1}</p>
                      <p className="text-xs text-gray-500">
                        {formatTime(clip.startTime)} - {formatTime(clip.endTime)}
                      </p>
                    </div>
                  </div>

                  {/* Clip Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSelectClip(index)}
                      className="p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                      title="Preview this clip"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleToggleLetterbox(index)}
                      disabled={isTogglingLetterbox === index}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                      title={clip.letterbox ? "Switch to Standard Crop" : "Switch to Letterbox"}
                    >
                      {isTogglingLetterbox === index ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span className="text-xs">Processing...</span>
                        </>
                      ) : clip.letterbox ? (
                        <>
                          <Minimize2 className="h-4 w-4" />
                          <span className="text-xs">Standard Crop</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="h-4 w-4" />
                          <span className="text-xs">Landscape</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Trim Controls */}
                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <label className="text-gray-400">Start:</label>
                    <input
                      type="number"
                      value={clip.startTime.toFixed(1)}
                      min={0}
                      max={clip.duration}
                      step={0.1}
                      onChange={(e) =>
                        handleTrimClip(index, Number(e.target.value), clip.endTime)
                      }
                      className="w-20 px-2 py-1 bg-gray-800 text-white rounded border border-gray-700 focus:border-purple-600 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-gray-400">End:</label>
                    <input
                      type="number"
                      value={clip.endTime.toFixed(1)}
                      min={0}
                      max={clip.duration}
                      step={0.1}
                      onChange={(e) =>
                        handleTrimClip(index, clip.startTime, Number(e.target.value))
                      }
                      className="w-20 px-2 py-1 bg-gray-800 text-white rounded border border-gray-700 focus:border-purple-600 outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (index !== currentClipIndex) {
                        handleSelectClip(index);
                      }
                      setShowCaptionEditor(!showCaptionEditor);
                    }}
                    className="ml-auto flex items-center gap-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                  >
                    <Type className="h-4 w-4" />
                    <span>Captions</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Caption Editor Section */}
        {showCaptionEditor && currentClip && (
          <div className="mb-6 bg-gray-900 rounded-lg p-4 border border-purple-600">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-white">Caption Editor</h3>
              <button
                onClick={() => setShowCaptionEditor(false)}
                className="text-gray-400 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <CaptionEditor
              sessionId={sessionId}
              filename={currentClip.filename}
              videoUrl={currentClip.path}
              onCaptionsUpdate={() => {}}
            />
          </div>
        )}

        {/* Merged Video Info */}
        {mergedVideoUrl && (
          <div className="mb-6 p-4 bg-green-900/20 border border-green-700 rounded-lg">
            <p className="text-green-400 font-medium">
              ✅ Videos merged successfully! Preview above or download.
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-800 bg-gray-900">
        <div className="max-w-4xl mx-auto">
          <div className="bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors mb-3">
            <button
              onClick={handleMergeClips}
              disabled={selectedClips.length < 2 || isMerging}
              className="w-full py-4 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isMerging ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Merge className="h-5 w-5" />
                  <span>Merge Selected ({selectedClips.length})</span>
                </>
              )}
            </button>
          </div>

          {mergedVideoUrl && (
            <button
              onClick={handleDownloadMerged}
              className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="h-5 w-5" />
              Download Merged Video
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
