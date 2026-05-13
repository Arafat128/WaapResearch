"use client";

import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function MissionGuardrails() {
  return (
    <Card>
      <CardContent className="grid gap-2 p-4 text-sm text-muted-foreground sm:grid-cols-3">
        <div className="flex items-center gap-2 text-emerald-200">
          <ShieldCheck className="h-4 w-4" />
          WaaP signs; this app never handles seed phrases or private keys.
        </div>
        <div>Every send, swap, bridge, and repeat action requires preview plus manual confirmation.</div>
        <div>Repeat actions stay sequential, capped, stoppable, and never run as an infinite loop.</div>
      </CardContent>
    </Card>
  );
}
