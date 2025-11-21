import { useState } from "react";
import { Link2 } from "lucide-react";
import { SiGoogledrive, SiDropbox } from "react-icons/si";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface CloudUrlInputProps {
  googleDriveUrl: string;
  dropboxUrl: string;
  onGoogleDriveChange: (value: string) => void;
  onDropboxChange: (value: string) => void;
}

export function CloudUrlInput({ 
  googleDriveUrl, 
  dropboxUrl, 
  onGoogleDriveChange, 
  onDropboxChange 
}: CloudUrlInputProps) {
  const [googleError, setGoogleError] = useState("");
  const [dropboxError, setDropboxError] = useState("");

  const validateGoogleDriveUrl = (url: string) => {
    const patterns = [
      /^https?:\/\/drive\.google\.com\/(file\/d\/|open\?id=).+/,
      /^https?:\/\/drive\.google\.com\/uc\?id=.+/,
      /^https?:\/\/docs\.google\.com\/(document|spreadsheets|presentation|file)\/d\/.+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const validateDropboxUrl = (url: string) => {
    const patterns = [
      /^https?:\/\/(www\.)?dropbox\.com\/.+/,
      /^https?:\/\/dl\.dropboxusercontent\.com\/.+/,
      /^https?:\/\/(www\.)?dl\.dropbox\.com\/.+/
    ];
    return patterns.some(pattern => pattern.test(url));
  };

  const handleGoogleDriveChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    onGoogleDriveChange(url);
    
    if (url && !validateGoogleDriveUrl(url)) {
      setGoogleError("Please enter a valid Google Drive URL");
    } else {
      setGoogleError("");
    }
  };

  const handleDropboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    onDropboxChange(url);
    
    if (url && !validateDropboxUrl(url)) {
      setDropboxError("Please enter a valid Dropbox URL");
    } else {
      setDropboxError("");
    }
  };

  const handlePaste = async (service: 'google' | 'dropbox') => {
    const text = await navigator.clipboard.readText();
    if (service === 'google') {
      if (validateGoogleDriveUrl(text)) {
        onGoogleDriveChange(text);
        setGoogleError("");
      } else {
        setGoogleError("Pasted URL is not a valid Google Drive link");
      }
    } else {
      if (validateDropboxUrl(text)) {
        onDropboxChange(text);
        setDropboxError("");
      } else {
        setDropboxError("Pasted URL is not a valid Dropbox link");
      }
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="googledrive" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="googledrive">Google Drive</TabsTrigger>
          <TabsTrigger value="dropbox">Dropbox</TabsTrigger>
        </TabsList>
        
        <TabsContent value="googledrive" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
              <SiGoogledrive className="h-6 w-6 text-[#4285F4]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold">Google Drive URL</h3>
              <p className="text-sm text-muted-foreground">Paste a public Google Drive link to your video</p>
            </div>
          </div>

          <div className="relative">
            <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="url"
              placeholder="https://drive.google.com/file/d/..."
              value={googleDriveUrl}
              onChange={handleGoogleDriveChange}
              className="pl-10"
              data-testid="input-googledrive-url"
            />
            {googleError && (
              <p className="text-xs text-destructive mt-1">{googleError}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePaste('google')}
              className="text-xs"
            >
              Paste from clipboard
            </Button>
            <p className="text-xs text-muted-foreground">
              Make sure your file has public view permissions
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              <strong>Tip:</strong> To share from Google Drive:
            </p>
            <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
              <li>Right-click your video file in Google Drive</li>
              <li>Select "Share" → "Copy link"</li>
              <li>Make sure "Anyone with the link" can view</li>
              <li>Paste the link here</li>
            </ol>
          </div>
        </TabsContent>
        
        <TabsContent value="dropbox" className="space-y-4">
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
              value={dropboxUrl}
              onChange={handleDropboxChange}
              className="pl-10"
              data-testid="input-dropbox-url"
            />
            {dropboxError && (
              <p className="text-xs text-destructive mt-1">{dropboxError}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePaste('dropbox')}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
