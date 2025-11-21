import { Youtube } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface YouTubeInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function YouTubeInput({ value, onChange }: YouTubeInputProps) {
  return (
    <div className="space-y-3">
      <Label htmlFor="youtube-url" className="flex items-center gap-2">
        <Youtube className="h-4 w-4 text-primary" />
        YouTube URL
      </Label>
      <Input
        id="youtube-url"
        type="url"
        placeholder="https://www.youtube.com/watch?v=..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid="input-youtube-url"
      />
      <p className="text-xs text-muted-foreground">
        Paste a link to any YouTube video to extract clips from
      </p>
    </div>
  );
}
