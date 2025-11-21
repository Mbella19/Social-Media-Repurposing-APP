import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, Youtube, FileVideo } from "lucide-react";

export default function UploadPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [videoUrl, setVideoUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<"youtube" | "file">("youtube");

  const handleUrlSubmit = () => {
    if (!videoUrl) return;

    // Basic YouTube URL validation
    if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      sessionStorage.setItem("videoUrl", videoUrl);
      sessionStorage.setItem("videoType", "youtube");
      setLocation("/configure");
    } else {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL",
        variant: "destructive"
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In a real app, we'd upload this. For now, we'll simulate it.
      // We'd need a backend endpoint to handle the file upload and return a URL/ID.
      toast({
        title: "File Selected",
        description: "File upload simulation started.",
      });
      // For demo purposes, we might just store the name or a fake URL
      sessionStorage.setItem("videoUrl", URL.createObjectURL(file));
      sessionStorage.setItem("videoType", "file");
      setLocation("/configure");
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 animate-fade-in">
      <div className="w-full max-w-4xl space-y-12">

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-900">
          <button
            onClick={() => setActiveTab("youtube")}
            className={`px-8 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === "youtube" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-zinc-600 hover:text-white"
              }`}
          >
            YouTube URL
          </button>
          <button
            onClick={() => setActiveTab("file")}
            className={`px-8 py-4 text-xs font-bold uppercase tracking-widest transition-colors ${activeTab === "file" ? "text-cyan-400 border-b-2 border-cyan-400" : "text-zinc-600 hover:text-white"
              }`}
          >
            Upload File
          </button>
        </div>

        {/* Main Input Area */}
        <main className="space-y-8">
          {activeTab === "youtube" ? (
            <div className="relative group">
              <textarea
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="PASTE YOUTUBE URL..."
                className="w-full h-64 bg-transparent text-4xl md:text-6xl font-black outline-none border-none resize-none placeholder-zinc-800 text-white transition-all caret-cyan-400"
                spellCheck={false}
              />
              {/* Helper Text */}
              <div className="absolute bottom-4 right-0 text-zinc-700 font-mono text-xs uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                Press Enter to Process
              </div>
            </div>
          ) : (
            <div
              className={`
                relative h-64 border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center gap-4 group cursor-pointer
                ${isDragging ? "border-cyan-400 bg-cyan-400/5" : "border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/30"}
              `}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                // Handle drop
              }}
            >
              <input
                type="file"
                accept="video/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
              />
              <Upload className={`h-12 w-12 transition-colors ${isDragging ? "text-cyan-400" : "text-zinc-700 group-hover:text-white"}`} />
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 group-hover:text-zinc-300">
                Drop Video File or Click to Browse
              </p>
            </div>
          )}

          {/* Controls */}
          <div className="flex justify-end">
            {activeTab === "youtube" && (
              <Button
                onClick={handleUrlSubmit}
                disabled={!videoUrl.trim()}
                size="lg"
                className={`
                  h-16 px-12 rounded-none text-lg font-black uppercase tracking-widest transition-all duration-300
                  ${!videoUrl.trim()
                    ? 'bg-zinc-900 text-zinc-700 hover:bg-zinc-900'
                    : 'bg-white text-black hover:bg-cyan-400 hover:scale-105'}
                `}
              >
                Next Step
              </Button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
