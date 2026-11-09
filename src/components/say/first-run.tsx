"use client";

import { useEffect, useState } from "react";
import { Building2, Landmark } from "lucide-react";
import { ApiError, useKit } from "@/components/kit/kit-provider";
import { Button, Card, CardBody, CardHeader, Input } from "@/components/ui";

export interface BusinessView {
  tradeName: string;
  own: boolean;
  demoName: string;
  max: number;
  email: string | null;
  firstRun: boolean;
}

/**
 * The first visit with no business set: the trade's name and email, and which PayPal account it invoices from,
 * said plainly as the sandbox. One short step above the recorder; it never blocks a job, and Skip keeps the demo trade.
 */
export function FirstRun({ onDone }: { onDone: (business: BusinessView) => void }) {
  const { kitFetch, status } = useKit();
  const [business, setBusiness] = useState<BusinessView | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState<"save" | "skip" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    kitFetch<BusinessView>("/api/business")
      .then(setBusiness)
      .catch(() => undefined);
  }, [kitFetch]);

  async function save(skip: boolean) {
    setSaving(skip ? "skip" : "save");
    setProblem(null);
    try {
      const b = await kitFetch<BusinessView>("/api/business", { method: "PUT", json: skip ? { skip: true } : { tradeName: name, email } });
      setBusiness(b);
      onDone(b);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "No signal. Try again.");
    } finally {
      setSaving(null);
    }
  }

  if (!business?.firstRun) return null;
  const sandbox = status?.paypal.mode === "sandbox";
  return (
    <Card className="mb-6" data-testid="first-run">
      <CardHeader title="Your business" description="Before the first job: the name your customers see on PayPal's invoice, and your email." />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save(false);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-zinc-700">
              <span className="flex items-center gap-1.5">
                <Building2 className="size-4 text-brand" /> Trade name
              </span>
              <Input value={name} maxLength={business.max} onChange={(e) => setName(e.target.value)} placeholder="Birch Lane Plumbing" autoComplete="organization" data-testid="first-run-name" />
            </label>
            <label className="space-y-1 text-sm font-medium text-zinc-700">
              <span>Your email</span>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="office@yourtrade.com" autoComplete="email" data-testid="first-run-email" />
            </label>
          </div>
          <p className="text-xs text-zinc-500">Your email goes at the end of the note on each invoice, so customers know where to ask.</p>
          <p className="flex items-start gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700" data-testid="first-run-paypal">
            <Landmark className="mt-0.5 size-4 shrink-0 text-zinc-500" />
            <span>
              {sandbox
                ? "PayPal account: this site's PayPal sandbox business account. Sandbox means test money: no real payments, and every trade trying this site invoices from the same account, under its own name."
                : "PayPal account: none on this copy of the app. Invoices stay on this computer; no money moves."}
            </span>
          </p>
          {problem ? (
            <p role="alert" className="text-sm text-red-700" data-testid="first-run-problem">
              {problem}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 [&>button]:max-w-full">
            <Button type="submit" loading={saving === "save"} disabled={!!saving || !name.trim()} data-testid="first-run-save">
              Save and start
            </Button>
            <Button type="button" variant="secondary" loading={saving === "skip"} disabled={!!saving} onClick={() => void save(true)} data-testid="first-run-skip">
              Skip for now
            </Button>
          </div>
          <p className="text-xs text-zinc-500">Skipped, invoices go out as the demo trade, {business.demoName}. You can set yours later under Your business.</p>
        </form>
      </CardBody>
    </Card>
  );
}
