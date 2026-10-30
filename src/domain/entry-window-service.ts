import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, entryWindows } from "@/db/schema";

export type EntryWindowKind = "vacation" | "overtime";

export async function isEntryWindowOpen(
  organizationId: string,
  kind: EntryWindowKind,
  year: number,
  month = 0,
): Promise<boolean> {
  const [window] = await db
    .select({ isOpen: entryWindows.isOpen })
    .from(entryWindows)
    .where(
      and(
        eq(entryWindows.organizationId, organizationId),
        eq(entryWindows.kind, kind),
        eq(entryWindows.year, year),
        eq(entryWindows.month, month),
      ),
    )
    .limit(1);
  return window?.isOpen ?? false;
}

export async function getEntryWindowsForYear(
  organizationId: string,
  year: number,
) {
  const rows = await db
    .select({
      kind: entryWindows.kind,
      month: entryWindows.month,
      isOpen: entryWindows.isOpen,
    })
    .from(entryWindows)
    .where(
      and(
        eq(entryWindows.organizationId, organizationId),
        eq(entryWindows.year, year),
      ),
    );
  const vacation = rows.find((row) => row.kind === "vacation");
  const overtime = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [index + 1, false]),
  ) as Record<number, boolean>;
  for (const row of rows)
    if (row.kind === "overtime") overtime[row.month] = row.isOpen;
  return { year, vacationOpen: vacation?.isOpen ?? false, overtime };
}

export async function setEntryWindow(input: {
  actor: { id: string; organizationId: string; role: string };
  kind: EntryWindowKind;
  year: number;
  month: number;
  isOpen: boolean;
}) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .insert(entryWindows)
      .values({
        organizationId: input.actor.organizationId,
        kind: input.kind,
        year: input.year,
        month: input.month,
        isOpen: input.isOpen,
        updatedBy: input.actor.id,
      })
      .onConflictDoUpdate({
        target: [
          entryWindows.organizationId,
          entryWindows.kind,
          entryWindows.year,
          entryWindows.month,
        ],
        set: {
          isOpen: input.isOpen,
          updatedBy: input.actor.id,
          updatedAt: new Date(),
        },
      })
      .returning();
    await tx.insert(auditEvents).values({
      organizationId: input.actor.organizationId,
      actorId: input.actor.id,
      action: input.isOpen ? "entry_window.opened" : "entry_window.closed",
      objectType: "entry_window",
      objectId: `${input.kind}:${input.year}:${input.month}`,
      metadata: {
        kind: input.kind,
        year: input.year,
        month: input.month,
        isOpen: input.isOpen,
      },
    });
    return updated;
  });
}
