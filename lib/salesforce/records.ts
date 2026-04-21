import "server-only";
import type { Connection } from "jsforce";

export interface CreateRecordInput {
  objectApiName: string;
  fields: Record<string, unknown>;
}

export async function createRecord(conn: Connection, input: CreateRecordInput) {
  const result = await conn.sobject(input.objectApiName).create(input.fields as Record<string, unknown>);
  if (Array.isArray(result)) throw new Error("Unexpected bulk result from createRecord");
  if (!result.success) {
    const errors = (result as any).errors as Array<{ message: string }> | undefined;
    throw new Error(errors?.map((e) => e.message).join("; ") || "SObject create failed");
  }
  return { id: result.id as string, success: true };
}

export interface AssignPermissionSetInput {
  permissionSetId: string;
  assigneeId: string;
}

export async function assignPermissionSet(conn: Connection, input: AssignPermissionSetInput) {
  const result = await conn.sobject("PermissionSetAssignment").create({
    PermissionSetId: input.permissionSetId,
    AssigneeId: input.assigneeId,
  });
  if (Array.isArray(result)) throw new Error("Unexpected bulk result from assignPermissionSet");
  if (!result.success) {
    const errors = (result as any).errors as Array<{ message: string }> | undefined;
    throw new Error(errors?.map((e) => e.message).join("; ") || "PermissionSetAssignment create failed");
  }
  return { id: result.id as string, success: true };
}

// ── dmlRecords ────────────────────────────────────────────────────────────────

export interface DmlInput {
  objectApiName: string;
  operation: "insert" | "update" | "delete" | "upsert";
  records: Record<string, unknown>[];
  externalIdField?: string;
}

export async function dmlRecords(conn: Connection, input: DmlInput) {
  const { objectApiName, operation, records, externalIdField } = input;
  let raw: unknown;

  if (operation === "insert") {
    raw = await conn.sobject(objectApiName).create(records as any);
  } else if (operation === "update") {
    raw = await conn.sobject(objectApiName).update(records as any);
  } else if (operation === "delete") {
    const ids = records.map((r) => r.Id as string);
    raw = await conn.sobject(objectApiName).destroy(ids);
  } else {
    if (!externalIdField) throw new Error("externalIdField is required for upsert");
    raw = await conn.sobject(objectApiName).upsert(records as any, externalIdField);
  }

  const results: Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }> =
    Array.isArray(raw) ? raw : [raw as any];
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) {
    const msg = failures.map((r) => r.errors?.map((e) => e.message).join("; ") ?? "unknown").join("; ");
    throw new Error(`DML ${operation} failed: ${msg}`);
  }
  return results.map((r) => ({ id: r.id, success: true }));
}
