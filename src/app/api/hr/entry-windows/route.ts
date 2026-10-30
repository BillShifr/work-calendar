import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getEntryWindowsForYear,
  setEntryWindow,
} from "@/domain/entry-window-service";
import { requireHr } from "@/lib/auth";

const yearSchema = z.number().int().min(2020).max(2100);
const updateSchema = z.object({
  kind: z.enum(["vacation", "overtime"]),
  year: yearSchema,
  month: z.number().int().min(0).max(12),
  isOpen: z.boolean(),
});

export async function GET(request: Request) {
  const actor = await requireHr();
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!yearSchema.safeParse(year).success)
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  return NextResponse.json(
    await getEntryWindowsForYear(actor.organizationId, year),
  );
}

export async function PUT(request: Request) {
  const actor = await requireHr();
  const parsed = updateSchema.safeParse(await request.json());
  if (
    !parsed.success ||
    (parsed.data.kind === "vacation" && parsed.data.month !== 0) ||
    (parsed.data.kind === "overtime" && parsed.data.month === 0)
  )
    return NextResponse.json({ error: "Некорректный период" }, { status: 400 });
  return NextResponse.json(await setEntryWindow({ actor, ...parsed.data }));
}
