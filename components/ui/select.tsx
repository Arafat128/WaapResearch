import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={cn(
          "waap-select h-10 w-full appearance-none rounded-md border px-3 py-2 pr-11 text-sm font-medium outline-none transition focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
          props.className
        )}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-cyan-200/5 text-cyan-100 shadow-[0_0_14px_rgba(103,232,249,0.28)]">
        <ChevronDown className="h-4 w-4" aria-hidden="true" />
      </span>
    </div>
  );
}
