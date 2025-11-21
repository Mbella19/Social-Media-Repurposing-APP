import { Clock, Hash, Maximize2, Monitor } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface AspectRatio {
  value: string;
  label: string;
  icon: "vertical" | "square" | "horizontal";
}

const aspectRatios: AspectRatio[] = [
  { value: "9:16", label: "9:16 Vertical", icon: "vertical" },
  { value: "1:1", label: "1:1 Square", icon: "square" },
  { value: "16:9", label: "16:9 Horizontal", icon: "horizontal" },
];

interface SettingsPanelProps {
  clipDuration: number | string;
  numClips: number | string;
  aspectRatio: string;
  resolution: string;
  onClipDurationChange: (value: number | string) => void;
  onNumClipsChange: (value: number | string) => void;
  onAspectRatioChange: (value: string) => void;
  onResolutionChange: (value: string) => void;
}

export function SettingsPanel({
  clipDuration,
  numClips,
  aspectRatio,
  resolution,
  onClipDurationChange,
  onNumClipsChange,
  onAspectRatioChange,
  onResolutionChange,
}: SettingsPanelProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          Clip Duration
        </Label>
        <Select 
          value={clipDuration.toString()} 
          onValueChange={(v) => onClipDurationChange(v === "auto" ? "auto" : Number(v))}
        >
          <SelectTrigger data-testid="select-clip-duration">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              <div className="flex flex-col">
                <span className="font-medium">Auto (AI Decides)</span>
                <span className="text-xs text-muted-foreground">Up to 2 minutes</span>
              </div>
            </SelectItem>
            <SelectItem value="15">15 seconds</SelectItem>
            <SelectItem value="30">30 seconds</SelectItem>
            <SelectItem value="45">45 seconds</SelectItem>
            <SelectItem value="60">60 seconds</SelectItem>
            <SelectItem value="90">90 seconds</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-primary" />
          Number of Clips
        </Label>
        <Select 
          value={numClips.toString()} 
          onValueChange={(v) => onNumClipsChange(v === "auto" ? "auto" : Number(v))}
        >
          <SelectTrigger data-testid="select-num-clips">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">
              <div className="flex flex-col">
                <span className="font-medium">Auto (AI Decides)</span>
                <span className="text-xs text-muted-foreground">Extract all engaging moments</span>
              </div>
            </SelectItem>
            <SelectItem value="2">2 clips</SelectItem>
            <SelectItem value="3">3 clips</SelectItem>
            <SelectItem value="5">5 clips</SelectItem>
            <SelectItem value="7">7 clips</SelectItem>
            <SelectItem value="10">10 clips</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Maximize2 className="h-4 w-4 text-primary" />
          Aspect Ratio
        </Label>
        <div className="grid grid-cols-3 gap-2">
          {aspectRatios.map((ratio) => (
            <Button
              key={ratio.value}
              variant={aspectRatio === ratio.value ? "default" : "outline"}
              onClick={() => onAspectRatioChange(ratio.value)}
              className="flex flex-col items-center gap-2 h-auto py-3"
              data-testid={`button-aspect-${ratio.value}`}
            >
              <div
                className={`rounded ${
                  ratio.icon === "vertical"
                    ? "w-4 h-7"
                    : ratio.icon === "square"
                    ? "w-6 h-6"
                    : "w-7 h-4"
                } ${aspectRatio === ratio.value ? "bg-primary-foreground" : "bg-muted-foreground"}`}
              />
              <span className="text-xs">{ratio.label}</span>
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label className="flex items-center gap-2">
          <Monitor className="h-4 w-4 text-primary" />
          Resolution
        </Label>
        <Select value={resolution} onValueChange={onResolutionChange}>
          <SelectTrigger data-testid="select-resolution">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1080p">1080p HD</SelectItem>
            <SelectItem value="720p">720p</SelectItem>
            <SelectItem value="480p">480p</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
