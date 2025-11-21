import { useEffect, useState } from "react";
import { Download, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressStepper } from "@/components/ProgressStepper";
import { useLocation } from "wouter";

const steps = [
  { id: 1, label: "Upload", description: "Choose video source" },
  { id: 2, label: "Configure", description: "Set preferences" },
  { id: 3, label: "Analyze", description: "AI processing" },
  { id: 4, label: "Edit & Captions", description: "Trim and style" },
  { id: 5, label: "Merge", description: "Combine clips" },
  { id: 6, label: "Export", description: "Download results" },
];

export default function ResultsPage() {
  const [, setLocation] = useLocation();
  const [sessionId, setSessionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [mergedVideo, setMergedVideo] = useState<any>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");
  
  useEffect(() => {
    const loadMergedVideo = () => {
      // Get session ID from sessionStorage
      const sid = sessionStorage.getItem("sessionId");
      if (!sid) {
        setLocation("/upload");
        return;
      }
      
      setSessionId(sid);
      
      // Check if we have a merged video
      const mergedVideoJson = sessionStorage.getItem("mergedVideo");
      if (mergedVideoJson) {
        const merged = JSON.parse(mergedVideoJson);
        setMergedVideo(merged);
        setVideoUrl(`/api/stream/${sid}/${merged.filename}`);
      } else {
        // No merged video, redirect back to merge
        setLocation("/merge");
        return;
      }
      
      setLoading(false);
    };
    
    loadMergedVideo();
  }, [setLocation]);

  const handleDownload = () => {
    if (sessionId && mergedVideo) {
      window.open(`/api/download/${sessionId}/${mergedVideo.filename}`, "_blank");
    }
  };

  const handleShare = () => {
    console.log("Sharing merged video");
  };

  if (loading) {
    return (
      <div className="min-h-screen pb-8">
        <ProgressStepper currentStep={6} steps={steps} />
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading your video...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-8">
      <ProgressStepper currentStep={6} steps={steps} />

      <div className="max-w-5xl mx-auto px-4 space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Your Clips are Ready!</h1>
          <p className="text-muted-foreground">
            Download individual clips or all at once
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-3 flex-wrap">
          <Button variant="outline" onClick={handleShare}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>

        {/* Video Player - Centered, natural aspect ratio */}
        <div className="flex justify-center">
          {videoUrl ? (
            <video
              controls
              className="w-full max-w-2xl h-auto rounded-lg bg-black"
              src={videoUrl}
              data-testid="merged-video-player"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full max-w-2xl h-[50vh] bg-muted rounded-lg flex items-center justify-center">
              <p className="text-muted-foreground">No video loaded</p>
            </div>
          )}
        </div>

        {/* Video Info */}
        {mergedVideo?.isMerged && (
          <div className="text-center text-sm text-muted-foreground">
            Merged {mergedVideo.clipCount} clips with {mergedVideo.transition} transition
          </div>
        )}
      </div>
    </div>
  );
}
