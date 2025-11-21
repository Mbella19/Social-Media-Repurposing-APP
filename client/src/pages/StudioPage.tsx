import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Play, Pause, Download, Settings, Type, Wand2, Share2, ArrowLeft, Loader2, Ratio, Check, Scissors, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Timeline } from "@/components/Timeline";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const parseTimestampToSeconds = (value: any): number => {
  if (value === null || value === undefined) return NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;

  const parts = String(value)
    .trim()
    .split(":")
    .map((part) => Number(part));

  if (parts.some((num) => Number.isNaN(num))) return NaN;

  // Support HH:MM:SS or MM:SS
  return parts.reduce((acc, part) => acc * 60 + part, 0);
};

const normalizeClipForStudio = (clip: any) => {
  const startSeconds = parseTimestampToSeconds(clip.startSeconds ?? clip.start_time ?? clip.start ?? clip.startTime);
  const endSeconds = parseTimestampToSeconds(clip.endSeconds ?? clip.end_time ?? clip.end ?? clip.endTime);
  const durationFromServer = Number(clip.duration);
  const computedDuration =
    Number.isFinite(startSeconds) &&
    Number.isFinite(endSeconds) &&
    endSeconds > startSeconds
      ? endSeconds - startSeconds
      : NaN;

  const duration = Number.isFinite(durationFromServer) && durationFromServer > 0
    ? durationFromServer
    : Number.isFinite(computedDuration)
      ? computedDuration
      : 0;

  return {
    ...clip,
    thumbnail: clip.thumbnail || clip.url,
    startSeconds,
    endSeconds,
    duration,
  };
};

export default function StudioPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClip, setSelectedClip] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const sid = sessionStorage.getItem("sessionId");
    if (!sid) {
      setLoading(false);
      return;
    }
    setSessionId(sid);

    const fetchClips = async () => {
      try {
        const response = await fetch(`/api/status/${sid}`);
        if (!response.ok) throw new Error("Failed to fetch clips");
        const data = await response.json();

        if (data.clips && Array.isArray(data.clips)) {
          const processedClips = data.clips.map(normalizeClipForStudio);
          setClips(processedClips);
          if (processedClips.length > 0) {
            setSelectedClip(processedClips[0]);
          }
        }
      } catch (error) {
        console.error("Error fetching clips:", error);
        toast({
          title: "Error loading clips",
          description: "Could not retrieve processed clips.",
          variant: "destructive"
        });
      } finally {
        setLoading(false);
      }
    };

    fetchClips();
  }, [toast]);

  const getActiveDuration = (clip?: any): number => {
    if (!clip) return 0;
    const fromClip = Number(clip.duration);
    if (Number.isFinite(fromClip) && fromClip > 0) return fromClip;

    const derived = Number(clip.endSeconds) - Number(clip.startSeconds);
    if (Number.isFinite(derived) && derived > 0) return derived;

    const metaDuration = videoRef.current?.duration ?? 0;
    return Number.isFinite(metaDuration) && metaDuration > 0 ? metaDuration : 0;
  };

  const formatSecondsLabel = (value: number) => {
    if (!Number.isFinite(value)) return "0s";
    return `${Math.max(0, Math.floor(value))}s`;
  };

  // Update current time during playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      const safeDuration = getActiveDuration(selectedClip);
      const safeTime = safeDuration ? Math.min(video.currentTime, safeDuration) : video.currentTime;
      setCurrentTime(safeTime);
    };

    video.addEventListener("timeupdate", handleTimeUpdate);
    return () => video.removeEventListener("timeupdate", handleTimeUpdate);
  }, [selectedClip]);

  // Capture actual media duration to avoid NaNs and short timelines
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selectedClip) return;

    const handleLoadedMetadata = () => {
      const mediaDuration = Number(video.duration);
      if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return;

      setClips((prev) =>
        prev.map((clip) =>
          clip.filename === selectedClip.filename
            ? { ...clip, duration: mediaDuration }
            : clip
        )
      );

      setSelectedClip((prev: any) =>
        prev && prev.filename === selectedClip.filename
          ? { ...prev, duration: mediaDuration }
          : prev
      );
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    if (video.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => video.removeEventListener("loadedmetadata", handleLoadedMetadata);
  }, [selectedClip]);

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

  const handleTimeChange = (time: number) => {
    const durationLimit = getActiveDuration(selectedClip);
    const safeTarget = Math.max(0, Math.min(time, durationLimit || time || 0));

    if (videoRef.current) {
      videoRef.current.currentTime = safeTarget;
    }
    setCurrentTime(safeTarget);
  };

  const handleToggleLetterbox = async () => {
    if (!selectedClip || !sessionId) return;

    const newLetterboxState = !selectedClip.letterbox;
    setProcessingAction("Changing crop style...");

    try {
      const response = await fetch(`/api/toggle-letterbox/${sessionId}/${selectedClip.filename}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ use_letterbox: newLetterboxState })
      });

      if (!response.ok) throw new Error("Failed to toggle letterbox");

      const data = await response.json();

      // Update clip in list
      const updatedClips = clips.map(c =>
        c.filename === selectedClip.filename
          ? { ...c, url: data.url, letterbox: data.letterbox }
          : c
      );

      setClips(updatedClips);
      setSelectedClip({ ...selectedClip, url: data.url, letterbox: data.letterbox });

      toast({
        title: "Crop updated",
        description: `Switched to ${data.letterbox ? "Letterbox" : "Standard"} mode.`
      });

    } catch (error) {
      console.error("Error toggling letterbox:", error);
      toast({
        title: "Error",
        description: "Failed to update crop style.",
        variant: "destructive"
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleGenerateCaptions = async () => {
    if (!selectedClip || !sessionId) return;

    setProcessingAction("Generating captions...");

    try {
      // 1. Generate captions
      const genResponse = await fetch(`/api/generate-captions/${sessionId}/${selectedClip.filename}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "en" })
      });

      if (!genResponse.ok) {
        const errorData = await genResponse.json();
        throw new Error(errorData.error || "Failed to generate captions");
      }

      // 2. Burn captions (create captioned version)
      setProcessingAction("Burning captions...");
      const burnResponse = await fetch(`/api/generate-captioned-version/${sessionId}/${selectedClip.filename}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          styleOptions: {
            fontFamily: "Inter",
            fontSize: 16,
            color: "#FFFFFF",
            backgroundColor: "#000000",
            backgroundOpacity: 80
          }
        })
      });

      if (!burnResponse.ok) throw new Error("Failed to burn captions");

      const data = await burnResponse.json();

      // Update clip URL to point to captioned version
      const captionedUrl = `/api/stream/${sessionId}/${data.filename}?t=${Date.now()}`;

      setSelectedClip({ ...selectedClip, url: captionedUrl });

      toast({
        title: "Captions added",
        description: "Captions have been generated and burned into the video."
      });

    } catch (error: any) {
      console.error("Error generating captions:", error);
      toast({
        title: "Caption Generation Failed",
        description: error.message || "Please check your API key or try again.",
        variant: "destructive"
      });
    } finally {
      setProcessingAction(null);
    }
  };

  const handleSplitClip = async () => {
    if (!selectedClip || !sessionId) return;

    setProcessingAction("Splitting clip...");

    try {
      const response = await fetch(`/api/split-clip/${sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedClip.filename,
          split_time: currentTime,
          clip_start: 0,
          clip_end: getActiveDuration(selectedClip)
        })
      });

      if (!response.ok) throw new Error("Failed to split clip");

      const data = await response.json();

      // Refresh clips list from backend to get new URLs and metadata
      const statusResponse = await fetch(`/api/status/${sessionId}`);
      const statusData = await statusResponse.json();

      if (statusData.clips) {
        const processed = statusData.clips.map(normalizeClipForStudio);
        setClips(processed);
        const firstPart = processed.find((c: any) => c.filename === data.parts[0].filename);
        if (firstPart) {
          setSelectedClip(firstPart);
          setCurrentTime(0);
        }
      }

      toast({
        title: "Clip Split",
        description: "Successfully split the clip into two parts."
      });

    } catch (error) {
      console.error("Error splitting clip:", error);
      toast({
        title: "Error",
        description: "Failed to split clip.",
        variant: "destructive"
      });
    } finally {
      setProcessingAction(null);
    }
  };

  // Prepare clips for Timeline component
  const activeDuration = getActiveDuration(selectedClip);
  const timelineClips = selectedClip ? [{
    id: selectedClip.filename,
    thumbnail: selectedClip.url,
    start: 0,
    end: activeDuration,
    duration: activeDuration
  }] : [];

  return (
    <div className="min-h-[calc(100vh-80px)] bg-zinc-950 text-white overflow-auto flex flex-col">
      {/* Toolbar */}
      <div className="h-14 border-b border-zinc-900 flex items-center justify-between px-4 bg-zinc-950">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="rounded-none hover:bg-zinc-900 text-zinc-500 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
            Studio <span className="text-zinc-700">/</span> {sessionId ? sessionId.slice(0, 8) : "Untitled"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button className="h-9 rounded-none bg-white text-black font-bold uppercase tracking-widest text-xs hover:bg-cyan-400 hover:scale-105 transition-all">
            <Download className="mr-2 h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {/* Main Workspace */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">

        {/* Left Sidebar: Clips */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-zinc-950 border-r border-zinc-900">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-zinc-900">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Clips</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-2">
                {loading ? (
                  <div className="flex justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
                  </div>
                ) : clips.length === 0 ? (
                  <div className="p-4 text-center text-zinc-500 text-xs">No clips found</div>
                ) : (
                  clips.map((clip, i) => (
                    <div
                      key={i}
                      className={`p-3 border border-zinc-900 cursor-pointer transition-all hover:border-zinc-700 ${selectedClip?.filename === clip.filename ? "bg-zinc-900 border-cyan-400/50" : "bg-transparent"
                        }`}
                      onClick={() => {
                        setSelectedClip(clip);
                        setIsPlaying(false);
                        setCurrentTime(0);
                        if (videoRef.current) {
                          videoRef.current.pause();
                          videoRef.current.currentTime = 0;
                        }
                      }}
                    >
                      <div className="aspect-video bg-black mb-2 relative overflow-hidden group">
                        {/* Video Thumbnail */}
                        <video
                          src={clip.url}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                          muted
                          onMouseOver={(e) => e.currentTarget.play()}
                          onMouseOut={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                          }}
                        />
                        <div className="absolute top-1 left-1 bg-black/50 px-1 text-[10px] font-mono text-white">
                          {i + 1}
                        </div>
                      </div>
                      <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-zinc-300 truncate max-w-[120px]">{clip.description || `Clip ${i + 1}`}</span>
                        <span className="text-[10px] font-mono text-zinc-600">{clip.duration ? `${Math.round(clip.duration)}s` : ""}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle className="bg-zinc-900 w-[1px]" />

        {/* Center: Preview & Timeline */}
        <ResizablePanel defaultSize={60}>
          <div className="h-full bg-zinc-950 flex flex-col relative">
            {/* Video Preview Area */}
            <div className="flex-1 flex items-center justify-center p-8 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-900/20 to-zinc-950 overflow-hidden">
              <div className="aspect-[9/16] h-full max-h-[60vh] bg-black border border-zinc-900 shadow-2xl relative group">
                {selectedClip ? (
                  <video
                    ref={videoRef}
                    src={selectedClip.url}
                    className="w-full h-full object-contain"
                    onEnded={() => setIsPlaying(false)}
                    controls={false}
                    onClick={togglePlay}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-zinc-800">
                    <Play className="h-12 w-12 opacity-20" />
                  </div>
                )}

                {/* Loading Overlay */}
                {processingAction && (
                  <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                    <Loader2 className="h-10 w-10 animate-spin text-cyan-400 mb-4" />
                    <p className="text-xs font-bold uppercase tracking-widest text-white">{processingAction}</p>
                  </div>
                )}

                {/* Play Overlay */}
                {!isPlaying && !processingAction && selectedClip && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/10 transition-colors"
                    onClick={togglePlay}
                  >
                    <Play className="h-16 w-16 text-white opacity-80" />
                  </div>
                )}
              </div>
            </div>

            {/* Timeline Area */}
            <div className="h-48 border-t border-zinc-900 bg-zinc-950 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-none hover:text-cyan-400"
                    onClick={togglePlay}
                    disabled={!selectedClip}
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs font-mono text-zinc-500">
                    {selectedClip ? `${formatSecondsLabel(currentTime)} / ${formatSecondsLabel(activeDuration)}` : "0s / 0s"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-zinc-800 hover:bg-zinc-900 hover:text-cyan-400"
                    onClick={handleSplitClip}
                    disabled={!selectedClip || !!processingAction}
                  >
                    <Scissors className="mr-2 h-3 w-3" /> Split
                  </Button>
                </div>
              </div>

              <div className="flex-1">
                {selectedClip && (
                  <Timeline
                    clips={timelineClips}
                    currentTime={currentTime}
                    onTimeChange={handleTimeChange}
                    selectedClipId={selectedClip.filename}
                    onSplitClip={handleSplitClip}
                  />
                )}
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle className="bg-zinc-900 w-[1px]" />

        {/* Right Sidebar: Tools */}
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30} className="bg-zinc-950 border-l border-zinc-900">
          <div className="h-full flex flex-col">
            <div className="p-4 border-b border-zinc-900">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Tools</h3>
            </div>
            <div className="p-4 space-y-6">

              {/* Crop Settings */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-zinc-400 uppercase">Crop Mode</Label>
                <div className="flex items-center justify-between p-3 border border-zinc-900 bg-zinc-900/30">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-200">Letterbox</span>
                    <span className="text-[10px] text-zinc-500">Add black bars</span>
                  </div>
                  <Switch
                    checked={selectedClip?.letterbox || false}
                    onCheckedChange={handleToggleLetterbox}
                    disabled={!selectedClip || !!processingAction}
                  />
                </div>
              </div>

              {/* Captions */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-zinc-400 uppercase">Captions</Label>
                <Button
                  variant="outline"
                  className="w-full justify-start rounded-none border-zinc-800 hover:bg-zinc-900 hover:text-cyan-400"
                  onClick={handleGenerateCaptions}
                  disabled={!selectedClip || !!processingAction}
                >
                  <Type className="mr-2 h-4 w-4" /> Generate Captions
                </Button>
              </div>

              {/* Effects */}
              <div className="space-y-3">
                <Label className="text-xs font-bold text-zinc-400 uppercase">Effects</Label>
                <Button variant="outline" className="w-full justify-start rounded-none border-zinc-800 hover:bg-zinc-900 hover:text-cyan-400">
                  <Wand2 className="mr-2 h-4 w-4" /> Auto-Enhance
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>

      </ResizablePanelGroup>
    </div>
  );
}
