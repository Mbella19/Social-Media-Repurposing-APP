import { useState } from "react";
import { useLocation } from "wouter";
import { AspectRatioSelector } from "@/components/AspectRatioSelector";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ConfigPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [resolution, setResolution] = useState("1080p");
  const [clipCount, setClipCount] = useState("3");
  const [duration, setDuration] = useState("30");
  const [smartCrop, setSmartCrop] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStartProcessing = async () => {
    setIsProcessing(true);

    try {
      const videoType = sessionStorage.getItem("videoType");
      const videoUrl = sessionStorage.getItem("videoUrl");

      const config = {
        videoUrl,
        videoType,
        aspectRatio,
        resolution,
        clipCount: clipCount === "auto" ? "auto" : parseInt(clipCount),
        duration: duration === "auto" ? "auto" : parseInt(duration),
        smartCrop,
        customPrompt: customPrompt.trim() || undefined
      };

      sessionStorage.setItem("videoConfig", JSON.stringify(config));
      setLocation("/processing");

    } catch (error) {
      console.error("Error starting processing:", error);
      toast({
        title: "Error",
        description: "Failed to start processing. Please try again.",
        variant: "destructive"
      });
      setIsProcessing(false);
    }
  };

  return (
    <div className="container max-w-5xl mx-auto py-16 px-6 animate-fade-in">
      <div className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-4">
          CONFIGURE<span className="text-cyan-400">.</span>
        </h1>
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">
          Define output parameters
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-12">
          {/* Aspect Ratio Section */}
          <div className="space-y-6">
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Aspect Ratio</Label>
            <AspectRatioSelector selected={aspectRatio} onSelect={setAspectRatio} />
          </div>

          {/* Settings Grid */}
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Resolution</Label>
              <Select value={resolution} onValueChange={setResolution}>
                <SelectTrigger className="h-12 rounded-none bg-zinc-900 border-zinc-800 text-white focus:ring-cyan-400/50">
                  <SelectValue placeholder="Select resolution" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-zinc-800 bg-zinc-950 text-white">
                  <SelectItem value="4K">4K (Ultra HD)</SelectItem>
                  <SelectItem value="1080p">1080p (Full HD)</SelectItem>
                  <SelectItem value="720p">720p (HD)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4">
              <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Clip Count</Label>
              <Select value={clipCount} onValueChange={setClipCount}>
                <SelectTrigger className="h-12 rounded-none bg-zinc-900 border-zinc-800 text-white focus:ring-cyan-400/50">
                  <SelectValue placeholder="How many clips?" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-zinc-800 bg-zinc-950 text-white">
                  <SelectItem value="auto">Auto (AI decides)</SelectItem>
                  <SelectItem value="1">1 clip</SelectItem>
                  <SelectItem value="3">3 clips</SelectItem>
                  <SelectItem value="5">5 clips</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* AI Prompt */}
          <div className="space-y-4">
            <Label className="text-xs font-bold uppercase tracking-widest text-zinc-500">AI Instructions (Optional)</Label>
            <Textarea
              placeholder="FOCUS ON FUNNY MOMENTS..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="min-h-[150px] rounded-none bg-zinc-900 border-zinc-800 text-lg font-bold text-white resize-none placeholder-zinc-700 focus:border-cyan-400 focus:ring-0"
            />
          </div>
        </div>

        {/* Summary Panel */}
        <div className="space-y-8">
          <div className="border border-zinc-800 bg-zinc-900/30 p-8">
            <h3 className="text-xl font-black uppercase tracking-tight text-white mb-8">Summary</h3>
            <dl className="space-y-6 text-sm">
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-500 font-bold uppercase tracking-wider">Aspect</span>
                <span className="font-mono text-white">{aspectRatio}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-500 font-bold uppercase tracking-wider">Resolution</span>
                <span className="font-mono text-white">{resolution}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800 pb-2">
                <span className="text-zinc-500 font-bold uppercase tracking-wider">Clips</span>
                <span className="font-mono text-white">{clipCount === "auto" ? "AI" : clipCount}</span>
              </div>
            </dl>

            <div className="mt-12 space-y-4">
              <Button
                size="lg"
                onClick={handleStartProcessing}
                disabled={isProcessing}
                className="w-full h-14 rounded-none bg-white text-black text-lg font-black uppercase tracking-widest hover:bg-cyan-400 hover:scale-105 transition-all"
              >
                {isProcessing ? "Starting..." : "Process"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setLocation("/upload")}
                className="w-full rounded-none text-zinc-500 hover:text-white hover:bg-transparent"
              >
                Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
