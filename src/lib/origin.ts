export function sessionCookieSecure(origin: string | undefined): boolean {
  if (!origin) return false;
  const protocol = new URL(origin).protocol;
  if (protocol === "http:") return false;
  if (protocol === "https:") return true;
  throw new Error("APP_ORIGIN must use http or https");
}
