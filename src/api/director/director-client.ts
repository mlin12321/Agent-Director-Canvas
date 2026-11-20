import { isHttpError } from "@openhands/typescript-client";
import { DirectorClient as SdkDirectorClient } from "@openhands/typescript-client/clients";
import { getEffectiveLocalBackend } from "../backend-registry/active-store";
import type {
  DirectorOrgSettings,
  DirectorSettings,
  NodeId,
  OpenSessionRequest,
  OrgEvent,
  RouteMessageRequest,
  Side,
} from "./types";

const RETRY_DELAYS_MS = [1000, 2000, 5000];
// A call may start conversations and ask a model where a message goes. A
// caller that gave up sooner would send the message itself as well.
const CALL_TIMEOUT_MS = 5 * 60 * 1000;

export class DirectorError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "DirectorError";
  }
}

/**
 * What the director said when it refused a call, in its own words; `null`
 * for a failure that is not a refusal (the server could not be reached, or
 * failed itself).
 */
export function refusalOf(error: unknown): string | null {
  return error instanceof DirectorError &&
    error.status !== null &&
    error.status >= 400 &&
    error.status < 500
    ? error.message
    : null;
}

/**
 * The SDK's typed director client, for the backend that is active now. The
 * director API is served by a local Agent Server; Cloud has none.
 */
function director() {
  const backend = getEffectiveLocalBackend();
  if (!backend) {
    throw new DirectorError("No local backend is active", null);
  }
  const host = backend.host.replace(/\/+$/, "");
  const client = new SdkDirectorClient({
    host,
    apiKey: backend.apiKey?.trim() || undefined,
    timeout: CALL_TIMEOUT_MS,
  });
  return { host, client };
}

/** What a server answers for a path it does not serve at all. */
const NO_SUCH_ROUTE = "Not Found";
/**
 * The servers found to have no director, and when: what is asked of one is
 * answered here for a while, without a request for every message written
 * and every key pressed. A server started again with a director is found.
 */
const withoutDirector = new Map<string, number>();
const NO_DIRECTOR_KEPT_MS = 30_000;

/** Ask every server again, as after the page is loaded again. */
export function forgetServersWithoutDirector() {
  withoutDirector.clear();
}

/**
 * Run one call, with a refusal told as the page tells it.
 *
 * @param always Whether every director serves the call, so that a server
 * which does not know it has no director.
 */
async function call<T>(
  run: (client: SdkDirectorClient) => Promise<T>,
  always = false,
) {
  const { host, client } = director();
  if (
    Date.now() - (withoutDirector.get(host) ?? -Infinity) <
    NO_DIRECTOR_KEPT_MS
  )
    throw new DirectorError(NO_SUCH_ROUTE, 404);
  try {
    return await run(client);
  } catch (error) {
    if (isHttpError(error)) {
      if (always && error.status === 404 && error.detail === NO_SUCH_ROUTE) {
        withoutDirector.set(host, Date.now());
      }
      throw new DirectorError(error.detail ?? error.statusText, error.status);
    }
    throw error;
  }
}

/**
 * The director's API for the page: each call is the SDK client's
 * (`@openhands/typescript-client`), made against the active local backend.
 */
export const DirectorClient = {
  /** Whether the director has an org; `root_id` is null when it has none. */
  getOrg: () => call((client) => client.getOrg(), true),

  /**
   * Say something to the org. It goes to the IC of the nearest team at or
   * above `path`; without an org it starts one and becomes its task.
   */
  routeMessage: (request: RouteMessageRequest) =>
    call((client) => client.routeMessage(request)),

  /** The sessions that are open, oldest first. */
  listSessions: () => call((client) => client.listSessions(), true),

  /**
   * Answer an escalation a team raised in a session and that waits on the
   * human. The answer goes to the session's IC at that team.
   */
  answerSessionEscalation: (
    sessionId: string,
    nodeId: NodeId,
    escalationId: string,
    answer: string,
  ) =>
    call((client) =>
      client.answerSessionEscalation(sessionId, nodeId, escalationId, answer),
    ),

  /**
   * Where an agent's conversation is in the org, with the conversations one
   * level from it. Refused (404) for a conversation that is no agent's.
   */
  getConversationPlace: (conversationId: string) =>
    call((client) => client.getConversationPlace(conversationId)),

  /** Say that the human has joined an agent's conversation. */
  joinConversation: (conversationId: string) =>
    call((client) => client.joinConversation(conversationId)),

  /** Open a session at a team and start it with a request. */
  openSession: (request: OpenSessionRequest) =>
    call((client) => client.openSession(request)),

  /** Close a session. Only the human does. */
  closeSession: (sessionId: string) =>
    call((client) => client.closeSession(sessionId)),

  getOrgHistory: (limit: number, before?: string) =>
    call((client) => client.getOrgHistory(limit, before)),

  getNodeMemory: (nodeId: NodeId) =>
    call((client) => client.getNodeMemory(nodeId)),

  getNodeMessages: (nodeId: NodeId) =>
    call((client) => client.getNodeMessages(nodeId)),

  getNodeOwnership: (nodeId: NodeId) =>
    call((client) => client.getNodeOwnership(nodeId)),

  getNodeChanges: (nodeId: NodeId) =>
    call((client) => client.getNodeChanges(nodeId)),

  getNodeChangedFile: (nodeId: NodeId, path: string) =>
    call((client) => client.getNodeChangedFile(nodeId, path)),

  /** The files an accept in the history took, by its two commits. */
  getAcceptedChanges: (base: string, head: string, path: string) =>
    call((client) => client.getAcceptedChanges(base, head, path)),

  getAcceptedFile: (base: string, head: string, path: string) =>
    call((client) => client.getAcceptedFile(base, head, path)),

  /** Write one file of a team by hand; its IC is told. */
  editNodeFile: (nodeId: NodeId, path: string, content: string) =>
    call((client) => client.editNodeFile(nodeId, path, content)),

  pullOrg: (remote = "origin") => call((client) => client.pullOrg(remote)),

  pushOrg: (remote = "origin") => call((client) => client.pushOrg(remote)),

  /** Start a team's lost agents again in a session. */
  startAgain: (sessionId: string, nodeId: NodeId) =>
    call((client) => client.startAgain(sessionId, nodeId)),

  getMerge: () => call((client) => client.getMerge()),

  resolveMerge: (choices: Record<string, Side>) =>
    call((client) => client.resolveMerge({ choices })),

  abortMerge: () => call((client) => client.abortMerge()),

  getSettings: () => call((client) => client.getSettings()),

  updateSettings: (settings: Partial<DirectorSettings>) =>
    call((client) => client.updateSettings(settings)),

  /**
   * The agent type of a new team and the types one may be, with every type
   * the director finds now. Without an org, what a new org starts with.
   */
  getOrgSettings: () => call((client) => client.getOrgSettings()),

  /** Set them for this org alone. Refused (404) without an org. */
  updateOrgSettings: (settings: DirectorOrgSettings) =>
    call((client) => client.updateOrgSettings(settings)),

  pauseOrg: () => call((client) => client.pauseOrg()),

  resumeOrg: () => call((client) => client.resumeOrg()),

  getRecovery: () => call((client) => client.getRecovery()),

  searchTeams: (query: string, limit = 8) =>
    call((client) => client.searchTeams(query, limit)),
};

export type OrgStreamStatus =
  "connecting" | "live" | "reconnecting" | "unavailable" | "not_found";

export interface OrgStreamHandlers {
  onEvent: (event: OrgEvent) => void;
  onStatus: (status: OrgStreamStatus) => void;
}

/**
 * Follow the org tree, and connect again when the stream ends or fails. The
 * SDK client reads one stream and retries nothing; the retrying is the page's.
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
    const events = director().client.streamOrgTree({
      node: nodeId ?? undefined,
      full,
      signal: controller.signal,
    });
    for await (const event of events) {
      attempt = 0;
      everLive = true;
      onStatus("live");
      onEvent(event);
    }
    throw new DirectorError("The org tree stream ended", null);
  };

  const run = () => {
    connect().catch((error: unknown) => {
      if (controller.signal.aborted) return;
      // A 404 for a named node means the node is gone. A 404 for the root
      // means this backend has no org tree (yet), or no director API at all,
      // which is worth retrying.
      if (nodeId !== null && isHttpError(error) && error.status === 404) {
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
