"use client";

import { ExternalLink, Power } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const LOCAL_URL = "http://localhost:3000";

export function LocalRunHelp() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Power className="h-5 w-5 text-primary" />
          Local Run Help
        </CardTitle>
        <CardDescription>PowerShell commands to stop, restart, and open the local dashboard.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <div className="grid gap-2 rounded-md border bg-background p-3">
          <div className="font-medium">Start the app</div>
          <code className="whitespace-pre-wrap text-muted-foreground">cd D:\Codex\Waap{"\n"}powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1</code>
        </div>
        <div className="grid gap-2 rounded-md border bg-background p-3">
          <div className="font-medium">Terminate / restart</div>
          <code className="whitespace-pre-wrap text-muted-foreground">Ctrl + C{"\n"}Y{"\n"}powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1</code>
        </div>
        <div className="grid gap-2 rounded-md border bg-background p-3">
          <div className="font-medium">If port 3000 is busy</div>
          <code className="whitespace-pre-wrap text-muted-foreground">taskkill /PID YOUR_PID /F{"\n"}powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -Port 3001</code>
        </div>
        <Button variant="outline" asChild>
          <a href={LOCAL_URL} target="_blank" rel="noreferrer">
            <ExternalLink className="h-4 w-4" />
            Open {LOCAL_URL}
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
