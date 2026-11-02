/**
 * Who's asking, so a shared demo site doesn't mix everyone's jobs and prices. It's a tidiness
 * scope, not a login: the id only decides which jobs and learned prices a browser sees.
 */
export const VISITOR_HEADER = "x-say-visitor";

export const newVisitorId = () => `v_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;

export function visitorOf(req: Request): string | undefined {
  const id = req.headers.get(VISITOR_HEADER);
  return id && /^v_[a-z0-9]{6,40}$/.test(id) ? id : undefined;
}
