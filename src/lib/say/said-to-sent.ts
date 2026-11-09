/**
 * Said to sent: how long from the words reaching the app to PayPal sending the invoice. Plain code,
 * shared by the browser and the server. The start is stamped by the server when the recording
 * arrives (or the sample starts), the end is the audit log's record of the send.
 */

/** A recording kept on the phone and read later doesn't count from when it was first heard. */
export const SAID_AT_MAX_AGE_MS = 30 * 60_000;

export const secondsBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000));

/** The server's own time the recording arrived, if it's recent; otherwise the time this request came in. */
export function saidAtFrom(heardAt: string | undefined, receivedAt: Date): string {
  const heard = heardAt ? Date.parse(heardAt) : NaN;
  const fresh = Number.isFinite(heard) && heard <= receivedAt.getTime() && receivedAt.getTime() - heard <= SAID_AT_MAX_AGE_MS;
  return fresh ? new Date(heard).toISOString() : receivedAt.toISOString();
}

/** "Said to sent: 48 s", "Said to sent: 2 min 5 s" */
export function saidToSentText(seconds: number): string {
  if (seconds < 60) return `Said to sent: ${seconds} s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `Said to sent: ${min} min${sec ? ` ${sec} s` : ""}`;
}
