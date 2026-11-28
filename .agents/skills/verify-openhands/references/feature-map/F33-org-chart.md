# F33 — Org chart

The org chart draws the agents of a backend as an organization, top down. Each
card is a team: a pod of two agents, an IC and a Manager, that owns one
boundary of the repository. A team's IC leads that team and is a report of
the team above.

The page is always on one team (`/org/<id>`; `/org` is the root). By default
it draws only that team and its direct reports, in the middle of the chart area
with a margin around them: the team's card on top, its reports below it in
rows. Every card has the same size, and the chart as a whole is zoomed so the
team is as large as fits, between 40% and 200%; a team too large for 40%
scrolls.
An ellipsis (`…`) above the team says there is a team above it, and one under
a report says that report has sub-teams of its own. Clicking a report moves
the page to it. Each card shows the team's name and how many sub-teams it
has. **Whole org** draws every team instead, with the
team the page is on outlined and brought to the middle. The zoom control
scales either view, on top of that fit. The view and the zoom are remembered in the browser.

The chart shows the org and nothing else. A team's status, boundary, agents
and the escalations it raised appear in a card only while the team is hovered
or focused.

An escalation does not go to the user when it is raised. It goes to the team
above, which either settles it or passes it up with a reason. Only an
escalation that every team above has passed up waits on the user, and only
those are put in front of the user: in the **Escalations** list above the
chart, whichever team the page is on, each with the path to the team that
raised it and each team's reason for passing it up. Every card on that path
carries a count.

A team's details open in a drawer when the card of the team the page is on is
clicked: the boundary's permanent memory (with a form to teach it a rule), the
team's agents, and the picked agent's conversation.

The tree, the escalations and the memory come from the Agent Server's
director API (`/api/director/*`). The page follows the team it is on (or the
whole tree, in **Whole org**) over a server-sent event stream.

Source: `src/routes/org-chart.tsx`, `src/components/features/org-chart/`, `src/hooks/use-org-tree.ts`, `src/stores/org-chart-store.ts`, `src/api/director/`, `src/constants/org-chart.ts`, `src/components/features/sidebar/sidebar-rail-body.tsx`.

Server: F02, F25.

## Sub-features

- `F33.open-root`: `/org` draws the root team's card and one card per direct report, nothing deeper, and no team's status or boundary.
- `F33.navigate`: clicking a report moves the page to `/org/<id>`, which draws that team and its direct reports only, with a breadcrumb of its ancestors and a link up to the team above. A team without reports is drawn alone.
- `F33.sub-team-lines`: a report that has sub-teams has an ellipsis below its card; one that has none does not. A team that has a team above it has an ellipsis above its card, which is the link up; the root has none.
- `F33.hover`: hovering a card (or focusing it with the keyboard) shows that team's summary, status, boundary directory and worktree mode, writable and read-only globs, and agents.
- `F33.whole-org`: **Whole org** draws every team; the team the page is on is outlined and scrolled to the middle, and clicking another card moves the page (and the outline) to it. **This team** goes back.
- `F33.zoom`: **Zoom out** and **Zoom in** scale the chart in steps of 10% between 30% and 200%; the button between them shows the zoom and resets it to 100%. The zoom and the view survive a reload.
- `F33.escalations`: **Escalations** lists only what waits on the user, critical issues first, each with its kind, title, detail, the path of teams from the top, and under **Passed up by** each team's reason. The list is the same on every team's page. Every card on a path shows how many are at or below it.
- `F33.escalation-link`: clicking an escalation moves the page to the team that raised it.
- `F33.held-escalation`: an escalation a team above is still working on is not in the list and adds to no count; the hover card of the team that raised it shows it with **With <team>**. One that reached the user shows **Waiting on you** there.
- `F33.details`: clicking the card of the team the page is on opens a drawer titled with the team; it lists the team's agents, the first one picked. An agent with no conversation shows **This agent has no live conversation yet.**
- `F33.memory-unavailable`: when the director's directory is not a git repository, the drawer says boundary memory is unavailable and offers no form.
- `F33.teach`: saving a rule in the drawer adds it to the list, and the rule is stored for that team's boundary only.
- `F33.unknown-team`: `/org/<id>` for a team that does not exist says **This team no longer exists** with a link back to the root, in either view.
- `F33.unavailable`: on a backend with no org tree (or no director API), `/org` says **The director is offline** and keeps retrying.

## How to get to it (user POV)

- Sidebar → **Org chart** (`sidebar-org-chart-link`), shown for local backends only.
- Direct URL: `/org` for the root team, `/org/<id>` for any other.
- A card, the ellipsis above the current team, a breadcrumb link, or an escalation.

## Driving it with control-openhands

Preconditions:

- An Agent Server that has the director API. Until a release includes it, launch with `--sdk-path <checkout>` of an SDK that does.
- `control-openhands launch --new --director-fixture --sdk-path <checkout>`: the server then serves its built-in fixture tree (487 teams: a root, 6 domains, 5 services in each, 15 modules in each service) and keeps boundary memory in the run's `qa-repo`. The fixture has 4 escalations: one from `data.worker.module-03` that every team above passed up, and three still with a team (`identity` with the root, `payments.gateway.module-07` with `payments.gateway`, `search.storage` with `search`). Then `control-openhands onboard --skip`.
- No LLM is needed. No fixture team has a conversation.
- Each card is `testid=org-node-<id>`; ids are `root`, `<domain>`, `<domain>.<service>`, `<domain>.<service>.module-NN`. The card of the team the page is on has `data-current="true"` and holds a button; every other card holds a link.

- **Root (`F33.open-root`, `F33.sub-team-lines`).** `control-openhands browser click 'testid=sidebar-org-chart-link' --expect-url '/org$'`, `control-openhands browser wait 'testid=org-chart'`. `control-openhands browser count '[data-testid^="org-node-"]'` is `7`, and `control-openhands browser text 'role=region[name="Org chart"]'` reads `Root organization`, `Sub-teams: 6`, then the six `<domain> domain` cards each with `Sub-teams: 5` (the lone digits are escalation counts, see below); it has no `Working`, `Blocked` or `services/`. `control-openhands browser attr 'testid=org-node-root' data-current` is `true`, `control-openhands browser count 'role=link[name=/^Up to /]'` is `0`, and `control-openhands browser count '[data-has-sub-teams]'` is `6`.
- **Escalations (`F33.escalations`).** `control-openhands browser text 'role=region[name="Escalations"]'` reads `Escalations`, `1`, `Critical issue`, `Export job writes customer emails to debug logs`, its detail, `Root organization › data domain › data/worker › module-03`, `Passed up by`, then one line each starting `data/worker:`, `data domain:` and `Root organization:`. `control-openhands browser text 'testid=org-node-root >> role=img'` and `'testid=org-node-data >> role=img'` are `1`; `control-openhands browser count 'testid=org-node-payments >> role=img'` is `0`. `control-openhands api GET /api/director/org/nodes/root --pick node.escalation_count` is `1`.
- **Move to a team (`F33.navigate`).** `control-openhands browser click 'testid=org-node-payments >> role=link' --expect-url '/org/payments$'`, `control-openhands browser wait 'testid=org-node-payments.gateway'`; the card count is `6`. `control-openhands browser attr 'role=link[name="Up to Root organization"]' href` is `/org/root`, `control-openhands browser text 'role=navigation[name="Org chart path"]'` reads `Root organization`, `payments domain`, and `control-openhands browser text 'role=region[name="Escalations"] >> role=heading'` still reads `Escalations`, `1`.
- **Hover (`F33.hover`).** `control-openhands browser tooltip 'testid=org-node-payments.gateway >> role=link'` returns `Implements the gateway service for payments.`, `Status:`, `Working`, `services/payments/gateway · Own worktree`, `Writable:`, `services/payments/gateway/*.ts`, `Read-only:`, `services/payments/contracts/**` and `IC (working), Manager (idle)`.
- **Held escalation and a leaf (`F33.held-escalation`, `F33.navigate`).** `control-openhands browser click 'testid=org-node-payments.gateway >> role=link' --expect-url 'payments.gateway$'`, `control-openhands browser wait 'testid=org-node-payments.gateway.module-07'`: the card count is `16`, `control-openhands browser count '[data-has-sub-teams]'` is `0`, and no card shows a count. `control-openhands browser tooltip 'testid=org-node-payments.gateway.module-07 >> role=link'` ends `Idempotency keys collide across retries`, `Critical issue · With payments/gateway`. `control-openhands browser click 'testid=org-node-payments.gateway.module-07 >> role=link' --expect-url 'module-07$'`; the card count is `1`.
- **Follow an escalation (`F33.escalation-link`, `F33.held-escalation`).** `control-openhands browser click 'role=region[name="Escalations"] >> role=link' --expect-url '/org/data.worker.module-03$'`. `control-openhands browser attr 'testid=org-node-data.worker.module-03' data-current` is `true`, and `control-openhands browser tooltip 'testid=org-node-data.worker.module-03 >> role=button'` ends `Critical issue · Waiting on you`.
- **Details without a repository (`F33.details`, `F33.memory-unavailable`).** Before `fixture git-repo`: `control-openhands browser click 'testid=org-node-data.worker.module-03 >> role=button[name=/Open details/]'`; `control-openhands browser text 'role=dialog'` reads `module-03`, `Boundary memory is unavailable. The director may not be attached to a git repository.`, `IC`, `Manager` and `This agent has no live conversation yet.` `control-openhands browser press Escape` closes it.
- **Teach (`F33.teach`).** `control-openhands fixture git-repo`, `control-openhands browser reload`, open the details again, `control-openhands browser fill 'role=dialog >> role=textbox' 'QA_rule: never log customer emails.'`, `control-openhands browser click 'role=dialog >> role=button[name="Save rule"]'`. `control-openhands browser text 'role=dialog'` now lists the rule above the form. `control-openhands api GET /api/director/org/nodes/data.worker.module-03/blackboard --pick memory.rules` returns it, `git -C "$OH_VERIFY_RUN/workspace/qa-repo" show refs/agents/blackboard:services/data/worker/module-03/memory.json` holds it, and `git -C "$OH_VERIFY_RUN/workspace/qa-repo" status --porcelain` prints nothing. `control-openhands browser click 'role=dialog >> role=button[name="Close inspector"]'`.
- **Whole org (`F33.whole-org`).** `control-openhands browser click 'role=button[name="Whole org"]'`, `control-openhands browser wait 'testid=org-node-identity.api'`: the card count is `487`, `control-openhands browser attr 'role=button[name="Whole org"]' aria-pressed` is `true`, and `data.worker.module-03` still has `data-current`. `control-openhands browser click 'testid=org-node-identity.api >> role=link' --expect-url '/org/identity.api$'`: `identity.api` now has `data-current`, `control-openhands browser count '[data-current]'` is `1`, and `control-openhands browser screenshot` shows that card in the middle of the chart. `control-openhands browser click 'role=button[name="This team"]'`, `control-openhands browser wait 'testid=org-node-root' --state detached`; the card count is `16`.
- **Zoom (`F33.zoom`).** `control-openhands browser click 'role=button[name="Zoom out"]'` twice: `control-openhands browser text 'role=group[name="Zoom"]'` is `80%`, and `control-openhands browser eval 'localStorage.getItem("openhands-org-chart")'` holds `"zoom":0.8` and the view. `control-openhands browser reload`, wait for a card: the group still reads `80%`. In **Whole org**, where nothing is fitted, `control-openhands browser eval 'getComputedStyle(document.querySelector("[data-testid=org-chart-zoom]")).zoom'` is `0.8`; go back to **This team**. `control-openhands browser click 'role=button[name="Zoom in"]'` gives `90%`; `control-openhands browser click 'role=button[name="Reset zoom"]'` gives `100%`.
- **Unknown team (`F33.unknown-team`).** `control-openhands browser goto /org/nope`; `control-openhands browser text 'text=This team no longer exists'` matches, and `control-openhands browser click 'role=link[name="Back to the root"]' --expect-url '/org$'` goes back.
- **No org tree (`F33.unavailable`).** In a run launched without `--director-fixture`: `control-openhands browser goto /org`; `control-openhands browser testids --filter org` lists only `sidebar-org-chart-link` (no `org-chart`), and `control-openhands api GET /api/director/org/nodes/root` is `404`.
- After the family, `control-openhands browser errors --app-only` shows no page errors. It does list the `503` from each blackboard request made before `fixture git-repo` and the `404` for `/org/nope`; those are expected.

## Gotchas

- `--director-fixture` is a launch flag, not something to export: runs are isolated from the operator's shell, so `OH_DIRECTOR_FIXTURE` set there never reaches the server.
- The fixture tree is read-only and identical on every start; nothing a recipe does changes it. Taught rules live in `qa-repo`'s hidden ref `refs/agents/blackboard` and disappear with the run.
- The drawer loads boundary memory when it opens. After `fixture git-repo`, reload (or reopen the drawer) to leave the unavailable state.
- A stock Agent Server answers `404` for every `/api/director/*` route, which the page shows as `F33.unavailable`, not as an error.
- Moving to another team, or switching view, replaces the page's event stream, so each shows as a new `tree-stream` request (`?node=<id>`, or `?full=true` for **Whole org**). That is by design, not a reconnect. Moving around inside **Whole org** opens none.
- The view and zoom are stored in the browser profile (`openhands-org-chart`) and so carry over between recipes in one run. Put them back (**This team**, **Reset zoom**) before a recipe that counts cards.
- The unknown-team page has no view or zoom controls.
- A team at the edge of **Whole org** cannot be scrolled all the way to the middle; check centering on a team away from the edges.
- Live changes (a team added or pruned, an escalation raised, passed up or settled) cannot be driven yet: no user action or API changes the tree until agents can. The page's handling of those events is covered by its unit tests only.
