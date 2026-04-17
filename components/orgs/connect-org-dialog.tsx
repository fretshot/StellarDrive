"use client";

import { useState } from "react";

/**
 * Minimal Connect-org widget. Picks the login host, then redirects to the
 * authorize endpoint which handles PKCE + state cookie + Salesforce redirect.
 *
 * TODO(milestone-5): turn this into a proper modal dialog with alias input.
 */
export function ConnectOrgDialog() {
  const [host, setHost] = useState("login.salesforce.com");
  const [custom, setCustom] = useState("");

  function connect() {
    const chosen = host === "custom" ? custom.trim() : host;
    if (!chosen) return;
    window.location.href = `/api/salesforce/oauth/authorize?loginHost=${encodeURIComponent(chosen)}`;
  }

  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="font-medium">Connect a Salesforce org</div>
      <div className="flex flex-col gap-1">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="host"
            checked={host === "login.salesforce.com"}
            onChange={() => setHost("login.salesforce.com")}
          />
          Production / Developer
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="host"
            checked={host === "test.salesforce.com"}
            onChange={() => setHost("test.salesforce.com")}
          />
          Sandbox
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="host"
            checked={host === "custom"}
            onChange={() => setHost("custom")}
          />
          Custom domain
        </label>
        {host === "custom" ? (
          <input
            type="text"
            placeholder="mydomain.my.salesforce.com"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="mt-1 rounded border border-neutral-300 px-2 py-1 text-xs dark:border-neutral-700"
          />
        ) : null}
      </div>
      <button
        onClick={connect}
        className="mt-1 self-start rounded bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-white dark:text-neutral-900"
      >
        Connect
      </button>
    </div>
  );
}
