/** The script-runner endpoints, shared by every frontend version. */

async function json(response, what) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `${what} failed (${response.status})`);
  }
  return await response.json();
}

export async function fetchScripts(group) {
  return await json(await fetch(`/api/scripts/${group}`, { cache: "no-store" }), "Loading scripts");
}

export async function fetchSource(group, id) {
  const response = await fetch(`/api/scripts/${group}/${id}/source`, { cache: "no-store" });
  return await json(response, "Reading source");
}

export async function openInEditor(group, id) {
  const response = await fetch(`/api/scripts/${group}/${id}/open`, { method: "POST" });
  await json(response, "Opening the editor");
}

/**
 * Runs a script and reports its output as it arrives. The stream is plain text
 * and the server ends it with an `── exit N ──` line, which is where the exit
 * code comes from.
 */
export async function runScript(group, id, onOutput, signal) {
  const response = await fetch(`/api/scripts/${group}/${id}/run`, { method: "POST", signal });
  if (!response.ok) throw new Error(`Failed to run script (${response.status})`);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output += decoder.decode(value, { stream: true });
    onOutput(output);
  }

  const match = output.match(/── exit (\d+) ──/);
  return match ? Number(match[1]) : 0;
}
