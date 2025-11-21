import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Type, Palette, AlignLeft, AlignCenter, AlignRight } from "lucide-react";
import { Card } from "@/components/ui/card";

interface Caption {
  id: string;
  text: string;
  start: number;
  end: number;
}

interface CaptionEditorProps {
  captions: Caption[];
  currentTime: number;
  onCaptionEdit?: (id: string, text: string) => void;
  onCaptionDelete?: (id: string) => void;
  onStyleChange?: (style: { fontWeight: string; color: string; textAlign: string }) => void;
}

export function CaptionEditorSimple({ captions, currentTime, onCaptionEdit, onCaptionDelete, onStyleChange }: CaptionEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [showAlignMenu, setShowAlignMenu] = useState(false);
  const [selectedFont, setSelectedFont] = useState("Bold");
  const [selectedColor, setSelectedColor] = useState("#FFFFFF");
  const [selectedAlign, setSelectedAlign] = useState("center");

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Captions</h3>
        <div className="flex gap-2">
          <Button 
            variant={showStyleMenu ? "default" : "outline"}
            size="icon" 
            className="h-8 w-8" 
            data-testid="button-font"
            onClick={() => {
              setShowStyleMenu(!showStyleMenu);
              setShowColorMenu(false);
              setShowAlignMenu(false);
            }}
            title="Text Style"
          >
            <Type className="h-4 w-4" />
          </Button>
          <Button 
            variant={showColorMenu ? "default" : "outline"}
            size="icon" 
            className="h-8 w-8" 
            data-testid="button-color"
            onClick={() => {
              setShowColorMenu(!showColorMenu);
              setShowStyleMenu(false);
              setShowAlignMenu(false);
            }}
            title="Text Color"
          >
            <Palette className="h-4 w-4" />
          </Button>
          <Button 
            variant={showAlignMenu ? "default" : "outline"}
            size="icon" 
            className="h-8 w-8" 
            data-testid="button-align"
            onClick={() => {
              setShowAlignMenu(!showAlignMenu);
              setShowStyleMenu(false);
              setShowColorMenu(false);
            }}
            title="Text Alignment"
          >
            {selectedAlign === "left" ? <AlignLeft className="h-4 w-4" /> : 
             selectedAlign === "right" ? <AlignRight className="h-4 w-4" /> : 
             <AlignCenter className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Style Menu */}
      {showStyleMenu && (
        <Card className="p-4 mb-4">
          <h4 className="text-sm font-semibold mb-3">Text Style</h4>
          <div className="grid grid-cols-2 gap-2">
            {["Bold", "Regular", "Light", "Black"].map((style) => (
              <Button
                key={style}
                variant={selectedFont === style ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setSelectedFont(style);
                  onStyleChange?.({ fontWeight: style, color: selectedColor, textAlign: selectedAlign });
                }}
              >
                {style}
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Color Menu */}
      {showColorMenu && (
        <Card className="p-4 mb-4">
          <h4 className="text-sm font-semibold mb-3">Text Color</h4>
          <div className="grid grid-cols-5 gap-2">
            {["#FFFFFF", "#000000", "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#FFA500", "#800080"].map((color) => (
              <button
                key={color}
                className={cn(
                  "w-10 h-10 rounded-md border-2 transition-all",
                  selectedColor === color ? "border-primary scale-110" : "border-border"
                )}
                style={{ backgroundColor: color }}
                onClick={() => {
                  setSelectedColor(color);
                  onStyleChange?.({ fontWeight: selectedFont, color: color, textAlign: selectedAlign });
                }}
              />
            ))}
          </div>
        </Card>
      )}

      {/* Alignment Menu */}
      {showAlignMenu && (
        <Card className="p-4 mb-4">
          <h4 className="text-sm font-semibold mb-3">Text Alignment</h4>
          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={selectedAlign === "left" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedAlign("left");
                onStyleChange?.({ fontWeight: selectedFont, color: selectedColor, textAlign: "left" });
              }}
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              variant={selectedAlign === "center" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedAlign("center");
                onStyleChange?.({ fontWeight: selectedFont, color: selectedColor, textAlign: "center" });
              }}
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              variant={selectedAlign === "right" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSelectedAlign("right");
                onStyleChange?.({ fontWeight: selectedFont, color: selectedColor, textAlign: "right" });
              }}
            >
              <AlignRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
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
