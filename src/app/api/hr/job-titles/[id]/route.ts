import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, jobTitles } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  isActive: z.boolean(),
});

export async function PUT(
  request: Request,
  context: RouteContext<"/api/hr/job-titles/[id]">,
) {
  const actor = await requireHr();
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте название должности" },
      { status: 400 },
    );
  try {
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(jobTitles)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(
            eq(jobTitles.id, id),
            eq(jobTitles.organizationId, actor.organizationId),
          ),
        )
        .returning({ id: jobTitles.id });
      if (!row) throw new Error("NOT_FOUND");
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "job_title.updated",
        objectType: "job_title",
        objectId: id,
        metadata: parsed.data,
      });
      return row;
    });
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "NOT_FOUND"
            ? "Должность не найдена"
            : "Должность с таким названием уже существует",
      },
      { status: message === "NOT_FOUND" ? 404 : 409 },
    );
  }
}
