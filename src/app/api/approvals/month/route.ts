import { NextResponse } from "next/server";
import { z } from "zod";
import { approveDepartmentMonth } from "@/domain/department-approval-service";
import { requireUser } from "@/lib/auth";

const schema = z.object({
  departmentId: z.uuid(),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(request: Request) {
  const actor = await requireUser();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Некорректный период" }, { status: 400 });
  try {
    return NextResponse.json(
      await approveDepartmentMonth({ actor, ...parsed.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!["INCOMPLETE", "FORBIDDEN"].includes(message)) {
      console.error("Month approval failed", error);
    }
    return NextResponse.json(
      {
        error:
          message === "INCOMPLETE"
            ? "Не все сотрудники отправили отчёты за этот месяц"
            : message === "FORBIDDEN"
              ? "Нет прав на согласование этого подразделения"
              : "Не удалось согласовать месяц",
      },
      {
        status:
          message === "INCOMPLETE" ? 409 : message === "FORBIDDEN" ? 403 : 500,
      },
    );
  }
}
