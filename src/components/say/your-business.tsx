"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronDown, UserPlus } from "lucide-react";
import { ApiError, useKit } from "@/components/kit/kit-provider";
import { useToast } from "@/components/toast";
import { Button, Card, CardBody, Input } from "@/components/ui";
import { cn } from "@/components/ui/cn";
import type { Contact } from "@/lib/say/contacts";

interface BusinessView {
  tradeName: string;
  own: boolean;
  demoName: string;
  max: number;
}

/**
 * Your business, in one card folded below the recorder: the name your customers see on PayPal's
 * invoice, and a customer of your own. Both stay with this browser, like the price book.
 */
export function YourBusiness({ onContacts, className }: { onContacts: (contacts: Contact[], added: Contact) => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const { kitFetch } = useKit();
  const { toast } = useToast();
  const [business, setBusiness] = useState<BusinessView | null>(null);
  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    kitFetch<BusinessView>("/api/business")
      .then((b) => {
        setBusiness(b);
        setName(b.own ? b.tradeName : "");
      })
      .catch(() => undefined);
  }, [kitFetch]);

  async function saveName() {
    setSavingName(true);
    try {
      const b = await kitFetch<BusinessView>("/api/business", { method: "PUT", json: { tradeName: name } });
      setBusiness(b);
      setName(b.own ? b.tradeName : "");
      toast({ title: b.own ? `Invoices now go out as ${b.tradeName}` : `Back to the demo name, ${b.demoName}`, variant: "success" });
    } catch (e) {
      toast({ title: "The name wasn't saved", description: (e as Error).message, variant: "error" });
    } finally {
      setSavingName(false);
    }
  }

  async function addCustomer() {
    setAdding(true);
    setProblem(null);
    try {
      const r = await kitFetch<{ contact: Contact; contacts: Contact[] }>("/api/contacts", { json: { name: customerName, email: customerEmail } });
      onContacts(r.contacts, r.contact);
      setCustomerName("");
      setCustomerEmail("");
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : "No signal. Try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card className={className} data-testid="business-card" data-open={open || undefined}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 px-5 py-4 text-left" data-testid="business-toggle">
        <Building2 className="size-4 shrink-0 text-brand" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-zinc-900">Your business</span>
          <span className="text-zinc-500"> and adding a customer</span>
          <span className="block truncate text-xs text-zinc-500">Invoices go out as {business?.tradeName ?? "…"}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
      </button>
      <CardBody className="grid gap-5 border-t border-zinc-100 lg:grid-cols-2" hidden={!open}>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void saveName();
          }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Building2 className="size-4 text-brand" /> Your business
          </p>
          <p className="text-sm text-zinc-600">
            Your customers see <strong className="font-semibold text-zinc-900" data-testid="trade-name-current">{business?.tradeName ?? "…"}</strong> at the top of PayPal&apos;s invoice
            {business && !business.own ? " (the demo trade, until you put your own)" : ""}.
          </p>
          <div className="flex gap-2">
            <Input aria-label="Your trade name" value={name} maxLength={business?.max ?? 80} onChange={(e) => setName(e.target.value)} placeholder="Your trade name" data-testid="trade-name-input" />
            <Button type="submit" variant="secondary" disabled={savingName || (!name.trim() && !business?.own)} data-testid="trade-name-save">
              Save
            </Button>
          </div>
        </form>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addCustomer();
          }}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <UserPlus className="size-4 text-brand" /> Add a customer
          </p>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input aria-label="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Name" data-testid="add-customer-name" />
            <Input aria-label="Customer email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="name@example.com" data-testid="add-customer-email" />
            <Button type="submit" variant="secondary" disabled={adding || !customerName.trim() || !customerEmail.trim()} data-testid="add-customer-save">
              Add
            </Button>
          </div>
          {problem ? (
            <p role="alert" className="text-sm text-red-700" data-testid="add-customer-problem">
              {problem}
            </p>
          ) : (
            <p className="text-xs text-zinc-500">Saved to this browser&apos;s contacts. On this test site, emails end in @example.com.</p>
          )}
        </form>
      </CardBody>
    </Card>
  );
}
