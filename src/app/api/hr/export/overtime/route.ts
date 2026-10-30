import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { buildOvertimeSummaryWorkbook } from "@/domain/overtime-export";
import { requireHr } from "@/lib/auth";

const yearSchema = z.number().int().min(2020).max(2100);

export async function GET(request: Request) {
  const actor = await requireHr();
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!yearSchema.safeParse(year).success)
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  const workbook = await buildOvertimeSummaryWorkbook(
    actor.organizationId,
    year,
  );
  const data = await workbook.xlsx.writeBuffer();
  await db.insert(auditEvents).values({
    organizationId: actor.organizationId,
    actorId: actor.id,
    action: "overtime_summary.exported",
    objectType: "overtime_summary",
    objectId: String(year),
    metadata: { year, format: "xlsx" },
  });
  const filename = `tfoms-overtime-summary-${year}.xlsx`;
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}
