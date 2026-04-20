import "server-only";
import type { Connection } from "jsforce";

// ── helpers ──────────────────────────────────────────────────────────────────

function extractErrors(r: { success: boolean; errors?: unknown }): string {
  if (!r.errors) return "Metadata deploy failed";
  const errs = Array.isArray(r.errors) ? r.errors : [r.errors];
  return (errs as Array<{ message?: string }>).map((e) => e.message ?? String(e)).join("; ");
}

// ── createCustomField ────────────────────────────────────────────────────────

export interface CreateCustomFieldInput {
  objectApiName: string;
  fieldApiName: string;
  label: string;
  type: "Text" | "TextArea" | "Checkbox" | "Number" | "Date" | "DateTime" | "Email" | "Phone" | "Url";
  length?: number;
  required?: boolean;
  description?: string;
}

export async function createCustomField(conn: Connection, input: CreateCustomFieldInput) {
  const result = await (conn.metadata.create as Function)("CustomField", {
    fullName: `${input.objectApiName}.${input.fieldApiName}`,
    label: input.label,
    type: input.type,
    ...(input.length !== undefined ? { length: input.length } : {}),
    required: input.required ?? false,
    ...(input.description ? { description: input.description } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));
  return { fullName: r.fullName as string, success: true };
}

// ── createCustomObject ───────────────────────────────────────────────────────

export interface CreateCustomObjectInput {
  apiName: string;
  label: string;
  pluralLabel: string;
  nameFieldLabel?: string;
  description?: string;
}

export async function createCustomObject(conn: Connection, input: CreateCustomObjectInput) {
  const result = await (conn.metadata.create as Function)("CustomObject", {
    fullName: input.apiName,
    label: input.label,
    pluralLabel: input.pluralLabel,
    nameField: { type: "Text", label: input.nameFieldLabel ?? "Name" },
    deploymentStatus: "Deployed",
    sharingModel: "ReadWrite",
    ...(input.description ? { description: input.description } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));
  return { fullName: r.fullName as string, success: true };
}

// ── createPermissionSet ──────────────────────────────────────────────────────

export interface CreatePermissionSetInput {
  apiName: string;
  label: string;
  description?: string;
}

export async function createPermissionSet(conn: Connection, input: CreatePermissionSetInput) {
  const result = await (conn.metadata.create as Function)("PermissionSet", {
    fullName: input.apiName,
    label: input.label,
    ...(input.description ? { description: input.description } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));

  // Metadata API does not return the record ID — query it by Name
  const soql = await conn.query<{ Id: string }>(
    `SELECT Id FROM PermissionSet WHERE Name = '${input.apiName.replace(/'/g, "''")}' LIMIT 1`,
  );
  const id = soql.records[0]?.Id;
  if (!id) throw new Error("PermissionSet created but could not retrieve its Salesforce ID");
  return { id, fullName: r.fullName as string, success: true };
}
