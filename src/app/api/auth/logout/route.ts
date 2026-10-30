import { destroySession } from "@/lib/auth";
import { relativeRedirect } from "@/lib/http";

export async function POST() {
  await destroySession();
  return relativeRedirect("/login");
}
