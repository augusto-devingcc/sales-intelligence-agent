"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowRight, Loader2, Radio, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ToolStepCard, type StepState } from "./tool-step-card";
import { EmailCard } from "./email-card";
import type { Classification, GeneratedEmail } from "@/lib/tools/types";

const EXAMPLES = ["linear.app", "notion.so", "vercel.com"];

export function EnrichExperience() {
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [iteration, setIteration] = useState(0);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [assistantNotes, setAssistantNotes] = useState<string[]>([]);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [email, setEmail] = useState<GeneratedEmail | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setSteps([]);
    setAssistantNotes([]);
    setClassification(null);
    setEmail(null);
    setCompanyName(null);
    setIteration(0);
    setErrorMsg(null);
  }, []);

  const handleEvent = useCallback(
    (event: string, data: Record<string, unknown>) => {
      switch (event) {
        case "iteration":
          setIteration(Number(data.iteration) || 0);
          break;
        case "assistant_text":
          if (typeof data.text === "string") {
            setAssistantNotes((prev) => [...prev, data.text as string]);
          }
          break;
        case "step_start": {
          const id = `${data.iteration}-${data.tool}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 6)}`;
          setSteps((prev) => [
            ...prev,
            {
              id,
              tool: String(data.tool),
              args: (data.args as Record<string, unknown>) ?? {},
              iteration: Number(data.iteration) || 0,
              status: "running",
            },
          ]);
          break;
        }
        case "step_result": {
          setSteps((prev) => {
            const next = [...prev];
            for (let i = next.length - 1; i >= 0; i--) {
              if (
                next[i].tool === data.tool &&
                next[i].status === "running" &&
                next[i].iteration === Number(data.iteration)
              ) {
                next[i] = {
                  ...next[i],
                  status: data.is_error ? "error" : "done",
                  duration_ms: Number(data.duration_ms) || 0,
                  result: data.result,
                };
                break;
              }
            }
            return next;
          });
          break;
        }
        case "final":
          setClassification((data.classification as Classification) ?? null);
          setEmail((data.generated_email as GeneratedEmail) ?? null);
          setCompanyName((data.company_name as string) ?? null);
          setStatus("done");
          break;
        case "error":
          setErrorMsg(String(data.message ?? "Unknown error"));
          setStatus("error");
          break;
      }
    },
    []
  );

  const startEnrichment = useCallback(
    async (target: string) => {
      if (!target) return;
      abortRef.current?.abort();
      reset();
      setStatus("running");
      setActiveDomain(target);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: target }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `Request failed with ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIndex;
          while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, sepIndex);
            buffer = buffer.slice(sepIndex + 2);
            const parsed = parseSSE(rawEvent);
            if (parsed) handleEvent(parsed.event, parsed.data);
          }
        }

        setStatus((s) => (s === "running" ? "done" : s));
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        const message = err instanceof Error ? err.message : "Stream failed.";
        setErrorMsg(message);
        setStatus("error");
      }
    },
    [reset, handleEvent]
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "running") return;
    startEnrichment(domain.trim().toLowerCase());
  };

  const isRunning = status === "running";

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <div className="flex items-center justify-center gap-2 mb-4">
        <Badge
          variant="secondary"
          className="bg-[#1e293b] border-[#334155] text-[#34d399] font-mono text-[10px] uppercase tracking-wider"
        >
          <Sparkles className="h-3 w-3 mr-1" /> Claude agent + tool use
        </Badge>
      </div>
      <h1 className="text-center text-3xl sm:text-5xl font-semibold tracking-tight text-[#f4f4f5]">
        Sales Intelligence Agent
      </h1>
      <p className="mt-3 text-center text-[#94a3b8] text-base sm:text-lg max-w-2xl mx-auto">
        Paste a domain. Watch an AI agent enrich the lead and draft the email.
      </p>

      <form
        onSubmit={onSubmit}
        className="mt-8 mx-auto max-w-xl flex flex-col sm:flex-row gap-2"
      >
        <Input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="linear.app"
          disabled={isRunning}
          className="bg-[#1e293b] border-[#334155] text-[#f4f4f5] placeholder:text-[#475569] font-mono h-11"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <Button
          type="submit"
          disabled={isRunning || !domain.trim()}
          className="h-11 bg-[#34d399] text-[#052e1a] hover:bg-[#34d399]/90 font-medium"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Enriching
            </>
          ) : (
            <>
              Run agent <ArrowRight className="h-4 w-4 ml-2" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2 justify-center">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={isRunning}
            onClick={() => {
              setDomain(ex);
              startEnrichment(ex);
            }}
            className="text-xs font-mono text-[#94a3b8] hover:text-[#34d399] disabled:opacity-50 disabled:cursor-not-allowed border border-[#334155] hover:border-[#34d399]/50 bg-[#1e293b] px-3 py-1 rounded-full transition-colors"
          >
            Try {ex}
          </button>
        ))}
      </div>

      {(activeDomain || isRunning) && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#94a3b8]">
          <Radio
            className={`h-3 w-3 ${
              isRunning ? "text-[#fbbf24] animate-pulse" : "text-[#34d399]"
            }`}
          />
          <span className="font-mono">
            {isRunning ? "Watch live" : "Run complete"} · iteration {iteration}
            {activeDomain ? ` · ${activeDomain}` : ""}
          </span>
        </div>
      )}

      {errorMsg && (
        <div className="mt-6 max-w-2xl mx-auto rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
          {errorMsg}
        </div>
      )}

      <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#1e293b]/60 border-[#334155]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-[#f4f4f5]">Agent steps</h2>
              <span className="text-xs text-[#94a3b8] font-mono">
                {steps.length} call{steps.length === 1 ? "" : "s"}
              </span>
            </div>
            <ScrollArea className="h-[500px] pr-3">
              {steps.length === 0 && !isRunning ? (
                <div className="h-[460px] flex items-center justify-center text-center text-sm text-[#475569]">
                  Tool calls will stream here in real time.
                </div>
              ) : (
                <div className="space-y-2">
                  {steps.map((s) => (
                    <ToolStepCard key={s.id} step={s} />
                  ))}
                  {assistantNotes.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-[#94a3b8]">
                        Agent reasoning
                      </div>
                      {assistantNotes.map((n, i) => (
                        <div
                          key={i}
                          className="text-xs text-[#94a3b8] italic border-l-2 border-[#334155] pl-3"
                        >
                          {n}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <EmailCard
          email={email}
          classification={classification}
          companyName={companyName}
          domain={activeDomain}
        />
      </div>
    </div>
  );
}

function parseSSE(raw: string): { event: string; data: Record<string, unknown> } | null {
  let event = "message";
  let dataStr = "";
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }
  if (!dataStr) return null;
  try {
    return { event, data: JSON.parse(dataStr) as Record<string, unknown> };
  } catch {
    return null;
  }
}
