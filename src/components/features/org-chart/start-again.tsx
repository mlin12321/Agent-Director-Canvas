import { useMutation } from "@tanstack/react-query";
import { RotateCw } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { DirectorClient, DirectorError } from "#/api/director/director-client";
import type { MemberInfo, SessionTeam } from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";
import { useTeamTypes } from "./team-types";

/**
 * Whether a team's agents are missing here while its work is not done: the
 * member that works in the folder has no conversation on this server.
 */
export function isLost(node: SessionTeam, members: readonly MemberInfo[]) {
  return (
    node.status !== "done" &&
    node.agents.some(
      (agent) =>
        agent.status === "lost" &&
        members.some((member) => member.writes && member.name === agent.role),
    )
  );
}

/**
 * Starts a team again whose agents have no conversation on this server.
 * The server says why when it cannot, e.g. that the team above is lost too.
 */
export function StartAgain({
  node,
  agentType,
}: {
  node: SessionTeam;
  /** The type of the team the place is at. */
  agentType: string;
}) {
  const { t } = useTranslation("openhands");
  const start = useMutation({
    mutationFn: () => DirectorClient.startAgain(node.session, node.id),
    meta: { disableToast: true },
  });
  const lost = isLost(node, useTeamTypes().members(agentType));
  // Started, it may be lost again later and then be started again.
  const { reset } = start;
  React.useEffect(() => {
    if (!lost) reset();
  }, [lost, reset]);

  if (!lost) return null;
  return (
    <div
      data-testid="org-start-again"
      className="flex flex-col gap-2 rounded-lg border border-feedback-warning px-3 py-2"
    >
      <p className="text-xs text-contrast">
        {t(I18nKey.ORG_CHART$START_AGAIN_HINT)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={start.isPending || start.isSuccess}
          onClick={() => start.mutate()}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-contrast hover:bg-surface-raised disabled:opacity-40"
        >
          <RotateCw width={12} height={12} aria-hidden="true" />
          {t(I18nKey.ORG_CHART$START_AGAIN)}
        </button>
        {start.isError ? (
          <span role="alert" className="text-xs text-feedback-error">
            {start.error instanceof DirectorError && start.error.status === 409
              ? start.error.message
              : t(I18nKey.ORG_CHART$START_AGAIN_ERROR)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
