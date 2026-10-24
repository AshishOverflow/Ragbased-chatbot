import * as React from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 outline-none select-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-indigo-500/50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 hover:shadow-indigo-500/35",
        destructive:
          "bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 hover:border-rose-500/50",
        outline:
          "border border-slate-700/60 bg-slate-900/40 text-slate-200 hover:bg-slate-800/60 hover:border-slate-600 hover:text-white backdrop-blur-sm",
        secondary:
          "bg-slate-800/70 text-slate-200 border border-slate-700/50 hover:bg-slate-700/80 hover:text-white",
        ghost:
          "text-slate-300 hover:bg-slate-800/60 hover:text-white",
        link:
          "text-indigo-400 underline-offset-4 hover:underline",
        midnight:
          "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white font-semibold shadow-[0_0_20px_rgba(99,102,241,0.35)] hover:from-indigo-400 hover:to-indigo-500 hover:shadow-[0_0_25px_rgba(99,102,241,0.5)] border border-indigo-400/30",
        subtle:
          "bg-slate-900/80 text-slate-300 border border-slate-800 hover:border-slate-700 hover:text-white",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6 text-base",
        icon: "h-9 w-9 rounded-xl p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
