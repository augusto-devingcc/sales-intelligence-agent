"use client";

import { useState } from "react";
import { Copy, Check, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Classification, GeneratedEmail } from "@/lib/tools/types";

type Props = {
  email: GeneratedEmail | null;
  classification: Classification | null;
  companyName: string | null;
  domain: string | null;
};

export function EmailCard({ email, classification, companyName, domain }: Props) {
  const [copied, setCopied] = useState(false);

  if (!email) {
    return (
      <Card className="h-full border-dashed border-[#334155] bg-[#1e293b]/40">
        <CardContent className="flex flex-col items-center justify-center h-full p-10 text-center min-h-[420px]">
          <Mail className="h-10 w-10 text-[#475569] mb-3" />
          <p className="text-[#94a3b8] text-sm max-w-xs">
            The drafted email and company profile will appear here once the agent finishes.
          </p>
        </CardContent>
      </Card>
    );
  }

  const fullText = `Subject: ${email.subject}\n\n${email.body}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <Card className="bg-[#1e293b] border-[#334155]">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-[#f4f4f5] text-lg truncate">
              {companyName || domain || "Generated email"}
            </CardTitle>
            {classification?.industry && (
              <p className="text-xs text-[#94a3b8] mt-1">
                {classification.industry}
                {classification.size_estimate ? ` · ${classification.size_estimate}` : ""}
              </p>
            )}
          </div>
          <Button
            onClick={handleCopy}
            variant="outline"
            size="sm"
            className="border-[#334155] bg-[#0f172a] text-[#f4f4f5] hover:bg-[#334155] hover:text-[#f4f4f5]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 mr-1" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {classification?.description && (
          <p className="text-sm text-[#cbd5e1] leading-relaxed">
            {classification.description}
          </p>
        )}
        {classification?.tech_stack && classification.tech_stack.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {classification.tech_stack.slice(0, 8).map((t) => (
              <Badge
                key={t}
                variant="secondary"
                className="bg-[#0f172a] text-[#94a3b8] border-[#334155] font-mono text-[10px]"
              >
                {t}
              </Badge>
            ))}
          </div>
        )}
        <div className="rounded-md bg-[#0f172a] border border-[#334155] p-4 space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#94a3b8] mb-1">
              Subject
            </div>
            <div className="text-[#f4f4f5] font-medium">{email.subject}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#94a3b8] mb-1">
              Body
            </div>
            <div className="text-[#cbd5e1] text-sm whitespace-pre-wrap leading-relaxed">
              {email.body}
            </div>
          </div>
        </div>
        {classification?.pain_points && classification.pain_points.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[#94a3b8] mb-2">
              Inferred pain points
            </div>
            <ul className="space-y-1 text-sm text-[#cbd5e1]">
              {classification.pain_points.slice(0, 5).map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#34d399] shrink-0">·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
