import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ProgressStepper } from "@/components/ProgressStepper";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, ArrowLeft, GripVertical, Download, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const steps = [
  { id: 1, label: "Upload", description: "Choose video source" },
  { id: 2, label: "Configure", description: "Set preferences" },
  { id: 3, label: "Analyze", description: "AI processing" },
  { id: 4, label: "Edit & Captions", description: "Trim and style" },
  { id: 5, label: "Merge", description: "Combine clips" },
  { id: 6, label: "Export", description: "Download results" },
];

export default function MergePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [transition, setTransition] = useState("fade");
  const [clips, setClips] = useState<any[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    const fetchClips = async () => {
      const sid = sessionStorage.getItem("sessionId");
      if (!sid) {
        setLocation("/upload");
        return;
      }
      
      setSessionId(sid);
      
      try {
        let clipsData: any[] = [];
        
        // First, try to get edited clips from sessionStorage (after split/delete in Editor)
        const editedClipsJson = sessionStorage.getItem('editedClips');
        if (editedClipsJson) {
          clipsData = JSON.parse(editedClipsJson);
          console.log('Loaded edited clips from sessionStorage for Merge:', clipsData);
        } else {
          // Fallback to fetching original clips from backend
          const response = await fetch(`/api/status/${sid}`);
          if (response.ok) {
            const data = await response.json();
            clipsData = data.clips || [];
            console.log('Loaded original clips from backend for Merge:', clipsData);
          }
        }
        
        if (clipsData.length > 0) {
          // For each clip, check if a captioned version exists
          const clipsWithCaptions = await Promise.all(
            clipsData.map(async (clip: any, index: number) => {
              const duration = clip.duration || 30;
              let filename = clip.filename;
              let hasCaptions = false;
              
              // Check if captions exist for this clip
              try {
                const captionsResponse = await fetch(`/api/captions/${sid}/${clip.filename}`);
                if (captionsResponse.ok) {
                  const captionsData = await captionsResponse.json();
                  if (captionsData.captions && captionsData.captions.length > 0) {
                    hasCaptions = true;
                    console.log(`Clip ${clip.filename} has captions`);
                  }
                }
              } catch (error) {
                // No captions for this clip
              }
              
              // Keep the original filename - don't assume captioned version exists
              // The captioned version will be created when merging if needed
              const finalFilename = clip.filename;
              
              return {
                id: (index + 1).toString(),
                title: `Clip ${index + 1}${hasCaptions ? ' 🎬' : ''}`,
                duration,
                filename: finalFilename,
                hasCaptions,
                originalFilename: clip.filename
              };
            })
          );
          
          setClips(clipsWithCaptions);
        }
      } catch (error) {
        console.error("Error fetching clips:", error);
      }
    };
    
    fetchClips();
  }, [setLocation]);

  const totalDuration = clips.reduce((sum, clip) => sum + clip.duration, 0);

  return (
    <div className="min-h-screen pb-8">
      <ProgressStepper currentStep={5} steps={steps} />

      <div className="max-w-5xl mx-auto px-4 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Merge Clips</h1>
          <p className="text-muted-foreground">
            Arrange clips and add transitions
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {clips.length > 0 ? (
              clips.map((clip, index) => (
                <div key={clip.id} className="space-y-2">
                  <Card
                    className="p-4 hover-elevate cursor-move"
                    data-testid={`clip-${clip.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <GripVertical className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{clip.title}</p>
                        <p className="text-sm text-muted-foreground">
                          Duration: {clip.duration}s
                        </p>
                      </div>
                    </div>
                  </Card>

                  {index < clips.length - 1 && (
                    <div className="flex items-center justify-center">
                      <div className="w-px h-8 bg-border" />
                      <div className="absolute px-3 py-1 bg-background border rounded-full text-xs text-muted-foreground">
                        {transition}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">No clips available</p>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="p-6 sticky top-24 space-y-6">
              <div className="space-y-2">
                <Label>Transition Effect</Label>
                <Select value={transition} onValueChange={setTransition}>
                  <SelectTrigger data-testid="select-transition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cut">Cut</SelectItem>
                    <SelectItem value="fade">Fade</SelectItem>
                    <SelectItem value="slide">Slide</SelectItem>
                    <SelectItem value="wipe">Wipe</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-4 border-t space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Duration:</span>
                  <span className="font-mono">
                    {Math.floor(totalDuration / 60)}:{(totalDuration % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Clips:</span>
                  <span>{clips.length}</span>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setLocation("/studio")}
                >
                  <ArrowLeft className="h-5 w-5" />
                  Back to Studio
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={async () => {
                    if (!sessionId || clips.length === 0) return;
                    
                    // Download edited clips (captioned, split, etc.) as ZIP
                    try {
                      toast({
                        title: "Preparing Download",
                        description: `Generating captioned videos and creating ZIP...`,
                      });
                      
                      // For each clip, check backend captions fresh and generate captioned versions if present
                      const filesToDownload: string[] = [];
                      for (const clip of clips) {
                        try {
                          let hasCaptionsFresh = false;
                          let capData: any = null;
                          try {
                            const capResp = await fetch(`/api/captions/${sessionId}/${clip.filename}`);
                            if (capResp.ok) {
                              capData = await capResp.json();
                              hasCaptionsFresh = Array.isArray(capData.captions) && capData.captions.length > 0;
                            }
                          } catch {}

                          if (hasCaptionsFresh) {
                            // Load caption styles saved per-clip
                            const styleKey = `captionStyle_${sessionId}_${clip.filename}`;
                            const savedStyle = sessionStorage.getItem(styleKey);
                            const styleOptions = savedStyle ? JSON.parse(savedStyle) : {};

                            const genResp = await fetch(`/api/generate-captioned-version/${sessionId}/${clip.filename}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ styleOptions, captions: capData?.captions || [] })
                            });
                            if (genResp.ok) {
                              const genData = await genResp.json();
                              filesToDownload.push(genData.filename);
                            } else {
                              filesToDownload.push(clip.filename);
                            }
                          } else {
                            filesToDownload.push(clip.filename);
                          }
                        } catch (error) {
                          console.error(`Error preparing ${clip.filename} for download:`, error);
                          filesToDownload.push(clip.filename);
                        }
                      }
                      
                      // Download the files as ZIP
                      const response = await fetch(`/api/download-edited-clips/${sessionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ filenames: filesToDownload })
                      });
                      
                      if (response.ok) {
                        const blob = await response.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `clips_${sessionId}.zip`;
                        document.body.appendChild(a);
                        a.click();
                        window.URL.revokeObjectURL(url);
                        document.body.removeChild(a);
                        
                        toast({
                          title: "Download Started",
                          description: `Downloading ${clips.length} clips as ZIP`,
                        });
                      } else {
                        throw new Error('Download failed');
                      }
                    } catch (error) {
                      console.error("Download error:", error);
                      toast({
                        title: "Error",
                        description: "Failed to download clips",
                        variant: "destructive"
                      });
                    }
                  }}
                  data-testid="button-download-individual"
                >
                  <Download className="h-5 w-5" />
                  Download Individual Clips
                </Button>

                <Button
                  size="lg"
                  className="w-full gap-2"
                  onClick={async () => {
                    if (!sessionId || clips.length === 0) return;
                    
                    if (clips.length === 1) {
                      // If only one clip, still ensure captioned version is generated if needed
                      let finalFilename = clips[0].filename;
                      try {
                        // Check captions fresh
                        let hasCaptionsFresh = false;
                        let capData: any = null;
                        try {
                          const capResp = await fetch(`/api/captions/${sessionId}/${clips[0].filename}`);
                          if (capResp.ok) {
                            capData = await capResp.json();
                            hasCaptionsFresh = Array.isArray(capData.captions) && capData.captions.length > 0;
                          }
                        } catch {}

                        if (hasCaptionsFresh) {
                          const styleKey = `captionStyle_${sessionId}_${clips[0].filename}`;
                          const savedStyle = sessionStorage.getItem(styleKey);
                          const styleOptions = savedStyle ? JSON.parse(savedStyle) : {};
                          const genResp = await fetch(`/api/generate-captioned-version/${sessionId}/${clips[0].filename}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ styleOptions, captions: capData?.captions || [] })
                          });
                          if (genResp.ok) {
                            const genData = await genResp.json();
                            finalFilename = genData.filename;
                          }
                        }
                      } catch (e) {
                        console.error('Error generating single captioned clip:', e);
                      }
                      // Navigate to results with the (possibly captioned) single clip
                      sessionStorage.setItem('mergedVideo', JSON.stringify({
                        filename: finalFilename,
                        isMerged: false,
                      }));
                      setLocation("/results");
                      return;
                    }
                    
                    setMerging(true);
                    
                    try {
                      toast({
                        title: "Preparing Merge",
                        description: `Generating captioned videos...`,
                      });
                      
                      // First, generate captioned versions for all clips that currently have captions (fresh check)
                      const filesToMerge: string[] = [];
                      for (let i = 0; i < clips.length; i++) {
                        const clip = clips[i];
                        try {
                          let hasCaptionsFresh = false;
                          let capData: any = null;
                          try {
                            const capResp = await fetch(`/api/captions/${sessionId}/${clip.filename}`);
                            if (capResp.ok) {
                              capData = await capResp.json();
                              hasCaptionsFresh = Array.isArray(capData.captions) && capData.captions.length > 0;
                            }
                          } catch {}

                          if (hasCaptionsFresh) {
                            const styleKey = `captionStyle_${sessionId}_${clip.filename}`;
                            const savedStyle = sessionStorage.getItem(styleKey);
                            const styleOptions = savedStyle ? JSON.parse(savedStyle) : {};

                            console.log(`🎨 Clip ${i + 1} (${clip.filename}):`);
                            console.log(`   Style key: ${styleKey}`);
                            console.log(`   Styles found:`, savedStyle ? 'YES' : 'NO');
                            if (savedStyle) {
                              console.log(`   Styles:`, styleOptions);
                            }

                            toast({
                              title: `Generating Clip ${i + 1}`,
                              description: `Burning captions with your custom styles...`,
                            });

                            const response = await fetch(`/api/generate-captioned-version/${sessionId}/${clip.filename}`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ styleOptions, captions: capData?.captions || [] })
                            });

                            if (response.ok) {
                              const data = await response.json();
                              filesToMerge.push(data.filename);
                              console.log(`   ✅ Generated: ${data.filename}`);
                            } else {
                              console.warn(`   ❌ Failed, using original`);
                              filesToMerge.push(clip.filename);
                            }
                          } else {
                            console.log(`📹 Clip ${i + 1} (${clip.filename}): No captions`);
                            filesToMerge.push(clip.filename);
                          }
                        } catch (error) {
                          console.error(`❌ Error preparing ${clip.filename} for merge:`, error);
                          filesToMerge.push(clip.filename);
                        }
                      }
                      
                      toast({
                        title: "Merging Clips",
                        description: `Combining ${clips.length} clips with ${transition} transition...`,
                      });
                      
                      const response = await fetch(`/api/merge-clips/${sessionId}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          clips: filesToMerge.map(filename => ({
                            filename,
                            startTime: 0,
                            endTime: null
                          })),
                          transition
                        })
                      });
                      
                      if (response.ok) {
                        const data = await response.json();
                        
                        // Save merged video info to sessionStorage
                        sessionStorage.setItem('mergedVideo', JSON.stringify({
                          filename: data.filename,
                          isMerged: true,
                          clipCount: clips.length,
                          transition
                        }));
                        
                        toast({
                          title: "Merge Complete!",
                          description: "Your video has been merged successfully",
                        });
                        
                        // Navigate to results page
                        setLocation("/results");
                      } else {
                        throw new Error('Merge failed');
                      }
                    } catch (error) {
                      console.error("Merge error:", error);
                      toast({
                        title: "Error",
                        description: "Failed to merge clips. Please try again.",
                        variant: "destructive"
                      });
                    } finally {
                      setMerging(false);
                    }
                  }}
                  disabled={merging || clips.length === 0}
                  data-testid="button-merge"
                >
                  {merging ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Merging...
                    </>
                  ) : (
                    <>
                      Merge & Export <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
