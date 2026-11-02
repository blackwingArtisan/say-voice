import { route } from "@/lib/http";
import { priceBook } from "@/lib/say/price-store";

export const GET = route(async () => ({ prices: priceBook() }));
