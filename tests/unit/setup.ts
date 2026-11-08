/**
 * Test files run in parallel workers, and the JSON store is files on disk. One data dir per worker,
 * so one file's ledger.clear() can't empty another's ledger halfway through a test.
 */
import os from "node:os";
import path from "node:path";

process.env.KIT_DATA_DIR = path.join(os.tmpdir(), `kit-test-data-${process.pid}-${process.env.VITEST_POOL_ID ?? "0"}`);
