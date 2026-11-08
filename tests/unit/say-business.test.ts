import { describe, expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { invoiceRequest } from "@/agents/tools/send-job-invoice";
import { addContact, cleanTradeName, ContactProblem, contactsFor, setTradeName, tradeNameFor, TRADE_NAME_MAX } from "@/lib/say/business";
import { CONTACTS } from "@/lib/say/contacts";

const input = {
  customer_name: "Derek Evans",
  customer_email: "derek.evans@example.com",
  lines: [{ name: "Labor", quantityMilli: 1000, unitCents: 8000 }],
  tax_rate_milli: 0,
  due_date: "2026-11-22",
  total_cents: 8000,
  idempotency_key: "job_1",
};

describe("your business", () => {
  it("the demo trade's name until a visitor sets their own, and only for that visitor", () => {
    expect(tradeNameFor("v_aaaaaaaa")).toBe(appConfig.tradeName);
    setTradeName("v_aaaaaaaa", "  Birch   Lane Plumbing ");
    expect(tradeNameFor("v_aaaaaaaa")).toBe("Birch Lane Plumbing");
    expect(tradeNameFor("v_bbbbbbbb")).toBe(appConfig.tradeName);
    expect(tradeNameFor(undefined)).toBe(appConfig.tradeName);
    setTradeName("v_aaaaaaaa", "   ");
    expect(tradeNameFor("v_aaaaaaaa")).toBe(appConfig.tradeName);
  });

  it("a trade name is one plain line, no longer than PayPal's field needs", () => {
    expect(cleanTradeName("A<b>\nC")).toBe("A b C");
    expect(cleanTradeName("x".repeat(200))).toHaveLength(TRADE_NAME_MAX);
  });

  it("the name goes to PayPal as the invoicer's business name", () => {
    expect(invoiceRequest(input).invoicer?.business_name).toBe(appConfig.tradeName);
    expect(invoiceRequest({ ...input, business_name: "Birch Lane Plumbing" }).invoicer?.business_name).toBe("Birch Lane Plumbing");
  });

  it("a customer you add comes first in your contacts, not anyone else's, and only with a test address", () => {
    const added = addContact("v_cccccccc", { name: " Jordan  Ellis ", email: "Jordan.Ellis@example.com" });
    expect(added).toMatchObject({ name: "Jordan Ellis", email: "jordan.ellis@example.com" });
    expect(contactsFor("v_cccccccc")[0]).toEqual(added);
    expect(contactsFor("v_cccccccc")).toHaveLength(CONTACTS.length + 1);
    expect(contactsFor("v_dddddddd")).toEqual(CONTACTS);
    // The same email again updates the one entry.
    addContact("v_cccccccc", { name: "Jordan Ellis Jr", email: "jordan.ellis@example.com" });
    expect(contactsFor("v_cccccccc").filter((c) => c.email === "jordan.ellis@example.com").map((c) => c.name)).toEqual(["Jordan Ellis Jr"]);
    expect(() => addContact("v_cccccccc", { name: "Jordan", email: "jordan@gmail.com" })).toThrow(ContactProblem);
    expect(() => addContact("v_cccccccc", { name: "Jordan", email: "jordan@" })).toThrow("doesn't look complete");
    expect(() => addContact("v_cccccccc", { name: " ", email: "a@example.com" })).toThrow("name");
  });
});
