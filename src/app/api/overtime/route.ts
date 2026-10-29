import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import {
  getOvertimeReport,
  saveOvertimeReport,
} from "@/domain/overtime-service";
import { MAX_OVERTIME_MINUTES_PER_DAY } from "@/domain/overtime";

const overtimeTotalSchema = z
  .number()
  .int()
  .min(5)
  .max(MAX_OVERTIME_MINUTES_PER_DAY)
  .multipleOf(5);

const saveSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  version: z.number().int().positive(),
  zeroConfirmed: z.boolean(),
  entries: z.record(z.iso.date(), overtimeTotalSchema),
});

export async function GET(request: Request) {
  const user = await requireUser();
  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));
  if (!Number.isInteger(year) || month < 1 || month > 12)
    return NextResponse.json({ error: "Некорректный период" }, { status: 400 });
  return NextResponse.json(await getOvertimeReport(user, year, month));
}

export async function PUT(request: Request) {
  const user = await requireUser();
  const input = saveSchema.safeParse(await request.json());
  if (!input.success)
    return NextResponse.json(
      { error: "Проверьте заполненные данные" },
      { status: 400 },
    );
  try {
    return NextResponse.json(await saveOvertimeReport({ user, ...input.data }));
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CONFLICT")
      return NextResponse.json(
        { error: "Данные изменились в другой вкладке. Обновите страницу." },
        { status: 409 },
      );
    if (error instanceof Error && error.message === "REPORT_READ_ONLY")
      return NextResponse.json(
        {
          error: "Отправленный отчёт нельзя изменить без повторного открытия.",
        },
        { status: 409 },
      );
    throw error;
  }
}
