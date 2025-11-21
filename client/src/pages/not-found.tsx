import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center text-center px-4">
      <h1 className="text-9xl font-black tracking-tighter text-white/10">404</h1>
      <div className="space-y-6 -mt-12 relative z-10">
        <h2 className="text-4xl font-bold tracking-tight">Page Not Found</h2>
        <p className="text-muted-foreground text-lg max-w-md mx-auto">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link href="/">
          <Button size="lg" className="h-12 px-8 rounded-none">
            <Home className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
