#!/usr/bin/env node

/**
 * Vendor the fork's typed client
 *
 * This fork's `@openhands/typescript-client` is not published to npm, so
 * Canvas depends on a build of it packed into vendor/. Run this after the
 * SDK's `clients/typescript` changed, then `npm ci`.
 *
 * Usage:
 *   node scripts/vendor-typescript-client.mjs ../software-director-sdk
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = "@openhands/typescript-client";
const VENDOR = join(projectRoot, "vendor");

const [sdk] = process.argv.slice(2);
if (!sdk) {
  console.error(
    "Usage: node scripts/vendor-typescript-client.mjs <sdk checkout>",
  );
  process.exit(1);
}
const client = resolve(sdk, "clients", "typescript");

execFileSync("npm", ["run", "build"], { cwd: client, stdio: "inherit" });
for (const file of readdirSync(VENDOR)) {
  if (file.endsWith(".tgz")) rmSync(join(VENDOR, file));
}
const packed = execFileSync("npm", ["pack", "--pack-destination", VENDOR], {
  cwd: client,
  encoding: "utf-8",
})
  .trim()
  .split("\n")
  .pop();
const spec = `file:vendor/${packed}`;
const integrity = `sha512-${createHash("sha512")
  .update(readFileSync(join(VENDOR, packed)))
  .digest("base64")}`;

// Only the client's own entries change: a full `npm install` would rewrite
// the rest of the lockfile.
const pkgPath = join(projectRoot, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const before = pkg.dependencies[PACKAGE];
writeFileSync(
  pkgPath,
  readFileSync(pkgPath, "utf-8").replace(
    `"${PACKAGE}": "${before}"`,
    `"${PACKAGE}": "${spec}"`,
  ),
);

const lockPath = join(projectRoot, "package-lock.json");
const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
const entry = lock.packages[`node_modules/${PACKAGE}`];
writeFileSync(
  lockPath,
  readFileSync(lockPath, "utf-8")
    .replace(`"${PACKAGE}": "${before}"`, `"${PACKAGE}": "${spec}"`)
    .replace(`"resolved": "${entry.resolved}"`, `"resolved": "${spec}"`)
    .replace(
      `"integrity": "${entry.integrity}"`,
      `"integrity": "${integrity}"`,
    ),
);

console.log(`Vendored ${packed}. Run \`npm ci\`.`);
