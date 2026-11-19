import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NodeId, NodeOwnership, OrgNode } from "#/api/director/types";
import { NavigationLink } from "#/components/shared/navigation-link";
import { orgNodePath } from "#/constants/org-chart";
import { I18nKey } from "#/i18n/declaration";
import { useOrgChartStore } from "#/stores/org-chart-store";
import { buildFileTree } from "#/utils/file-tree";
import { cn } from "#/utils/utils";
import { KEPT_SWATCH, ownerSwatches } from "./ownership-colors";
import { OwnershipRow, type OwnershipLookup } from "./ownership-tree";

interface OwnershipMapProps {
  /** The team the page is on. */
  node: OrgNode;
  /** Undefined until the server has answered. */
  ownership: NodeOwnership | undefined;
}

/** Every directory above `path`, nearest last. */
function directoriesAbove(path: string) {
  const segments = path.split("/");
  return segments
    .slice(0, -1)
    .map((_, index) => segments.slice(0, index + 1).join("/"));
}

/** The files of the team the page is on, by the direct report that owns them. */
export function OwnershipMap({ node, ownership }: OwnershipMapProps) {
  const { t } = useTranslation("openhands");
  const open = useOrgChartStore((state) => state.ownershipOpen);
  const toggle = useOrgChartStore((state) => state.toggleOwnership);

  const model = React.useMemo(() => {
    if (!ownership) return null;
    const titles = new Map<NodeId, string>([
      [node.id, node.title],
      ...ownership.owners.map((owner) => [owner.node_id, owner.title] as const),
    ]);
    const swatches = ownerSwatches(ownership.owners.map((o) => o.node_id));
    const owners = new Map(ownership.files.map((f) => [f.path, f.owner]));
    const below = new Map<string, Set<NodeId | null>>();
    for (const file of ownership.files) {
      for (const directory of directoriesAbove(file.path)) {
        let teams = below.get(directory);
        if (!teams) below.set(directory, (teams = new Set()));
        teams.add(file.owner);
      }
    }
    const none: ReadonlySet<NodeId | null> = new Set();
    const lookup: OwnershipLookup = {
      ownerOf: (path) => owners.get(path) ?? null,
      ownersBelow: (path) => below.get(path) ?? none,
      swatchOf: (owner) => (owner && swatches.get(owner)) || KEPT_SWATCH,
      ownerLabel: (owner) =>
        t(I18nKey.ORG_CHART$OWNERSHIP_OWNER, {
          team: titles.get(owner ?? node.id) ?? owner,
        }),
    };
    return {
      lookup,
      swatches,
      tree: buildFileTree(ownership.files.map((file) => file.path)),
    };
  }, [ownership, node.id, node.title, t]);

  if (!ownership || !model) return null;
  const { lookup, swatches, tree } = model;

  return (
    <section
      aria-label={t(I18nKey.ORG_CHART$OWNERSHIP_TITLE)}
      data-testid="ownership-map"
      className="flex max-h-2/5 shrink-0 flex-col rounded-xl border border-border"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-3 py-2 text-left text-sm font-medium text-contrast"
      >
        {open ? (
          <ChevronDown width={14} height={14} aria-hidden="true" />
        ) : (
          <ChevronRight width={14} height={14} aria-hidden="true" />
        )}
        {t(I18nKey.ORG_CHART$OWNERSHIP_TITLE)}
      </button>
      {open ? (
        <div className="flex min-h-0 flex-col gap-2 overflow-auto border-t border-border px-3 py-2">
          <ul
            data-testid="ownership-legend"
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary"
          >
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("size-2.5 rounded-xs", KEPT_SWATCH)}
              />
              {t(I18nKey.ORG_CHART$OWNERSHIP_KEPT, { team: node.title })}
            </li>
            {ownership.owners.map((owner) => (
              <li key={owner.node_id} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-2.5 rounded-xs",
                    swatches.get(owner.node_id),
                  )}
                />
                <NavigationLink
                  to={orgNodePath(owner.node_id)}
                  className="text-contrast hover:underline"
                >
                  {owner.title}
                </NavigationLink>
                <span className="text-muted">{owner.path}</span>
              </li>
            ))}
          </ul>
          {ownership.files.length === 0 ? (
            <p className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$OWNERSHIP_EMPTY)}
            </p>
          ) : (
            <ul>
              {tree.children.map((child) => (
                <OwnershipRow
                  key={child.path}
                  node={child}
                  depth={0}
                  lookup={lookup}
                />
              ))}
            </ul>
          )}
          {ownership.truncated ? (
            <p className="text-xs text-muted">
              {t(I18nKey.ORG_CHART$OWNERSHIP_TRUNCATED, {
                count: ownership.files.length,
              })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
