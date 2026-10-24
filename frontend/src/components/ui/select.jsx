import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const SelectContext = React.createContext({
  value: "",
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
  disabled: false,
  displayLabel: "",
  setDisplayLabel: () => {},
});

export function Select({
  value,
  onValueChange,
  disabled = false,
  children,
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const [displayLabel, setDisplayLabel] = React.useState("");
  const containerRef = React.useRef(null);

  // Close when clicking outside
  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <SelectContext.Provider
      value={{
        value: String(value ?? ""),
        onValueChange: (val) => {
          onValueChange?.(val);
          setOpen(false);
        },
        open,
        setOpen,
        disabled,
        displayLabel,
        setDisplayLabel,
      }}
    >
      <div
        ref={containerRef}
        className={cn("relative inline-block", open && "z-50", className)}
      >
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export const SelectTrigger = React.forwardRef(
  ({ className, children, ...props }, ref) => {
    const { open, setOpen, disabled } = React.useContext(SelectContext);

    return (
      <button
        ref={ref}
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen(!open)}
        className={cn(
          "flex h-8 items-center justify-between gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-200 shadow-sm backdrop-blur-md outline-none transition-all duration-150 hover:border-slate-600 hover:bg-slate-800/90 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 select-none",
          open && "border-indigo-500 ring-1 ring-indigo-500/40",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDown
          className={cn(
            "size-3.5 text-slate-400 transition-transform duration-200 shrink-0",
            open && "rotate-180 text-indigo-400"
          )}
        />
      </button>
    );
  }
);
SelectTrigger.displayName = "SelectTrigger";

export function SelectValue({ placeholder = "Select...", className }) {
  const { value, displayLabel } = React.useContext(SelectContext);
  const text = displayLabel || (value ? `${value} cards` : placeholder);

  return (
    <span className={cn("truncate", !text && "text-slate-500", className)}>
      {text}
    </span>
  );
}

export function SelectContent({ className, align = "right", children, ...props }) {
  const { open } = React.useContext(SelectContext);
  if (!open) return null;

  return (
    <div
      role="listbox"
      className={cn(
        "absolute top-full mt-1.5 min-w-[130px] rounded-xl border border-slate-700/80 bg-slate-950 p-1 text-slate-200 shadow-2xl shadow-black/90 backdrop-blur-2xl z-[100] animate-in fade-in-0 zoom-in-95 duration-150 outline-none ring-1 ring-slate-800/80",
        align === "right" ? "right-0" : "left-0",
        className
      )}
      {...props}
    >
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

export function SelectItem({ value, children, className, ...props }) {
  const { value: selectedValue, onValueChange, setDisplayLabel } = React.useContext(SelectContext);
  const isSelected = String(value) === String(selectedValue);

  const textContent = Array.isArray(children)
    ? children.join("")
    : typeof children === "string" || typeof children === "number"
    ? String(children)
    : String(value);

  // Keep displayLabel synchronized
  React.useEffect(() => {
    if (isSelected) {
      setDisplayLabel(textContent);
    }
  }, [isSelected, textContent, setDisplayLabel]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={() => onValueChange(value)}
      className={cn(
        "relative flex cursor-pointer select-none items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium outline-none transition-colors",
        isSelected
          ? "bg-indigo-600/20 text-indigo-200 font-semibold"
          : "text-slate-300 hover:bg-slate-800/80 hover:text-white",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {isSelected && <Check className="size-3.5 text-indigo-400 shrink-0 ml-2" />}
    </div>
  );
}
