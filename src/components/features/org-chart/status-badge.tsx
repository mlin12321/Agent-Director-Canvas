import { useTranslation } from "react-i18next";
import type { NodeStatus } from "#/api/director/types";
import { cn } from "#/utils/utils";
import {
  STATUS_DOT_CLASSES,
  STATUS_LABEL_KEYS,
} from "./org-chart-presentation";

// Up to this many dots are drawn one by one; more are counted.
const DOTS_DRAWN = 3;

function Dot({ status }: { status: NodeStatus }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 rounded-full", STATUS_DOT_CLASSES[status])}
    />
  );
}

interface StatusBadgeProps {
  status: NodeStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation("openhands");
  return (
    <span
      data-status={status}
      className="inline-flex items-center gap-1.5 text-xs text-contrast"
    >
      <Dot status={status} />
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

// Blocked first: what needs someone is read before what does not.
const DOT_ORDER: NodeStatus[] = ["blocked", "working", "idle", "done"];

/**
 * The state of every line of work at a team, as dots: the team's own and
 * one for each session that works there. A few are drawn one by one; more
 * than that are counted, one dot and a number for each state.
 */
export function StatusDots({ statuses }: { statuses: readonly NodeStatus[] }) {
  const { t } = useTranslation("openhands");
  const counts = DOT_ORDER.map((status) => ({
    status,
    count: statuses.filter((candidate) => candidate === status).length,
  })).filter(({ count }) => count > 0);
  const counted = statuses.length > DOTS_DRAWN;
  const label = counts
    .map(({ status, count }) => `${count} ${t(STATUS_LABEL_KEYS[status])}`)
    .join(", ");
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="org-status-dots"
      data-counted={counted || undefined}
      className="flex shrink-0 items-center gap-1 text-2xs font-medium text-text-secondary"
    >
      {counted
        ? counts.map(({ status, count }) => (
            <span
              key={status}
              data-status={status}
              className="flex items-center gap-0.5"
            >
              <Dot status={status} />
              {count}
            </span>
          ))
        : statuses.map((status, index) => (
            <span
              // The dots of one team have no identity but their place.
              key={index}
              aria-hidden="true"
              data-status={status}
              className={cn("size-2 rounded-full", STATUS_DOT_CLASSES[status])}
            />
          ))}
    </span>
  );
}
