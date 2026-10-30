import pino from "pino";

export const logger = pino({
  name: "hr",
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
