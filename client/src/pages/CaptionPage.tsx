import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ProgressStepper } from "@/components/ProgressStepper";
import { VideoPlayer } from "@/components/VideoPlayer";
import { CaptionEditorAdvanced } from "@/components/CaptionEditorAdvanced";
import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
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

export default function CaptionPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [captions, setCaptions] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(3);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [selectedClip, setSelectedClip] = useState<any>(null);
  const [allClips, setAllClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatingCaptions, setGeneratingCaptions] = useState(false);
  // Cache captions and styles for each clip to prevent losing edits when switching
  const [captionCache, setCaptionCache] = useState<Record<string, any[]>>({});
  const [styleCache, setStyleCache] = useState<Record<string, any>>({});
  const [captionStyle, setCaptionStyle] = useState({
    fontFamily: 'Inter, sans-serif',
    fontSize: 24,
    fontWeight: 'Bold',
    color: '#FFFFFF',
    backgroundColor: '#000000',
    backgroundOpacity: 80,
    textAlign: 'center',
    outlineColor: '#000000',
    outlineWidth: 0,
    letterSpacing: 0,
    lineHeight: 1.2,
    animation: 'none',
    positionX: 50,
    positionY: 85
  });

  useEffect(() => {
    const fetchClipAndCaptions = async () => {
      const sid = sessionStorage.getItem("sessionId");
      if (!sid) {
        setLocation("/upload");
        return;
      }
      setSessionId(sid);
      
      // Get clips - prioritize edited clips from Editor page
      try {
        let clips: any[] = [];
        
        // First, try to get edited clips from sessionStorage (after split/delete)
        const editedClipsJson = sessionStorage.getItem('editedClips');
        if (editedClipsJson) {
          clips = JSON.parse(editedClipsJson);
          console.log('Loaded edited clips from sessionStorage:', clips);
        } else {
          // Fallback to fetching original clips from backend
          const response = await fetch(`/api/status/${sid}`);
          if (response.ok) {
            const data = await response.json();
            clips = data.clips || [];
            console.log('Loaded original clips from backend:', clips);
          }
        }
        
        if (clips.length > 0) {
          setAllClips(clips);
          const selectedIndex = parseInt(sessionStorage.getItem("selectedClipIndex") || "0");
          const clip = clips[selectedIndex] || clips[0];
          setSelectedClip(clip);
          
          // Load captions for the selected clip
          await loadCaptionsForClip(sid, clip);
        }
      } catch (error) {
        console.error("Error fetching clips:", error);
      }
    };
    
    fetchClipAndCaptions();
  }, [setLocation]);

  const loadCaptionsForClip = async (sid: string, clip: any) => {
    // Check cache first
    if (captionCache[clip.filename]) {
      console.log(`📦 Loading captions from cache for ${clip.filename}`);
      setCaptions(captionCache[clip.filename]);
      
      // Load caption styles from style cache or sessionStorage
      if (styleCache[clip.filename]) {
        console.log(`🎨 Loading styles from cache for ${clip.filename}:`, styleCache[clip.filename]);
        setCaptionStyle(styleCache[clip.filename]);
      } else {
        const styleKey = `captionStyle_${sid}_${clip.filename}`;
        const savedStyle = sessionStorage.getItem(styleKey);
        if (savedStyle) {
          const parsedStyle = JSON.parse(savedStyle);
          setCaptionStyle(parsedStyle);
          setStyleCache(prev => ({...prev, [clip.filename]: parsedStyle}));
        } else {
          // No saved style found: persist current default style for this clip
          setStyleCache(prev => ({...prev, [clip.filename]: captionStyle}));
          sessionStorage.setItem(styleKey, JSON.stringify(captionStyle));
        }
      }
      return;
    }
    
    // Clear current captions
    setCaptions([]);
    
    // Try to load existing captions for this clip from backend
    try {
      const captionsResponse = await fetch(`/api/captions/${sid}/${clip.filename}`);
      if (captionsResponse.ok) {
        const captionsData = await captionsResponse.json();
        if (captionsData.captions) {
          const loadedCaptions = captionsData.captions.map((c: any, index: number) => ({
            id: index.toString(),
            text: c.text,
            start: c.start,
            end: c.end
          }));
          setCaptions(loadedCaptions);
          // Cache them
          setCaptionCache(prev => ({...prev, [clip.filename]: loadedCaptions}));
        }
      }
      
      // Load caption styles from style cache or sessionStorage
      if (styleCache[clip.filename]) {
        console.log(`🎨 Loading styles from cache for ${clip.filename}:`, styleCache[clip.filename]);
        setCaptionStyle(styleCache[clip.filename]);
      } else {
        const styleKey = `captionStyle_${sid}_${clip.filename}`;
        const savedStyle = sessionStorage.getItem(styleKey);
        if (savedStyle) {
          const parsedStyle = JSON.parse(savedStyle);
          setCaptionStyle(parsedStyle);
          setStyleCache(prev => ({...prev, [clip.filename]: parsedStyle}));
        } else {
          // No saved style found: persist current default style for this clip
          setCaptionStyle(captionStyle);
          setStyleCache(prev => ({...prev, [clip.filename]: captionStyle}));
          sessionStorage.setItem(styleKey, JSON.stringify(captionStyle));
        }
      }
    } catch (error) {
      console.log("No existing captions found for this clip");
    }
  };
  
  const handleClipSelect = async (clip: any) => {
    // Save current clip's captions and styles to cache before switching
    if (selectedClip) {
      if (captions.length > 0) {
        console.log(`💾 Caching captions for ${selectedClip.filename} before switching`);
        setCaptionCache(prev => ({...prev, [selectedClip.filename]: captions}));
      }
      // Always cache current styles
      console.log(`🎨 Caching styles for ${selectedClip.filename}:`, captionStyle);
      setStyleCache(prev => ({...prev, [selectedClip.filename]: captionStyle}));
      if (sessionId) {
        const prevStyleKey = `captionStyle_${sessionId}_${selectedClip.filename}`;
        sessionStorage.setItem(prevStyleKey, JSON.stringify(captionStyle));
      }
    }
    
    setSelectedClip(clip);
    if (sessionId) {
      await loadCaptionsForClip(sessionId, clip);
    }
  };

  const generateCaptions = async () => {
    if (!sessionId || !selectedClip) return;
    
    setGeneratingCaptions(true);
    try {
      const response = await fetch(`/api/generate-captions/${sessionId}/${selectedClip.filename}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.captions) {
          const generatedCaptions = data.captions.map((c: any, index: number) => ({
            id: index.toString(),
            text: c.text,
            start: c.start,
            end: c.end
          }));
          setCaptions(generatedCaptions);
          
          // Update cache immediately
          if (selectedClip) {
            setCaptionCache(prev => ({...prev, [selectedClip.filename]: generatedCaptions}));
          }
          
          toast({
            title: "Captions Generated",
            description: "Captions have been generated successfully"
          });
        }
      }
    } catch (error) {
      console.error("Error generating captions:", error);
      toast({
        title: "Error",
        description: "Failed to generate captions",
        variant: "destructive"
      });
    } finally {
      setGeneratingCaptions(false);
    }
  };

  return (
    <div className="min-h-screen pb-8">
      <ProgressStepper currentStep={5} steps={steps} />

      <div className="max-w-7xl mx-auto px-4 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Caption Editor</h1>
          <p className="text-muted-foreground">
            Customize captions with word-level precision
          </p>
        </div>

        {/* Clip Selector */}
        {allClips.length > 1 && (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {allClips.map((clip, index) => (
                <Button
                  key={index}
                  variant={selectedClip?.filename === clip.filename ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleClipSelect(clip)}
                  className="flex-shrink-0"
                >
                  Clip {index + 1}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          <div className="lg:col-span-1">
            <div className="sticky top-24">
              <VideoPlayer 
                aspectRatio="9/16" 
                className="max-w-sm mx-auto"
                videoUrl={selectedClip && sessionId ? `/api/stream/${sessionId}/${selectedClip.filename}` : undefined}
                captions={captions}
                showCaptions={true}
                captionStyle={captionStyle}
              />
            </div>
          </div>

          <div className="lg:col-span-1 space-y-4">
            {captions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">No captions yet</p>
                <Button 
                  onClick={generateCaptions}
                  disabled={generatingCaptions}
                  size="lg"
                >
                  {generatingCaptions ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Captions...
                    </>
                  ) : (
                    "Generate Captions"
                  )}
                </Button>
              </div>
            ) : (
              <CaptionEditorAdvanced
                captions={captions}
                currentTime={currentTime}
                initialStyle={captionStyle}
                onCaptionEdit={async (id: string, text: string) => {
                  const updatedCaptions = captions.map((c) => (c.id === id ? { ...c, text } : c));
                  setCaptions(updatedCaptions);
                  
                  // Update cache immediately
                  if (selectedClip) {
                    setCaptionCache(prev => ({...prev, [selectedClip.filename]: updatedCaptions}));
                  }
                  
                  // Save to backend
                  if (sessionId && selectedClip) {
                    try {
                      await fetch(`/api/update-captions/${sessionId}/${selectedClip.filename}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ captions: updatedCaptions })
                      });
                    } catch (error) {
                      console.error("Error saving captions:", error);
                    }
                  }
                }}
                onStyleChange={(style: any) => {
                  setCaptionStyle(style);
                  
                  // Update style cache immediately
                  if (selectedClip) {
                    setStyleCache(prev => ({...prev, [selectedClip.filename]: style}));
                  }
                  
                  // Save caption styles to sessionStorage for later use
                  if (sessionId && selectedClip) {
                    const styleKey = `captionStyle_${sessionId}_${selectedClip.filename}`;
                    sessionStorage.setItem(styleKey, JSON.stringify(style));
                    console.log(`💾 Saved caption styles for ${selectedClip.filename}`);
                    console.log(`   Key: ${styleKey}`);
                    console.log(`   Styles:`, style);
                  }
                }}
              />
            )}

            <div className="flex justify-between">
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                onClick={() => setLocation("/editor")}
              >
                <ArrowLeft className="h-5 w-5" />
                Back to Editor
              </Button>
              <Button
                size="lg"
                className="gap-2"
                onClick={() => {
                  // Just save caption data - don't generate captioned video yet
                  // The captioned version will be created when user downloads or merges
                  if (captions.length > 0) {
                    toast({
                      title: "Captions Saved",
                      description: "Your captions have been saved",
                    });
                  }
                  setLocation("/merge");
                }}
                data-testid="button-continue-merge"
              >
                Continue to Merge <ArrowRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
