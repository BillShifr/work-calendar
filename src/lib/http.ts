import { NextResponse } from "next/server";

export function relativeRedirect(path: string, status = 303) {
  const response = NextResponse.redirect(
    new URL(path, "http://localhost"),
    status,
  );
  response.headers.set("location", path);
  return response;
}
