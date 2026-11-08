import { describe, expect, it } from "vitest";
import { getAuditLog } from "@/lib/agent/audit";
import { getApprovals } from "@/lib/agent/approvals";
import { getPayPal } from "@/lib/paypal";
import { EXAMPLE_APPROVER, EXAMPLE_JOB_ID, ensureExampleJob, exampleJob } from "@/lib/say/example-job";
import { listJobs } from "@/lib/say/jobs";
import { priceBook } from "@/lib/say/price-store";
import { SAMPLE_AMOUNTS } from "@/lib/say/sample";
import { isPaid } from "@/lib/say/types";

describe("a first visit opens on a finished sample job", () => {
  it("is the sample job, put right, sent through the approval gate and paid, made once", async () => {
    const job = await ensureExampleJob();
    expect(job).toMatchObject({ id: EXAMPLE_JOB_ID, example: true, status: "sent", source: "sample" });
    expect(job!.lines.map((l) => l.unitCents)).toContain(SAMPLE_AMOUNTS.spokenElementCents);
    expect(job!.heardLines.map((l) => l.unitCents)).toContain(SAMPLE_AMOUNTS.heardElementCents);
    expect(job!.invoice?.totalCents).toBe(SAMPLE_AMOUNTS.spokenTotalCents);
    expect(isPaid(job!.invoice)).toBe(true);

    // Through the gate, like any job: an approval, decided by the sample, and PayPal's own record.
    const approval = getApprovals().list({ runId: job!.runId })[0];
    expect(approval).toMatchObject({ state: "approved", decidedBy: EXAMPLE_APPROVER });
    expect(getAuditLog().list({ runId: job!.runId }).map((e) => e.action)).toEqual(expect.arrayContaining(["approval.requested", "approval.approved", "tool.executed"]));
    const invoice = await getPayPal().invoicing.get(job!.invoice!.id);
    expect(invoice.status).toBe("PAID");

    const again = await ensureExampleJob();
    expect(again!.invoice!.id).toBe(job!.invoice!.id);
    expect(exampleJob()!.invoice!.id).toBe(job!.invoice!.id);
  });

  it("is shown apart from anyone's own jobs, and teaches no one's price book", async () => {
    await ensureExampleJob();
    const visitor = `v_${Math.random()}`;
    expect(listJobs(visitor).map((j) => j.id)).not.toContain(EXAMPLE_JOB_ID);
    expect(listJobs(undefined).map((j) => j.id)).not.toContain(EXAMPLE_JOB_ID);
    const element = priceBook(undefined).find((e) => e.name === "Heating element")!;
    expect(element.sentHere).toBeUndefined();
  });
});
