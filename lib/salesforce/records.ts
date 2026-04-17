import "server-only";
import type { Connection } from "jsforce";

/**
 * SObject DML. Phase 1: CREATE only.
 *
 * TODO(milestone-8): implement using conn.sobject(name).create(payload).
 */

export interface CreateRecordInput {
  objectApiName: string;
  fields: Record<string, unknown>;
}

export async function createRecord(_conn: Connection, _input: CreateRecordInput) {
  throw new Error("records.createRecord not implemented yet (milestone-8)");
}

export interface AssignPermissionSetInput {
  permissionSetId: string;
  assigneeId: string; // User.Id
}

export async function assignPermissionSet(
  _conn: Connection,
  _input: AssignPermissionSetInput,
) {
  throw new Error("records.assignPermissionSet not implemented yet (milestone-8)");
}
