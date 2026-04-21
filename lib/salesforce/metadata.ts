import "server-only";
import type { Connection } from "jsforce";
import { createHash } from "node:crypto";

/**
 * Read-only metadata operations. Write operations on metadata live in
 * `metadata-deploy.ts`. Data-record operations live in `records.ts`.
 */

export interface ObjectSummary {
  api_name: string;
  label: string;
  is_custom: boolean;
  key_prefix: string | null;
  createable: boolean;
  summary: Record<string, unknown>;
}

export interface FieldSummary {
  api_name: string;
  label: string;
  data_type: string;
  is_required: boolean;
  is_custom: boolean;
  reference_to: string[];
  summary: Record<string, unknown>;
}

export interface ApexClassSummary {
  api_name: string;
  api_version: string;
  status: string;
  body_hash: string;
  summary: Record<string, unknown>;
}

export interface TriggerSummary {
  api_name: string;
  object_name: string;
  status: string;
  events: string[];
}

export interface FlowSummary {
  api_name: string;
  label: string;
  process_type: string;
  status: string;
}

export interface WorkflowRuleSummary {
  api_name: string;
  object_name: string;
  active: boolean;
}

/**
 * Lightweight top-level list of every SObject in the org via describeGlobal.
 */
export async function listObjects(conn: Connection): Promise<ObjectSummary[]> {
  const result = await conn.describeGlobal();
  return result.sobjects.map((s) => ({
    api_name: s.name,
    label: s.label,
    is_custom: Boolean(s.custom),
    key_prefix: s.keyPrefix ?? null,
    createable: Boolean(s.createable),
    summary: {
      plural_label: s.labelPlural,
      queryable: s.queryable,
      updateable: s.updateable,
      deletable: s.deletable,
      custom_setting: s.customSetting,
      deprecated: s.deprecatedAndHidden,
      feed_enabled: s.feedEnabled,
      layoutable: s.layoutable,
      searchable: s.searchable,
      triggerable: s.triggerable,
    },
  }));
}

/**
 * Full describe of a single SObject — returns its fields.
 */
export async function describeObject(
  conn: Connection,
  apiName: string,
): Promise<{ fields: FieldSummary[] }> {
  const describe = await conn.sobject(apiName).describe();
  const fields = describe.fields.map<FieldSummary>((f) => ({
    api_name: f.name,
    label: f.label,
    data_type: f.type,
    is_required: !f.nillable && !f.defaultedOnCreate && f.createable,
    is_custom: Boolean(f.custom),
    reference_to: (f.referenceTo ?? []).filter((x): x is string => typeof x === "string"),
    summary: {
      length: f.length,
      precision: f.precision,
      scale: f.scale,
      unique: f.unique,
      external_id: f.externalId,
      calculated: f.calculated,
      formula: f.calculatedFormula ?? null,
      default_value: f.defaultValue ?? null,
      picklist_values: Array.isArray(f.picklistValues)
        ? f.picklistValues.filter((p) => p.active).map((p) => p.value)
        : [],
      inline_help: f.inlineHelpText ?? null,
    },
  }));
  return { fields };
}

/**
 * Apex class list via the Tooling API. We persist a hash of the body rather
 * than the body itself to keep the table small; bodies can be re-fetched.
 *
 * Namespaced classes (from managed packages) are stored as `NS__ClassName`
 * so they don't collide with local classes of the same short name.
 */
export async function listApexClasses(conn: Connection): Promise<ApexClassSummary[]> {
  type Row = {
    Id: string;
    Name: string;
    NamespacePrefix: string | null;
    ApiVersion: number;
    Status: string;
    Body: string | null;
  };
  const res = await conn.tooling.query<Row>(
    "SELECT Id, Name, NamespacePrefix, ApiVersion, Status, Body FROM ApexClass",
  );

  // Dedupe defensively on the final api_name; Salesforce occasionally returns
  // multiple rows that collapse to the same key (e.g. historical versions).
  const byKey = new Map<string, ApexClassSummary>();
  for (const r of res.records as Row[]) {
    const body = r.Body ?? "";
    const apiName = r.NamespacePrefix ? `${r.NamespacePrefix}__${r.Name}` : r.Name;
    byKey.set(apiName, {
      api_name: apiName,
      api_version: String(r.ApiVersion),
      status: r.Status,
      body_hash: createHash("sha256").update(body).digest("hex"),
      summary: {
        namespace: r.NamespacePrefix ?? null,
        length: body.length,
        has_test_annotation: /@IsTest/i.test(body),
      },
    });
  }
  return Array.from(byKey.values());
}

/**
 * Read the Organization SObject so we can classify the org (production vs
 * sandbox vs developer vs custom). Called during the OAuth callback and also
 * during sync to keep `is_sandbox` accurate.
 */
export async function readOrganization(conn: Connection) {
  type Org = {
    Id: string;
    Name: string;
    OrganizationType: string;
    IsSandbox: boolean;
    TrialExpirationDate: string | null;
    CreatedDate: string;
  };
  const res = await conn.query<Org>(
    "SELECT Id, Name, OrganizationType, IsSandbox, TrialExpirationDate, CreatedDate FROM Organization LIMIT 1",
  );
  const row = res.records[0];
  if (!row) throw new Error("Organization record not returned");
  return row;
}

export async function listApexTriggers(conn: Connection): Promise<TriggerSummary[]> {
  type Row = {
    Id: string;
    Name: string;
    TableEnumOrId: string;
    Status: string;
    Body: string | null;
  };
  const res = await conn.tooling.query<Row>(
    "SELECT Id, Name, TableEnumOrId, Status, Body FROM ApexTrigger",
  );

  return (res.records as Row[]).map((r) => {
    const body = r.Body ?? "";
    const match = /trigger\s+\w+\s+on\s+\w+\s*\(([^)]+)\)/i.exec(body);
    const events = match
      ? match[1].split(",").map((e) => e.trim().toLowerCase())
      : [];
    return {
      api_name: r.Name,
      object_name: r.TableEnumOrId,
      status: r.Status,
      events,
    };
  });
}

export async function listFlows(conn: Connection): Promise<FlowSummary[]> {
  type Row = {
    Label: string;
    Id: string;
    ApiName: string;
    MasterLabel: string;
    ProcessType: string;
    IsActive: boolean;
    VersionNumber: number;
    TriggerType: string;
    NamespacePrefix: string;
  };
  // Query Flow (version objects) — ProcessType and Status live here, not on FlowDefinition.
  // Deduplicate by ApiName keeping the Active version; fall back to any version seen last.
  const res = await conn.query<Row>(
    "SELECT Id, ApiName, ProcessType, Label, IsActive, VersionNumber, TriggerType, NamespacePrefix FROM FlowDefinitionView ORDER BY ApiName ASC",
  );

  const byKey = new Map<string, FlowSummary>();
  for (const r of res.records as Row[]) {
    if (!byKey.has(r.ApiName)) {
      byKey.set(r.ApiName, {
        api_name: r.ApiName,
        label: r.Label,
        process_type: r.ProcessType,
        status: r.IsActive ? "Active" : "Inactive",
      });
    }
  }
  return Array.from(byKey.values());
}

export async function listWorkflowRules(conn: Connection): Promise<WorkflowRuleSummary[]> {
  type Row = {
    Id: string;
    Name: string;
    TableEnumOrId: string;
  };
  // Active status is not a queryable column on WorkflowRule via Tooling API.
  const res = await conn.tooling.query<Row>(
    "SELECT Id, Name, TableEnumOrId FROM WorkflowRule",
  );

  return (res.records as Row[]).map((r) => ({
    api_name: r.Name,
    object_name: r.TableEnumOrId,
    active: false,
  }));
}

// ── live query / search ───────────────────────────────────────────────────────

export async function queryRecords(conn: Connection, soql: string): Promise<unknown[]> {
  const res = await conn.query(soql);
  return res.records as unknown[];
}

export async function aggregateQuery(conn: Connection, soql: string): Promise<unknown[]> {
  const res = await conn.query(soql);
  return res.records as unknown[];
}

export async function searchAll(conn: Connection, sosl: string): Promise<unknown[]> {
  const res = await (conn as any).search(sosl);
  return (res.searchRecords as unknown[]) ?? [];
}

// ── Apex class / trigger read (full body) ─────────────────────────────────────

export interface ApexClassDetail {
  id: string;
  api_name: string;
  api_version: string;
  status: string;
  body: string;
  summary: Record<string, unknown>;
}

export async function readApexClass(conn: Connection, namePattern: string): Promise<ApexClassDetail[]> {
  const soqlLike = namePattern.replace(/\*/g, "%").replace(/\?/g, "_").replace(/'/g, "''");
  type Row = { Id: string; Name: string; NamespacePrefix: string | null; ApiVersion: number; Status: string; Body: string | null };
  const res = await conn.tooling.query<Row>(
    `SELECT Id, Name, NamespacePrefix, ApiVersion, Status, Body FROM ApexClass WHERE Name LIKE '${soqlLike}' LIMIT 25`,
  );
  return (res.records as Row[]).map((r) => {
    const body = r.Body ?? "";
    const apiName = r.NamespacePrefix ? `${r.NamespacePrefix}__${r.Name}` : r.Name;
    return {
      id: r.Id,
      api_name: apiName,
      api_version: String(r.ApiVersion),
      status: r.Status,
      body,
      summary: {
        namespace: r.NamespacePrefix ?? null,
        length: body.length,
        has_test_annotation: /@IsTest/i.test(body),
      },
    };
  });
}

export interface ApexTriggerDetail {
  id: string;
  api_name: string;
  object_name: string;
  api_version: string;
  status: string;
  events: string[];
  body: string;
}

export async function readApexTrigger(conn: Connection, namePattern: string): Promise<ApexTriggerDetail[]> {
  const soqlLike = namePattern.replace(/\*/g, "%").replace(/\?/g, "_").replace(/'/g, "''");
  type Row = { Id: string; Name: string; TableEnumOrId: string; ApiVersion: number; Status: string; Body: string | null };
  const res = await conn.tooling.query<Row>(
    `SELECT Id, Name, TableEnumOrId, ApiVersion, Status, Body FROM ApexTrigger WHERE Name LIKE '${soqlLike}' LIMIT 25`,
  );
  return (res.records as Row[]).map((r) => {
    const body = r.Body ?? "";
    const match = /trigger\s+\w+\s+on\s+\w+\s*\(([^)]+)\)/i.exec(body);
    const events = match ? match[1].split(",").map((e) => e.trim().toLowerCase()) : [];
    return {
      id: r.Id,
      api_name: r.Name,
      object_name: r.TableEnumOrId,
      api_version: String(r.ApiVersion),
      status: r.Status,
      events,
      body,
    };
  });
}
