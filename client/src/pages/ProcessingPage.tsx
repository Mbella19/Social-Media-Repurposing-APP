import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Progress } from "@/components/ui/progress";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ProcessingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    const startProcessing = async () => {
      try {
        const configStr = sessionStorage.getItem("videoConfig");
        if (!configStr) {
          setLocation("/configure");
          return;
        }

        const config = JSON.parse(configStr);
        const formData = new FormData();

        // Map config to backend expected fields
        formData.append("youtube_url", config.videoUrl);
        formData.append("clip_duration", config.duration.toString());
        formData.append("num_clips", config.clipCount.toString());
        formData.append("aspect_ratio", config.aspectRatio);
        formData.append("resolution", config.resolution);
        formData.append("smart_crop", config.smartCrop.toString());

        if (config.customPrompt) {
          formData.append("custom_prompt", config.customPrompt);
        }

        setStatus("Sending request...");
        setProgress(10);

        const response = await fetch("/api/process", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to start processing");
        }

        const data = await response.json();

        if (data.session_id) {
          sessionStorage.setItem("sessionId", data.session_id);
          setProgress(100);
          setStatus("Job started!");
          // Small delay to show 100% before redirect
          setTimeout(() => setLocation("/analysis"), 500);
        } else {
          throw new Error("No session ID received");
        }

      } catch (error: any) {
        console.error("Processing error:", error);
        toast({
          title: "Processing Failed",
          description: error.message,
          variant: "destructive"
        });
        setTimeout(() => setLocation("/configure"), 2000);
      }
    };

    startProcessing();
  }, [setLocation, toast]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className="w-full max-w-2xl space-y-12 text-center">
        <div className="space-y-6">
          <Loader2 className="h-16 w-16 animate-spin text-cyan-400 mx-auto" />
          <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white">
            PROCESSING<span className="text-cyan-400">.</span>
          </h1>
          <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">
            {status}
          </p>
        </div>

        <div className="space-y-2">
          <Progress value={progress} className="h-1 bg-zinc-900" />
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-zinc-500">
            <span>Status</span>
            <span className="text-white">{Math.round(progress)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
