"use client";
import { useRouter } from "next/navigation";
import { setActiveOrg } from "@/app/dashboard/actions";

interface Org {
  id: string;
  alias: string | null;
  display_name: string | null;
}

interface OrgSwitcherProps {
  orgs: Org[];
  activeOrgId: string | null;
}

export function OrgSwitcher({ orgs, activeOrgId }: OrgSwitcherProps) {
  const router = useRouter();

  if (orgs.length === 0) {
    return <span className="text-sm text-neutral-500">No orgs connected</span>;
  }

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    await setActiveOrg(e.target.value);
    router.refresh();
  }

  return (
    <select
      value={activeOrgId ?? orgs[0].id}
      onChange={handleChange}
      className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
    >
      {orgs.map((org) => (
        <option key={org.id} value={org.id}>
          {org.alias || org.display_name || org.id}
        </option>
      ))}
    </select>
  );
}
