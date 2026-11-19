import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { NodeId } from "#/api/director/types";
import type { FileTreeNode } from "#/utils/file-tree";
import { cn } from "#/utils/utils";
import { KEPT_SWATCH } from "./ownership-colors";

/** What the rows of the tree need to know about the files below them. */
export interface OwnershipLookup {
  /** The team that owns a file; null when the team on the page kept it. */
  ownerOf: (path: string) => NodeId | null;
  /** The teams that own the files below a directory. */
  ownersBelow: (path: string) => ReadonlySet<NodeId | null>;
  swatchOf: (owner: NodeId | null) => string;
  /** "Owned by <team>", for a swatch. */
  ownerLabel: (owner: NodeId | null) => string;
}

interface RowProps {
  node: FileTreeNode;
  depth: number;
  lookup: OwnershipLookup;
}

function Swatch({
  owner,
  lookup,
}: {
  owner: NodeId | null;
  lookup: OwnershipLookup;
}) {
  return (
    <span
      role="img"
      aria-label={lookup.ownerLabel(owner)}
      title={lookup.ownerLabel(owner)}
      className={cn(
        "size-2.5 shrink-0 rounded-xs",
        owner === null ? KEPT_SWATCH : lookup.swatchOf(owner),
      )}
    />
  );
}

const ROW =
  "flex w-full items-center gap-1.5 py-0.5 pr-2 pl-(--ownership-row-indent) text-left text-xs";

function indentPx(depth: number, isFile: boolean) {
  return 8 + depth * 12 + (isFile ? 18 : 0);
}

/**
 * One file or directory of the ownership map. A directory that one team
 * owns outright starts closed and wears that team's swatch; one that is
 * divided between teams starts open, so the division shows.
 */
export function OwnershipRow({ node, depth, lookup }: RowProps) {
  const owners = node.isDirectory ? lookup.ownersBelow(node.path) : null;
  const [isOpen, setIsOpen] = React.useState(() => (owners?.size ?? 0) > 1);

  if (!node.isDirectory) {
    return (
      <li
        data-testid={`ownership-file-${node.path}`}
        className={cn(ROW, "text-text-secondary")}
        style={
          {
            "--ownership-row-indent": `${indentPx(depth, true)}px`,
          } as React.CSSProperties
        }
      >
        <Swatch owner={lookup.ownerOf(node.path)} lookup={lookup} />
        <span className="truncate">{node.name}</span>
      </li>
    );
  }

  const [only] = owners ?? [];
  return (
    <li>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        data-testid={`ownership-dir-${node.path}`}
        className={cn(ROW, "text-contrast hover:bg-surface-raised")}
        style={
          {
            "--ownership-row-indent": `${indentPx(depth, false)}px`,
          } as React.CSSProperties
        }
      >
        <span aria-hidden="true" className="flex w-3 shrink-0 text-muted">
          {isOpen ? (
            <ChevronDown width={12} height={12} />
          ) : (
            <ChevronRight width={12} height={12} />
          )}
        </span>
        {owners?.size === 1 ? <Swatch owner={only} lookup={lookup} /> : null}
        <span className="truncate">{node.name}</span>
      </button>
      {isOpen ? (
        <ul>
          {node.children.map((child) => (
            <OwnershipRow
              key={child.path}
              node={child}
              depth={depth + 1}
              lookup={lookup}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
