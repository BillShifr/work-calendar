import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, departments } from "@/db/schema";
import { requireHr } from "@/lib/auth";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  headcount: z.number().int().min(0).max(100_000),
});

export async function POST(request: Request) {
  const actor = await requireHr();
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: "Проверьте название и численность" },
      { status: 400 },
    );
  const input = parsed.data;
  try {
    const created = await db.transaction(async (tx) => {
      const [department] = await tx
        .insert(departments)
        .values({
          organizationId: actor.organizationId,
          name: input.name,
          headcount: input.headcount,
        })
        .returning();
      await tx.insert(auditEvents).values({
        organizationId: actor.organizationId,
        actorId: actor.id,
        action: "department.created",
        objectType: "department",
        objectId: department.id,
        metadata: input,
      });
      return department;
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Подразделение с таким названием уже существует" },
      { status: 409 },
    );
  }
}
