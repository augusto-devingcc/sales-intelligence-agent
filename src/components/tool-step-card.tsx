"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Check, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type StepState = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  iteration: number;
  status: "running" | "done" | "error";
  duration_ms?: number;
  result?: unknown;
};

export function ToolStepCard({ step }: { step: StepState }) {
  const [open, setOpen] = useState(false);
  const isRunning = step.status === "running";
  const isError = step.status === "error";

  const accent = isRunning
    ? "border-[#fbbf24]/60 bg-[#fbbf24]/5"
    : isError
    ? "border-red-500/50 bg-red-500/5"
    : "border-[#34d399]/40 bg-[#34d399]/5";

  const argsPreview = Object.entries(step.args)
    .map(([k, v]) => {
      const s = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}: ${s.length > 60 ? s.slice(0, 60) + "..." : s}`;
    })
    .join(", ");

  return (
    <Card className={`p-3 transition-colors ${accent}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-[#fbbf24]" />
          ) : isError ? (
            <AlertTriangle className="h-4 w-4 text-red-400" />
          ) : (
            <Check className="h-4 w-4 text-[#34d399]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="font-mono text-sm text-[#f4f4f5]">{step.tool}</code>
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 bg-[#1e293b] text-[#94a3b8] border-[#334155]"
            >
              iter {step.iteration}
            </Badge>
            {step.duration_ms !== undefined && (
              <span className="text-xs text-[#94a3b8] font-mono">
                {step.duration_ms}ms
              </span>
            )}
          </div>
          {argsPreview && (
            <div className="mt-1 text-xs text-[#94a3b8] font-mono truncate">
              {argsPreview}
            </div>
          )}
          {step.result !== undefined && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="mt-2 inline-flex items-center gap-1 text-xs text-[#94a3b8] hover:text-[#f4f4f5] transition-colors"
            >
              {open ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              {open ? "Hide result" : "Show result"}
            </button>
          )}
          {open && step.result !== undefined && (
            <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-[#0f172a] border border-[#334155] p-2 text-[11px] text-[#cbd5e1] font-mono whitespace-pre-wrap break-words">
              {safeStringify(step.result)}
            </pre>
          )}
        </div>
      </div>
    </Card>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
