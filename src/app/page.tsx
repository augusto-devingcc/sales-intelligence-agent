import { EnrichExperience } from "@/components/enrich-experience";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      <EnrichExperience />
      <footer className="mt-auto border-t border-[#334155] bg-[#0f172a]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#94a3b8]">
          <span>
            Built by Augusto Garcia ·{" "}
            <a
              href="https://github.com/augusto-devingcc"
              target="_blank"
              rel="noreferrer"
              className="hover:text-[#34d399] transition-colors"
            >
              github.com/augusto-devingcc
            </a>
          </span>
          <a
            href="https://github.com/augusto-devingcc/company-intel-mcp"
            target="_blank"
            rel="noreferrer"
            className="font-mono hover:text-[#34d399] transition-colors"
          >
            Companion MCP server →
          </a>
        </div>
      </footer>
    </main>
  );
}
