import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "warning" | "success" | "danger" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-1 text-xs font-medium shadow-sm backdrop-blur",
        variant === "default" && "border-cyan-200/20 bg-cyan-200/10 text-cyan-100",
        variant === "warning" && "border-amber-200/20 bg-amber-300/10 text-amber-100",
        variant === "success" && "border-emerald-200/20 bg-emerald-300/10 text-emerald-100",
        variant === "danger" && "border-red-200/20 bg-red-300/10 text-red-100",
        variant === "muted" && "border-white/10 bg-white/5 text-slate-300",
        className
      )}
      {...props}
    />
  );
}
