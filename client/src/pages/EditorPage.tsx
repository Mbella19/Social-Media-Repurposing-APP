import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ProgressStepper } from "@/components/ProgressStepper";
import { VideoPlayer } from "@/components/VideoPlayer";
import { Timeline } from "@/components/Timeline";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, Scissors, Copy, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const steps = [
  { id: 1, label: "Upload", description: "Choose video source" },
  { id: 2, label: "Configure", description: "Set preferences" },
  { id: 3, label: "Analyze", description: "AI processing" },
  { id: 4, label: "Edit", description: "Customize clips" },
  { id: 5, label: "Caption", description: "Add captions" },
  { id: 6, label: "Merge", description: "Combine clips" },
  { id: 7, label: "Export", description: "Download results" },
];

export default function EditorPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedClip, setSelectedClip] = useState("0");
  const [currentTime, setCurrentTime] = useState(15);
  const [clips, setClips] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState<"16/9" | "9/16" | "1/1">("16/9");

  useEffect(() => {
    const fetchClips = async () => {
      const sid = sessionStorage.getItem("sessionId");
      if (!sid) {
        setLocation("/upload");
        return;
      }
      
      setSessionId(sid);
      
      // Get aspect ratio from config
      const config = JSON.parse(sessionStorage.getItem("videoConfig") || "{}");
      if (config.aspectRatio === "9:16") {
        setVideoAspectRatio("9/16");
      } else if (config.aspectRatio === "1:1") {
        setVideoAspectRatio("1/1");
      } else if (config.aspectRatio === "16:9") {
      }
      
      try {
        const response = await fetch(`/api/status/${sid}`);
        if (response.ok) {
          const data = await response.json();
          if (data.clips && data.clips.length > 0) {
            const mappedClips = data.clips.map((clip: any, index: number) => {
              const start = parseFloat(clip.start_time.split(':')[0]) * 60 + parseFloat(clip.start_time.split(':')[1] || 0);
              const end = parseFloat(clip.end_time.split(':')[0]) * 60 + parseFloat(clip.end_time.split(':')[1] || 0);
              return {
                id: index.toString(),
                thumbnail: "",
                start,
                end,
                duration: Math.round(end - start),
                filename: clip.filename,
                start_time: clip.start_time,
                end_time: clip.end_time,
                description: clip.description
              };
            });
            setClips(mappedClips);
            
            // Save initial clips to sessionStorage for Caption page
            sessionStorage.setItem('editedClips', JSON.stringify(mappedClips));
          }
        }
      } catch (error) {
        console.error("Error fetching clips:", error);
      }
    };
    
    fetchClips();
  }, [setLocation]);

  const selectedOriginalClip = clips.find((c: any) => c.id === selectedClip);
  const selectedClipData = selectedOriginalClip;

  const handleSplitClip = async () => {
    if (!selectedOriginalClip || !sessionId) return;
    
    // Find the actual index of the selected clip in the array
    const clipIndex = clips.findIndex((c: any) => c.id === selectedClip);
    if (clipIndex === -1) return;
    
    // Calculate cumulative time before this clip
    let cumulativeTime = 0;
    for (let i = 0; i < clipIndex; i++) {
      cumulativeTime += clips[i].duration;
    }
    
    // Calculate time within the selected clip
    const timeInClip = currentTime - cumulativeTime;
    
    // Validate split point is within clip bounds
    if (timeInClip <= 0.5 || timeInClip >= selectedOriginalClip.duration - 0.5) {
      toast({
        title: "Invalid Split Point",
        description: "Please position the playhead within the clip, not at the edges",
        variant: "destructive"
      });
      return;
    }
    
    const splitTime = selectedOriginalClip.start + timeInClip;
    
    try {
      // Call backend to actually split the video file
      const response = await fetch(`/api/split-clip/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filename: selectedOriginalClip.filename,
          split_time: splitTime,
          clip_start: selectedOriginalClip.start,
          clip_end: selectedOriginalClip.end
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to split clip on backend');
      }
      
      const data = await response.json();
      
      // Create two new clips from the split with data from backend
      const firstPart = {
        ...selectedOriginalClip,
        id: `${Date.now()}_${clipIndex}_1`,
        filename: data.parts[0].filename,
        duration: Math.round(data.parts[0].duration),
        start: data.parts[0].start,  // Now 0 for the new file
        end: data.parts[0].end,  // Now equals duration
        start_time: formatTime(data.parts[0].original_start || 0),
        end_time: formatTime(data.parts[0].original_end || data.parts[0].end)
      };
      
      const secondPart = {
        ...selectedOriginalClip,
        id: `${Date.now()}_${clipIndex}_2`,
        filename: data.parts[1].filename,
        duration: Math.round(data.parts[1].duration),
        start: data.parts[1].start,  // Now 0 for the new file
        end: data.parts[1].end,  // Now equals duration
        start_time: formatTime(data.parts[1].original_start || 0),
        end_time: formatTime(data.parts[1].original_end || data.parts[1].end)
      };
      
      // Update clips array
      const newClips = [...clips];
      newClips.splice(clipIndex, 1, firstPart, secondPart);
      setClips(newClips);
      
      // Save updated clips to sessionStorage for Caption page
      sessionStorage.setItem('editedClips', JSON.stringify(newClips));
      
      // Select the first part of the split clip
      setSelectedClip(firstPart.id);
      
      toast({
        title: "Clip Split Successfully",
        description: `Split into ${firstPart.duration}s and ${secondPart.duration}s clips`,
      });
    } catch (error) {
      console.error('Split error:', error);
      toast({
        title: "Error",
        description: "Failed to split clip. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDuplicateClip = () => {
    if (selectedOriginalClip) {
      const newClip = { ...selectedOriginalClip, id: `${clips.length}` };
      setClips([...clips, newClip]);
      toast({
        title: "Clip Duplicated",
        description: "Clip has been duplicated successfully",
      });
    }
  };

  const handleDeleteClip = async () => {
    if (!selectedOriginalClip || !sessionId) return;
    
    if (clips.length > 1) {
      try {
        // Call backend to delete the actual video file
        const response = await fetch(`/api/delete-clip/${sessionId}/${selectedOriginalClip.filename}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error('Failed to delete clip on backend');
        }
        
        // Remove from frontend state
        const remainingClips = clips.filter((c) => c.id !== selectedClip);
        setClips(remainingClips);
        setSelectedClip(remainingClips[0]?.id || "0");
        
        // Save updated clips to sessionStorage for Caption page
        sessionStorage.setItem('editedClips', JSON.stringify(remainingClips));
        
        toast({
          title: "Clip Deleted Successfully",
          description: "Clip has been removed from disk",
        });
      } catch (error) {
        console.error('Delete error:', error);
        toast({
          title: "Error",
          description: "Failed to delete clip. Please try again.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Cannot Delete",
        description: "You must have at least one clip",
        variant: "destructive"
      });
    }
  };

  return (
    <div className="min-h-screen pb-8">
      <ProgressStepper currentStep={4} steps={steps} />

      <div className="max-w-7xl mx-auto px-4 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Video Editor</h1>
          <p className="text-muted-foreground">
            Trim, split, and arrange your clips
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Card className="p-4 flex justify-center">
              <div className="w-full" style={{ maxWidth: '280px' }}>
                <VideoPlayer 
                  aspectRatio={videoAspectRatio}
                  videoUrl={selectedOriginalClip && sessionId ? `/api/stream/${sessionId}/${selectedOriginalClip.filename}` : undefined}
                  currentTime={currentTime}
                  onTimeUpdate={setCurrentTime}
                  clipStart={selectedOriginalClip?.start || 0}
                  clipEnd={selectedOriginalClip?.end}
                />
              </div>
            </Card>

            {clips.length > 0 && (
              <Timeline
                clips={clips}
                currentTime={currentTime}
                onClipSelect={setSelectedClip}
                selectedClipId={selectedClip}
                onTimeChange={setCurrentTime}
                onSplitClip={handleSplitClip}
                onDeleteClip={handleDeleteClip}
              />
            )}
          </div>

          <div className="lg:col-span-1 space-y-4">
            <Card className="p-4">
              <h3 className="font-semibold mb-4">Tools</h3>
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  data-testid="button-split-clip"
                  onClick={handleSplitClip}
                >
                  <Scissors className="h-4 w-4" />
                  Split Clip
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  data-testid="button-duplicate-clip"
                  onClick={handleDuplicateClip}
                >
                  <Copy className="h-4 w-4" />
                  Duplicate
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2"
                  data-testid="button-delete-clip"
                  onClick={handleDeleteClip}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="font-semibold mb-4">Clip Properties</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Duration:</span>
                  <span className="font-mono">{selectedClipData?.duration || 0}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Start:</span>
                  <span className="font-mono">{selectedOriginalClip?.start_time || "0:00"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End:</span>
                  <span className="font-mono">{selectedOriginalClip?.end_time || "0:30"}</span>
                </div>
              </div>
            </Card>

            <div className="space-y-3">
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2"
                onClick={() => setLocation("/analysis")}
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Analysis
              </Button>

              <Button
                size="lg"
                className="w-full gap-2"
                onClick={() => {
                  // Store selected clip for caption page
                  if (selectedOriginalClip) {
                    sessionStorage.setItem("selectedClipIndex", selectedClip);
                  }
                  setLocation("/captions");
                }}
                data-testid="button-add-captions"
              >
                Add Captions <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
