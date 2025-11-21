import { Youtube, Cloud } from "lucide-react";
import { Button } from "@/components/ui/button";

export type SourceType = "youtube" | "cloud";

interface SourceSelectorProps {
  selected: SourceType;
  onSelect: (source: SourceType) => void;
}

export function SourceSelector({ selected, onSelect }: SourceSelectorProps) {
  return (
    <div className="flex gap-3">
      <Button
        variant={selected === "youtube" ? "default" : "outline"}
        onClick={() => onSelect("youtube")}
        className="flex-1"
        data-testid="button-source-youtube"
      >
        <Youtube className="h-4 w-4 mr-2" />
        YouTube URL
      </Button>
      <Button
        variant={selected === "cloud" ? "default" : "outline"}
        onClick={() => onSelect("cloud")}
        className="flex-1"
        data-testid="button-source-cloud"
      >
        <Cloud className="h-4 w-4 mr-2" />
        Cloud Storage
      </Button>
    </div>
  );
}
