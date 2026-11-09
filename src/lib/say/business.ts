/**
 * Your business: the trade name on this visitor's invoices and the customers they added. Kept per
 * browser, like the price book, so one visitor's name never goes out on another's invoice. Until a
 * visitor sets a name, invoices go out as the demo trade. Server only.
 */
import { appConfig } from "@/app.config";
import { collection } from "@/lib/store/collection";
import { CONTACTS, isTestAddress, TEST_ADDRESS_RULE, type Contact } from "./contacts";

export const TRADE_NAME_MAX = 80;
export const BUSINESS_EMAIL_MAX = 120;
/** A visitor's own customers, newest first, up to this many. */
export const OWN_CONTACTS_MAX = 30;

export interface Business {
  id: string;
  visitor: string;
  tradeName?: string;
  /** Where the trade's customers can ask: it ends the note on each invoice. */
  email?: string;
  /** The first-run step was done or skipped: it doesn't come back, even if the name is cleared later. */
  firstRunDone?: boolean;
  contacts: Contact[];
  updatedAt: string;
}

const businesses = () => collection<Business>("business");
const keyOf = (visitor: string) => `b_${visitor}`;

export const businessOf = (visitor?: string) => (visitor ? (businesses().get(keyOf(visitor)) ?? null) : null);

/** The name PayPal shows the customer for this visitor's invoices. */
export const tradeNameFor = (visitor?: string) => businessOf(visitor)?.tradeName || appConfig.tradeName;

/** This visitor's customers first, then the demo ones. */
export const contactsFor = (visitor?: string): Contact[] => [...(businessOf(visitor)?.contacts ?? []), ...CONTACTS];

/** The trade's own email, for the note on its invoices. None until it gives one. */
export const businessEmailFor = (visitor?: string) => businessOf(visitor)?.email;

/** A first visit: no name of its own yet, and the step not skipped. */
export const isFirstRun = (visitor?: string) => {
  const business = businessOf(visitor);
  return !business?.tradeName && !business?.firstRunDone;
};

const save = (visitor: string, patch: Partial<Pick<Business, "tradeName" | "email" | "firstRunDone" | "contacts">>) => {
  const now = businessOf(visitor) ?? { id: keyOf(visitor), visitor, contacts: [], updatedAt: "" };
  return businesses().upsert({ ...now, ...patch, updatedAt: new Date().toISOString() });
};

/** Letters, numbers and ordinary business punctuation, one line. Empty goes back to the demo name. */
export function cleanTradeName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, TRADE_NAME_MAX);
}

export function setTradeName(visitor: string, raw: string): Business {
  const tradeName = cleanTradeName(raw);
  return save(visitor, { tradeName: tradeName || undefined });
}

export class ContactProblem extends Error {}

/** An email of the trade's own, or nothing. It is shown to its customers, never sent to. */
export function cleanBusinessEmail(raw: string): string | undefined {
  const email = raw.trim().toLowerCase();
  if (!email) return undefined;
  if (email.length > BUSINESS_EMAIL_MAX || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw new ContactProblem("That email doesn't look complete.");
  return email;
}

/** The first-run step: a name (and an email) of its own, or Skip, which keeps the demo name. */
export function setBusiness(visitor: string, input: { tradeName?: string; email?: string; skip?: boolean }): Business {
  if (input.skip) return save(visitor, { firstRunDone: true });
  const email = input.email === undefined ? businessOf(visitor)?.email : cleanBusinessEmail(input.email);
  const tradeName = input.tradeName === undefined ? businessOf(visitor)?.tradeName : cleanTradeName(input.tradeName) || undefined;
  return save(visitor, { tradeName, email, firstRunDone: true });
}

export function addContact(visitor: string, input: { name: string; email: string; note?: string }): Contact {
  const name = input.name.replace(/\s+/g, " ").trim().slice(0, 80);
  const email = input.email.trim().toLowerCase();
  if (!name) throw new ContactProblem("Add the customer's name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ContactProblem("That email doesn't look complete.");
  if (!isTestAddress(email)) throw new ContactProblem(`${TEST_ADDRESS_RULE} Use something like name@example.com.`);
  const mine = businessOf(visitor)?.contacts ?? [];
  const same = mine.find((c) => c.email === email);
  const contact: Contact = { id: same?.id ?? `c_${Math.random().toString(36).slice(2, 10)}`, name, email, note: (input.note ?? "").trim().slice(0, 60) || "Added by you" };
  save(visitor, { contacts: [contact, ...mine.filter((c) => c.email !== email)].slice(0, OWN_CONTACTS_MAX) });
  return contact;
}
