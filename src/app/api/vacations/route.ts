import { NextResponse } from "next/server";
import { z } from "zod";
import { getVacationPlan, saveVacationPlan } from "@/domain/vacation-service";
import { requireUser } from "@/lib/auth";

const periodSchema = z.object({
  id: z.string().min(1),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
  source: z.enum(["employee", "hr"]),
  status: z.enum(["draft", "approved"]).optional(),
});
const saveSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  version: z.number().int().positive(),
  periods: z.array(periodSchema).max(12),
});

export async function GET(request: Request) {
  const user = await requireUser();
  const year = Number(new URL(request.url).searchParams.get("year"));
  if (!Number.isInteger(year))
    return NextResponse.json({ error: "Некорректный год" }, { status: 400 });
  return NextResponse.json(await getVacationPlan(user, year));
}
export async function PUT(request: Request) {
  const user = await requireUser();
  const input = saveSchema.safeParse(await request.json());
  if (!input.success)
    return NextResponse.json({ error: "Проверьте периоды" }, { status: 400 });
  try {
    return NextResponse.json(await saveVacationPlan({ user, ...input.data }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known: Record<string, string> = {
      VERSION_CONFLICT: "План изменился в другой вкладке. Обновите страницу.",
      PERIODS_OVERLAP: "Ваши периоды пересекаются.",
      PERIOD_OUTSIDE_YEAR: "Период должен находиться внутри выбранного года.",
      PLAN_READ_ONLY:
        "Отправленный план нельзя изменить без повторного открытия.",
    };
    if (known[message])
      return NextResponse.json({ error: known[message] }, { status: 409 });
    throw error;
  }
}
