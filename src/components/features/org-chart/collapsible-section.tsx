import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "#/utils/utils";

const STORAGE_PREFIX = "org-chart-section-open:";

/** Whether the human last left this part open; null when they never chose. */
function rememberedOpen(testId: string): boolean | null {
  try {
    const kept = localStorage.getItem(STORAGE_PREFIX + testId);
    return kept === null ? null : kept === "true";
  } catch {
    return null;
  }
}

function rememberOpen(testId: string, open: boolean) {
  try {
    localStorage.setItem(STORAGE_PREFIX + testId, String(open));
  } catch {
    // Storage can be off or full; the part then starts as it does by default.
  }
}

/**
 * A part of the org page under a heading that opens and closes it. What is
 * inside is only there while it is open, so it asks the server for nothing
 * while it is closed. How the human left it is kept in this browser.
 */
export function CollapsibleSection({
  title,
  testId,
  startsOpen,
  summary,
  className,
  bodyClassName,
  bodyRef,
  children,
}: {
  title: string;
  testId: string;
  startsOpen: boolean;
  /** Shown beside the title, open or closed. */
  summary?: React.ReactNode;
  /** For the part as a whole, as where it may grow. */
  className?: string;
  bodyClassName?: string;
  /** What is inside, while it is open. */
  bodyRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(
    () => rememberedOpen(testId) ?? startsOpen,
  );
  return (
    <section
      aria-label={title}
      data-testid={testId}
      className={cn(
        "flex shrink-0 flex-col rounded-xl border border-border",
        open ? className : null,
      )}
    >
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        onClick={() => {
          rememberOpen(testId, !open);
          setOpen(!open);
        }}
        aria-expanded={open}
        className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-left text-sm font-medium text-contrast"
      >
        {open ? (
          <ChevronDown width={14} height={14} aria-hidden="true" />
        ) : (
          <ChevronRight width={14} height={14} aria-hidden="true" />
        )}
        {title}
        {summary}
      </button>
      {open ? (
        <div
          ref={bodyRef}
          className={cn(
            "flex flex-col gap-2 border-t border-border px-3 py-2",
            bodyClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
