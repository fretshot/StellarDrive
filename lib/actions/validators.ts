import "server-only";

/**
 * Shared validators used by ActionDefinition.validate() implementations.
 *
 * TODO(milestone-8): add API-name format validators, length checks per SF
 * field type, org-still-active checks, object-is-createable lookups.
 */

export function isValidSalesforceApiName(name: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]*$/.test(name) && !name.endsWith("_") && !name.includes("__") ;
}

export function isCustomApiName(name: string): boolean {
  return name.endsWith("__c");
}
