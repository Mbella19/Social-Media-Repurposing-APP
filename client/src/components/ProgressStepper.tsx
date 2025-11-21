import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: number;
  label: string;
  description: string;
}

interface ProgressStepperProps {
  currentStep: number;
  steps: Step[];
}

export function ProgressStepper({ currentStep, steps }: ProgressStepperProps) {
  const progressRatio =
    steps.length > 1 ? Math.max(0, Math.min((currentStep - 1) / (steps.length - 1), 1)) : 0;

  return (
    <div className="w-full py-6">
      <div className="mx-auto w-full max-w-5xl rounded-3xl border border-white/5 bg-gradient-to-br from-white/5 via-transparent to-white/5 p-6 backdrop-blur-xl">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary via-purple-500 to-accent transition-[width]"
            style={{ width: `${progressRatio * 100}%` }}
          />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {steps.map((step) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;

            return (
              <div
                key={step.id}
                className={cn(
                  "rounded-2xl border px-4 py-3 text-left transition-all duration-200",
                  isCompleted || isCurrent
                    ? "border-white/30 bg-white/10"
                    : "border-white/5 bg-transparent text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold backdrop-blur",
                      isCompleted
                        ? "border-white/40 bg-white/90 text-background"
                        : isCurrent
                        ? "border-transparent bg-gradient-to-r from-primary to-accent text-white shadow-lg"
                        : "border-white/10 text-muted-foreground"
                    )}
                    data-testid={`step-indicator-${step.id}`}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : step.id}
                  </div>

                  <div>
                    <p
                      className="text-xs font-semibold uppercase tracking-[0.2em]"
                      data-testid={`step-label-${step.id}`}
                    >
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
