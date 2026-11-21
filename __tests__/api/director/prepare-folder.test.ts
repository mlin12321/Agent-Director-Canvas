import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_PREPARE_COMMAND,
  gitRootAbove,
  isGitRepository,
  isGitRoot,
  prepareFolder,
} from "#/api/director/prepare-folder";

const IDENTITY = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

// The server's bash endpoint, played by this machine's own shell.
function shell(command: string, cwd: string) {
  const ran = spawnSync("bash", ["-c", command], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...IDENTITY },
  });
  return {
    exit_code: ran.status ?? -1,
    stdout: ran.stdout || null,
    stderr: ran.stderr || null,
  };
}

const executeCommand = vi.hoisted(() => vi.fn());
vi.mock("@openhands/typescript-client/clients", () => ({
  BashClient: class {
    executeCommand = executeCommand;
  },
}));
vi.mock("#/api/agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({ host: "http://localhost" }),
}));

describe("preparing a folder for an org", () => {
  let folder: string;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), "prepare-folder-"));
    executeCommand.mockReset();
    executeCommand.mockImplementation(
      async ({ command, cwd }: { command: string; cwd: string }) =>
        shell(command, cwd),
    );
  });

  it("makes a folder with files a git repository that has them in its first commit", async () => {
    writeFileSync(join(folder, "notes.txt"), "hello\n");
    expect(await isGitRepository(folder)).toBe(false);

    await prepareFolder(folder, DEFAULT_PREPARE_COMMAND);

    expect(await isGitRepository(folder)).toBe(true);
    expect(shell("git ls-files", folder).stdout).toBe("notes.txt\n");
    expect(shell("git status --porcelain", folder).stdout).toBeNull();
  });

  it("gives an empty folder a first commit too, since an org needs one", async () => {
    await prepareFolder(folder, DEFAULT_PREPARE_COMMAND);

    expect(shell("git rev-list --count HEAD", folder).stdout).toBe("1\n");
  });

  it("counts only a .git in the folder itself", async () => {
    shell("git init -b main", folder);
    const nested = join(folder, "app");
    shell(`mkdir -p ${nested}`, folder);

    expect(await isGitRepository(nested)).toBe(true);
    expect(await isGitRoot(nested)).toBe(false);
    expect(await isGitRoot(folder)).toBe(true);
    expect(await gitRootAbove(nested)).toBe(folder);
    expect(await gitRootAbove(folder)).toBeNull();

    const fresh = mkdtempSync(join(tmpdir(), "prepare-folder-"));
    expect(await isGitRoot(fresh)).toBe(false);
    expect(await gitRootAbove(fresh)).toBeNull();
    await prepareFolder(fresh, DEFAULT_PREPARE_COMMAND);
    expect(await isGitRoot(fresh)).toBe(true);
  });

  it("fails with what the command printed", async () => {
    await expect(
      prepareFolder(folder, "echo no such thing >&2; exit 3"),
    ).rejects.toThrow("no such thing");
  });

  it("fails with the exit code when the command printed nothing", async () => {
    await expect(prepareFolder(folder, "exit 3")).rejects.toThrow("exit 3");
  });
});
