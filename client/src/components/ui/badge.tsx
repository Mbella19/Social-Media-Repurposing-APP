import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-white/30 bg-white/20 text-background shadow-sm",
        secondary:
          "border border-primary/30 bg-primary/10 text-primary",
        destructive:
          "border border-destructive/50 bg-destructive/20 text-destructive-foreground",
        outline: "border border-white/20 text-white",
        glow: "border-transparent bg-gradient-to-r from-primary/80 to-accent/80 text-white shadow-[0_10px_30px_rgba(99,102,241,0.45)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
