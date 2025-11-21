import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SourceSelector, SourceType } from "@/components/SourceSelector";
import { YouTubeInput } from "@/components/YouTubeInput";
import { CloudUrlInput } from "@/components/CloudUrlInput";
import { SettingsPanel } from "@/components/SettingsPanel";
import { CustomPromptInput } from "@/components/CustomPromptInput";
import { useLocation } from "wouter";

export default function CreatePage() {
  const [, setLocation] = useLocation();
  const [sourceType, setSourceType] = useState<SourceType>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [googleDriveUrl, setGoogleDriveUrl] = useState("");
  const [dropboxUrl, setDropboxUrl] = useState("");
  const [clipDuration, setClipDuration] = useState<number | string>("auto");
  const [numClips, setNumClips] = useState<number | string>(3);
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [customPrompt, setCustomPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleGenerate = async () => {
    const formData = new FormData();
    
    if (sourceType === "youtube") {
      formData.append("youtube_url", youtubeUrl);
    } else if (sourceType === "cloud") {
      if (googleDriveUrl) {
        formData.append("google_drive_url", googleDriveUrl);
      } else if (dropboxUrl) {
        formData.append("dropbox_url", dropboxUrl);
      }
    }
    
    formData.append("clip_duration", clipDuration.toString());
    formData.append("num_clips", numClips.toString());
    formData.append("aspect_ratio", aspectRatio);
    formData.append("resolution", resolution);
    if (customPrompt) {
      formData.append("custom_prompt", customPrompt);
    }
    
    setIsProcessing(true);
    
    try {
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData,
      });
      
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("processingData", JSON.stringify(data));
        setLocation("/processing");
      } else {
        console.error("Failed to process video");
        setIsProcessing(false);
      }
    } catch (error) {
      console.error("Error processing video:", error);
      setIsProcessing(false);
    }
  };

  const isValid = sourceType === "youtube" 
    ? youtubeUrl.trim() !== "" 
    : (googleDriveUrl.trim() !== "" || dropboxUrl.trim() !== "");

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">Create Clips</h1>
        <p className="text-muted-foreground">
          Paste a video URL from YouTube, Google Drive, or Dropbox to get started
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Source</CardTitle>
              <CardDescription>Choose your video source</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <SourceSelector selected={sourceType} onSelect={setSourceType} />
              <Separator />
              {sourceType === "youtube" ? (
                <YouTubeInput value={youtubeUrl} onChange={setYoutubeUrl} />
              ) : (
                <CloudUrlInput 
                  googleDriveUrl={googleDriveUrl}
                  dropboxUrl={dropboxUrl}
                  onGoogleDriveChange={setGoogleDriveUrl}
                  onDropboxChange={setDropboxUrl}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI Instructions</CardTitle>
              <CardDescription>Customize what the AI should look for (optional)</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomPromptInput value={customPrompt} onChange={setCustomPrompt} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardDescription>Configure your clips</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsPanel
                clipDuration={clipDuration}
                numClips={numClips}
                aspectRatio={aspectRatio}
                resolution={resolution}
                onClipDurationChange={(value) => setClipDuration(value)}
                onNumClipsChange={(value) => setNumClips(value)}
                onAspectRatioChange={(value) => setAspectRatio(value)}
                onResolutionChange={(value) => setResolution(value)}
              />
            </CardContent>
          </Card>

          <Button
            onClick={handleGenerate}
            disabled={!isValid || isProcessing}
            className="w-full"
            size="lg"
          >
            <Play className="mr-2 h-5 w-5" />
            {isProcessing ? "Processing..." : "Generate Clips"}
          </Button>
        </div>
      </div>
    </div>
  );
}
