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
