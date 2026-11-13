import { createWriteStream } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { analyticsEventRepository } from "../repositories/analytics-event.repository";
import { exportFileName, toExportRow, utcDayRange } from "./export-row";

export interface AnalyticsExportResult {
  day: string;
  file: string;
  count: number;
}

/**
 * Writes every event that occurred on the UTC `day` to
 * `<outDir>/events-<day>.jsonl.gz`, one row per line (export-row.ts).
 * Streams from Mongo, writes to a temp file and renames it, so a reader
 * never sees a half-written day. A day with no events still gets an empty
 * file, so "exported, nothing happened" differs from "not exported".
 */
export async function exportAnalyticsDay(
  day: string,
  outDir: string,
): Promise<AnalyticsExportResult> {
  const { start, end } = utcDayRange(day);
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, exportFileName(day));
  const tmp = `${file}.tmp`;

  let count = 0;
  async function* lines() {
    for await (const doc of analyticsEventRepository.streamOccurredBetween(
      start,
      end,
    )) {
      count += 1;
      yield `${JSON.stringify(toExportRow(doc))}\n`;
    }
  }

  try {
    await pipeline(
      Readable.from(lines()),
      createGzip(),
      createWriteStream(tmp),
    );
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
  return { day, file, count };
}
