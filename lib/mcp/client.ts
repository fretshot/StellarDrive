import "server-only";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { env } from "@/lib/env";

let mcpClientInstance: Client | null = null;
let mcpTransport: SSEClientTransport | null = null;

/**
 * Get or create an MCP Client instance connected to the configured server.
 */
export async function getMcpClient(): Promise<Client | null> {
  const url = env().SALESFORCE_MCP_SERVER_URL;
  if (!url) return null;

  if (mcpClientInstance) return mcpClientInstance;

  try {
    mcpTransport = new SSEClientTransport(new URL(url));
    const client = new Client(
      { name: "StellarDrive-Client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(mcpTransport);
    mcpClientInstance = client;
    return client;
  } catch (err) {
    console.error("[MCP] Failed to connect to server:", err);
    return null;
  }
}

/**
 * Fetch tools from the MCP server.
 * Returns tools as defined by the MCP spec.
 */
export async function fetchMcpTools() {
  const client = await getMcpClient();
  if (!client) return [];

  try {
    const response = await client.listTools();
    return response.tools;
  } catch (err) {
    console.error("[MCP] Failed to list tools:", err);
    return [];
  }
}

/**
 * Call an MCP tool.
 */
export async function callMcpTool(name: string, args: any) {
  const client = await getMcpClient();
  if (!client) throw new Error("MCP client not connected");

  try {
    return await client.callTool({
      name,
      arguments: args,
    });
  } catch (err) {
    console.error(`[MCP] Failed to call tool ${name}:`, err);
    throw err;
  }
}

/**
 * Returns basic status info about the MCP connection.
 */
export async function getMcpStatus() {
  const url = env().SALESFORCE_MCP_SERVER_URL;
  if (!url) return { enabled: false };
  
  const client = await getMcpClient();
  return {
    enabled: true,
    connected: !!client,
    url,
  };
}
