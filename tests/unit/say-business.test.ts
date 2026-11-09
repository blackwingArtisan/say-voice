import { describe, expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { invoiceRequest } from "@/agents/tools/send-job-invoice";
import { addContact, businessEmailFor, cleanTradeName, ContactProblem, contactsFor, isFirstRun, setBusiness, setTradeName, tradeNameFor, TRADE_NAME_MAX } from "@/lib/say/business";
import { invoiceNote, NOTE_MAX } from "@/agents/tools/send-job-invoice";
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

  it("a first visit is the first run until a name is saved or the step skipped, and it doesn't come back", () => {
    expect(isFirstRun("v_ffffffff")).toBe(true);
    setBusiness("v_ffffffff", { tradeName: " Oak Street  Electric ", email: " Jobs@OakStreet.example.com " });
    expect(isFirstRun("v_ffffffff")).toBe(false);
    expect(tradeNameFor("v_ffffffff")).toBe("Oak Street Electric");
    expect(businessEmailFor("v_ffffffff")).toBe("jobs@oakstreet.example.com");
    // Clearing the name later goes back to the demo name, not to the step.
    setBusiness("v_ffffffff", { tradeName: "" });
    expect(tradeNameFor("v_ffffffff")).toBe(appConfig.tradeName);
    expect(businessEmailFor("v_ffffffff")).toBe("jobs@oakstreet.example.com");
    expect(isFirstRun("v_ffffffff")).toBe(false);
    setBusiness("v_gggggggg", { skip: true });
    expect(isFirstRun("v_gggggggg")).toBe(false);
    expect(tradeNameFor("v_gggggggg")).toBe(appConfig.tradeName);
    expect(isFirstRun("v_hhhhhhhh")).toBe(true);
  });

  it("an email that isn't one is refused; none is fine", () => {
    expect(() => setBusiness("v_iiiiiiii", { tradeName: "A", email: "not-an-email" })).toThrow(ContactProblem);
    expect(() => setBusiness("v_iiiiiiii", { tradeName: "A", email: "a@b.co<script>" })).toThrow(ContactProblem);
    setBusiness("v_iiiiiiii", { tradeName: "A", email: "" });
    expect(businessEmailFor("v_iiiiiiii")).toBeUndefined();
  });

  it("the trade's email ends the note the customer reads, kept whole when the job's words are long", () => {
    expect(invoiceNote({ job_summary: "Dryer repair", business_email: "office@birchlane.example.com" })).toBe("Dryer repair\nQuestions: office@birchlane.example.com");
    expect(invoiceNote({ business_email: "office@birchlane.example.com" })).toBe("Questions: office@birchlane.example.com");
    expect(invoiceNote({ job_summary: "Dryer repair" })).toBe("Dryer repair");
    const long = invoiceNote({ job_summary: "y ".repeat(3000), business_email: "office@birchlane.example.com" })!;
    expect(long.length).toBeLessThanOrEqual(NOTE_MAX);
    expect(long.endsWith("\nQuestions: office@birchlane.example.com")).toBe(true);
    expect(invoiceRequest({ ...input, job_summary: "Dryer repair", business_email: "office@birchlane.example.com" }).detail.note).toContain("Questions: office@birchlane.example.com");
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
