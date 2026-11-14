import { getEffectiveLocalBackend } from "../backend-registry/active-store";
import {
  DIRECTOR_BASE_PATH,
  type DirectorSettings,
  type DirectorSettingsState,
  type FileEdit,
  type FileSides,
  type NodeMemory,
  type NodeId,
  type NodeOwnership,
  type OrgEvent,
  type OrgMerge,
  type OrgNode,
  type OrgSummary,
  type OrgSync,
  type Recovery,
  type RoutedMessage,
  type RouteMessageRequest,
  type Side,
  type TeamChanges,
  type TeamMatch,
} from "./types";

const SESSION_KEY_HEADER = "X-Session-API-Key";
const ORG_PATH = "/org";
const SETTINGS_PATH = "/settings";
const TREE_STREAM_PATH = "/org/tree-stream";
const NODE_QUERY_PARAM = "node";
const FULL_QUERY_PARAM = "full";
const RETRY_DELAYS_MS = [1000, 2000, 5000];

export class DirectorError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "DirectorError";
  }
}

/** The director API is served by a local Agent Server; Cloud has none. */
function resolveDirector() {
  const backend = getEffectiveLocalBackend();
  if (!backend) {
    throw new DirectorError("No local backend is active", null);
  }
  const apiKey = backend.apiKey?.trim();
  const headers: Record<string, string> = apiKey
    ? { [SESSION_KEY_HEADER]: apiKey }
    : {};
  return {
    baseUrl: `${backend.host.replace(/\/+$/, "")}${DIRECTOR_BASE_PATH}`,
    headers,
  };
}

function nodePath(nodeId: NodeId, action: string) {
  return `/org/nodes/${encodeURIComponent(nodeId)}/${action}`;
}

async function requestJson<T>(path: string, init: RequestInit = {}) {
  const { baseUrl, headers } = resolveDirector();
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new DirectorError(
      typeof body?.detail === "string" ? body.detail : response.statusText,
      response.status,
    );
  }
  return (await response.json()) as T;
}

function postJson<T>(path: string, body: unknown) {
  return requestJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const DirectorClient = {
  /** Whether the director has an org; `root_id` is null when it has none. */
  getOrg() {
    return requestJson<OrgSummary>(ORG_PATH);
  },

  /**
   * Say something to the org. It goes to the IC of the nearest team at or
   * above `path`; without an org it starts one and becomes its task.
   */
  routeMessage(request: RouteMessageRequest) {
    return postJson<RoutedMessage>(`${ORG_PATH}/messages`, request);
  },

  /**
   * Answer an escalation that waits on the human, which settles it.
   *
   * @param nodeId The team that raised the escalation.
   */
  answerEscalation(nodeId: NodeId, escalationId: string, answer: string) {
    return postJson<OrgNode>(
      nodePath(
        nodeId,
        `escalations/${encodeURIComponent(escalationId)}/answer`,
      ),
      { answer },
    );
  },

  getNodeMemory(nodeId: NodeId) {
    return requestJson<NodeMemory>(nodePath(nodeId, "memory"));
  },

  getNodeOwnership(nodeId: NodeId) {
    return requestJson<NodeOwnership>(nodePath(nodeId, "ownership"));
  },

  /** The files a team changed since its work started or was accepted. */
  getNodeChanges(nodeId: NodeId) {
    return requestJson<TeamChanges>(nodePath(nodeId, "changes"));
  },

  /** One file at the team's base commit and in its checkout now. */
  getNodeChangedFile(nodeId: NodeId, path: string) {
    const query = new URLSearchParams({ path });
    return requestJson<FileSides>(nodePath(nodeId, `changes/file?${query}`));
  },

  /**
   * Write one file of a team by hand. It is committed alone and the team's
   * IC is told. Refused with 409 while an agent of the team is working.
   */
  editNodeFile(nodeId: NodeId, path: string, content: string) {
    const query = new URLSearchParams({ path });
    return requestJson<FileEdit>(nodePath(nodeId, `files?${query}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Take in the org a remote of the repository has, as a merge: the tree,
   * the team memory and the branches of the teams' work.
   */
  pullOrg(remote = "origin") {
    return postJson<OrgSync>(`${ORG_PATH}/pull`, { remote });
  },

  /** Give a remote the org, the team memory and the teams' branches. */
  pushOrg(remote = "origin") {
    return postJson<OrgSync>(`${ORG_PATH}/push`, { remote });
  },

  /**
   * Start afresh a team whose agents have no conversation on this server,
   * on the work its branch has. Its IC starts like the IC of the team above.
   */
  startAgain(nodeId: NodeId) {
    return postJson<OrgNode>(
      `${ORG_PATH}/nodes/${encodeURIComponent(nodeId)}/start_again`,
      {},
    );
  },

  /** The merge that waits for choices; `null` when none does. */
  getMerge() {
    return requestJson<OrgMerge | null>(`${ORG_PATH}/merge`);
  },

  /** Choose a side for conflicts; the merge is finished once all have one. */
  resolveMerge(choices: Record<string, Side>) {
    return postJson<OrgSync>(`${ORG_PATH}/merge/resolve`, { choices });
  },

  /** Abandon the merge that waits; the org stays as it was. */
  abortMerge() {
    return postJson<OrgSync>(`${ORG_PATH}/merge/abort`, {});
  },

  /** The limits on new teams, beside how large the org is now. */
  getSettings() {
    return requestJson<DirectorSettingsState>(SETTINGS_PATH);
  },

  /**
   * Change the limits on new teams. They are checked only when a team
   * splits, so lowering one removes nothing.
   */
  updateSettings(settings: Partial<DirectorSettings>) {
    return requestJson<DirectorSettingsState>(SETTINGS_PATH, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
  },

  /**
   * Hold the org: its agents stop after the step they are in, and messages
   * to them wait.
   */
  pauseOrg() {
    return postJson<Recovery>(`${ORG_PATH}/pause`, {});
  },

  /** Take a paused org up again; answers with what was put aside as stale. */
  resumeOrg() {
    return postJson<Recovery>(`${ORG_PATH}/resume`, {});
  },

  /** What resuming a paused org does, team by team. */
  getRecovery() {
    return requestJson<Recovery>(`${ORG_PATH}/recovery`);
  },

  /** Teams whose title or directory has every word of `query`. */
  searchTeams(query: string, limit = 8) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    return requestJson<TeamMatch[]>(`${ORG_PATH}/search?${params}`);
  },
};

export type OrgStreamStatus =
  /** First connection attempt is in flight. */
  | "connecting"
  | "live"
  /** Was live, lost the connection, retrying. */
  | "reconnecting"
  /** The backend cannot be reached or has no org tree; still retrying. */
  | "unavailable"
  /** The requested node does not exist. Not retried. */
  | "not_found";

export interface OrgStreamHandlers {
  onEvent: (event: OrgEvent) => void;
  onStatus: (status: OrgStreamStatus) => void;
}

/**
 * Feed decoded text in; get each complete server-sent event's `data` out.
 * Comment frames (heartbeats) and frames without data are dropped.
 */
function createSseDecoder(onData: (data: string) => void) {
  let buffer = "";
  return (chunk: string) => {
    buffer += chunk.replaceAll("\r\n", "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).replace(/^ /, ""))
        .join("\n");
      if (data) onData(data);
      boundary = buffer.indexOf("\n\n");
    }
  };
}

/**
 * Follow one node of the org tree (`nodeId: null` is the root) with its
 * ancestors and direct reports, or with `full` every node below it.
 *
 * The connection is re-established with backoff whenever it drops; every
 * (re)connect starts with a fresh snapshot, so callers never have to
 * reconcile missed events. `fetch` is used rather than `EventSource` because
 * the session key travels in a header.
 *
 * @returns A function that stops following.
 */
export function subscribeOrgTree(
  nodeId: NodeId | null,
  { onEvent, onStatus }: OrgStreamHandlers,
  full = false,
): () => void {
  const controller = new AbortController();
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let everLive = false;

  const connect = async () => {
    const { baseUrl, headers } = resolveDirector();
    const params = new URLSearchParams();
    if (nodeId !== null) params.set(NODE_QUERY_PARAM, nodeId);
    if (full) params.set(FULL_QUERY_PARAM, "true");
    const query = params.size > 0 ? `?${params}` : "";
    const url = `${baseUrl}${TREE_STREAM_PATH}${query}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new DirectorError(response.statusText, response.status);
    }

    const decode = createSseDecoder((data) => {
      attempt = 0;
      everLive = true;
      onStatus("live");
      onEvent(JSON.parse(data) as OrgEvent);
    });
    const reader = response.body.getReader();
    const text = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      decode(text.decode(value, { stream: true }));
    }
    throw new DirectorError("The org tree stream ended", null);
  };

  const run = () => {
    connect().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      // A 404 for a named node means the node is gone. A 404 for the root
      // means this backend has no org tree (yet), or no director API at all,
      // which is worth retrying.
      if (
        nodeId !== null &&
        error instanceof DirectorError &&
        error.status === 404
      ) {
        onStatus("not_found");
        return;
      }
      onStatus(everLive ? "reconnecting" : "unavailable");
      const delay =
        RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
      attempt += 1;
      retryTimer = setTimeout(run, delay);
    });
  };

  onStatus("connecting");
  run();

  return () => {
    controller.abort();
    if (retryTimer !== null) clearTimeout(retryTimer);
  };
}
