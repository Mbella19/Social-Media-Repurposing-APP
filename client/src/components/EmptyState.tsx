import { FileVideo } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  title?: string;
  description?: string;
}

export function EmptyState({
  title = "No clips generated yet",
  description = "Upload a video and configure your settings to start creating amazing clips with AI"
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-32 h-32 mb-6 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
        <FileVideo className="w-16 h-16 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      <Link href="/create">
        <Button>Create Clips</Button>
      </Link>
    </div>
  );
}
