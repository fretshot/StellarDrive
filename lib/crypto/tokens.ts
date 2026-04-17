import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

function key(): Buffer {
  return Buffer.from(env().TOKEN_ENCRYPTION_KEY, "base64");
}

/**
 * Encrypts `plaintext` with AES-256-GCM. Returns `{ ct, iv }` as Buffers.
 * The auth tag is appended to the ciphertext so a single column holds both.
 */
export function encryptToken(plaintext: string): { ct: Buffer; iv: Buffer } {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ct: Buffer.concat([enc, tag]), iv };
}

export function decryptToken(ct: Buffer, iv: Buffer): string {
  if (ct.length <= TAG_BYTES) throw new Error("ciphertext too short");
  const enc = ct.subarray(0, ct.length - TAG_BYTES);
  const tag = ct.subarray(ct.length - TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
