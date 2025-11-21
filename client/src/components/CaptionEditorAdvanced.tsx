import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Type, Palette, AlignLeft, AlignCenter, AlignRight, 
  Settings, Sparkles, Eye, EyeOff
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColorPicker } from "@/components/ColorPicker";

interface Caption {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  textAlign: string;
  outlineColor: string;
  outlineWidth: number;
  letterSpacing: number;
  lineHeight: number;
  animation: string;
  positionX: number;
  positionY: number;
}

interface CaptionEditorAdvancedProps {
  captions: Caption[];
  currentTime: number;
  onCaptionEdit?: (id: string, text: string) => void;
  onCaptionDelete?: (id: string) => void;
  onStyleChange?: (style: CaptionStyle) => void;
  initialStyle?: CaptionStyle;
}

export function CaptionEditorAdvanced({ 
  captions, 
  currentTime, 
  onCaptionEdit, 
  onCaptionDelete,
  onStyleChange,
  initialStyle
}: CaptionEditorAdvancedProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showStylePanel, setShowStylePanel] = useState(true);
  
  const defaultStyle: CaptionStyle = {
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
  };
  
  const [style, setStyle] = useState<CaptionStyle>(initialStyle || defaultStyle);

  // Update style when initialStyle changes (when switching clips)
  useEffect(() => {
    if (initialStyle) {
      setStyle(initialStyle);
    }
  }, [initialStyle]);

  const updateStyle = (updates: Partial<CaptionStyle>) => {
    const newStyle = { ...style, ...updates };
    setStyle(newStyle);
    onStyleChange?.(newStyle);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const fonts = [
    { value: 'Inter', label: 'Inter', css: 'Inter, sans-serif' },
    { value: 'Arial', label: 'Arial', css: 'Arial, sans-serif' },
    { value: 'Helvetica', label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
    { value: 'Georgia', label: 'Georgia', css: 'Georgia, serif' },
    { value: 'Times New Roman', label: 'Times', css: '"Times New Roman", Times, serif' },
    { value: 'Courier New', label: 'Courier', css: '"Courier New", Courier, monospace' },
    { value: 'Verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
    { value: 'Trebuchet MS', label: 'Trebuchet', css: '"Trebuchet MS", sans-serif' },
    { value: 'Impact', label: 'Impact', css: 'Impact, sans-serif' },
    { value: 'Libre Caslon Text', label: 'Libre Caslon', css: '"Libre Caslon Text", Georgia, serif' },
    { value: 'Montserrat', label: 'Montserrat', css: 'Montserrat, sans-serif' }
  ];

  const animations = [
    { value: 'none', label: 'None' },
    { value: 'fade', label: 'Fade In' },
    { value: 'slide-up', label: 'Slide Up' },
    { value: 'slide-down', label: 'Slide Down' },
    { value: 'zoom', label: 'Zoom' },
    { value: 'bounce', label: 'Bounce' },
    { value: 'typewriter', label: 'Typewriter' }
  ];

  const presetColors = [
    '#FFFFFF', '#000000', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', '#800080',
    '#FFC0CB', '#FFD700', '#C0C0C0', '#808080', '#8B4513'
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-semibold">Caption Editor</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowStylePanel(!showStylePanel)}
        >
          <Settings className="h-4 w-4 mr-2" />
          {showStylePanel ? 'Hide' : 'Show'} Styles
        </Button>
      </div>

      {showStylePanel && (
        <Card className="p-2 border bg-card/70 shadow-sm rounded-xl">
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-5 h-8 rounded-full bg-muted/50 p-1">
              <TabsTrigger value="text" className="text-[10px] px-1 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">Text</TabsTrigger>
              <TabsTrigger value="colors" className="text-[10px] px-1 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">Colors</TabsTrigger>
              <TabsTrigger value="position" className="text-[10px] px-1 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">Position</TabsTrigger>
              <TabsTrigger value="effects" className="text-[10px] px-1 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">Effects</TabsTrigger>
              <TabsTrigger value="animation" className="text-[10px] px-1 rounded-full data-[state=active]:bg-background data-[state=active]:shadow">Animation</TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-1.5 mt-2 max-h-[350px] overflow-y-auto rounded-lg border bg-card/60 p-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Font Family</Label>
                <Select 
                  value={fonts.find(f => f.css === style.fontFamily)?.value || 'Inter'}
                  onValueChange={(v) => {
                    const font = fonts.find(f => f.value === v);
                    if (font) {
                      updateStyle({ fontFamily: font.css });
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {fonts.map((font) => (
                      <SelectItem key={font.value} value={font.value}>
                        <span style={{ fontFamily: font.css }}>{font.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Font Weight</Label>
                <div className="grid grid-cols-4 gap-1">
                  {['Light', 'Regular', 'Bold', 'Black'].map((weight) => (
                    <Button
                      key={weight}
                      variant={style.fontWeight === weight ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[10px] px-1"
                      onClick={() => updateStyle({ fontWeight: weight })}
                    >
                      {weight.charAt(0)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Size: {style.fontSize}px</Label>
                  <Slider
                    value={[style.fontSize]}
                    onValueChange={([v]) => updateStyle({ fontSize: v })}
                    min={12}
                    max={72}
                    step={1}
                    className="h-5"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Spacing: {style.letterSpacing}px</Label>
                  <Slider
                    value={[style.letterSpacing]}
                    onValueChange={([v]) => updateStyle({ letterSpacing: v })}
                    min={-5}
                    max={20}
                    step={0.5}
                    className="h-5"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Alignment</Label>
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    variant={style.textAlign === "left" ? "default" : "outline"}
                    size="sm"
                    className="h-6"
                    onClick={() => updateStyle({ textAlign: "left" })}
                  >
                    <AlignLeft className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={style.textAlign === "center" ? "default" : "outline"}
                    size="sm"
                    className="h-6"
                    onClick={() => updateStyle({ textAlign: "center" })}
                  >
                    <AlignCenter className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={style.textAlign === "right" ? "default" : "outline"}
                    size="sm"
                    className="h-6"
                    onClick={() => updateStyle({ textAlign: "right" })}
                  >
                    <AlignRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="colors" className="space-y-1.5 mt-2 max-h-[350px] overflow-y-auto rounded-lg border bg-card/60 p-2">
              <ColorPicker
                color={style.color}
                onChange={(color) => updateStyle({ color })}
                label="Text Color"
              />
              
              <div className="border-t pt-1.5 mt-1.5">
                <ColorPicker
                  color={style.backgroundColor}
                  onChange={(color) => updateStyle({ backgroundColor: color })}
                  label="Background Color"
                />
              </div>

              <div className="space-y-0.5">
                <Label className="text-[11px]">BG Opacity: {style.backgroundOpacity}%</Label>
                <input
                  type="range"
                  value={style.backgroundOpacity}
                  onChange={(e) => updateStyle({ backgroundOpacity: parseInt(e.target.value) })}
                  min={0}
                  max={100}
                  step={1}
                  className="w-full h-5"
                />
              </div>

              {/* Preset swatches */}
              <div className="border-t pt-2 mt-2">
                <Label className="text-[11px] mb-1 block">Quick Swatches</Label>
                <div className="grid grid-cols-10 gap-1">
                  {presetColors.map((c) => (
                    <button
                      key={c}
                      className="h-6 w-6 rounded ring-1 ring-border"
                      style={{ backgroundColor: c }}
                      onClick={() => updateStyle({ color: c })}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="position" className="space-y-1.5 mt-2 max-h-[350px] overflow-y-auto rounded-lg border bg-card/60 p-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-0.5">
                  <Label className="text-[11px]">X: {style.positionX}%</Label>
                  <Slider
                    value={[style.positionX]}
                    onValueChange={([v]) => updateStyle({ positionX: v })}
                    min={0}
                    max={100}
                    step={1}
                    className="h-5"
                  />
                </div>
                <div className="space-y-0.5">
                  <Label className="text-[11px]">Y: {style.positionY}%</Label>
                  <Slider
                    value={[style.positionY]}
                    onValueChange={([v]) => updateStyle({ positionY: v })}
                    min={0}
                    max={100}
                    step={1}
                    className="h-5"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => updateStyle({ positionX: 50, positionY: 10 })}>
                  Top
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => updateStyle({ positionX: 50, positionY: 50 })}>
                  Mid
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => updateStyle({ positionX: 50, positionY: 85 })}>
                  Bot
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="effects" className="space-y-1.5 mt-2 max-h-[350px] overflow-y-auto rounded-lg border bg-card/60 p-2">
              <ColorPicker
                color={style.outlineColor}
                onChange={(color) => updateStyle({ outlineColor: color })}
                label="Outline Color"
              />
              <div className="space-y-0.5">
                <Label className="text-[11px]">Outline: {style.outlineWidth}px</Label>
                <Slider
                  value={[style.outlineWidth]}
                  onValueChange={([v]) => updateStyle({ outlineWidth: v })}
                  min={0}
                  max={10}
                  step={0.5}
                  className="h-5"
                />
              </div>
            </TabsContent>

            <TabsContent value="animation" className="space-y-1.5 mt-2 max-h-[350px] overflow-y-auto rounded-lg border bg-card/60 p-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Animation</Label>
                <Select value={style.animation} onValueChange={(v) => updateStyle({ animation: v })}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {animations.map((anim) => (
                      <SelectItem key={anim.value} value={anim.value}>
                        <div className="flex items-center gap-1.5 text-xs">
                          <Sparkles className="h-3 w-3" />
                          {anim.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      )}

      <div className="rounded-xl border bg-card/70 p-2 max-h-[420px] overflow-y-auto space-y-2">
        {captions.map((caption) => {
          const isActive = currentTime >= caption.start && currentTime <= caption.end;
          const isExpanded = expandedId === caption.id;

          return (
            <div
              key={caption.id}
              className={cn(
                "rounded-lg border p-3 transition-all duration-200",
                isActive && "ring-2 ring-primary bg-primary/5",
                !isActive && "bg-card hover-elevate"
              )}
              data-testid={`caption-${caption.id}`}
            >
              <div className="flex items-start gap-3">
                <Badge
                  variant="outline"
                  className="font-mono text-xs shrink-0"
                  data-testid={`caption-time-${caption.id}`}
                >
                  {formatTime(caption.start)}
                </Badge>

                <div className="flex-1 space-y-2">
                  {isExpanded ? (
                    <Textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className="min-h-20"
                      data-testid={`caption-textarea-${caption.id}`}
                    />
                  ) : (
                    <p
                      className="cursor-pointer"
                      onClick={() => {
                        setExpandedId(caption.id);
                        setEditingText(caption.text);
                      }}
                    >
                      {caption.text}
                    </p>
                  )}

                  {isExpanded && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => {
                          onCaptionEdit?.(caption.id, editingText);
                          setExpandedId(null);
                        }}
                        data-testid={`caption-save-${caption.id}`}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setExpandedId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
