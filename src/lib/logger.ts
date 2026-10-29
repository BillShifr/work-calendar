import pino from "pino";

export const logger = pino({
  name: "tfoms-time",
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "tokenHash",
      "cookie",
      "authorization",
      "*.password",
      "*.token",
    ],
    censor: "[REDACTED]",
  },
});
