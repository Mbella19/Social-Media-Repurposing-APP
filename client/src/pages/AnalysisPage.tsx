import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const analysisSteps = [
  "Initializing Analysis",
  "Analyzing with Gemini AI",
  "Extracting Clips from Stream",
  "Processing & Formatting Clips",
  "Finalizing Output",
];

export default function AnalysisPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [progress, setProgress] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Waiting for server...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sid = sessionStorage.getItem("sessionId");
    if (!sid) {
      setLocation("/upload");
      return;
    }

    const pollStatus = async () => {
      try {
        const response = await fetch(`/api/status/${sid}`);
        if (!response.ok) throw new Error("Failed to fetch status");

        const data = await response.json();

        if (data.status === "error") {
          setError(data.error || "An unknown error occurred");
          return;
        }

        if (data.status === "completed") {
          setProgress(100);
          setAnalysisComplete(true);
          setCurrentStep(analysisSteps.length - 1);
          setStatusMessage("Processing complete!");
          return;
        }

        // Update progress and message
        if (data.progress) setProgress(data.progress);
        if (data.message) setStatusMessage(data.message);

        // Map backend steps to visual steps
        // Backend Step 1: Analyzing -> Visual Step 1 (Index 1)
        // Backend Step 2: Extracting -> Visual Step 2 (Index 2)
        // Backend Step 3: Processing -> Visual Step 3 (Index 3)
        if (data.step) {
          setCurrentStep(Math.min(data.step, analysisSteps.length - 1));
        }

      } catch (err) {
        console.error("Polling error:", err);
        // Don't show error immediately on poll fail, might be temporary
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollStatus, 2000);

    // Initial poll
    pollStatus();

    return () => clearInterval(interval);
  }, [setLocation]);

  if (error) {
    return (
      <div className="container max-w-4xl mx-auto py-20 px-6 animate-fade-in flex flex-col items-center text-center">
        <AlertCircle className="h-16 w-16 text-red-500 mb-6" />
        <h1 className="text-4xl font-black text-white mb-4">ERROR</h1>
        <p className="text-zinc-400 mb-8">{error}</p>
        <Button
          onClick={() => setLocation("/configure")}
          className="rounded-none bg-white text-black hover:bg-cyan-400"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl mx-auto py-20 px-6 animate-fade-in">
      <div className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-4">
          ANALYZING<span className="text-cyan-400">.</span>
        </h1>
        <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">
          {statusMessage}
        </p>
      </div>

      <div className="space-y-12">
        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-zinc-500">
            <span>Progress</span>
            <span className="text-white">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-1 bg-zinc-900" />
        </div>

        {/* Steps */}
        <div className="grid gap-4 border border-zinc-900 bg-zinc-950/50 p-8">
          {analysisSteps.map((step, index) => {
            const isComplete = currentStep > index || (analysisComplete && index === analysisSteps.length - 1);
            const isCurrent = currentStep === index && !analysisComplete;

            return (
              <div key={index} className="flex items-center gap-4">
                <div className={`
                  h-6 w-6 flex items-center justify-center border transition-all duration-300
                  ${isComplete ? "bg-cyan-400 border-cyan-400 text-black" : isCurrent ? "border-cyan-400 text-cyan-400 animate-pulse" : "border-zinc-800 text-zinc-700"}
                `}>
                  {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <span className="text-[10px] font-bold">{index + 1}</span>}
                </div>
                <span className={`text-sm font-bold uppercase tracking-wide transition-colors ${isComplete || isCurrent ? "text-white" : "text-zinc-700"
                  }`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {/* Action */}
        {analysisComplete && (
          <div className="flex justify-end animate-fade-in">
            <Button
              size="lg"
              onClick={() => setLocation("/studio")}
              className="h-16 px-12 rounded-none bg-white text-black text-lg font-black uppercase tracking-widest hover:bg-cyan-400 hover:scale-105 transition-all"
            >
              Open Studio <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
