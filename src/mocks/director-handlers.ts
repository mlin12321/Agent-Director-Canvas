import { http, HttpResponse } from "msw";
import { SHIPPED_MEMBERS } from "./director-members";
import {
  DIRECTOR_BASE_PATH,
  type AcceptedChanges,
  type AgentRef,
  type FileSides,
  type HistoryEvent,
  type AgentTypeInfo,
  type DirectorOrgSettings,
  type DirectorOrgSettingsState,
  type DirectorSettingsState,
  type OrgHistory,
  type Recovery,
  type InheritedSpec,
  type NodeMemory,
  type NodeOwnership,
  type NodeStatus,
  type NodeId,
  type OpenEscalation,
  type Escalation,
  type Session,
  type SessionTeam,
  type OrgEvent,
  type Merge,
  type OrgNode,
  type Report,
  type OrgSummary,
  type Review,
  type RouteMessageRequest,
  type TeamMatch,
  type Thread,
} from "#/api/director/types";

/**
 * MSW handlers for the Agent Server director API, so `npm run dev:mock` renders the
 * org chart without one running. The tree is small and static: one root, a
 * few domains, a few modules under each. It is the org's structure only:
 * nobody works at a team itself. The work is that of two sessions: one
 * opened at the top team, with places at several teams, and one opened at a
 * domain. They have two open escalations: one still held by the team above,
 * one that has reached the human and can be answered.
 */
const NODE_QUERY_PARAM = "node";
const FULL_QUERY_PARAM = "full";
const BASE = `*${DIRECTOR_BASE_PATH}`;
const ROOT_ID = "root";

const TEAM_AGENTS: AgentRef[] = [
  {
    role: "ic",
    conversation_id: null,
    status: "working",
    kind: "openhands",
    acp_server: null,
    model: null,
    reason: null,
    hand_over: null,
  },
  {
    role: "manager",
    conversation_id: null,
    status: "idle",
    kind: "openhands",
    acp_server: null,
    model: null,
    reason: null,
    hand_over: null,
  },
];

/** The two agents that take a session's work in: the IC reviews it, the
 * Manager settles its teams and contracts. */
const DIVISION_LEADS: AgentRef[] = [
  {
    role: "ic",
    conversation_id: null,
    status: "idle",
    kind: "openhands",
    acp_server: null,
    model: null,
    reason: null,
    hand_over: null,
  },
  {
    role: "manager",
    conversation_id: null,
    status: "idle",
    kind: "openhands",
    acp_server: null,
    model: null,
    reason: null,
    hand_over: null,
  },
];

const DOMAINS = ["platform", "payments", "identity", "search"];

const MODULES = ["api", "worker", "storage"];

const SESSION_TOKENS: Escalation = {
  id: "session-tokens",
  kind: "design_decision",
  title: "Session tokens: signed JWTs or opaque server-side sessions?",
  detail: "The api and worker teams disagree.",
  raised_at: "2026-11-10T09:12:00Z",
  raised_by: "ic",
  held_by: "identity",
  handoffs: [],
};

const IDEMPOTENCY_COLLISION: Escalation = {
  id: "idempotency-collision",
  kind: "critical_issue",
  title: "Idempotency keys collide across retries",
  detail: "The fix needs a schema change outside this team's boundary.",
  raised_at: "2026-11-11T16:40:00Z",
  raised_by: "manager",
  held_by: null,
  handoffs: [
    {
      node_id: "payments",
      reason: "The schema is shared with the identity domain.",
      at: "2026-11-11T17:05:00Z",
    },
    {
      node_id: ROOT_ID,
      reason: "Changing it means downtime only a human can schedule.",
      at: "2026-11-11T17:30:00Z",
    },
  ],
};

// A spec the team that had the directory before left; it is shown as old.
const MOCK_SPECS: Record<NodeId, InheritedSpec[]> = {
  payments: [
    {
      path: "services/payments",
      spec: "# Billing\n\nOne service for charges and refunds.",
      readonly: false,
      old: true,
      left_by: "billing domain",
    },
  ],
};

const MOCK_REPORTS: Record<NodeId, Report[]> = {
  payments: [
    {
      at: "2026-05-12T08:00:00+00:00",
      role: "ic",
      text: "Billing settled on one ledger table; keep it.",
      handed_over: true,
    },
    {
      at: "2026-05-12T08:15:00+00:00",
      role: "ic",
      text: "Idempotency keys on every write.",
    },
  ],
  [ROOT_ID]: [
    {
      at: "2026-05-11T09:00:00+00:00",
      role: "manager",
      text: "Split by domain: each one deploys on its own.",
    },
    {
      at: "2026-05-11T11:30:00+00:00",
      role: "ic",
      text: "A shared schema package failed: each domain pinned its own.",
    },
  ],
};

const MOCK_THREADS: Record<NodeId, Thread[]> = {
  [ROOT_ID]: [
    {
      manager_node_id: ROOT_ID,
      ic_node_id: ROOT_ID,
      messages: [
        {
          at: "2026-05-11T08:40:00+00:00",
          sender: "ic",
          text: [
            "Payments and Identity can be built side by side.",
            "",
            "```teams",
            "contracts: Identity issues the session token Payments checks.",
            "teams:",
            "  - name: Payments",
            "    path: payments",
            "    instruction: Take card payments.",
            "  - name: Identity",
            "    path: identity",
            "    instruction: Sign users in.",
            "```",
          ].join("\n"),
        },
        {
          at: "2026-05-11T08:55:00+00:00",
          sender: "manager",
          text: "Approved as written.",
        },
      ],
    },
    {
      // What the IC wrote to the IC of a team below; these go one way.
      manager_node_id: ROOT_ID,
      ic_node_id: "payments",
      ic_to_ic: true,
      messages: [
        {
          at: "2026-05-12T09:30:00+00:00",
          sender: "ic",
          text: "Start with card payments only; refunds can follow.",
        },
      ],
    },
  ],
};

const MOCK_REVIEW: Review = {
  state: "pending",
  round: 1,
  summary: "The module is built and its tests pass.",
  description:
    "Adds the module's handlers and their tests.\n\n" +
    "- `handlers.ts`: new request handlers.\n" +
    "- `handlers.test.ts`: covers the happy path and bad input.",
  findings: [],
  at: "2026-11-12T10:00:00+00:00",
};

const DEFAULT_AGENT_TYPE = "software-engineer";
/** The agent types the mock director finds, by name. */
const MOCK_AGENT_TYPES: Record<string, string> = {
  [DEFAULT_AGENT_TYPE]:
    "Builds and maintains software: writes code and tests, and reviews changes.",
  researcher:
    "Investigates a question and writes up what it found, with its sources.",
  "technical-writer":
    "Writes and maintains documentation for what the other teams build.",
};

/** What the mock org sets for itself; the rest is the server's. */
let mockOrgSettings: DirectorOrgSettings = {};

function orgSettingsNow(): DirectorOrgSettingsState {
  const allowed = mockOrgSettings.allowed_agent_types ?? [];
  const agentTypes: AgentTypeInfo[] = Object.entries(MOCK_AGENT_TYPES).map(
    ([name, description]) => ({
      name,
      description,
      allowed: allowed.length === 0 || allowed.includes(name),
      sas_profile: null,
      members: SHIPPED_MEMBERS,
    }),
  );
  return {
    default_agent_type:
      mockOrgSettings.default_agent_type || DEFAULT_AGENT_TYPE,
    allowed_agent_types: allowed,
    own: mockOrgSettings,
    agent_types: agentTypes,
  };
}

/** A team of the org: where it is and what it owns. Nobody works at it. */
function referenceTeam(
  id: NodeId,
  parentId: NodeId | null,
  childIds: NodeId[],
  given: Pick<OrgNode, "title" | "boundary" | "isolation" | "spec_summary">,
): OrgNode {
  return {
    id,
    parent_id: parentId,
    child_ids: childIds,
    headline: "",
    agent_profile: null,
    agent_type: DEFAULT_AGENT_TYPE,
    ...given,
    old_specs: [],
  };
}

function buildMockTree() {
  const nodes = new Map<NodeId, OrgNode>();
  nodes.set(
    ROOT_ID,
    referenceTeam(ROOT_ID, null, DOMAINS, {
      title: "Root organization",
      boundary: { path: "", writable: [], readonly: ["**"] },
      isolation: "worktree",
      spec_summary: "Owns cross-domain contracts and the release plan.",
    }),
  );
  DOMAINS.forEach((domain) => {
    const path = `services/${domain}`;
    nodes.set(
      domain,
      referenceTeam(
        domain,
        ROOT_ID,
        MODULES.map((module) => `${domain}.${module}`),
        {
          title: `${domain} domain`,
          boundary: { path, writable: [`${path}/*.md`], readonly: [] },
          isolation: "worktree",
          spec_summary: `Interface contracts between the ${domain} services.`,
        },
      ),
    );
    MODULES.forEach((module) => {
      const id = `${domain}.${module}`;
      nodes.set(
        id,
        referenceTeam(id, domain, [], {
          title: `${domain}/${module}`,
          boundary: {
            path: `${path}/${module}`,
            writable: [`${path}/${module}/**`],
            readonly: [`${path}/contracts/**`],
          },
          isolation: "shared",
          spec_summary: `Implements ${module} for ${domain}.`,
        }),
      );
    });
  });
  return nodes;
}

/** A session before what it has at its teams is worked out. */
interface MockSession {
  id: string;
  title: string;
  team_id: NodeId;
  request: string;
  opened_at: string;
  /** Sub-teams of it that wait for the Manager of the team above. */
  waits?: Merge;
  /** What it has at each team, the one it was opened at first. */
  work: Array<
    { team_id: NodeId; status: NodeStatus; headline: string } & Partial<
      Pick<SessionTeam, "agents" | "escalations" | "review">
    >
  >;
}

function buildMockSessions(): MockSession[] {
  return [
    {
      id: "release-24",
      title: "Release 2.4",
      team_id: ROOT_ID,
      request: "Ship release 2.4 across every domain.",
      opened_at: "2026-11-09T08:00:00Z",
      work: [
        {
          team_id: ROOT_ID,
          status: "working",
          headline: "Plans the release across every domain.",
        },
        {
          team_id: "platform",
          status: "working",
          headline: "Moves the platform services to the new deploy.",
        },
        {
          team_id: "platform.api",
          status: "working",
          headline: "Building api for platform.",
        },
        {
          team_id: "payments",
          status: "blocked",
          headline: "Keeps the payments services working together.",
        },
        {
          team_id: "payments.api",
          status: "working",
          headline: "Building api for payments.",
        },
        {
          team_id: "payments.worker",
          status: "blocked",
          headline: "Building worker for payments.",
          escalations: [IDEMPOTENCY_COLLISION],
        },
        {
          team_id: "payments.storage",
          status: "done",
          headline: "Building storage for payments.",
          review: MOCK_REVIEW,
        },
        {
          team_id: "search",
          status: "done",
          headline: "Rebuilds the search index for the release.",
          review: { ...MOCK_REVIEW, state: "accepted" },
        },
      ],
    },
    {
      id: "passkeys",
      title: "Passkey sign-in",
      team_id: "identity",
      request: "Let users sign in with a passkey.",
      opened_at: "2026-11-10T08:30:00Z",
      waits: {
        seq: 2,
        code_landed: true,
        items: [
          {
            kind: "team",
            key: "identity.worker",
            gate: "manager",
            title: "identity/worker",
            session: "identity/passkeys, under identity",
            org: "identity/worker, under identity.api",
            take: null,
          },
          {
            kind: "contracts",
            key: "identity",
            gate: "manager",
            session: "Passkeys are verified by the worker.",
            org: "Sign-in tokens are issued by the API.",
            take: "text",
            text: "Sign-in tokens are issued by the API; passkeys are verified by the worker.",
          },
        ],
      },
      work: [
        {
          team_id: "identity",
          status: "working",
          headline: "Adds passkey sign-in.",
        },
        {
          team_id: "identity.api",
          status: "blocked",
          headline: "Building api for identity.",
          escalations: [SESSION_TOKENS],
        },
        {
          team_id: "identity.worker",
          status: "idle",
          headline: "",
          // Set up in the session and not given its task yet.
          agents: [],
        },
      ],
    },
  ];
}

let tree = buildMockTree();
let mockSessions = buildMockSessions();

function ancestorsOf(node: OrgNode): OrgNode[] {
  const ancestors: OrgNode[] = [];
  let parent = node.parent_id === null ? undefined : tree.get(node.parent_id);
  while (parent) {
    ancestors.unshift(parent);
    parent = parent.parent_id === null ? undefined : tree.get(parent.parent_id);
  }
  return ancestors;
}

function subtreeOf(nodeId: NodeId): OrgNode[] {
  return reportsOf(nodeId).flatMap((node) => [node, ...subtreeOf(node.id)]);
}

function reportsOf(nodeId: NodeId): OrgNode[] {
  return (tree.get(nodeId)?.child_ids ?? []).flatMap(
    (id) => tree.get(id) ?? [],
  );
}

const placeId = (teamId: NodeId, sessionId: string) => `${teamId}@${sessionId}`;

/**
 * The sessions as a client reads them: what each has at its teams, and
 * last the place its work is reviewed from, which is the team above the
 * one it was opened at, or that team itself at the top.
 */
function sessionsNow(): Session[] {
  return mockSessions.flatMap((session) => {
    const opened = tree.get(session.team_id);
    if (!opened) return [];
    const aboveId = opened.parent_id ?? opened.id;
    const leadId = `${placeId(aboveId, session.id)}@lead`;
    const here = new Set(session.work.map((work) => work.team_id));
    const places = session.work.flatMap((work): SessionTeam[] => {
      const team = tree.get(work.team_id);
      if (!team) return [];
      const escalations = work.escalations ?? [];
      return [
        {
          ...team,
          worktree_path: `.worktrees/${session.id}`,
          branch: `director/session/${session.id}`,
          base_commit: "",
          boundary_enforcement: "sandbox",
          division_lead: false,
          agents: TEAM_AGENTS,
          pending_split: null,
          waiting_to_start: false,
          ...work,
          id: placeId(team.id, session.id),
          parent_id:
            team.id === session.team_id
              ? leadId
              : placeId(team.parent_id ?? "", session.id),
          child_ids: team.child_ids
            .filter((id) => here.has(id))
            .map((id) => placeId(id, session.id)),
          escalations,
          review: work.review ?? null,
          session: session.id,
          team_id: team.id,
        },
      ];
    });
    const above = tree.get(aboveId);
    const [first] = places;
    if (!above || !first) return [];
    const reviewPlace: SessionTeam = {
      ...above,
      id: leadId,
      parent_id: null,
      child_ids: [first.id],
      worktree_path: ".",
      branch: "main",
      base_commit: "",
      boundary_enforcement: "sandbox",
      agents: DIVISION_LEADS,
      status: "idle",
      escalations: [],
      pending_split: null,
      review: null,
      waiting_to_start: false,
      session: session.id,
      team_id: aboveId,
      division_lead: true,
      merge: session.waits ?? null,
    };
    return [
      {
        id: session.id,
        title: session.title,
        team_id: session.team_id,
        team: opened.title,
        above_id: aboveId,
        request: session.request,
        opened_at: session.opened_at,
        branch: "main",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cost: 0,
          unpriced_tokens: 0,
        },
        cost_allowance: 0,
        status: first.status,
        review: first.review?.state ?? null,
        conversation_id: null,
        teams: [...places, reviewPlace],
      },
    ];
  });
}

/** What waits on the human in any session, critical issues first. */
function escalationsWaiting(): OpenEscalation[] {
  return sessionsNow()
    .flatMap((session) =>
      session.teams.flatMap((place) => {
        const team = tree.get(place.team_id);
        if (!team) return [];
        return place.escalations
          .filter((escalation) => escalation.held_by === null)
          .map((escalation) => ({
            node_id: team.id,
            session_id: session.id,
            session: session.title,
            escalation,
            path: [...ancestorsOf(team), team].map(({ id, title }) => ({
              id,
              title,
            })),
          }));
      }),
    )
    .sort(
      (a, b) =>
        Number(a.escalation.kind !== "critical_issue") -
          Number(b.escalation.kind !== "critical_issue") ||
        a.escalation.raised_at.localeCompare(b.escalation.raised_at),
    );
}

function snapshot(focusId: NodeId, full: boolean): OrgEvent | null {
  const focus = tree.get(focusId);
  if (!focus) return null;
  const nodes = new Map<NodeId, OrgNode>();
  [
    ...ancestorsOf(focus),
    focus,
    ...reportsOf(focusId),
    ...(full ? subtreeOf(focusId) : []),
  ].forEach((node) => nodes.set(node.id, node));
  return {
    type: "snapshot",
    focus_id: focusId,
    nodes: [...nodes.values()],
    escalations: escalationsWaiting(),
    sessions: sessionsNow(),
    paused: null,
    merging: false,
  };
}

/** The open streams, which hear about what changes in a session. */
const subscribers = new Set<(event: OrgEvent) => void>();

export function resetDirectorMockData() {
  tree = buildMockTree();
  mockSessions = buildMockSessions();
  mockOrgSettings = {};
}

/** Tell the open streams what the sessions are now, and what waits. */
function announceSessions() {
  subscribers.forEach((tell) => {
    tell({ type: "sessions", sessions: sessionsNow() });
    tell({ type: "escalations", escalations: escalationsWaiting() });
  });
}

function frame(event: OrgEvent) {
  return new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

function notFound(id: string) {
  return HttpResponse.json({ detail: `Unknown node: ${id}` }, { status: 404 });
}

/** What the mock org did before the page was opened, newest first. */
const MOCK_HISTORY: HistoryEvent[] = [
  {
    at: "2026-05-11T05:10:00+00:00",
    kind: "accepted",
    team_id: "payments",
    team: "payments domain",
    above_id: ROOT_ID,
    above: "Root organization",
    session: "Release 2.4",
    detail: "at review 2",
    paths: ["payments"],
    base: "3dd5e1284c1f0c9a7e6b5d4c3b2a190817263544",
    head: "9cd48bb5a6f7e8d9c0b1a2f3e4d5c6b7a8091827",
  },
  {
    at: "2026-05-11T04:40:00+00:00",
    kind: "sent_back",
    team_id: "payments",
    team: "payments domain",
    above_id: ROOT_ID,
    above: "Root organization",
    session: "Release 2.4",
    detail: "Retries charge twice.",
  },
  {
    at: "2026-05-11T02:05:00+00:00",
    kind: "set_up",
    team_id: "payments",
    team: "payments domain",
    above_id: ROOT_ID,
    above: "Root organization",
    session: "Release 2.4",
    detail: "Keeps the payments services working together.",
  },
];

export const DIRECTOR_HANDLERS = [
  http.get(`${BASE}/org`, () => {
    const body: OrgSummary = {
      root_id: ROOT_ID,
      node_count: tree.size,
      repo_path: "/workspace/project",
      directory: "",
      is_git_repository: true,
      boundary_enforcement: "sandbox",
      paused: null,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/search`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const words = (params.get("q") ?? "").toLowerCase().split(/\s+/);
    const limit = Number(params.get("limit") ?? 8);
    const body: TeamMatch[] = [...tree.values()]
      .filter((node) => {
        const text = `${node.title} ${node.boundary.path}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .slice(0, limit)
      .map((node) => ({
        id: node.id,
        title: node.title,
        path: node.boundary.path,
      }));
    return HttpResponse.json(body);
  }),

  http.post(`${BASE}/org/messages`, async ({ request }) => {
    const payload = (await request.json()) as RouteMessageRequest | null;
    if (typeof payload?.text !== "string" || !payload.text.trim()) {
      return HttpResponse.json(
        { detail: "`text` must be a non-empty string" },
        { status: 422 },
      );
    }
    // The mock org's agents have no conversations to take a message, so
    // it is not routed and the page starts an ordinary conversation.
    return HttpResponse.json(
      { detail: "The mock org takes no messages" },
      { status: 409 },
    );
  }),

  http.post(
    `${BASE}/org/sessions/:sessionId/teams/:nodeId/escalations/:escalationId/answer`,
    async ({ params, request }) => {
      const sessionId = String(params.sessionId);
      const nodeId = String(params.nodeId);
      const escalationId = String(params.escalationId);
      const work = mockSessions
        .find((session) => session.id === sessionId)
        ?.work.find((candidate) => candidate.team_id === nodeId);
      if (!work) return notFound(placeId(nodeId, sessionId));
      const payload = (await request.json()) as { answer?: unknown } | null;
      if (typeof payload?.answer !== "string" || !payload.answer.trim()) {
        return HttpResponse.json(
          { detail: "`answer` must be a non-empty string" },
          { status: 422 },
        );
      }
      const waiting = (work.escalations ?? []).some(
        ({ id, held_by: heldBy }) => id === escalationId && heldBy === null,
      );
      if (!waiting) {
        return HttpResponse.json(
          { detail: "That escalation does not wait on the human" },
          { status: 409 },
        );
      }
      // An answer settles it, and the team works again.
      work.escalations = (work.escalations ?? []).filter(
        ({ id }) => id !== escalationId,
      );
      work.status = "working";
      announceSessions();
      return HttpResponse.json(
        sessionsNow()
          .find((session) => session.id === sessionId)
          ?.teams.find((place) => place.id === placeId(nodeId, sessionId)),
      );
    },
  ),

  http.delete(`${BASE}/org/sessions/:sessionId`, ({ params }) => {
    const sessionId = String(params.sessionId);
    if (!mockSessions.some((session) => session.id === sessionId)) {
      return HttpResponse.json(
        { detail: `No session '${sessionId}' is open` },
        { status: 404 },
      );
    }
    mockSessions = mockSessions.filter((session) => session.id !== sessionId);
    announceSessions();
    return HttpResponse.json({}, { status: 202 });
  }),

  // What the page reads beside the tree, so that every part of it has
  // something to show.
  http.get(`${BASE}/settings`, () => {
    const body: DirectorSettingsState = {
      max_teams: 120,
      max_depth: 5,
      default_agent_type: "software-engineer",
      allowed_agent_types: [],
      allowed_profiles: [],
      resume_on_start: false,
      report_compaction_chars: 24000,
      soft_check_in_minutes: 30,
      hard_check_in_minutes: 360,
      manager_check_accepted_reviews: 5,
      manager_check_ic_setbacks: 3,
      route_requests: true,
      session_cost_limit: 0,
      max_open_sessions: 0,
      teams: tree.size,
      depth: 3,
      max_concurrent_runs: null,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/settings`, () => HttpResponse.json(orgSettingsNow())),

  http.patch(`${BASE}/org/settings`, async ({ request }) => {
    const change = (await request.json()) as DirectorOrgSettings;
    const next = { ...mockOrgSettings, ...change };
    const allowed = next.allowed_agent_types ?? [];
    const named = [
      ...allowed,
      ...(next.default_agent_type ? [next.default_agent_type] : []),
    ];
    const unknown = named.find((name) => !(name in MOCK_AGENT_TYPES));
    if (unknown) {
      return HttpResponse.json(
        { detail: `No agent type is named '${unknown}'` },
        { status: 422 },
      );
    }
    const chosen = next.default_agent_type || DEFAULT_AGENT_TYPE;
    if (allowed.length > 0 && !allowed.includes(chosen)) {
      return HttpResponse.json(
        { detail: `The default agent type '${chosen}' is not allowed` },
        { status: 422 },
      );
    }
    mockOrgSettings = next;
    return HttpResponse.json(orgSettingsNow());
  }),

  http.get(`${BASE}/org/sessions`, () => HttpResponse.json(sessionsNow())),

  http.get(`${BASE}/org/history`, () => {
    const body: OrgHistory = { events: MOCK_HISTORY, earlier: false };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/accepted/changes`, ({ request }) => {
    const asked = new URL(request.url).searchParams;
    const folder = asked.get("path") ?? "";
    const body: AcceptedChanges = {
      base: asked.get("base") ?? "",
      head: asked.get("head") ?? "",
      files: [
        {
          path: `${folder}/src/main.py`,
          kind: "modified",
          added: 2,
          removed: 1,
          committed: true,
        },
        {
          path: `${folder}/tests/test_main.py`,
          kind: "added",
          added: 3,
          removed: 0,
          committed: true,
        },
      ],
      truncated: false,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/accepted/changes/file`, ({ request }) => {
    const path = new URL(request.url).searchParams.get("path") ?? "";
    const added = path.includes("tests/");
    const body: FileSides = {
      path,
      before: added ? null : "def charge(order):\n    return order.total\n",
      after: added
        ? "def test_charge():\n    assert charge(ORDER) == 12\n"
        : "def charge(order):\n    key = order.idempotency_key\n    return pay(order.total, key)\n",
      unreadable: false,
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/recovery`, () => {
    const body: Recovery = { paused: null, items: [], messages_held: 0 };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/tree-stream`, ({ request }) => {
    const params = new URL(request.url).searchParams;
    const focusId = params.get(NODE_QUERY_PARAM) ?? ROOT_ID;
    const event = snapshot(focusId, params.get(FULL_QUERY_PARAM) === "true");
    if (!event) return notFound(focusId);

    // A snapshot, then the stream stays open like the real one does.
    let tell: ((event: OrgEvent) => void) | null = null;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(frame(event));
        tell = (next) => controller.enqueue(frame(next));
        subscribers.add(tell);
      },
      cancel() {
        if (tell) subscribers.delete(tell);
      },
    });
    return new HttpResponse(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }),

  http.get(`${BASE}/org/nodes/:nodeId/memory`, ({ params }) => {
    const nodeId = String(params.nodeId);
    if (!tree.has(nodeId)) return notFound(nodeId);
    const body: NodeMemory = {
      specs: MOCK_SPECS[nodeId] ?? [],
      reports: MOCK_REPORTS[nodeId] ?? [],
      former_teams: [],
      history: [],
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/nodes/:nodeId/messages`, ({ params }) => {
    const nodeId = String(params.nodeId);
    // Threads are kept per place (`<team>@<session>`), as the server does:
    // nobody works at a team itself, so a team's own id has none.
    const [teamId, sessionId] = nodeId.split("@");
    if (!tree.has(teamId)) return notFound(nodeId);
    if (!sessionId) return HttpResponse.json([]);
    return HttpResponse.json(
      (MOCK_THREADS[teamId] ?? []).map((thread) => ({
        ...thread,
        manager_node_id: placeId(thread.manager_node_id, sessionId),
        ic_node_id: placeId(thread.ic_node_id, sessionId),
      })),
    );
  }),

  http.get(`${BASE}/org/nodes/:nodeId/ownership`, ({ params }) => {
    const nodeId = String(params.nodeId);
    const node = tree.get(nodeId);
    if (!node) return notFound(nodeId);
    const reports = reportsOf(nodeId);
    const kept = node.boundary.path ? `${node.boundary.path}/` : "";
    const [first, second] = reports;
    const body: NodeOwnership = {
      node_id: nodeId,
      owners: reports.map((report) => ({
        node_id: report.id,
        title: report.title,
        path: report.boundary.path,
        isolation: report.isolation,
        branch: "",
      })),
      files: [
        { path: `${kept}README.md`, owner: null },
        ...reports.flatMap((report) =>
          ["README.md", "src/main.py", "tests/test_main.py"].map((file) => ({
            path: `${report.boundary.path}/${file}`,
            owner: report.id,
          })),
        ),
      ],
      truncated: false,
      // The first two reports work in worktrees of their own at the root.
      collisions:
        nodeId === ROOT_ID && first && second
          ? [
              {
                path: `${first.boundary.path}/src/main.py`,
                node_ids: [first.id, second.id],
              },
            ]
          : [],
      collisions_checked: true,
    };
    return HttpResponse.json(body);
  }),
];
