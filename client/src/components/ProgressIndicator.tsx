import { Brain, Scissors, Clapperboard, CheckCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface ProgressIndicatorProps {
  progress: number;
  currentStep: number;
  statusMessage: string;
}

const steps = [
  { id: 1, icon: Brain, label: "AI Analysis" },
  { id: 2, icon: Scissors, label: "Extracting" },
  { id: 3, icon: Clapperboard, label: "Formatting" },
  { id: 4, icon: CheckCircle, label: "Complete" },
];

export function ProgressIndicator({ progress, currentStep, statusMessage }: ProgressIndicatorProps) {
  return (
    <div className="space-y-6">
      <Progress value={progress} className="h-2" />
      
      <p className="text-center text-sm text-muted-foreground">{statusMessage}</p>

      <div className="flex justify-between items-center gap-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isActive = currentStep >= step.id;
          const isCurrent = currentStep === step.id;

          return (
            <div key={step.id} className="flex flex-col items-center gap-2 flex-1">
              <div
                className={`
                  flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all
                  ${isActive ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}
                  ${isCurrent ? "scale-110" : ""}
                `}
              >
                <Icon className={`h-5 w-5 ${isCurrent ? "animate-pulse" : ""}`} />
              </div>
              <span className={`text-xs font-medium ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
