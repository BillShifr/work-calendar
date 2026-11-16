import { NextResponse } from "next/server";
import { deleteOvertimeReport } from "@/domain/overtime-service";
import { requireUser } from "@/lib/auth";

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/overtime/[id]">,
) {
  const actor = await requireUser();
  const { id } = await context.params;
  try {
    return NextResponse.json(
      await deleteOvertimeReport({ actor, reportId: id }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "FORBIDDEN")
      return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
    if (message === "NOT_FOUND")
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    if (message === "READ_ONLY")
      return NextResponse.json(
        { error: "Этот период нельзя удалить" },
        { status: 409 },
      );
    console.error("Overtime delete failed", error);
    return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
  }
}
