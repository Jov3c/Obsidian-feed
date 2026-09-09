import { pathToFileURL } from "node:url";

export async function fetchSystemStatus(
  baseUrl: string,
  token: string,
  request: typeof fetch = fetch,
): Promise<unknown> {
  const response = await request(`${baseUrl.replace(/\/+$/u, "")}/v1/system/status`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Status request failed with HTTP ${response.status}`);
  return response.json();
}

export async function runStatusCli(environment: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const token = environment.FEED_SERVER_TOKEN;
  if (!token) throw new Error("FEED_SERVER_TOKEN is required");
  return fetchSystemStatus(environment.FEED_SERVER_URL ?? "http://127.0.0.1:43110", token);
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  process.stdout.write(`${JSON.stringify(await runStatusCli(), null, 2)}\n`);
}
