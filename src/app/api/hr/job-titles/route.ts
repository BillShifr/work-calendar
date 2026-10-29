import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, jobTitles } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({ name: z.string().trim().min(2).max(160) });

export async function POST(request: Request) {
  const actor = await requireHr();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Укажите название должности" },
      { status: 400 },
    );
  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: jobTitles.id, isActive: jobTitles.isActive })
        .from(jobTitles)
        .where(
          and(
            eq(jobTitles.organizationId, actor.organizationId),
            eq(jobTitles.name, parsed.data.name),
          ),
        )
        .limit(1);
      if (existing) throw new Error("DUPLICATE");
      const [created] = await tx
        .insert(jobTitles)
        .values({
          organizationId: actor.organizationId,
          name: parsed.data.name,
        })
        .returning({ id: jobTitles.id });
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "job_title.created",
        objectType: "job_title",
        objectId: created.id,
        metadata: { name: parsed.data.name },
      });
      return created;
    });
    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Такая должность уже существует" },
      { status: 409 },
    );
  }
}
