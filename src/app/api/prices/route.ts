import { route } from "@/lib/http";
import { priceBook } from "@/lib/say/price-store";
import { visitorOf } from "@/lib/say/visitor";

export const GET = route(async (req) => ({ prices: priceBook(visitorOf(req)) }));
