import { Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Header } from "@/components/Header";
import HomePage from "@/pages/HomePage";
import UploadPage from "@/pages/UploadPage";
import ConfigPage from "@/pages/ConfigPage";
import AnalysisPage from "@/pages/AnalysisPage";
import StudioPage from "@/pages/StudioPage";
import ProcessingPage from "@/pages/ProcessingPage";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/configure" component={ConfigPage} />
      <Route path="/analysis" component={AnalysisPage} />
      <Route path="/studio" component={StudioPage} />
      <Route path="/editor" component={StudioPage} />
      <Route path="/captions" component={StudioPage} />
      <Route path="/processing" component={ProcessingPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <div className="min-h-screen bg-background text-foreground font-sans antialiased selection:bg-primary selection:text-primary-foreground">
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">
                <Router />
              </main>
            </div>
          </div>
          <Toaster />
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
