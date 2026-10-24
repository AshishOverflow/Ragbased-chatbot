import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
        secondary:
          "border border-slate-700/60 bg-slate-800/60 text-slate-300",
        destructive:
          "border border-rose-500/30 bg-rose-500/15 text-rose-300",
        outline:
          "border border-slate-700 text-slate-300",
        indigo:
          "border border-indigo-400/30 bg-indigo-500/20 text-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.25)]",
        cyan:
          "border border-sky-400/30 bg-sky-500/15 text-sky-300",
        success:
          "border border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({ className, variant, ...props }) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
