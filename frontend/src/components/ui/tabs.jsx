import * as React from "react";
import { cn } from "@/lib/utils";

const TabsContext = React.createContext({ value: "", onValueChange: () => {} });

function Tabs({ value, onValueChange, className, children, ...props }) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("flex flex-col gap-2", className)} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-xl bg-slate-900/80 p-1 text-slate-400 border border-slate-800/80 backdrop-blur-md",
        className
      )}
      role="tablist"
      {...props}
    />
  );
}

function TabsTrigger({ value, className, children, ...props }) {
  const context = React.useContext(TabsContext);
  const isActive = context.value === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-1.5 text-xs font-semibold tracking-wide transition-all duration-200 outline-none select-none disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-slate-800 text-white shadow-sm border border-slate-700/60"
          : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/30",
        className
      )}
      onClick={() => context.onValueChange?.(value)}
      {...props}
    >
      {children}
    </button>
  );
}

function TabsContent({ value, className, children, ...props }) {
  const context = React.useContext(TabsContext);
  if (context.value !== value) return null;

  return (
    <div
      role="tabpanel"
      className={cn("mt-2 outline-none animate-in fade-in-50 duration-200", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
