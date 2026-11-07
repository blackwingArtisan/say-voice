/** Fictional customers. Names always come from this list or from typing, never from speech. */
import { SAMPLE_CONTACT_ID } from "./sample";

export interface Contact {
  id: string;
  name: string;
  email: string;
  note: string;
}

export const CONTACTS: Contact[] = [
  { id: SAMPLE_CONTACT_ID, name: "Derek Evans", email: "derek.evans@example.com", note: "Dryer, Birch Road" },
  { id: "priya-raghunathan", name: "Priya Raghunathan", email: "priya.raghunathan@example.com", note: "Landlord account" },
  { id: "tom-baker", name: "Tom Baker", email: "tom.baker@example.com", note: "Elm Street" },
  { id: "margaret-collins", name: "Margaret Collins", email: "margaret.collins@example.com", note: "Garage rewire" },
  { id: "sofia-rodriguez", name: "Sofia Rodriguez", email: "sofia.rodriguez@example.com", note: "Shelves, next quote" },
  { id: "wei-zhang", name: "Wei Zhang", email: "wei.zhang@example.com", note: "Yearly furnace visit" },
];

/** The Guard's payee allowlist, for the screens. A unit test keeps the two in step. */
export const isTestAddress = (email: string) => /@((personal|business)\.)?example\.com$/i.test(email.trim());

export const TEST_ADDRESS_RULE = "This is a test site, so invoices can only go to made-up addresses ending in @example.com.";

export const TEST_ADDRESS_REFUSED = `${TEST_ADDRESS_RULE} Nothing was sent. Change the customer email to something like name@example.com, then send again.`;

export const contactById = (id: string) => CONTACTS.find((c) => c.id === id);
