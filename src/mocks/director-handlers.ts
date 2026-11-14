import { http, HttpResponse } from "msw";
import {
  DIRECTOR_BASE_PATH,
  type AgentRef,
  type StatusCounts,
  type NodeMemory,
  type NodeOwnership,
  type NodeStatus,
  type NodeId,
  type OpenEscalation,
  type OrgEvent,
  type OrgNode,
  type Report,
  type OrgSummary,
  type Review,
  type RoutedMessage,
  type RouteMessageRequest,
  type TeamMatch,
  type Thread,
} from "#/api/director/types";

/**
 * MSW handlers for the Agent Server director API, so `npm run dev:mock` renders the
 * org chart without one running. The tree is small and static: one root, a
 * few domains, a few modules under each, and two open escalations: one still
 * held by the team above, one that has reached the human and can be answered.
 */
const NODE_QUERY_PARAM = "node";
const FULL_QUERY_PARAM = "full";
const BASE = `*${DIRECTOR_BASE_PATH}`;
const ROOT_ID = "root";

const POD: AgentRef[] = [
  { role: "ic", conversation_id: null, status: "working" },
  { role: "manager", conversation_id: null, status: "idle" },
];

const DOMAINS: Array<{ name: string; status: NodeStatus }> = [
  { name: "platform", status: "working" },
  { name: "payments", status: "blocked" },
  { name: "identity", status: "idle" },
  { name: "search", status: "done" },
];

const MODULES: Array<{ name: string; status: NodeStatus }> = [
  { name: "api", status: "working" },
  { name: "worker", status: "blocked" },
  { name: "storage", status: "done" },
];

const ESCALATIONS: Record<NodeId, OrgNode["escalations"]> = {
  identity: [
    {
      id: "session-tokens",
      kind: "design_decision",
      title: "Session tokens: signed JWTs or opaque server-side sessions?",
      detail: "The api and worker teams disagree.",
      raised_at: "2026-11-10T09:12:00Z",
      held_by: ROOT_ID,
      handoffs: [],
    },
  ],
  "payments.worker": [
    {
      id: "idempotency-collision",
      kind: "critical_issue",
      title: "Idempotency keys collide across retries",
      detail: "The fix needs a schema change outside this team's boundary.",
      raised_at: "2026-11-11T16:40:00Z",
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
    },
  ],
};

function waitingOnHuman(id: NodeId) {
  return (ESCALATIONS[id] ?? []).filter(
    (escalation) => escalation.held_by === null,
  ).length;
}

function zeroCounts(): StatusCounts {
  return {
    idle: 0,
    working: 0,
    done: 0,
    blocked: 0,
  };
}

const MOCK_REPORTS: Record<NodeId, Report[]> = {
  payments: [
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
  automated_ran: true,
  automated: [],
  findings: [],
  at: "2026-11-12T10:00:00+00:00",
};

function buildMockTree() {
  const nodes = new Map<NodeId, OrgNode>();
  const moduleCounts = zeroCounts();
  MODULES.forEach(({ status }) => {
    moduleCounts[status] += 1;
  });

  const rootCounts = zeroCounts();
  DOMAINS.forEach((domain) => {
    const path = `services/${domain.name}`;
    rootCounts[domain.status] += 1;
    MODULES.forEach((module) => {
      rootCounts[module.status] += 1;
      const id = `${domain.name}.${module.name}`;
      nodes.set(id, {
        id,
        parent_id: domain.name,
        child_ids: [],
        title: `${domain.name}/${module.name}`,
        boundary: {
          path: `${path}/${module.name}`,
          writable: [`${path}/${module.name}/**`],
          readonly: [`${path}/contracts/**`],
        },
        isolation: "shared",
        worktree_path: `.worktrees/${domain.name}`,
        branch: `agents/${domain.name}`,
        agents: POD,
        status: module.status,
        headline: `Building ${module.name} for ${domain.name}.`,
        spec_summary: `Implements ${module.name} for ${domain.name}.`,
        escalations: ESCALATIONS[id] ?? [],
        pending_split: null,
        review: module.status === "done" ? MOCK_REVIEW : null,
        descendant_counts: zeroCounts(),
        escalation_count: waitingOnHuman(id),
      });
    });
    const own = ESCALATIONS[domain.name] ?? [];
    const below = MODULES.reduce(
      (sum, module) => sum + waitingOnHuman(`${domain.name}.${module.name}`),
      0,
    );
    nodes.set(domain.name, {
      id: domain.name,
      parent_id: ROOT_ID,
      child_ids: MODULES.map((module) => `${domain.name}.${module.name}`),
      title: `${domain.name} domain`,
      boundary: { path, writable: [`${path}/*.md`], readonly: [] },
      isolation: "worktree",
      worktree_path: `.worktrees/${domain.name}`,
      branch: `agents/${domain.name}`,
      agents: POD,
      status: domain.status,
      headline: `Keeps the ${domain.name} services working together.`,
      spec_summary: `Interface contracts between the ${domain.name} services.`,
      escalations: own,
      pending_split: null,
      descendant_counts: { ...moduleCounts },
      escalation_count: waitingOnHuman(domain.name) + below,
    });
  });
  nodes.set(ROOT_ID, {
    id: ROOT_ID,
    parent_id: null,
    child_ids: DOMAINS.map((domain) => domain.name),
    title: "Root organization",
    boundary: { path: "", writable: [], readonly: ["**"] },
    isolation: "worktree",
    worktree_path: ".",
    branch: "main",
    agents: POD,
    status: "working",
    headline: "Plans the release across every domain.",
    spec_summary: "Owns cross-domain contracts and the release plan.",
    escalations: [],
    pending_split: null,
    descendant_counts: rootCounts,
    escalation_count: Object.keys(ESCALATIONS).reduce(
      (sum, id) => sum + waitingOnHuman(id),
      0,
    ),
  });
  return nodes;
}

let tree = buildMockTree();

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

/** What waits on the human anywhere in the tree, critical issues first. */
function escalationsWaiting(): OpenEscalation[] {
  return [...tree.values()]
    .flatMap((node) =>
      node.escalations
        .filter((escalation) => escalation.held_by === null)
        .map((escalation) => ({
          node_id: node.id,
          escalation,
          path: [...ancestorsOf(node), node].map(({ id, title }) => ({
            id,
            title,
          })),
        })),
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
  };
}

/** The open streams, which hear about an answered escalation. */
const subscribers = new Set<(event: OrgEvent) => void>();

export function resetDirectorMockData() {
  tree = buildMockTree();
}

/** The team that owns the nearest folder at or above `path`. */
function nearestTeam(path: string): OrgNode {
  const teams = [...tree.values()];
  for (let folder = path; ; folder = folder.replace(/\/?[^/]*$/, "")) {
    const team = teams.find((node) => node.boundary.path === folder);
    if (team) return team;
  }
}

function frame(event: OrgEvent) {
  return new TextEncoder().encode(
    `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

/** Settle an escalation that waits on the human, as an answer does. */
function settle(node: OrgNode, escalationId: string): OrgNode {
  const settled: OrgNode = {
    ...node,
    escalations: node.escalations.filter(({ id }) => id !== escalationId),
    escalation_count: node.escalation_count - 1,
  };
  tree.set(node.id, settled);
  const changed = [settled];
  ancestorsOf(node).forEach((ancestor) => {
    const updated = {
      ...ancestor,
      escalation_count: ancestor.escalation_count - 1,
    };
    tree.set(ancestor.id, updated);
    changed.push(updated);
  });
  subscribers.forEach((tell) => {
    changed.forEach((changedNode) =>
      tell({ type: "node_upsert", node: changedNode }),
    );
    tell({ type: "escalations", escalations: escalationsWaiting() });
  });
  return settled;
}

function notFound(id: string) {
  return HttpResponse.json({ detail: `Unknown node: ${id}` }, { status: 404 });
}

export const DIRECTOR_HANDLERS = [
  http.get(`${BASE}/org`, () => {
    const body: OrgSummary = {
      root_id: ROOT_ID,
      node_count: tree.size,
      repo_path: "/workspace/project",
      directory: "",
      is_git_repository: true,
      fixture: true,
      boundary_enforcement: "sandbox",
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
    const body: RoutedMessage = {
      node_id: nearestTeam(payload.path ?? "").id,
      // The mock org's agents have no conversations.
      conversation_id: "",
      started_org: false,
    };
    return HttpResponse.json(body);
  }),

  http.post(
    `${BASE}/org/nodes/:nodeId/escalations/:escalationId/answer`,
    async ({ params, request }) => {
      const nodeId = String(params.nodeId);
      const escalationId = String(params.escalationId);
      const node = tree.get(nodeId);
      if (!node) return notFound(nodeId);
      const payload = (await request.json()) as { answer?: unknown } | null;
      if (typeof payload?.answer !== "string" || !payload.answer.trim()) {
        return HttpResponse.json(
          { detail: "`answer` must be a non-empty string" },
          { status: 422 },
        );
      }
      const waiting = node.escalations.some(
        ({ id, held_by: heldBy }) => id === escalationId && heldBy === null,
      );
      if (!waiting) {
        return HttpResponse.json(
          { detail: "That escalation does not wait on the human" },
          { status: 409 },
        );
      }
      return HttpResponse.json(settle(node, escalationId));
    },
  ),

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
      specs: [],
      reports: MOCK_REPORTS[nodeId] ?? [],
    };
    return HttpResponse.json(body);
  }),

  http.get(`${BASE}/org/nodes/:nodeId/messages`, ({ params }) => {
    const nodeId = String(params.nodeId);
    if (!tree.has(nodeId)) return notFound(nodeId);
    return HttpResponse.json(MOCK_THREADS[nodeId] ?? []);
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
        branch: report.branch,
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
