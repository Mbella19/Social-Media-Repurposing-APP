import { Play, Pause, Volume2, VolumeX, Maximize } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface Caption {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface CaptionStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  backgroundOpacity?: number;
  textAlign?: string;
  outlineColor?: string;
  outlineWidth?: number;
  letterSpacing?: number;
  lineHeight?: number;
  animation?: string;
  positionX?: number;
  positionY?: number;
}

interface VideoPlayerProps {
  videoUrl?: string;
  aspectRatio?: "16/9" | "9/16" | "1/1";
  className?: string;
  captions?: Caption[];
  showCaptions?: boolean;
  captionStyle?: CaptionStyle;
  currentTime?: number;
  onTimeUpdate?: (time: number) => void;
  clipStart?: number;
  clipEnd?: number;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export function VideoPlayer({
  videoUrl = "",
  aspectRatio = "16/9",
  className,
  captions = [],
  showCaptions = true,
  captionStyle = {},
  currentTime: externalCurrentTime,
  onTimeUpdate: externalOnTimeUpdate,
  clipStart = 0,
  clipEnd,
}: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [internalCurrentTime, setInternalCurrentTime] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const currentTime = externalCurrentTime !== undefined ? externalCurrentTime : internalCurrentTime;
  const clipDuration = clipEnd ? (clipEnd - clipStart) : 0;
  
  // Set initial time to clip start when video loads
  useEffect(() => {
    if (videoRef.current && videoRef.current.readyState >= 2) {
      videoRef.current.currentTime = clipStart;
    }
  }, [videoUrl, clipStart]);
  
  // Seek video when external currentTime changes
  useEffect(() => {
    if (videoRef.current && externalCurrentTime !== undefined && 
        Math.abs(videoRef.current.currentTime - externalCurrentTime) > 0.1) {
      videoRef.current.currentTime = externalCurrentTime;
    }
  }, [externalCurrentTime]);
  
  // Find current caption
  const currentCaption = captions.find(
    (caption) => currentTime >= caption.start && currentTime <= caption.end
  );

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleProgressChange = (value: number[]) => {
    const newProgress = value[0];
    setProgress(newProgress);
    if (videoRef.current) {
      if (clipEnd) {
        // Map progress to clip range
        const clipTime = clipStart + (newProgress / 100) * clipDuration;
        videoRef.current.currentTime = clipTime;
      } else {
        videoRef.current.currentTime = (newProgress / 100) * videoRef.current.duration;
      }
    }
  };

  return (
    <div
      className={cn(
        "relative group rounded-xl overflow-hidden bg-black",
        className
      )}
      style={{ aspectRatio }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      data-testid="video-player"
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        src={videoUrl}
        onTimeUpdate={(e) => {
          const video = e.currentTarget;
          
          // Check if we've reached the clip end
          if (clipEnd && video.currentTime >= clipEnd) {
            video.pause();
            video.currentTime = clipEnd;
            setIsPlaying(false);
          }
          
          // Calculate progress relative to clip duration
          if (clipEnd) {
            const relativeTime = video.currentTime - clipStart;
            setProgress((relativeTime / clipDuration) * 100);
          } else {
            setProgress((video.currentTime / video.duration) * 100);
          }
          
          setInternalCurrentTime(video.currentTime);
          externalOnTimeUpdate?.(video.currentTime);
        }}
        onLoadedMetadata={(e) => {
          // Seek to clip start when video is ready
          e.currentTarget.currentTime = clipStart;
        }}
      />

      {!videoUrl && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <p className="text-muted-foreground">No video loaded</p>
        </div>
      )}

      {/* Caption Overlay */}
      {showCaptions && currentCaption && (
        <div 
          className="absolute pointer-events-none"
          style={{ 
            left: `${captionStyle.positionX || 50}%`,
            top: `${captionStyle.positionY || 85}%`,
            transform: 'translate(-50%, -50%)',
            maxWidth: '90%'
          }}
        >
          <div 
            className="px-4 py-2"
            style={{
              backgroundColor: captionStyle.backgroundOpacity === 0 
                ? 'transparent' 
                : captionStyle.backgroundColor 
                  ? `${captionStyle.backgroundColor}${Math.round((captionStyle.backgroundOpacity || 80) * 2.55).toString(16).padStart(2, '0')}` 
                  : 'rgba(0,0,0,0.8)',
              borderRadius: 0
            }}
          >
            <p 
              style={{ 
                fontFamily: captionStyle.fontFamily || 'Inter',
                fontSize: `${captionStyle.fontSize || 24}px`,
                color: captionStyle.color || '#FFFFFF',
                fontWeight: captionStyle.fontWeight === 'Bold' ? '700' : 
                           captionStyle.fontWeight === 'Black' ? '900' : 
                           captionStyle.fontWeight === 'Light' ? '300' : '400',
                textAlign: (captionStyle.textAlign || 'center') as any,
                letterSpacing: `${captionStyle.letterSpacing || 0}px`,
                lineHeight: captionStyle.lineHeight || 1.2,
                textShadow: captionStyle.outlineWidth ? 
                  `${captionStyle.outlineColor || '#000'} 0 0 ${captionStyle.outlineWidth}px, ${captionStyle.outlineColor || '#000'} 0 0 ${captionStyle.outlineWidth}px` : 
                  'none',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}
            >
              {currentCaption.text}
            </p>
          </div>
        </div>
      )}

      <div
        className={cn(
          "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent",
          "transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
          <Slider
            value={[progress]}
            onValueChange={handleProgressChange}
            max={100}
            step={0.1}
            className="cursor-pointer"
            data-testid="video-scrubber"
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={togglePlay}
                className="text-white hover:bg-white/20"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="text-white hover:bg-white/20"
                data-testid="button-mute"
              >
                {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>

              <span className="text-sm text-white font-mono">
                {formatTime(clipEnd ? Math.max(0, currentTime - clipStart) : currentTime)} / {formatTime(clipEnd ? clipDuration : videoRef.current?.duration || 0)}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              data-testid="button-fullscreen"
            >
              <Maximize className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
