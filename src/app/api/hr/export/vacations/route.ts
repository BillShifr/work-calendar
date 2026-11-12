import { PassThrough } from "node:stream";
import archiver from "archiver";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { buildVacationExportBundles } from "@/domain/vacation-export";
import { requireHr } from "@/lib/auth";

const yearSchema = z.number().int().min(2020).max(2100);

function safeArchiveName(value: string) {
  return value
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

async function zipBuffers(
  entries: Array<{ name: string; buffer: Buffer }>,
): Promise<Buffer> {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const sink = new PassThrough();
  const chunks: Buffer[] = [];
  sink.on("data", (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  const completed = new Promise<Buffer>((resolve, reject) => {
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);
    archive.on("error", reject);
  });
  archive.pipe(sink);
  for (const entry of entries) {
    archive.append(entry.buffer, { name: entry.name });
  }
  await archive.finalize();
  return completed;
}

export async function GET(request: Request) {
  const actor = await requireHr();
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  if (!yearSchema.safeParse(year).success)
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });

  const bundle = await buildVacationExportBundles(actor.organizationId, year);
  if (!bundle.employees.length)
    return NextResponse.json(
      { error: "Нет отправленных планов отпуска за выбранный год" },
      { status: 404 },
    );

  const zipEntries = [
    { name: bundle.tableFilename, buffer: bundle.tableBuffer },
    ...bundle.chessboards.map((item) => ({
      name: `Приложение 2 - ${safeArchiveName(item.departmentName)}.xlsx`,
      buffer: item.buffer,
    })),
  ];
  const data = await zipBuffers(zipEntries);

  await db.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "vacation_plans.exported",
    objectType: "vacation_plans",
    objectId: String(year),
    metadata: {
      year,
      format: "zip",
      employeeCount: bundle.employees.length,
      departmentCount: bundle.chessboards.length,
    },
  });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${bundle.archiveName}"`,
      "cache-control": "no-store",
    },
  });
}
