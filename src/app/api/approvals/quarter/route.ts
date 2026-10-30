import { NextResponse } from "next/server";
import { z } from "zod";
import { approveDepartmentQuarter } from "@/domain/department-approval-service";
import { requireDepartmentApprover } from "@/lib/auth";

const schema = z.object({
  departmentId: z.uuid(),
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
});

export async function POST(request: Request) {
  const actor = await requireDepartmentApprover();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ error: "Некорректный период" }, { status: 400 });
  try {
    return NextResponse.json(
      await approveDepartmentQuarter({ actor, ...parsed.data }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!["INCOMPLETE", "FORBIDDEN"].includes(message)) {
      console.error("Quarter approval failed", error);
    }
    return NextResponse.json(
      {
        error:
          message === "INCOMPLETE"
            ? "Не все сотрудники отправили отчёты за три месяца квартала"
            : message === "FORBIDDEN"
              ? "Нет прав на согласование этого подразделения"
              : "Не удалось согласовать квартал",
      },
      {
        status:
          message === "INCOMPLETE" ? 409 : message === "FORBIDDEN" ? 403 : 500,
      },
    );
  }
}
