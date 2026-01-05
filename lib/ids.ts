import { randomBytes } from "crypto";

export function randomId(bytes = 9): string {
  return randomBytes(bytes).toString("base64url");
}

