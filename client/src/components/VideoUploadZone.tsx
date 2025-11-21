import { Cloud, Youtube, Upload, Shield, Sparkles } from "lucide-react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

interface VideoUploadZoneProps {
  onUrlSubmit?: (url: string, source: string) => void;
  onFileSelect?: (file: File) => void;
}

export function VideoUploadZone({ onUrlSubmit, onFileSelect }: VideoUploadZoneProps) {
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [cloudUrl, setCloudUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleYoutubeSubmit = () => {
    if (youtubeUrl.trim()) {
      onUrlSubmit?.(youtubeUrl, "youtube");
    }
  };

  const handleCloudSubmit = () => {
    if (cloudUrl.trim()) {
      onUrlSubmit?.(cloudUrl, "cloud");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileSelect?.(file);
    }
  };

  return (
    <Tabs defaultValue="youtube" className="w-full">
      <TabsList className="w-full gap-3">
        <TabsTrigger value="youtube" className="w-full" data-testid="tab-youtube">
          <Youtube className="mr-2 h-4 w-4" />
          YouTube
        </TabsTrigger>
        <TabsTrigger value="cloud" className="w-full" data-testid="tab-cloud">
          <Cloud className="mr-2 h-4 w-4" />
          Cloud
        </TabsTrigger>
        <TabsTrigger value="upload" className="w-full" data-testid="tab-upload">
          <Upload className="mr-2 h-4 w-4" />
          Upload
        </TabsTrigger>
      </TabsList>

      <TabsContent value="youtube" className="mt-8" data-testid="youtube-zone">
        <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-white/5 via-transparent to-white/10 p-8 backdrop-blur-xl">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-5">
              <Badge variant="glow" className="w-fit">
                Stream processing
              </Badge>
              <h3 className="text-2xl font-semibold text-white">Paste a YouTube URL and stream instantly</h3>
              <p className="text-sm text-muted-foreground">
                ClipCraft taps directly into the stream so you can start clipping without waiting for a full download.
              </p>
              <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium text-white">Smart detection</p>
                  <p>Identify highlight moments in under 90 seconds.</p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="font-medium text-white">Auto captions</p>
                  <p>Line-perfect captions ready for reels.</p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-background/60 p-6 shadow-inner backdrop-blur">
              <Label htmlFor="youtube-url" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                YouTube URL
              </Label>
              <Input
                id="youtube-url"
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                className="mt-3"
                data-testid="input-youtube-url"
              />
              <Button
                onClick={handleYoutubeSubmit}
                className="mt-4 w-full"
                disabled={!youtubeUrl.trim()}
                data-testid="button-submit-youtube"
              >
                Stream from YouTube
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="cloud" className="mt-8" data-testid="cloud-zone">
        <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-[#0b1c2c] via-background to-[#161823] p-8 backdrop-blur-xl">
          <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <div className="flex items-center gap-3 text-white/80">
                <Shield className="h-5 w-5 text-accent" />
                <span className="text-xs uppercase tracking-[0.4em] text-muted-foreground">
                  Secure ingest
                </span>
              </div>
              <h3 className="text-2xl font-semibold text-white">Link any cloud workspace</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                {[
                  "Google Drive public share links",
                  "Dropbox and OneDrive URLs",
                  "Direct MP4 / MOV files",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-accent" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-white/10 bg-background/50 p-6">
              <Label htmlFor="cloud-url" className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                Cloud storage url
              </Label>
              <Input
                id="cloud-url"
                type="url"
                placeholder="https://drive.google.com/..."
                value={cloudUrl}
                onChange={(e) => setCloudUrl(e.target.value)}
                className="mt-3"
                data-testid="input-cloud-url"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                We fetch only the chunks we need. Your file never leaves your bucket.
              </p>
              <Button
                onClick={handleCloudSubmit}
                className="mt-4 w-full"
                disabled={!cloudUrl.trim()}
                data-testid="button-submit-cloud"
              >
                Connect cloud source
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="upload" className="mt-8" data-testid="upload-zone">
        <div
          className={cn(
            "cursor-pointer rounded-[32px] border border-dashed border-white/15 bg-white/5 p-10 text-center shadow-inner transition-all hover:border-white/40",
            selectedFile && "border-white/40"
          )}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            onChange={handleFileChange}
            className="hidden"
            data-testid="input-file"
          />
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl border border-white/15 bg-white/10 text-white">
            <Upload className="h-8 w-8" />
          </div>
          <h3 className="mt-6 text-2xl font-semibold text-white">Drop your file</h3>
          <p className="text-sm text-muted-foreground">
            MP4, MOV or WebM • up to 500MB
          </p>
          {selectedFile ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-background/60 p-4 text-left">
              <p className="text-sm font-medium text-white">{selectedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-xs uppercase tracking-[0.4em] text-muted-foreground">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" /> AI grading
              </div>
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Drag & drop
              </div>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
