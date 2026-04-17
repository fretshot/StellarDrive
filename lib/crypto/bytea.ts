import "server-only";

/**
 * Serialize a Buffer for insertion into a Postgres `bytea` column via
 * PostgREST (JSON body). Postgres accepts hex-format bytea as `\x<hex>`.
 * We avoid handing raw Buffers to supabase-js because its JSON serializer
 * would call `Buffer.prototype.toJSON()` and persist the bytes of a JSON
 * object, not the raw bytes.
 */
export function byteaForInsert(buf: Buffer): string {
  return "\\x" + buf.toString("hex");
}

/**
 * Decode a bytea value returned by PostgREST. PostgREST's default is the
 * hex format (`\x<hex>`). Some older flows return base64; we also accept
 * Buffer / Uint8Array in case upstream SDK internals change.
 */
export function byteaFromSelect(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === "string") {
    if (value.startsWith("\\x")) return Buffer.from(value.slice(2), "hex");
    // Fall back to base64 for older-format rows, if any.
    return Buffer.from(value, "base64");
  }
  throw new Error("Unexpected bytea representation");
}
