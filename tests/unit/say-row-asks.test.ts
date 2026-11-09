import { describe, expect, it } from "vitest";
import { rowAsks, type Check } from "@/lib/say/checks";

// The day-one element line as a live run can read it: the code's sound-alike catch, plus an AI note on the same line.
const alike: Check = { id: "alike:2", kind: "alike", lineKey: "2", text: 'Check this amount: "fifteen" or "fifty"?', alikeCents: 5_000 };
const note: Check = { id: "flag:0", kind: "flag", lineKey: "2", text: "Heating element: part number not said." };

describe("what a line's row asks", () => {
  it("on a phone, leaves the catch to its card even when an AI note keeps the row open", () => {
    const asks = rowAsks([alike, note], [alike.id, note.id], true);
    expect(asks.inCard(alike)).toBe(true);
    expect(asks.inCard(note)).toBe(false);
    expect(asks.group).toBe(true);
    expect(asks.settles).toEqual([note.id]);
  });

  it("on a phone, asks nothing on the row when the catch is the only check", () => {
    const asks = rowAsks([alike], [alike.id], true);
    expect(asks.group).toBe(false);
    expect(asks.settles).toEqual([]);
  });

  it("on a phone, asks nothing once the note is settled and only the catch is left", () => {
    expect(rowAsks([alike, note], [alike.id], true).group).toBe(false);
  });

  it("on a desktop, asks everything on the row and settles it all with one tap", () => {
    const asks = rowAsks([alike, note], [alike.id, note.id], false);
    expect(asks.inCard(alike)).toBe(false);
    expect(asks.group).toBe(true);
    expect(asks.settles).toEqual([alike.id, note.id]);
  });
});
