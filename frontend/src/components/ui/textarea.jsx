import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[44px] w-full rounded-xl border border-slate-700/60 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 backdrop-blur-md outline-none transition-all duration-200 focus-visible:border-indigo-500/80 focus-visible:ring-2 focus-visible:ring-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
