"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, X, ChevronDown, ChevronUp } from "lucide-react";
import { useJobsOptional, type JobPublic } from "@/lib/jobs-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  email_reverify: "Checking emails",
  mine_leads: "Finding professors",
  draft_generate: "Writing drafts",
  approval_sweep: "Queuing approvals",
};

function shortMessage(job: JobPublic) {
  const raw = (job.lastMessage || "").trim();
  if (!raw) {
    if (job.type === "mine_leads") return `${job.verified} found`;
    if (job.type === "draft_generate") return `${job.verified} drafted`;
    if (job.type === "approval_sweep") return `${job.verified} queued`;
    if (job.type === "email_reverify") return `${job.verified} verified`;
    return `${job.processed} of ${job.total}`;
  }
  return raw
    .replace(/^Mining up to \d+ fresh leads[^.]*\.?\s*/i, "")
    .replace(/^Queued \d+ professors[^.]*\.?\s*/i, "Queued… ")
    .slice(0, 64);
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function JobCard({
  job,
  expanded,
  onToggle,
  onCancel,
  onDismiss,
}: {
  job: JobPublic;
  expanded: boolean;
  onToggle: () => void;
  onCancel?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  const done = job.status === "completed";
  const failed = job.status === "failed" || job.status === "cancelled";
  const label = LABELS[job.type] || job.type;
  const pct = Math.min(100, Math.max(done ? 100 : 4, job.percent));
  const logs = job.eventLog || [];
  const stuck =
    job.status === "running" &&
    job.percent === 0 &&
    Date.now() - new Date(job.updatedAt).getTime() > 5 * 60 * 1000;

  return (
    <div
      className={cn(
        "w-[min(100vw-2rem,24rem)] overflow-hidden rounded-xl border bg-card/95 shadow-lg backdrop-blur-md transition",
        done && "border-emerald-200/80",
        failed && "border-border opacity-90",
        stuck && "border-amber-300",
        expanded && "ring-1 ring-primary/20"
      )}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 px-3.5 pt-3 pb-2 text-left hover:bg-muted/30"
        onClick={onToggle}
      >
        <div
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            done
              ? "bg-emerald-50 text-emerald-700"
              : stuck
                ? "bg-amber-50 text-amber-700"
                : "bg-primary/10 text-primary"
          )}
        >
          {done ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <Loader2
              className={cn("size-4", !stuck && "animate-spin")}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium leading-tight">
                {label}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {stuck ? "Possibly stuck · " : ""}
                {shortMessage(job)}
                {!done && job.total > 0
                  ? ` · ${job.processed}/${job.total}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <span className="px-1 text-xs tabular-nums text-muted-foreground">
                {done ? "Done" : `${job.percent}%`}
              </span>
              {expanded ? (
                <ChevronUp className="size-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
      </button>

      <div className="mx-3.5 mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            done ? "bg-emerald-500" : stuck ? "bg-amber-500" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {expanded && (
        <div className="border-t border-border/70 bg-muted/20 px-3.5 py-2.5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Activity log
            </p>
            <div className="flex gap-1">
              {!done && onCancel ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel(job.id);
                  }}
                >
                  Cancel job
                </Button>
              ) : null}
              {done && onDismiss ? (
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(job.id);
                  }}
                >
                  <X className="size-3.5" />
                  Dismiss
                </Button>
              ) : null}
            </div>
          </div>
          <div className="max-h-40 space-y-1.5 overflow-y-auto text-xs">
            {logs.length === 0 ? (
              <p className="text-muted-foreground">
                {job.lastMessage || "No log entries yet — click again after a tick."}
              </p>
            ) : (
              [...logs].reverse().map((entry, i) => (
                <div key={`${entry.at}-${i}`} className="flex gap-2">
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatTime(entry.at)}
                  </span>
                  <span className="min-w-0 break-words text-foreground/90">
                    {entry.msg}
                  </span>
                </div>
              ))
            )}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Updated {formatTime(job.updatedAt)}
            {job.status === "running" ? " · auto-advances every few seconds" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Floating activity panel — click a card to expand the log.
 */
export function JobProgressBar() {
  const jobs = useJobsOptional();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (!jobs) return;
    setDismissed((prev) => {
      const runningIds = new Set(
        jobs.jobs.filter((j) => j.status === "running").map((j) => j.id)
      );
      if (![...prev].some((id) => runningIds.has(id))) return prev;
      const next = new Set(prev);
      for (const id of runningIds) next.delete(id);
      return next;
    });
  }, [jobs]);

  if (!jobs) return null;

  const running = jobs.jobs.filter((j) => j.status === "running");
  const recentDone = jobs.jobs.filter(
    (j) =>
      j.status === "completed" &&
      !dismissed.has(j.id) &&
      Date.now() - new Date(j.updatedAt).getTime() < 20_000
  );

  const visible = [...running, ...recentDone.slice(0, 2)].filter(
    (j) => !dismissed.has(j.id)
  );
  if (!visible.length) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2 sm:right-6 sm:bottom-6"
      aria-live="polite"
    >
      {visible.map((job) => (
        <div
          key={job.id}
          className="pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <JobCard
            job={job}
            expanded={expandedId === job.id}
            onToggle={() =>
              setExpandedId((cur) => (cur === job.id ? null : job.id))
            }
            onCancel={
              job.status === "running"
                ? (id) => void jobs.cancelJob(id)
                : undefined
            }
            onDismiss={
              job.status === "completed"
                ? (id) => setDismissed((prev) => new Set(prev).add(id))
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}
