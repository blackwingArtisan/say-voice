import { route } from "@/lib/http";
import { CONTACTS } from "@/lib/say/contacts";

export const GET = route(async () => ({ contacts: CONTACTS }));
