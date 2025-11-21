import { cn } from "@/lib/utils";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";

interface TimelineClip {
  id: string;
  thumbnail: string;
  start: number;
  end: number;
  duration: number;
}

interface TimelineProps {
  clips: TimelineClip[];
  currentTime: number;
  onClipSelect?: (clipId: string) => void;
  selectedClipId?: string;
  onTimeChange?: (time: number) => void;
  onSplitClip?: () => void;
  onDeleteClip?: () => void;
}

export function Timeline({ clips, currentTime, onClipSelect, selectedClipId, onTimeChange }: TimelineProps) {
  // Ensure timeline math never receives NaN/strings
  const safeClips = clips.map((clip) => {
    const duration = Number(clip.duration);
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
    return { ...clip, duration: safeDuration };
  });

  const [isDragging, setIsDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [containerWidth, setContainerWidth] = useState(0);
  const [pxPerSec, setPxPerSec] = useState(20); // Default zoom level
  const MIN_CLIP_PX = 20;

  // Safely calculate total duration
  const totalDuration = Math.max(
    0.1,
    safeClips.reduce((sum, clip) => sum + (Number.isFinite(clip.duration) ? clip.duration : 0), 0)
  );
  const trackWidth = Math.max(containerWidth, totalDuration * pxPerSec);

  const getXFromEvent = (e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    const timelineEl = timelineRef.current;
    const scrollEl = scrollRef.current;
    if (!timelineEl || !scrollEl) return 0;
    const rect = timelineEl.getBoundingClientRect();
    const clientX = (e as MouseEvent).clientX;
    const x = clientX - rect.left + scrollEl.scrollLeft;
    return Math.max(0, Math.min(x, trackWidth));
  };

  const handleTimelineInteraction = useCallback((e: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
    if (!onTimeChange || totalDuration <= 0) return;
    const x = getXFromEvent(e);
    const seconds = x / pxPerSec;
    const clamped = Math.max(0, Math.min(seconds, totalDuration));

    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = requestAnimationFrame(() => onTimeChange(clamped));
  }, [onTimeChange, totalDuration, pxPerSec, trackWidth]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only start dragging on left click
    if (e.button !== 0) return;

    e.preventDefault();
    setIsDragging(true);
    handleTimelineInteraction(e);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      e.preventDefault();
      handleTimelineInteraction(e);
    }
  }, [isDragging, handleTimelineInteraction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
  }, []);

  // Handle zooming with Ctrl + Wheel and horizontal scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      setPxPerSec((prev) => {
        const newZoom = prev * (1 + zoomDelta);
        return Math.max(5, Math.min(200, newZoom));
      });
    } else if (e.deltaY !== 0) {
      // Map vertical scroll to horizontal scroll for natural timeline navigation
      e.preventDefault();
      if (scrollRef.current) {
        scrollRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const fitTimeline = () => {
    if (totalDuration <= 0 || containerWidth === 0) return;
    const fitted = Math.max(5, containerWidth / totalDuration);
    setPxPerSec(fitted);
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  };

  useEffect(() => {
    const update = () => {
      if (scrollRef.current) {
        setContainerWidth(scrollRef.current.clientWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Draw waveform
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    // Match the container height (h-24 = 96px)
    const height = 96;

    // Resize canvas
    canvas.width = Math.floor(trackWidth * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${trackWidth}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, trackWidth, height);

    // Background
    ctx.fillStyle = "#09090b"; // zinc-950
    ctx.fillRect(0, 0, trackWidth, height);

    // Draw grid lines
    ctx.strokeStyle = "#27272a"; // zinc-800
    ctx.lineWidth = 1;
    ctx.beginPath();
    const gridStep = pxPerSec; // One line per second
    for (let x = 0; x <= trackWidth; x += gridStep) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    ctx.stroke();

    // Draw waveform simulation
    ctx.fillStyle = "#3f3f46"; // zinc-700
    const barWidth = Math.max(2, pxPerSec / 10);
    const gap = 1;

    // Deterministic random for consistent waveform
    const seed = 12345;
    const random = (x: number) => {
      const n = Math.sin(x * 12.9898 + seed) * 43758.5453;
      return n - Math.floor(n);
    };

    for (let x = 0; x < trackWidth; x += barWidth + gap) {
      // Only draw if visible (optimization could be added here)
      const t = x / pxPerSec;
      const r = random(x);

      // Make waveform look somewhat realistic
      const amplitude = Math.max(0.1, r * 0.8 + Math.sin(t * 5) * 0.2);
      const h = amplitude * (height * 0.8);
      const y = (height - h) / 2;

      // Highlight active region
      const isActive = t <= currentTime;
      ctx.fillStyle = isActive ? "#22d3ee" : "#3f3f46"; // cyan-400 vs zinc-700

      ctx.fillRect(x, y, barWidth, h);
    }
  }, [pxPerSec, trackWidth, currentTime]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Generate ticks
  const tickInterval = pxPerSec < 20 ? 10 : pxPerSec < 50 ? 5 : 1;
  const ticks: number[] = [];
  for (let t = 0; t <= totalDuration; t += tickInterval) {
    ticks.push(t);
  }

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="w-full border border-zinc-800 bg-zinc-950/50 rounded-lg overflow-hidden flex flex-col select-none">
      {/* Header Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Timeline</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800"
            onClick={() => setPxPerSec((v) => Math.max(5, v * 0.8))}
            title="Zoom Out"
          >
            <ZoomOut className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800"
            onClick={() => setPxPerSec((v) => Math.min(200, v * 1.2))}
            title="Zoom In"
          >
            <ZoomIn className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-zinc-400 hover:text-cyan-400 hover:bg-zinc-800"
            onClick={fitTimeline}
            title="Fit to View"
          >
            <Maximize2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Timeline Area */}
      <div className="relative flex-1 min-h-[100px] flex flex-col">
        <div
          className="overflow-x-auto custom-scrollbar flex-1"
          ref={scrollRef}
          onWheel={handleWheel}
        >
          <div className="relative" style={{ width: trackWidth }}>

            {/* Ruler */}
            <div className="h-6 border-b border-zinc-800 bg-zinc-900/30 relative sticky top-0 z-20">
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l border-zinc-700/50 pl-1 text-[9px] font-mono text-zinc-500"
                  style={{ left: t * pxPerSec }}
                >
                  {formatTime(t)}
                </div>
              ))}
            </div>

            {/* Tracks Container */}
            <div
              ref={timelineRef}
              className="relative h-24 cursor-pointer group"
              onMouseDown={handleMouseDown}
            >
              {/* Waveform Canvas */}
              <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-50" />

              {/* Clips Overlay */}
              {safeClips.map((clip, index) => {
                let startOffset = 0;
                // Simple sequential layout for now
                for (let i = 0; i < index; i++) startOffset += (safeClips[i].duration || 0);

                const left = startOffset * pxPerSec;
                const width = Math.max(MIN_CLIP_PX, (clip.duration || 0) * pxPerSec);
                const isSelected = selectedClipId === clip.id;

                return (
                  <div
                    key={clip.id}
                    className={cn(
                      "absolute top-2 bottom-2 border-2 rounded-md transition-all overflow-hidden",
                      isSelected
                        ? "border-cyan-400 bg-cyan-400/10 z-10 shadow-[0_0_10px_rgba(34,211,238,0.2)]"
                        : "border-zinc-700 bg-zinc-800/40 hover:border-zinc-500"
                    )}
                    style={{ left, width }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onClipSelect?.(clip.id);
                    }}
                  >
                    <div className="absolute top-0 left-0 right-0 h-4 bg-zinc-900/80 px-1 flex items-center justify-between">
                      <span className="text-[9px] font-bold text-zinc-400 truncate max-w-full">
                        Clip {index + 1}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-cyan-400 z-30 pointer-events-none shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                style={{ left: currentTime * pxPerSec }}
              >
                <div className="absolute -top-1 -left-1.5 w-3 h-3 rotate-45 bg-cyan-400 shadow-sm" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-3 py-1.5 bg-zinc-900 border-t border-zinc-800 flex justify-between items-center text-[10px] font-mono">
        <span className="text-zinc-500">
          Zoom: {Math.round(pxPerSec)}px/s
        </span>
        <div className="flex gap-3">
          <span className="text-cyan-400 font-bold">{formatTime(currentTime)}</span>
          <span className="text-zinc-600">/</span>
          <span className="text-zinc-400">{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
}
