# The director in Agent Canvas

This fork of Agent Canvas is the page of the director: an Agent Server that
runs coding agents as an org of teams. What the director is and how it
works is in the server's own
[overview](https://github.com/mlin12321/software-director-sdk/blob/main/openhands-agent-server/openhands/agent_server/director/OVERVIEW.md);
this page says how to start it from here and what the page shows.

## Starting it

The director is in the fork of the Agent Server, not in the released one, so
Canvas is pointed at a checkout of it. Once: `npm ci` here (never
`npm install`, which rewrites the lock of the vendored client) and
`make build` in the server's checkout.

```sh
OH_AGENT_SERVER_LOCAL_PATH=/abs/path/to/software-director-sdk \
OH_DIRECTOR_REPO_PATH=/abs/path/to/your/repository \
OH_CONVERSATION_WORKTREE_ROOT=/abs/path/to/worktrees \
npm run dev:static
```

| Command | What it is for | A page load |
|---|---|---|
| `npm run dev:static` | Using the director. Builds the page once, about 15 seconds. | About 300 requests, under a second |
| `npm run dev:minimal` | Changing Canvas: edits show at once. | About 1,500 requests, 2 to 3 seconds |
| `npm run desktop` | A window of its own, no address to open. Under WSL it needs WSLg. | As `dev:static` |

- **The address** is printed at the start, normally `http://localhost:3001`.
- **State** (profiles, keys, conversations) is kept in
  `~/.openhands/agent-canvas`; `OH_CANVAS_SAFE_STATE_DIR` names another
  folder.
- **Without `OH_AGENT_SERVER_LOCAL_PATH`** the released Agent Server is
  used, which has no director, and the org page says it is unavailable.

## Starting an org

There is no "create org" step: the first message of a conversation in a
folder of a git repository starts the org there, and its first session.

- **From the org page.** While there is no org, the page says so and offers
  "Open a folder", which opens Home's folder chooser.
- **A folder that is not a git repository.** A row appears under the text
  box with the command that will be run in the folder before your first
  message:

  ```sh
  git init -b main && git add -A && git commit --allow-empty -m "Initial commit"
  ```

  Edit it, for example to leave files out of the first commit. Remove it
  with the ✕ to start an ordinary conversation with no org. If the command
  fails, nothing is started and you are shown what it printed.

## The org page

From top to bottom:

- **Escalations.** What waits on you. The count is also on the sidebar's
  link.
- **Org chart.** The teams. It can be folded away; a card shows the team's
  status and a headline of what it does.
- **Who owns what.** The repository's files by the team that owns them.
- **Sessions.** One per request, with its name, status and cost. Only you
  close a session.
- **What happened in the org.** The history, newest first.

A card opens the team's drawer on the right: its review, spec and
contracts, reports, record, and its conversations. Your own conversations
are white and the agents' are gray. You write to a team there, in the box at
the bottom or in a conversation you opened.

The toolbar has pause and resume, pull and push of the org, the view of the
chart and the settings: what a session may cost, how many sessions and
teams, when a team counts as stalled.

## The Director palette

The default palette. The page is white, text is black, and red marks what
is chosen or acts. A panel (the chat box, the drawer, a card) is a light
gray so that it stands apart from the page, and the chat box is outlined.
Another palette can be chosen in the settings.
