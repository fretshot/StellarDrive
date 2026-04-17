import "server-only";
import type { Connection } from "jsforce";

/**
 * Metadata API CREATE deploys. Phase 1 only: CustomField, CustomObject,
 * PermissionSet. No updates or deletes in this module.
 *
 * TODO(milestone-8): implement these using conn.metadata.create(...).
 */

export interface CreateCustomFieldInput {
  objectApiName: string;
  fieldApiName: string; // must end with __c
  label: string;
  type: "Text" | "TextArea" | "Checkbox" | "Number" | "Date" | "DateTime" | "Email" | "Phone" | "Url";
  length?: number;
  required?: boolean;
  description?: string;
}

export async function createCustomField(_conn: Connection, _input: CreateCustomFieldInput) {
  throw new Error("metadata-deploy.createCustomField not implemented yet (milestone-8)");
}

export interface CreateCustomObjectInput {
  apiName: string; // must end with __c
  label: string;
  pluralLabel: string;
  nameFieldLabel?: string;
  description?: string;
}

export async function createCustomObject(_conn: Connection, _input: CreateCustomObjectInput) {
  throw new Error("metadata-deploy.createCustomObject not implemented yet (milestone-8)");
}

export interface CreatePermissionSetInput {
  apiName: string;
  label: string;
  description?: string;
}

export async function createPermissionSet(_conn: Connection, _input: CreatePermissionSetInput) {
  throw new Error("metadata-deploy.createPermissionSet not implemented yet (milestone-8)");
}
