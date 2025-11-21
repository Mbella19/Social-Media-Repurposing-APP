import { useState } from "react";
import { Download, Play, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";

interface VideoClipCardProps {
  filename: string;
  description: string;
  videoUrl: string;
  startTime?: string;
  endTime?: string;
  letterbox?: boolean;
  onDownload: () => void;
  onToggleLetterbox?: (filename: string, useLetterbox: boolean) => Promise<void>;
  sessionId?: string;
}

export function VideoClipCard({ 
  filename, 
  description, 
  videoUrl, 
  startTime, 
  endTime, 
  letterbox, 
  onDownload,
  onToggleLetterbox,
  sessionId 
}: VideoClipCardProps) {
  const [isTogglingLetterbox, setIsTogglingLetterbox] = useState(false);
  const [currentLetterbox, setCurrentLetterbox] = useState(letterbox);
  const [localVideoUrl, setLocalVideoUrl] = useState(videoUrl);
  const [videoKey, setVideoKey] = useState(0);

  const handleToggleLetterbox = async () => {
    if (!onToggleLetterbox || !sessionId) return;
    
    setIsTogglingLetterbox(true);
    try {
      await onToggleLetterbox(filename, !currentLetterbox);
      setCurrentLetterbox(!currentLetterbox);
      // Force video reload with new timestamp and key
      const timestamp = new Date().getTime();
      const baseUrl = videoUrl.split('?')[0];
      setLocalVideoUrl(`${baseUrl}?v=${timestamp}`);
      setVideoKey(prev => prev + 1);
    } catch (error) {
      console.error('Failed to toggle letterbox:', error);
      alert('Failed to toggle letterbox. Please try again.');
    } finally {
      setIsTogglingLetterbox(false);
    }
  };

  return (
    <Card className="overflow-hidden hover-elevate transition-all duration-200">
      <CardContent className="p-0">
        <div className="relative aspect-[9/16] bg-card group">
          <video
            src={localVideoUrl}
            controls
            className="w-full h-full object-cover"
            data-testid={`video-${filename}`}
            key={videoKey}
          >
            <source src={localVideoUrl} type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <Play className="h-12 w-12 text-white" />
          </div>
          {currentLetterbox && (
            <div className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              Letterbox
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex flex-col items-start gap-3 p-4">
        <div className="flex-1 min-w-0 w-full">
          <p className="text-sm font-medium truncate">{filename}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{description}</p>
          {startTime && endTime && (
            <p className="text-xs text-muted-foreground mt-1">
              {startTime} - {endTime}
            </p>
          )}
        </div>
        <div className="flex gap-2 w-full">
          <Button
            onClick={onDownload}
            className="flex-1"
            data-testid={`button-download-${filename}`}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          {onToggleLetterbox && (
            <Button
              onClick={handleToggleLetterbox}
              disabled={isTogglingLetterbox}
              variant="outline"
              className="flex items-center gap-2"
            >
              {isTogglingLetterbox ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">Processing...</span>
                </>
              ) : currentLetterbox ? (
                <>
                  <Minimize2 className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Standard Crop</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-4 w-4" />
                  <span className="text-xs hidden sm:inline">Landscape</span>
                </>
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
