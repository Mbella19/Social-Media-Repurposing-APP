import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface HeroMetric {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
}

export interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  stats?: HeroMetric[];
  spotlight?: ReactNode;
  glow?: "violet" | "cyan" | "amber";
  align?: "left" | "center";
  className?: string;
  footer?: ReactNode;
}

const glowMap: Record<NonNullable<PageHeroProps["glow"]>, string> = {
  violet: "from-[#6c4df6]/60 via-[#5b21b6]/40 to-[#22d3ee]/35",
  cyan: "from-[#22d3ee]/60 via-[#2563eb]/35 to-[#c084fc]/35",
  amber: "from-[#fbbf24]/45 via-[#f472b6]/35 to-[#6366f1]/35",
};

export function PageHero({
  eyebrow,
  title,
  description,
  kicker,
  actions,
  stats = [],
  spotlight,
  glow = "violet",
  align = "left",
  className,
  footer,
}: PageHeroProps) {
  const hasSpotlight = Boolean(spotlight);
  const palette = glowMap[glow] ?? glowMap.violet;

  return (
    <section
      className={cn(
        "relative overflow-hidden rounded-[40px] border border-white/10 bg-gradient-to-br from-slate-950/85 via-slate-900/40 to-slate-950/70 p-8 text-white shadow-[0_40px_120px_rgba(15,23,42,0.45)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <div className={cn("absolute -inset-8 blur-3xl opacity-70 animate-aurora", `bg-gradient-to-r ${palette}`)} />
        <div className="absolute -right-10 top-10 h-56 w-56 rounded-full bg-primary/30 blur-[120px]" />
        <div className="absolute -left-20 bottom-0 h-40 w-40 rounded-full bg-accent/30 blur-[90px]" />
        <div className="grid-surface absolute inset-0 animate-grid-move" />
        <div className="absolute inset-0 rounded-[40px] border border-white/10 opacity-30" />
      </div>

      <div
        className={cn(
          "relative grid gap-12",
          hasSpotlight ? "lg:grid-cols-[1.25fr_0.85fr]" : "",
          align === "center" ? "text-center" : "text-left"
        )}
      >
        <div className="space-y-6">
          <p className="text-xs uppercase tracking-[0.45em] text-white/70">{eyebrow}</p>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{title}</h1>
            {description && <p className="text-base text-white/80">{description}</p>}
          </div>

          {actions && (
            <div className={cn("flex flex-wrap gap-3", align === "center" && "justify-center")}>{actions}</div>
          )}

          {kicker && <div className="text-sm text-white/70">{kicker}</div>}
        </div>

        {hasSpotlight && (
          <div className="relative rounded-[32px] border border-white/15 bg-white/5 p-6 shadow-inner backdrop-blur">
            <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/10 opacity-50" />
            <div className="relative space-y-4">{spotlight}</div>
          </div>
        )}
      </div>

      {stats.length > 0 && (
        <div className="relative mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="group rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-4 text-left shadow-[0_20px_50px_rgba(15,23,42,0.35)] backdrop-blur hover:border-primary/30 hover:shadow-[0_20px_60px_rgba(147,51,234,0.2)] transition-all duration-300 hover-elevate stagger-item"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <p className="text-3xl font-semibold counter gradient-text-animated">{stat.value}</p>
              <p className="text-xs uppercase tracking-[0.4em] text-white/60 group-hover:text-white/80 transition-colors">{stat.label}</p>
              {stat.detail && <p className="text-xs text-white/70 group-hover:text-white/90 transition-colors">{stat.detail}</p>}
            </div>
          ))}
        </div>
      )}

      {footer && <div className="mt-8 text-sm text-white/75">{footer}</div>}
    </section>
  );
}
