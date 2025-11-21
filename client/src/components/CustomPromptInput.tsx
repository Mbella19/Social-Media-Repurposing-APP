import { Sparkles, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface CustomPromptInputProps {
  value: string;
  onChange: (value: string) => void;
}

const examplePrompts = [
  "all goals in this soccer match",
  "funny moments and reactions",
  "best plays and highlights",
  "tutorial steps explained",
  "key talking points",
];

export function CustomPromptInput({ value, onChange }: CustomPromptInputProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Instructions (Optional)
        </Label>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange("")}
            className="h-7 text-xs"
            data-testid="button-clear-prompt"
          >
            <X className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="p-3 rounded-md bg-primary/10 border border-primary/20">
        <p className="text-sm text-muted-foreground">
          Tell the AI exactly what to look for in your video. Leave blank for automatic selection of engaging moments.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quick Examples:</p>
        <div className="flex flex-wrap gap-2">
          {examplePrompts.map((prompt) => (
            <Button
              key={prompt}
              variant="outline"
              size="sm"
              onClick={() => onChange(prompt)}
              className="text-xs hover-elevate active-elevate-2"
              data-testid={`button-prompt-example-${prompt.split(' ')[0]}`}
            >
              {prompt}
            </Button>
          ))}
        </div>
      </div>

      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g., 'Show all goals scored in this match' or 'Extract the funniest moments' or 'Find all product demonstrations'..."
        className="min-h-[100px] resize-none"
        data-testid="textarea-custom-prompt"
      />
    </div>
  );
}
