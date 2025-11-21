import { Upload, FileVideo, X } from "lucide-react";
import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";

interface FileUploadZoneProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onRemove: () => void;
}

export function FileUploadZone({ onFileSelect, selectedFile, onRemove }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.includes('video')) {
          onFileSelect(file);
        }
      }
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  };

  if (selectedFile) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-md bg-card border border-card-border">
        <FileVideo className="h-6 w-6 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{selectedFile.name}</p>
          <p className="text-xs text-muted-foreground">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-8 w-8 shrink-0"
          data-testid="button-remove-file"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={`
        relative border-2 border-dashed rounded-md p-12 text-center cursor-pointer
        transition-all duration-200 hover-elevate
        ${isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border'}
      `}
      onClick={() => document.getElementById('file-input')?.click()}
      data-testid="dropzone-file-upload"
    >
      <input
        id="file-input"
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={handleFileInput}
        className="hidden"
        data-testid="input-file"
      />
      <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
      <p className="text-base font-medium mb-2">
        Drag & drop your video here or click to browse
      </p>
      <p className="text-sm text-muted-foreground">
        Supported: MP4, MOV, WebM (Max 500MB)
      </p>
    </div>
  );
}
