"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex h-10 items-center justify-center gap-2 overflow-hidden rounded-md px-4 py-2 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&>svg]:relative [&>svg]:z-10 [&>span]:relative [&>span]:z-10",
  {
    variants: {
      variant: {
        default:
          "border border-cyan-200/35 bg-[linear-gradient(135deg,rgba(125,238,250,0.92),rgba(204,190,255,0.9)_58%,rgba(255,221,142,0.9))] text-slate-950 shadow-[0_0_16px_rgba(91,235,255,0.24),0_0_24px_rgba(255,168,232,0.12)] before:absolute before:inset-0 before:bg-[linear-gradient(120deg,transparent,rgba(255,255,255,0.42),transparent)] before:translate-x-[-140%] hover:-translate-y-0.5 hover:shadow-[0_0_22px_rgba(91,235,255,0.36),0_0_34px_rgba(255,168,232,0.2)] hover:before:translate-x-[140%] before:transition-transform before:duration-700",
        secondary:
          "border border-cyan-100/18 bg-[linear-gradient(135deg,rgba(34,42,76,0.82),rgba(45,40,72,0.76))] text-cyan-50 shadow-[0_0_14px_rgba(255,168,232,0.08)] hover:-translate-y-0.5 hover:border-cyan-100/35 hover:bg-muted/80 hover:shadow-[0_0_22px_rgba(91,235,255,0.16)]",
        outline:
          "border border-cyan-100/22 bg-[rgba(8,13,29,0.34)] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_14px_rgba(91,235,255,0.08)] hover:-translate-y-0.5 hover:border-cyan-100/35 hover:bg-[rgba(178,247,255,0.08)] hover:shadow-[0_0_20px_rgba(91,235,255,0.14)]",
        destructive:
          "border border-red-200/35 bg-[linear-gradient(135deg,rgba(239,68,68,0.94),rgba(255,138,199,0.9))] text-white shadow-[0_0_20px_rgba(248,113,113,0.36)] hover:-translate-y-0.5 hover:shadow-[0_0_30px_rgba(248,113,113,0.52)]",
        ghost:
          "text-cyan-50 hover:bg-[rgba(178,247,255,0.12)] hover:shadow-[0_0_18px_rgba(91,235,255,0.16)]"
      },
      size: {
        default: "h-10 px-4",
        sm: "h-9 px-3",
        icon: "h-10 w-10 px-0"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";
