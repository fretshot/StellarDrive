export type OrgType = "production" | "sandbox" | "developer" | "scratch" | "custom";

export interface SalesforceTokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  id: string;
  issued_at: string;
  signature: string;
  scope?: string;
  token_type: string;
}

export interface SalesforceOrgInfo {
  sf_org_id: string;
  display_name: string;
  org_type: OrgType;
}

/**
 * Classifies a connected org from Salesforce's Organization SObject.
 * `IsSandbox` trumps everything else — sandboxes can run on any edition.
 * Otherwise, scratch orgs announce themselves via OrganizationType; developer
 * orgs via "Developer Edition"; and any real commercial edition (Enterprise,
 * Professional, Performance, Unlimited, Essentials, Group, etc.) is grouped
 * as "production".
 */
export function normalizeOrgType(
  organizationType: string | null | undefined,
  isSandbox?: boolean,
): OrgType {
  if (isSandbox === true) return "sandbox";
  const v = (organizationType ?? "").toLowerCase();
  if (v.includes("scratch")) return "scratch";
  if (v.includes("developer")) return "developer";
  if (
    v.includes("enterprise") ||
    v.includes("professional") ||
    v.includes("unlimited") ||
    v.includes("performance") ||
    v.includes("essentials") ||
    v.includes("group") ||
    v.includes("base edition") ||
    v.includes("production")
  ) {
    return "production";
  }
  return "custom";
}
