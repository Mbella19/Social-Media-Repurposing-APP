import { cn } from "@/lib/utils";
import { Smartphone, Square, Monitor } from "lucide-react";

interface AspectRatio {
  id: string;
  label: string;
  ratio: string;
  icon: React.ReactNode;
  description: string;
}

interface AspectRatioSelectorProps {
  selected: string;
  onSelect: (id: string) => void;
}

const aspectRatios: AspectRatio[] = [
  {
    id: "9:16",
    label: "Vertical",
    ratio: "9:16",
    icon: <Smartphone className="h-6 w-6" />,
    description: "TikTok, Reels, Shorts",
  },
  {
    id: "1:1",
    label: "Square",
    ratio: "1:1",
    icon: <Square className="h-6 w-6" />,
    description: "Instagram Feed",
  },
  {
    id: "16:9",
    label: "Horizontal",
    ratio: "16:9",
    icon: <Monitor className="h-6 w-6" />,
    description: "YouTube, Twitter",
  },
];

export function AspectRatioSelector({ selected, onSelect }: AspectRatioSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {aspectRatios.map((aspect) => {
        const isSelected = selected === aspect.id;
        
        return (
          <button
            key={aspect.id}
            onClick={() => onSelect(aspect.id)}
            className={cn(
              "relative rounded-xl border-2 p-6 transition-all duration-200",
              "flex flex-col items-center gap-4 hover-elevate",
              isSelected
                ? "border-primary bg-primary/5"
                : "border-border bg-card"
            )}
            data-testid={`aspect-ratio-${aspect.id}`}
          >
            {isSelected && (
              <div className="absolute top-3 right-3 h-3 w-3 rounded-full bg-primary animate-pulse" />
            )}
            
            <div
              className={cn(
                "flex items-center justify-center rounded-lg p-3",
                isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {aspect.icon}
            </div>
            
            <div className="text-center space-y-1">
              <p className="font-semibold">{aspect.label}</p>
              <p className="text-sm font-mono text-muted-foreground">{aspect.ratio}</p>
              <p className="text-xs text-muted-foreground">{aspect.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
