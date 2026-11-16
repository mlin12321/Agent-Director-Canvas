/**
 * The Agent Server's director API, as the org-chart UI consumes it. The
 * contract is defined by the server (`openhands.agent_server.director.models`
 * in the SDK); these types mirror it and must not add to it.
 */

export type NodeId = string;

/**
 * A pod has an IC and a Manager. A team's IC leads that team, is a report
 * of the team above, and does the code work in its boundary that no
 * sub-team has taken on.
 */
export type AgentRole = "ic" | "manager";

/**
 * An IC in hand-over mode: beside its main conversation it has one the
 * director started to pass on what removed teams left. It shares nothing
 * with the main conversation.
 */
export interface HandOverMode {
  conversation_id: string;
  status: string;
}

export type NodeStatus = "idle" | "working" | "done" | "blocked";

/** `worktree`: own git worktree. `shared`: same directory as the parent. */
export type IsolationMode = "worktree" | "shared";

/** A codeowner boundary. All paths and globs are repo-relative. */
export interface Boundary {
  /** Directory the boundary is rooted at; `""` is the repository root. */
  path: string;
  writable: string[];
  readonly: string[];
}

export interface AgentRef {
  role: AgentRole;
  /** Set on an IC that is, or last was, in hand-over mode. */
  hand_over?: HandOverMode | null;
  /** `null` until the director has started a conversation for this agent. */
  conversation_id: string | null;
  status: string;
  kind: AgentKind;
  /**
   * Which external agent an `acp` agent is, such as `claude-code` or
   * `codex`; `null` when the server could not tell.
   */
  acp_server?: string | null;
}

/**
 * `acp`: an external agent, such as Claude Code or Codex, that runs its own
 * tools and reaches the director's through an MCP server.
 */
export type AgentKind = "openhands" | "acp";

/**
 * How one team is held to its boundary. `merge`: its agent runs its own
 * tools and no sandbox holds it, so what it commits outside its directory is
 * refused only when its work is merged into the team above.
 */
export type TeamEnforcement = BoundaryEnforcement | "merge";

export type EscalationKind = "critical_issue" | "design_decision";

/** A node that tried to settle an escalation, could not, and passed it up. */
export interface EscalationHandoff {
  node_id: NodeId;
  /** Why this node could not settle it. */
  reason: string;
  /** ISO 8601 timestamp. */
  at: string;
}

/**
 * Something an agent of a node cannot settle itself. It goes to the agent of
 * the same role in the node above (an IC's to the IC there, a Manager's to
 * the Manager), which settles it or passes it up in turn; it waits on the
 * human only once every node above the one that raised it has passed it up.
 */
export interface Escalation {
  /** Unique within the node that raised it. */
  id: string;
  kind: EscalationKind;
  title: string;
  detail: string;
  /** ISO 8601 timestamp. */
  raised_at: string;
  /** Which agent of the node raised it; the answer goes back to that one. */
  raised_by: AgentRole;
  /** The node working on it now; `null` when it waits on the human. */
  held_by: NodeId | null;
  /** The nodes that passed it up, nearest to the one that raised it first. */
  handoffs: EscalationHandoff[];
  /**
   * A team that is not above the one that raised it, which the director
   * asked to settle it directly. While set, that team's IC has it and
   * `held_by` does not.
   */
  asked_of: NodeId | null;
  /** When `asked_of` was asked (ISO 8601). */
  asked_at: string | null;
}

export type StatusCounts = Record<NodeStatus, number>;

export type SplitStatus = "proposed" | "approved";

/** A sub-team an IC proposes to hand part of its boundary to. */
export interface SplitChild {
  title: string;
  /** Directory the sub-team owns, inside the proposing node's boundary. */
  path: string;
  writable: string[];
  readonly: string[];
  isolation: IsolationMode;
  /** What the sub-team is to deliver. */
  task: string;
  /** Why the proposer wants this team, when it said. */
  reason?: string;
}

/**
 * The sub-teams an IC proposed in a message to its Manager, which approves
 * them as written or answers with a message.
 */
export interface SplitProposal {
  children: SplitChild[];
  contracts: string;
  /** Why the proposer wants this make-up of teams, when it said. */
  reason?: string;
  status: SplitStatus;
  /**
   * The sub-teams the node has now that the proposed ones take the place of.
   * Their own sub-teams stay.
   */
  replaces?: NodeId[];
  /** The sub-teams the node has now that the IC said are to stay as they are. */
  keeps?: NodeId[];
  /** ISO 8601 timestamp. */
  proposed_at: string;
}

/**
 * `pending`: the IC of the team above has the work to review. `unreviewed`:
 * the root team's, which has nobody above.
 */
export type ReviewState =
  "pending" | "changes_requested" | "accepted" | "unreviewed";

/** One thing a review found wrong in a team's work. */
export interface ReviewFinding {
  /** The file, relative to the repository; `""` when it is about no one file. */
  path: string;
  line: number | null;
  issue: string;
  evidence: string;
}

/**
 * The review of the work a team reported as done. The IC of the team above
 * reviews it; before that, the team's own IC is asked to describe the changes
 * and to review them.
 */
export interface Review {
  state: ReviewState;
  /** 1 the first time; one more each time the work comes back. */
  round: number;
  /** What the team said it delivered. */
  summary: string;
  /** The team's own account of what it changed, as markdown. */
  description: string;
  /** Whether the team's IC, asked to review the changes, gave an answer. */
  automated_ran: boolean;
  /** What it found. */
  automated: ReviewFinding[];
  /** What the reviewing IC wants changed, when it asked. */
  findings: ReviewFinding[];
  /**
   * Whether the work went up without a review of its own: all of it was
   * accepted work of the team's sub-teams.
   */
  passed_up?: boolean;
  /** ISO 8601 timestamp of the last change. */
  at: string;
}

/** That the IC of the team above stopped a team, and why. */
export interface Stopped {
  /** ISO 8601 timestamp. */
  at: string;
  reason: string;
}

export interface OrgNode {
  id: NodeId;
  parent_id: NodeId | null;
  child_ids: NodeId[];
  title: string;
  boundary: Boundary;
  isolation: IsolationMode;
  worktree_path: string;
  branch: string;
  agents: AgentRef[];
  status: NodeStatus;
  /**
   * One line on what the team is delivering, written by a model from the
   * team's task and its latest report. Empty on a server that writes none.
   */
  headline?: string;
  spec_summary: string;
  /** Open escalations this node raised, wherever above they are held. */
  escalations: Escalation[];
  /** A split of this node's boundary that is not carried out yet. */
  pending_split: SplitProposal | null;
  /**
   * The review of what the team last reported as done.
   */
  review: Review | null;
  /**
   * An agent of the team could not be started yet because the server runs
   * as many conversations as it may.
   */
  waiting_to_start: boolean;
  /**
   * Set while the IC of the team above has stopped the team: its agents and
   * those of every team below it are at rest and nothing is sent to them.
   */
  stopped?: Stopped | null;
  /**
   * Specs that teams before this one left in its directory. They are old
   * until the team's IC writes its own spec.
   */
  old_specs: OldSpec[];
  /**
   * The agent profile the team's agents were started from; `null` when
   * they were derived from the team above.
   */
  agent_profile?: string | null;
  /** How this team is held to its boundary; `null` until its IC ran. */
  boundary_enforcement?: TeamEnforcement | null;
  /**
   * Status of every node below this one, so a parent can summarize its whole
   * subtree without the client loading it.
   */
  descendant_counts: StatusCounts;
  /** Escalations from this node or below that wait on the human. */
  escalation_count: number;
}

/**
 * Limits on the teams an org may still add. They are checked when a team
 * splits; teams that exist are never removed for exceeding one.
 */
export interface DirectorSettings {
  /**
   * The most teams a team may be together with every team below it. Every
   * team has an IC and a Manager.
   */
  max_teams: number;
  /** The most levels of teams; the root team is level 1. */
  max_depth: number;
  /**
   * Names of the agent profiles a team may give a sub-team in place of its
   * own agent. Empty: every team runs on the agent of the team above.
   */
  allowed_profiles: string[];
  /**
   * Whether an org that was stopped in the middle of its work takes it up
   * again as soon as the server is back.
   */
  resume_on_start: boolean;
  /**
   * How many minutes a team may show no progress, with nothing submitted or
   * with its work sent back, before the IC of the team above is told. 0
   * turns the check off.
   */
  stall_check_minutes: number;
  /**
   * After how many reviews its IC accepted a Manager is woken to look at its
   * teams. 0 turns the check off.
   */
  manager_check_accepted_reviews: number;
  /**
   * After how many escalations from one team directly below on the work it
   * has in hand, and after how many times that work was sent back, a Manager
   * is woken to look at its teams. 0 turns the check off.
   */
  manager_check_ic_setbacks: number;
  /**
   * Whether what is written to the org as a whole, and what an IC asks of
   * another team, may go straight to the team the director chooses.
   */
  route_requests: boolean;
}

/** The settings, beside what the org has now. */
export interface DirectorSettingsState extends DirectorSettings {
  /** How many teams the org has. */
  teams: number;
  depth: number;
  /**
   * How many conversations the server runs at once; teams beyond that wait
   * to start. `null` when the director was not told.
   */
  max_concurrent_runs: number | null;
}

/** A team found by its title or its directory. */
export interface TeamMatch {
  id: NodeId;
  title: string;
  /** The directory the team owns; `""` at the root. */
  path: string;
}

/** Whether the director has an org, and where it would keep one. */
export interface OrgSummary {
  /** `null` when no org has been started. */
  root_id: NodeId | null;
  /**
   * The conversation of the top team's IC; `null` when there is no org or
   * that IC has no conversation here.
   */
  top_conversation_id: string | null;
  node_count: number;
  /**
   * The directory the org works in. For a server started in a git submodule
   * that has no org, the nearest repository above it that has one.
   */
  repo_path: string;
  /**
   * The directory the server was started for, relative to `repo_path`;
   * `""` when they are the same.
   */
  directory: string;
  /** An org can only be started in a git repository. */
  is_git_repository: boolean;
  /** The tree is a fixed sample; its agents are not running. */
  fixture: boolean;
  boundary_enforcement: BoundaryEnforcement;
  /**
   * Why the org's agents are held and its steps and messages wait; `null`
   * when the org runs.
   */
  paused: PauseReason | null;
  /** A pull stopped on conflicts and waits for choices. */
  merging?: boolean;
}

/**
 * Why an org is paused. `shutdown`: the server was stopped while the org
 * worked. `crash`: the server ended without stopping the org first.
 */
export type PauseReason = "human" | "shutdown" | "crash";

/**
 * `dropped`: run state that no longer fits the org was put aside.
 * `cannot_resume`: a team that cannot be taken up as it is. The others say
 * what resuming does.
 */
export type RecoveryKind =
  "run_again" | "start" | "continue" | "message" | "dropped" | "cannot_resume";

/** One thing a paused org takes up again, or cannot. */
export interface RecoveryItem {
  /** The team it is about; `""` for the whole org. */
  node_id: NodeId;
  title: string;
  kind: RecoveryKind;
  /** What it is, in the server's words. */
  detail: string;
}

/** What a paused org does when it is resumed. */
export interface Recovery {
  paused: PauseReason | null;
  items: RecoveryItem[];
  /** How many messages to agents wait for the org to resume. */
  messages_held: number;
}

/**
 * How far a team is held to its boundary. `sandbox`: the shell of an agent
 * can write only the directory its team owns, and its file tools are refused
 * anything else. `checks`: only the file tools are refused.
 */
export type BoundaryEnforcement = "sandbox" | "checks";

/** Something the human says to the org, from somewhere in the repository. */
export interface RouteMessageRequest {
  text: string;
  /** The directory the message is about, repo-relative. Default: the root. */
  path?: string;
  /**
   * Let the director choose a team below the one `path` gives, by the files
   * the text names and by what a model makes of it. It moves down only when
   * it is sure.
   */
  auto?: boolean;
  /**
   * How to start the root team's IC when there is no org yet, as for a
   * normal conversation; the message then becomes the org's task and every
   * other agent is derived from this one.
   */
  conversation?: Record<string, unknown>;
}

/** A request the human wants worked on beside what a team is doing. */
export interface OpenSessionRequest {
  text: string;
  /** What to call the session; taken from the text when left out. */
  title?: string;
  /** The team to open it at. Left out, the director chooses the team. */
  node_id?: NodeId;
}

/**
 * What a session has at one team of the org: agents, a checkout, a review
 * and escalations of its own. It is no node of the org tree. `id` is its
 * own, `parent_id` what the session has at the team above (for the team it
 * was opened at: the team whose IC reviews it), `child_ids` what it has at
 * the team's sub-teams.
 */
export interface SessionTeam extends OrgNode {
  /** The session. */
  session: string;
  /** The team of the org. */
  team_id: NodeId;
}

/**
 * A line of work the human opened at a team, beside the org's own. It is
 * not part of the org tree, which is the org's structure: it has agents and
 * a checkout of its own at the team it was opened at and, once they are
 * given a task in it, at the teams below. The IC of the team above reviews
 * its work.
 */
export interface Session {
  id: string;
  title: string;
  /** The team of the org it was opened at, and that team's title. */
  team_id: NodeId;
  team: string;
  /** The team whose IC reviews its work. */
  above_id: NodeId;
  /** What the human asked of it. */
  request: string;
  opened_at: string;
  status: NodeStatus;
  review: ReviewState | null;
  /** The conversation of its IC at the team it was opened at. */
  conversation_id: string | null;
  /** What it has at each of its teams, the one it was opened at first. */
  teams: SessionTeam[];
}

/**
 * Where an agent is from a conversation: `above` an agent of the team that
 * reviews its team's work, `beside` the other agent of its own team,
 * `below` the IC of a team directly below, `session` the IC of a session
 * whose work its team reviews.
 */
export type ConversationRelation = "above" | "beside" | "below" | "session";

/** An agent's conversation, as it is reached from another one. */
export interface ConversationLink {
  conversation_id: string;
  relation: ConversationRelation;
  /** The team of the org the agent works for, and its title. */
  node_id: NodeId;
  team: string;
  role: AgentRole;
  /** The session the agent works in and its title; empty for none. */
  session_id: string;
  session: string;
  status: string;
}

/** Where an agent's conversation is in the org, and those a level away. */
export interface ConversationPlace {
  conversation_id: string;
  node_id: NodeId;
  team: string;
  role: AgentRole;
  session_id: string;
  session: string;
  /** Whether the human has written in this conversation. */
  human_joined: boolean;
  /** Above first, then beside, below and sessions. */
  links: ConversationLink[];
}

/** A session that was just opened. */
export interface OpenedSession {
  session: Session;
  conversation_id: string;
  chosen_by: RoutedMessage["chosen_by"];
  reason: string;
}

/** One event of an org's history, with the team whose record holds it. */
export interface HistoryEvent extends TeamEvent {
  /** The team directly above the event's team. */
  above_id: NodeId;
  above: string;
}

/** What became of the teams of an org, newest first. */
export interface OrgHistory {
  events: HistoryEvent[];
  /** Whether there are events before these. */
  earlier: boolean;
}

/** Where a message to the org went. */
export interface RoutedMessage {
  /** The team that received it. */
  node_id: NodeId;
  /** The title of that team. */
  team: string;
  /** The conversation of that team's IC. */
  conversation_id: string;
  /** There was no org, and the message started one. */
  started_org: boolean;
  /**
   * How the team was found. `path`: it owns the directory the message came
   * from. `named`: the director chose it by the files the text names.
   * `model`: by what a model made of the text. `top`: the director was not
   * sure of any team below the one the directory gives.
   */
  chosen_by: "path" | "named" | "model" | "top";
  /** Why this team, in a sentence, in the server's words; may be empty. */
  reason: string;
}

/** An escalation that waits on the human, with the nodes it came up through. */
export interface OpenEscalation {
  /** The team of the org that raised it. */
  node_id: NodeId;
  /** The session it was raised in and its title; empty for the org's own. */
  session_id: string;
  session: string;
  escalation: Escalation;
  /** Root first, ending at the node that raised it. */
  path: Array<{ id: NodeId; title: string }>;
}

/** Something an agent recorded for itself and the other agent of its team. */
export interface Report {
  /** ISO 8601 timestamp. */
  at: string;
  /** Which agent of the team wrote it. */
  role: AgentRole;
  text: string;
  /** The title of the session its writer works in; empty for the org's own. */
  session?: string;
  /** True for the one report a model wrote in place of earlier ones. */
  compacted?: boolean;
  /**
   * True for what the IC of the team above passed on of the teams that were
   * there before this one. The team's own agents did not write it.
   */
  handed_over?: boolean;
}

/** One message between a Manager and an IC. */
export interface ThreadMessage {
  /** ISO 8601 timestamp. */
  at: string;
  /** Which of the two wrote it. */
  sender: AgentRole;
  text: string;
}

/**
 * What one Manager and one IC have said to each other, oldest first. The IC
 * is the Manager's own, or the IC of a team directly below it. With
 * `ic_to_ic`, what the IC of the team above wrote to an IC instead: those go
 * one way, and `manager_node_id` is then the team of the IC that writes.
 */
export interface Thread {
  manager_node_id: NodeId;
  ic_node_id: NodeId;
  ic_to_ic?: boolean;
  messages: ThreadMessage[];
}

export interface InheritedSpec {
  path: string;
  spec: string;
  /** False for the spec of the node's own boundary, which its IC writes. */
  readonly: boolean;
  /** True for a spec a team before this one left; it is to be rewritten. */
  old?: boolean;
  /** The title of the team that left an old spec, when known. */
  left_by?: string | null;
}

/** A spec a team before left in a directory a team now owns. */
export interface OldSpec {
  /** The directory of the spec; '' at the root. */
  path: string;
  /** The title of the team that left it, when known. */
  team: string | null;
}

/** What the sub-teams of one boundary must keep between them. */
export interface BoundaryContracts {
  /** The boundary that was split. */
  path: string;
  contracts: string;
  /**
   * True for the contracts between the node's own sub-teams; false for the
   * ones the team above set, which the node keeps with the teams beside it.
   */
  own: boolean;
}

export type TeamEventKind =
  | "set_up"
  | "accepted"
  | "sent_back"
  | "stalled"
  | "stopped"
  | "replaced"
  | "pruned"
  | "woken"
  | "proposed"
  | "approved"
  | "declined"
  | "needed"
  | "asked"
  | "misrouted"
  | "asked_team"
  | "answered"
  | "session_opened"
  | "session_closed";

/** Something that became of a team directly below a team. */
export interface TeamEvent {
  at: string;
  kind: TeamEventKind;
  /**
   * Empty when the event is about no single team. A `woken` event names the
   * team whose escalations reached the limit that wakes the Manager.
   */
  team_id?: string;
  team?: string;
  /** The title of the session the team works in, when it works in one. */
  session?: string;
  /**
   * For `woken`, why the Manager was woken; for `proposed`, `approved` and
   * `declined`, the sub-teams, and for `declined` the Manager's reason. In
   * the server's words.
   */
  detail?: string;
  /**
   * The directories a proposal was for; on `needed`, the file in the other
   * team's directory.
   */
  paths?: string[];
  /**
   * On `needed`, the team beside this one whose directory it needed; on
   * `asked_team` and `answered`, the team it asked directly.
   */
  other_id?: string;
  other?: string;
}

/** A team that was removed from below a team, and what it left. */
export interface FormerTeam {
  id: NodeId;
  title: string;
  path: string;
  purpose: string;
  ended: "replaced" | "pruned";
  at: string;
  /** Its agents' reports as one report. */
  compacted_report?: string;
  /** The contracts between its own sub-teams. */
  contracts?: string;
}

export interface NodeMemory {
  /** The spec of the node's own boundary, when it has one. */
  specs: InheritedSpec[];
  contracts?: BoundaryContracts[];
  /** What the team's own two agents recorded, oldest first. */
  reports?: Report[];
  /** The teams removed from directly below it. */
  former_teams: FormerTeam[];
  /** What became of the teams directly below it. */
  history: TeamEvent[];
}

/** A direct report, as the owner of a directory. */
export interface BoundaryOwner {
  node_id: NodeId;
  title: string;
  /** The directory it owns, relative to the repository. */
  path: string;
  isolation: IsolationMode;
  branch: string;
}

export interface OwnedFile {
  /** Relative to the repository. */
  path: string;
  /** The direct report that owns the file; null when the node kept it. */
  owner: NodeId | null;
}

/** A file the committed work of two teams changed in ways that do not merge. */
export interface Collision {
  path: string;
  /** The teams whose checkouts collide, the node itself included. */
  node_ids: NodeId[];
}

/** One file a team changed. */
export interface ChangedFile {
  /** Relative to the top of the repository. */
  path: string;
  kind: "added" | "modified" | "deleted";
  /** `null` when the file is not text. */
  added: number | null;
  removed: number | null;
  /** False when the file has changes that are not committed. */
  committed: boolean;
}

/** What a team changed in its directory since its base commit. */
export interface TeamChanges {
  node_id: NodeId;
  /** The commit compared with; `""` when the team has none yet. */
  base: string;
  files: ChangedFile[];
  truncated: boolean;
}

/** A file at a team's base commit and in its checkout now. */
export interface FileSides {
  path: string;
  before: string | null;
  after: string | null;
  /** A side is not text or is too large, and is left out. */
  unreadable: boolean;
}

/** What came of a change made by hand; `commit` is null when nothing changed. */
export interface FileEdit {
  path: string;
  commit: string | null;
}

/** How a node's boundary is divided among its direct reports. */
export interface NodeOwnership {
  node_id: NodeId;
  owners: BoundaryOwner[];
  /** The unignored files of the node's boundary in its own checkout. */
  files: OwnedFile[];
  truncated: boolean;
  /** From the tips of the checkouts; uncommitted changes are not compared. */
  collisions: Collision[];
  /** False when the server's git is too old to look for collisions. */
  collisions_checked: boolean;
}

/**
 * A snapshot holds the focused node, its ancestors and its direct reports
 * (or, for a full stream, every node below it), plus every escalation in the
 * tree that waits on the human. Node events are limited to that same set of
 * nodes; an `escalations` event carries the whole new list.
 */
/** What a pull or a push of the team memory did. */
export interface MemorySync {
  remote: string;
  /** The local team memory's commit afterwards; `null` when it is empty. */
  head: string | null;
  /** The local team memory took in remote changes. */
  changed: boolean;
  /**
   * Specs and contracts both sides had changed. The local text was kept;
   * the remote text is in the team memory's history.
   */
  kept_local: string[];
  /** The remote now has the local team memory. */
  pushed: boolean;
}

export type Side = "mine" | "theirs";

/**
 * Something both sides of a pull changed. `field`: one field of a team.
 * `team`: one side removed a team the other changed. `file`: both changed
 * the same lines of a spec or of contracts.
 */
export interface OrgConflict {
  /** Names the conflict in a resolve request. */
  id: string;
  kind: "field" | "team" | "file";
  /** The team; "" for a file of the team memory. */
  node_id: NodeId;
  title: string;
  /** The field, or the file's path. */
  field: string;
  /** What is here; `null` when removed here. */
  mine: string | null;
  /** What the remote has; `null` when removed there. */
  theirs: string | null;
  choice: Side | null;
}

/** A pull that stopped because both sides changed the same thing. */
export interface OrgMerge {
  remote: string;
  conflicts: OrgConflict[];
}

/** What a pull or a push did with the branch of one team's work. */
export interface BranchSync {
  node_id: NodeId;
  title: string;
  branch: string;
  result: "created" | "fast_forwarded" | "diverged" | "pushed";
}

/** What a pull or a push of the org did. */
export interface OrgSync {
  remote: string;
  result: "up_to_date" | "fast_forward" | "merged" | "conflicts" | "pushed";
  /** The merge waiting for choices, when `result` is `conflicts`. */
  merge: OrgMerge | null;
  memory: MemorySync | null;
  branches: BranchSync[];
  /** Unfinished work dropped because its team was changed. */
  put_aside: RecoveryItem[];
}

export type OrgEvent =
  | {
      type: "snapshot";
      focus_id: NodeId;
      nodes: OrgNode[];
      escalations: OpenEscalation[];
      /** The sessions that are open. They are no nodes of the tree. */
      sessions: Session[];
      paused: PauseReason | null;
      merging: boolean;
    }
  | { type: "org_state"; paused: PauseReason | null; merging: boolean }
  | { type: "node_upsert"; node: OrgNode }
  | { type: "node_removed"; id: NodeId }
  | { type: "escalations"; escalations: OpenEscalation[] }
  | { type: "sessions"; sessions: Session[] };

export const DIRECTOR_BASE_PATH = "/api/director";
