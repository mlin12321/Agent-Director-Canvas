import { useTranslation } from "react-i18next";
import type { Review, ReviewFinding } from "#/api/director/types";
import { MarkdownRenderer } from "#/components/features/markdown/markdown-renderer";
import { I18nKey } from "#/i18n/declaration";
import { REVIEW_LABEL_KEYS } from "./org-chart-presentation";

function Findings({
  title,
  findings,
}: {
  title: string;
  findings: ReviewFinding[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-medium text-contrast">{title}</h4>
      <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
        {findings.map((finding) => (
          <li
            key={`${finding.path}:${finding.line}:${finding.issue}`}
            className="flex flex-col"
          >
            {finding.path ? (
              <code className="break-all text-muted">
                {finding.line
                  ? `${finding.path}:${finding.line}`
                  : finding.path}
              </code>
            ) : null}
            <span>{finding.issue}</span>
            {finding.evidence ? (
              <span className="text-muted">{finding.evidence}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** How the round of a review is said next to its state, from the second on. */
export function useReviewLabel() {
  const { t } = useTranslation("openhands");
  return (review: Review) =>
    review.round > 1
      ? `${t(REVIEW_LABEL_KEYS[review.state])} · ${t(
          I18nKey.ORG_CHART$REVIEW_ROUND,
          { round: review.round },
        )}`
      : t(REVIEW_LABEL_KEYS[review.state]);
}

interface ReviewSummaryProps {
  review: Review;
}

/**
 * Where the review of a team's finished work stands: what the team said it
 * delivered and changed, what the reviewing IC wants changed, and what the
 * team's own review found.
 */
export function ReviewSummary({ review }: ReviewSummaryProps) {
  const { t } = useTranslation("openhands");
  const label = useReviewLabel();
  let automated: React.ReactNode = (
    <p className="text-xs text-muted">
      {t(
        review.automated_ran
          ? I18nKey.ORG_CHART$REVIEW_AUTOMATED_NONE
          : I18nKey.ORG_CHART$REVIEW_AUTOMATED_SKIPPED,
      )}
    </p>
  );
  if (review.automated.length > 0) {
    automated = (
      <Findings
        title={t(I18nKey.ORG_CHART$REVIEW_AUTOMATED)}
        findings={review.automated}
      />
    );
  }

  return (
    <section
      aria-label={t(I18nKey.ORG_CHART$REVIEW)}
      className="flex flex-col gap-1.5"
    >
      <h3 className="text-sm font-medium text-contrast">
        {t(I18nKey.ORG_CHART$REVIEW)}
      </h3>
      <p className="text-xs text-text-secondary">{label(review)}</p>
      {review.passed_up ? (
        <p className="text-xs text-muted">
          {t(I18nKey.ORG_CHART$REVIEW_PASSED_UP)}
        </p>
      ) : null}
      {review.summary ? (
        <p className="text-xs text-muted">{review.summary}</p>
      ) : null}
      {review.description ? (
        <div className="flex flex-col gap-1">
          <h4 className="text-xs font-medium text-contrast">
            {t(I18nKey.ORG_CHART$REVIEW_DESCRIPTION)}
          </h4>
          <div className="text-xs text-text-secondary">
            <MarkdownRenderer includeStandard>
              {review.description}
            </MarkdownRenderer>
          </div>
        </div>
      ) : null}
      {review.findings.length > 0 ? (
        <Findings
          title={t(I18nKey.ORG_CHART$REVIEW_FINDINGS)}
          findings={review.findings}
        />
      ) : null}
      {automated}
    </section>
  );
}
