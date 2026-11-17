import { useTranslation } from "react-i18next";
import type {
  Merge,
  MergeGate,
  MergeItem,
  NodeId,
  OrgNode,
} from "#/api/director/types";
import { I18nKey } from "#/i18n/declaration";

const GATES: ReadonlyArray<[MergeGate, I18nKey]> = [
  ["ic", I18nKey.ORG_CHART$MERGE_FOR_IC],
  ["manager", I18nKey.ORG_CHART$MERGE_FOR_MANAGER],
];

const TAKE_KEYS = {
  org: I18nKey.ORG_CHART$MERGE_TAKE_ORG,
  session: I18nKey.ORG_CHART$MERGE_TAKE_SESSION,
  text: I18nKey.ORG_CHART$MERGE_TAKE_TEXT,
} as const;

const KIND_KEYS = {
  code: I18nKey.ORG_CHART$MERGE_FILE,
  spec: I18nKey.ORG_CHART$MERGE_SPEC,
  contracts: I18nKey.ORG_CHART$MERGE_CONTRACTS,
} as const;

interface MergeWaitsProps {
  /** What the session is called. */
  title: string;
  session: string;
  merge: Merge;
  nodes?: ReadonlyMap<NodeId, OrgNode>;
}

/**
 * What waits of the work a session submitted before it is the org's: what
 * its reviewing IC and the Manager beside it each have to settle, with what
 * they decided, and how far it has come.
 */
export function MergeWaits({ title, session, merge, nodes }: MergeWaitsProps) {
  const { t } = useTranslation("openhands");
  const items = merge.items ?? [];
  if (!items.length && !merge.code_landed && !merge.org_queued) return null;
  const titleOf = (id: NodeId) => nodes?.get(id)?.title ?? id;

  const name = (item: MergeItem) =>
    item.kind === "team"
      ? item.title || item.key
      : t(KIND_KEYS[item.kind], { path: item.key || "/" });

  return (
    <section data-testid={`merge-${session}`} className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-text-secondary">{title}</h3>
      {merge.code_landed ? (
        <p role="status" className="text-xs text-feedback-warning">
          {t(I18nKey.ORG_CHART$MERGE_CODE_IN)}
        </p>
      ) : null}
      {merge.org_queued ? (
        <p role="status" className="text-xs text-feedback-warning">
          {t(I18nKey.ORG_CHART$MERGE_QUEUED)}
        </p>
      ) : null}
      {GATES.map(([gate, heading]) => {
        const waiting = items.filter((item) => item.gate === gate);
        if (!waiting.length) return null;
        return (
          <div key={gate} className="flex flex-col gap-1">
            <h4 className="text-xs text-muted">{t(heading)}</h4>
            <ul className="flex flex-col gap-1 text-xs">
              {waiting.map((item) => (
                <li key={`${item.kind} ${item.key}`}>
                  <span className="break-words text-contrast">
                    {name(item)}
                  </span>
                  {item.kind !== "code" ? (
                    <>
                      <span className="block whitespace-pre-wrap break-words text-muted">
                        {t(I18nKey.ORG_CHART$MERGE_SESSION, {
                          what: item.session ?? "",
                        })}
                      </span>
                      <span className="block whitespace-pre-wrap break-words text-muted">
                        {t(I18nKey.ORG_CHART$MERGE_ORG, {
                          what: item.org ?? "",
                        })}
                      </span>
                    </>
                  ) : null}
                  {item.moved_to ? (
                    <span className="block text-muted">
                      {t(I18nKey.ORG_CHART$MERGE_MOVED, {
                        team: titleOf(item.moved_to),
                      })}
                    </span>
                  ) : null}
                  {gate === "manager" ? (
                    <span
                      className={
                        item.take
                          ? "block text-text-secondary"
                          : "block text-feedback-warning"
                      }
                    >
                      {t(
                        item.take
                          ? TAKE_KEYS[item.take]
                          : I18nKey.ORG_CHART$MERGE_UNDECIDED,
                      )}
                    </span>
                  ) : null}
                  {item.under ? (
                    <span className="block text-muted">
                      {t(I18nKey.ORG_CHART$MERGE_PLACED, {
                        team: titleOf(item.under),
                      })}
                    </span>
                  ) : null}
                  {item.named ? (
                    <span className="block text-muted">
                      {t(I18nKey.ORG_CHART$MERGE_NAMED, { name: item.named })}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
