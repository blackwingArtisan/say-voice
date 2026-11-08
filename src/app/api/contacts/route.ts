import { z } from "zod";
import { HttpError, readJson, route } from "@/lib/http";
import { addContact, ContactProblem, contactsFor } from "@/lib/say/business";
import { visitorOf } from "@/lib/say/visitor";

/** This browser's own customers first, then the demo ones. */
export const GET = route(async (req) => ({ contacts: contactsFor(visitorOf(req)) }));

const Body = z.object({ name: z.string().max(200), email: z.string().max(200), note: z.string().max(200).optional() });

/** Adds a customer to this browser's contacts. Test addresses only, the same rule the Guard keeps. */
export const POST = route(async (req) => {
  const visitor = visitorOf(req);
  if (!visitor) throw new HttpError(400, "Reload the page, then add the customer again.");
  try {
    return { contact: addContact(visitor, await readJson(req, Body)), contacts: contactsFor(visitor) };
  } catch (e) {
    if (e instanceof ContactProblem) throw new HttpError(400, e.message, "CONTACT_PROBLEM");
    throw e;
  }
});
