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

// ── updateCustomObject ───────────────────────────────────────────────────────

export interface UpdateCustomObjectInput {
  apiName: string;
  label?: string;
  pluralLabel?: string;
  description?: string;
  sharingModel?: "Private" | "ReadWrite" | "Read" | "ControlledByParent";
}

export async function updateCustomObject(conn: Connection, input: UpdateCustomObjectInput) {
  const result = await (conn.metadata.update as Function)("CustomObject", {
    fullName: input.apiName,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.pluralLabel !== undefined ? { pluralLabel: input.pluralLabel } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.sharingModel !== undefined ? { sharingModel: input.sharingModel } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));
  return { fullName: r.fullName as string, success: true };
}

// ── updateCustomField ────────────────────────────────────────────────────────

export interface UpdateCustomFieldInput {
  objectApiName: string;
  fieldApiName: string;
  label?: string;
  description?: string;
  required?: boolean;
  length?: number;
}

export async function updateCustomField(conn: Connection, input: UpdateCustomFieldInput) {
  const result = await (conn.metadata.update as Function)("CustomField", {
    fullName: `${input.objectApiName}.${input.fieldApiName}`,
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.required !== undefined ? { required: input.required } : {}),
    ...(input.length !== undefined ? { length: input.length } : {}),
  });
  const r = Array.isArray(result) ? result[0] : result;
  if (!r.success) throw new Error(extractErrors(r));
  return { fullName: r.fullName as string, success: true };
}

// ── manageFieldPermissions ───────────────────────────────────────────────────

export interface ManageFieldPermissionsInput {
  objectApiName: string;
  fieldApiName: string;
  profiles: Array<{ name: string; readable: boolean; editable: boolean }>;
}

export async function manageFieldPermissions(conn: Connection, input: ManageFieldPermissionsInput) {
  const fieldFullName = `${input.objectApiName}.${input.fieldApiName}`;
  const updates = input.profiles.map((p) => ({
    fullName: p.name,
    fieldPermissions: [{ field: fieldFullName, readable: p.readable, editable: p.editable }],
  }));
  const result = await (conn.metadata.update as Function)("Profile", updates);
  const results: Array<{ success: boolean; errors?: unknown }> = Array.isArray(result) ? result : [result];
  const failures = results.filter((r) => !r.success);
  if (failures.length > 0) throw new Error(failures.map((r) => extractErrors(r)).join("; "));
  return { success: true, updatedProfiles: input.profiles.map((p) => p.name) };
}

// ── writeApexClass ───────────────────────────────────────────────────────────

export interface WriteApexClassInput {
  name: string;
  body: string;
  apiVersion?: number;
}

export async function writeApexClass(conn: Connection, input: WriteApexClassInput) {
  const version = input.apiVersion ?? 59;
  const escapedName = input.name.replace(/'/g, "''");
  const existing = await conn.tooling.query<{ Id: string }>(
    `SELECT Id FROM ApexClass WHERE Name = '${escapedName}' LIMIT 1`,
  );
  const sobject = conn.tooling.sobject("ApexClass") as any;
  let id: string;
  if ((existing.records as { Id: string }[]).length > 0) {
    const row = (existing.records as { Id: string }[])[0];
    await sobject.update({ Id: row.Id, Body: input.body });
    id = row.Id;
  } else {
    const r = await sobject.create({ Name: input.name, ApiVersion: version, Status: "Active", Body: input.body });
    if (!r.success) {
      const errors = (r.errors as Array<{ message: string }> | undefined)?.map((e) => e.message).join("; ");
      throw new Error(errors || "Apex class create failed");
    }
    id = r.id as string;
  }
  return { id, name: input.name, success: true };
}

// ── writeApexTrigger ─────────────────────────────────────────────────────────

export interface WriteApexTriggerInput {
  name: string;
  objectApiName: string;
  body: string;
  apiVersion?: number;
}

export async function writeApexTrigger(conn: Connection, input: WriteApexTriggerInput) {
  const version = input.apiVersion ?? 59;
  const escapedName = input.name.replace(/'/g, "''");
  const existing = await conn.tooling.query<{ Id: string }>(
    `SELECT Id FROM ApexTrigger WHERE Name = '${escapedName}' LIMIT 1`,
  );
  const sobject = conn.tooling.sobject("ApexTrigger") as any;
  let id: string;
  if ((existing.records as { Id: string }[]).length > 0) {
    const row = (existing.records as { Id: string }[])[0];
    await sobject.update({ Id: row.Id, Body: input.body });
    id = row.Id;
  } else {
    const r = await sobject.create({
      Name: input.name,
      TableEnumOrId: input.objectApiName,
      ApiVersion: version,
      Status: "Active",
      Body: input.body,
    });
    if (!r.success) {
      const errors = (r.errors as Array<{ message: string }> | undefined)?.map((e) => e.message).join("; ");
      throw new Error(errors || "Apex trigger create failed");
    }
    id = r.id as string;
  }
  return { id, name: input.name, success: true };
}
