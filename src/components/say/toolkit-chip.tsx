/** Which PayPal Agent Toolkit tool a step went through, as a small chip. */
export function ToolkitChip({ tool }: { tool: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 font-mono text-[11px] leading-none text-sky-800" data-testid="toolkit-chip">
      Agent Toolkit · {tool}
    </span>
  );
}
