import { useState } from "react";
import { Link2 } from "lucide-react";
import { SiDropbox } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface DropboxInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function DropboxInput({ value, onChange }: DropboxInputProps) {
  const [error, setError] = useState("");

  const validateDropboxUrl = (url: string) => {
    // Dropbox public URL patterns
    const patterns = [
      /^https?:\/\/(www\.)?dropbox\.com\/.+/,
      /^https?:\/\/dl\.dropboxusercontent\.com\/.+/,
      /^https?:\/\/(www\.)?dl\.dropbox\.com\/.+/
    ];
    
    return patterns.some(pattern => pattern.test(url));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    onChange(url);
    
    if (url && !validateDropboxUrl(url)) {
      setError("Please enter a valid Dropbox public URL");
    } else {
      setError("");
    }
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      if (validateDropboxUrl(text)) {
        onChange(text);
        setError("");
      } else {
        setError("Pasted URL is not a valid Dropbox link");
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-[#0061FF]/10 flex items-center justify-center">
          <SiDropbox className="h-6 w-6 text-[#0061FF]" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">Dropbox URL</h3>
          <p className="text-sm text-muted-foreground">Paste a public Dropbox link to your video</p>
        </div>
      </div>

      <div className="relative">
        <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          type="url"
          placeholder="https://www.dropbox.com/scl/fi/..."
          value={value}
          onChange={handleChange}
          className="pl-10"
          data-testid="input-dropbox-url"
        />
        {error && (
          <p className="text-xs text-destructive mt-1">{error}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handlePaste}
          className="text-xs"
        >
          Paste from clipboard
        </Button>
        <p className="text-xs text-muted-foreground">
          Make sure your Dropbox link is publicly accessible
        </p>
      </div>

      <div className="bg-muted/50 rounded-lg p-3">
        <p className="text-xs text-muted-foreground">
          <strong>Tip:</strong> To get a public Dropbox link:
        </p>
        <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
          <li>Right-click your video file in Dropbox</li>
          <li>Select "Copy link" or "Create link"</li>
          <li>Make sure link settings allow viewing</li>
          <li>Paste the link here</li>
        </ol>
      </div>
    </div>
  );
}
