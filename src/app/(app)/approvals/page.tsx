"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { getDemoBundle } from "@/lib/demo";
import { allowDemoFallback } from "@/lib/live-mode";
import { useJobsOptional } from "@/lib/jobs-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type Draft = {
  id: string;
  subject: string;
  body: string;
  htmlBody?: string | null;
  recipientEmail: string | null;
  ccEmails: string | null;
  specialNotes?: string | null;
  matchScore?: number | null;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  isFallback?: boolean | null;
  professor: {
    name: string;
    university: string;
    researchFocus: string | null;
    recentPaper: string | null;
    email: string | null;
    specialInstructions: string | null;
    matchScore?: number | null;
    matchReason?: string | null;
    title?: string | null;
  } | null;
};

type ProfileFuel = {
  displayName?: string | null;
  headline?: string | null;
  school?: string | null;
  researchInterests?: string | null;
  achievements?: Array<{ title?: string; detail?: string }>;
  projects?: Array<{ name?: string; details?: string }>;
  skills?: { languages?: string[]; frameworks?: string[]; expertise?: string[] };
  tone?: string | null;
  styleNotes?: string | null;
  workMode?: string | null;
  hasCv?: boolean;
  cvPreview?: string | null;
  briefPreview?: string | null;
};

const SWIPE_THRESHOLD = 110;

const FORMAT_HINTS = [
  { id: "shorter", label: "Shorter", hint: "Cut to ~140 words. Keep one tight bullet list." },
  { id: "formal", label: "More formal", hint: "More formal academic tone. No casual phrases." },
  { id: "warmer", label: "Warmer", hint: "Warmer and more personal, still professional." },
  { id: "no_bullets", label: "No bullets", hint: "Use short paragraphs only — no bullet lists." },
];

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

/** Client-side strip of leftover Markdown for preview safety */
function cleanPreviewText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function EmailPreview({
  draft,
  fromLabel,
  cc,
  hasCv,
  editing,
  subject,
  body,
  onSubject,
  onBody,
  className,
}: {
  draft: Draft;
  fromLabel: string;
  cc: string;
  hasCv: boolean;
  editing: boolean;
  subject: string;
  body: string;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  className?: string;
}) {
  const to = draft.recipientEmail || draft.professor?.email || "professor@university.edu";
  const fromName = fromLabel.split("<")[0]?.trim() || "You";
  const displayBody = cleanPreviewText(body);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-white shadow-[0_12px_40px_-18px_rgba(15,23,42,0.35)]",
        className
      )}
    >
      <div className="flex items-center gap-1.5 border-b border-border/70 bg-[#f6f7f9] px-3 py-2.5 sm:px-4">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 truncate text-[11px] text-muted-foreground">
          Gmail preview
        </span>
      </div>

      <div className="space-y-3 border-b border-border/60 px-4 py-4 sm:px-5">
        {editing ? (
          <Input
            value={subject}
            onChange={(e) => onSubject(e.target.value)}
            className="font-display text-base font-semibold"
            placeholder="Subject"
          />
        ) : (
          <h2 className="font-display text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">
            {cleanPreviewText(subject)}
          </h2>
        )}
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
            {initials(fromName)}
          </div>
          <div className="min-w-0 flex-1 space-y-1 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-slate-900">{fromName}</span>
              <span className="truncate text-xs text-muted-foreground">
                &lt;
                {fromLabel.includes("@")
                  ? fromLabel.match(/[\w.+-]+@[\w.-]+/)?.[0] || "you@gmail.com"
                  : "you@gmail.com"}
                &gt;
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-slate-600">To:</span> {to}
            </div>
            {cc.trim() ? (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-slate-600">Cc:</span> {cc}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="max-h-[min(52vh,440px)] overflow-y-auto px-4 py-5 sm:px-5">
        {editing ? (
          <Textarea
            value={body}
            onChange={(e) => onBody(e.target.value)}
            className="min-h-[280px] resize-y border-0 p-0 text-[15px] leading-relaxed shadow-none focus-visible:ring-0"
            placeholder="Email body…"
          />
        ) : (
          <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
            {displayBody}
          </div>
        )}
        <p className="mt-6 text-xs text-muted-foreground">
          {hasCv
            ? "📎 CV will be attached when you send (if connected Gmail supports it)"
            : "No CV on file — email will not claim an attachment"}
        </p>
      </div>
    </div>
  );
}

function SwipeCard(props: {
  draft: Draft;
  fromLabel: string;
  cc: string;
  hasCv: boolean;
  editing: boolean;
  subject: string;
  body: string;
  onSubject: (v: string) => void;
  onBody: (v: string) => void;
  busy: boolean;
  onApprove: () => void;
  onRewrite: () => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-220, 0, 220], [-10, 0, 10]);
  const approveOpacity = useTransform(x, [40, 140], [0, 1]);
  const rewriteOpacity = useTransform(x, [-140, -40], [1, 0]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (props.busy || props.editing) return;
    if (info.offset.x > SWIPE_THRESHOLD || info.velocity.x > 700) {
      props.onApprove();
      return;
    }
    if (info.offset.x < -SWIPE_THRESHOLD || info.velocity.x < -700) {
      props.onRewrite();
    }
  };

  return (
    <motion.div
      className="relative touch-pan-y"
      style={{ x, rotate }}
      drag={props.busy || props.editing ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.9}
      onDragEnd={onDragEnd}
    >
      <motion.div
        style={{ opacity: approveOpacity }}
        className="pointer-events-none absolute left-4 top-8 z-10 rounded-lg border-2 border-emerald-500 bg-emerald-500/10 px-3 py-1 text-sm font-bold tracking-wide text-emerald-600"
      >
        APPROVE
      </motion.div>
      <motion.div
        style={{ opacity: rewriteOpacity }}
        className="pointer-events-none absolute right-4 top-8 z-10 rounded-lg border-2 border-sky-500 bg-sky-500/10 px-3 py-1 text-sm font-bold tracking-wide text-sky-600"
      >
        REWRITE
      </motion.div>
      <EmailPreview {...props} />
    </motion.div>
  );
}

export default function ApprovalsPage() {
  const jobs = useJobsOptional();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [fromLabel, setFromLabel] = useState("You <you@gmail.com>");
  const [hasCv, setHasCv] = useState(false);
  const [fuel, setFuel] = useState<ProfileFuel | null>(null);
  const [agentNotes, setAgentNotes] = useState<string | null>(null);

  const sweeping = !!jobs?.jobs.some(
    (j) => j.type === "approval_sweep" && j.status === "running"
  );
  const sweepJob = jobs?.jobs.find((j) => j.type === "approval_sweep");

  const current = drafts[Math.min(index, Math.max(drafts.length - 1, 0))] || null;
  const remaining = drafts.length;

  async function load(opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoading(true);
    try {
      const [res, meRes] = await Promise.all([
        fetch("/api/approvals?status=pending"),
        fetch("/api/profile").catch(() => null),
      ]);
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      const list = (data.drafts || []) as Draft[];
      setDrafts(list);
      if (!opts?.silent) setIndex(0);
      setHasCv(!!data.hasCv);
      setFuel(data.profileFuel || null);
      setOffline(false);
      if (list[0] && !opts?.silent) {
        setCc(list[0].ccEmails || "");
        setSubject(list[0].subject);
        setBody(list[0].body);
      }
      if (meRes?.ok) {
        const me = await meRes.json();
        const name = me.profile?.displayName || me.user?.name || "You";
        const email = me.user?.email || "you@gmail.com";
        setFromLabel(`${name} <${email}>`);
      }
    } catch {
      if (!allowDemoFallback()) {
        if (!opts?.silent) {
          setDrafts([]);
          setOffline(false);
          toast.error("Could not load approvals — sign in and retry");
        }
      } else {
        const demo = getDemoBundle();
        const list = demo.drafts as Draft[];
        setDrafts(list);
        setIndex(0);
        setCc(list[0]?.ccEmails || "");
        setSubject(list[0]?.subject || "");
        setBody(list[0]?.body || "");
        setOffline(true);
        setHasCv(true);
        setFromLabel("Alex Rivera <alex@example.com>");
        setFuel({
          displayName: "Alex Rivera",
          headline: "Sample student",
          hasCv: true,
          achievements: [{ title: "Demo award" }],
          briefPreview: "Demo profile brief used for sample drafts.",
        });
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
      try {
        const settingsRes = await fetch("/api/settings");
        const settings = settingsRes.ok ? await settingsRes.json() : null;
        const mode = settings?.settings?.autoApproveMode || "manual";
        if (mode === "agent_gate" || mode === "auto") {
          void runApprovalSweep(false);
        }
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silent refresh only while sweep is actively running
  useEffect(() => {
    if (!sweeping) return;
    const id = setInterval(() => void load({ silent: true }), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweeping]);

  // One refresh when a sweep finishes (do not poll forever on completed)
  const prevSweeping = useRef(false);
  useEffect(() => {
    if (prevSweeping.current && !sweeping) {
      void load({ silent: true });
    }
    prevSweeping.current = sweeping;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sweeping]);

  async function runApprovalSweep(forceToast: boolean) {
    if (sweeping || offline) return;
    if (!jobs?.startSweep) {
      if (forceToast) toast.error("Background jobs unavailable — refresh the page");
      return;
    }
    try {
      const job = await jobs.startSweep();
      if (forceToast) {
        toast.success(
          job
            ? `Sweep started for ${job.total} drafts — watch the activity card`
            : "Sweep started"
        );
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sweep failed");
    }
  }

  useEffect(() => {
    if (!current) return;
    setCc(current.ccEmails || "");
    setSubject(current.subject);
    setBody(current.body);
    setEditing(false);
    setAgentNotes(current.reviewNotes || null);
  }, [current?.id]);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(drafts.length - 1, 0)));
  }, [drafts.length]);

  async function act(
    action: "approve" | "reject" | "agent_review" | "regenerate" | "save",
    formatHint?: string
  ) {
    if (!current || busy) return;
    setBusy(true);
    const draftId = current.id;
    try {
      if (offline) {
        if (action === "regenerate") {
          const cleaned = body.replace(/\*\*/g, "");
          setBody(
            `${cleaned}\n\n— (demo rewrite${formatHint ? `: ${formatHint}` : ""})`
          );
          setSubject(subject.replace(/\*\*/g, ""));
          toast.success("Rewrote draft (demo)");
        } else if (action === "save" || action === "agent_review") {
          if (action === "agent_review") {
            setAgentNotes("Demo agent: looks specific enough to send (score 84)");
            toast.message("Agent review (demo) — does not send");
          } else toast.success("Saved edits");
        } else {
          setDrafts((prev) => prev.filter((d) => d.id !== draftId));
          toast.success(action === "approve" ? "Approved · queued (demo)" : "Skipped");
        }
        return;
      }

      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          action,
          ccEmails: cc,
          subject,
          body,
          formatHint,
          autoSchedule: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Action failed");

      if (action === "save") {
        if (data.draft) {
          setDrafts((prev) =>
            prev.map((d) => (d.id === draftId ? { ...d, ...data.draft } : d))
          );
          setSubject(data.draft.subject);
          setBody(data.draft.body);
        }
        setEditing(false);
        toast.success("Saved — Gmail-safe formatting applied");
        return;
      }

      if (action === "regenerate") {
        const fresh = data.draft as Draft;
        setDrafts((prev) => {
          const next = [...prev];
          next[index] = fresh;
          return next;
        });
        setSubject(fresh.subject);
        setBody(fresh.body);
        setCc(fresh.ccEmails || "");
        setHasCv(!!data.hasCv || hasCv);
        setEditing(false);
        toast.success("Rewrote email for Gmail");
        return;
      }

      if (action === "agent_review") {
        setAgentNotes(
          data.verdict
            ? `${data.verdict.approve ? "Would approve" : "Would hold"} · ${data.verdict.notes} (score ${data.verdict.score})`
            : data.explanation
        );
        toast.message(
          data.explanation ||
            "Agent reviewed only — it does not send. Tap Approve if you agree."
        );
        return;
      }

      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.success(
        action === "reject" ? "Skipped" : `Queued · ${data.scheduledTime || "scheduled"}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const contextBits = useMemo(() => {
    if (!current) return [];
    const bits: Array<{ label: string; value: string }> = [];
    if (current.professor?.researchFocus) {
      bits.push({ label: "Focus", value: current.professor.researchFocus });
    }
    if (current.professor?.recentPaper) {
      bits.push({ label: "Paper", value: current.professor.recentPaper });
    }
    if (current.professor?.matchReason) {
      bits.push({ label: "Why", value: current.professor.matchReason });
    }
    return bits;
  }, [current]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[60vh] w-full rounded-2xl" />
      </div>
    );
  }

  if (!current || remaining === 0) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preview emails exactly as professors will see them in Gmail.
          </p>
        </div>
        <Empty className="border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>All caught up</EmptyTitle>
            <EmptyDescription>
              No pending drafts. Mine faculty from Directory when you&apos;re ready.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const fit = current.matchScore ?? current.professor?.matchScore;
  const previewProps = {
    draft: current,
    fromLabel,
    cc,
    hasCv,
    editing,
    subject,
    body,
    onSubject: setSubject,
    onBody: setBody,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-28 md:pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Approvals
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {remaining} left · Gmail-style preview · edit anytime before send
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={sweeping || offline || !!jobs?.refreshing}
            onClick={() => void runApprovalSweep(true)}
          >
            {sweeping ? <Spinner data-icon="inline-start" /> : null}
            {sweeping ? "Sweeping…" : "Verify emails + agent gate"}
          </Button>
          {fit != null && <Badge variant="secondary">Fit {fit}/100</Badge>}
          {current.isFallback && (
            <Badge variant="destructive">Template draft — rewrite before approving</Badge>
          )}
          <Badge variant={hasCv ? "secondary" : "outline"}>
            {hasCv ? "CV on file" : "No CV"}
          </Badge>
          <Badge variant="outline">
            {index + 1} / {drafts.length}
          </Badge>
        </div>
      </div>

      {sweeping && (
        <Alert>
          <AlertTitle>Background sweep running</AlertTitle>
          <AlertDescription>
            {sweepJob?.lastMessage ||
              "Re-checking emails and applying agent gate. Progress is under the nav — safe to leave this page."}
          </AlertDescription>
        </Alert>
      )}

      {offline && (
        <Alert>
          <AlertTitle>Sample drafts</AlertTitle>
          <AlertDescription>
            Demo mode — edits, rewrite, and agent review work locally.
          </AlertDescription>
        </Alert>
      )}

      {agentNotes && (
        <Alert>
          <Sparkles className="size-4" />
          <AlertTitle>Agent review</AlertTitle>
          <AlertDescription>
            {agentNotes}. Agent never sends — you still Approve to queue.
          </AlertDescription>
        </Alert>
      )}

      {/* Mobile */}
      <div className="md:hidden">
        <p className="mb-3 text-center text-xs text-muted-foreground">
          Swipe right to approve · left to rewrite
        </p>
        <SwipeCard
          key={current.id}
          {...previewProps}
          busy={busy}
          onApprove={() => act("approve")}
          onRewrite={() => act("regenerate")}
        />
        <div className="mt-4 space-y-3">
          <Input
            value={cc}
            onChange={(e) => setCc(e.target.value)}
            placeholder="Cc (optional)"
            className="bg-card"
          />
          <div className="flex flex-wrap justify-center gap-2">
            {FORMAT_HINTS.map((f) => (
              <Button
                key={f.id}
                size="xs"
                variant="outline"
                disabled={busy}
                onClick={() => act("regenerate", f.hint)}
              >
                {f.label}
              </Button>
            ))}
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button
              size="lg"
              variant="outline"
              className="size-14 rounded-full"
              disabled={busy}
              onClick={() => act("regenerate")}
              aria-label="Rewrite"
            >
              {busy ? <Spinner /> : <RefreshCw className="size-5 text-sky-600" />}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="size-12 rounded-full"
              disabled={busy}
              onClick={() => setEditing((e) => !e)}
              aria-label="Edit"
            >
              <Pencil className="size-5" />
            </Button>
            <Button
              size="lg"
              className="size-14 rounded-full"
              disabled={busy}
              onClick={() => act("approve")}
              aria-label="Approve"
            >
              {busy ? <Spinner /> : <Check className="size-6" />}
            </Button>
          </div>
          {editing && (
            <Button className="w-full" disabled={busy} onClick={() => act("save")}>
              Save edits
            </Button>
          )}
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
        <EmailPreview {...previewProps} className="min-h-[520px]" />

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                {initials(current.professor?.name)}
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold leading-tight">
                  {current.professor?.name || "Professor"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {current.professor?.university || ""}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {contextBits.map((b) => (
                <div key={b.label}>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {b.label}
                  </p>
                  <p className="mt-0.5 text-sm leading-snug">{b.value}</p>
                </div>
              ))}
            </div>
          </div>

          {fuel && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Data feeding this email
              </p>
              <p className="mt-1 text-sm font-medium">
                {fuel.displayName}
                {fuel.school ? ` · ${fuel.school}` : ""}
              </p>
              {fuel.researchInterests && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Interests: {fuel.researchInterests}
                </p>
              )}
              {!!fuel.achievements?.length && (
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {fuel.achievements.slice(0, 4).map((a, i) => (
                    <li key={i}>{a.title || a.detail}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Tone: {(fuel.tone || "warm").replace(/_/g, " ")}
                {fuel.styleNotes ? ` · ${fuel.styleNotes}` : ""}
              </p>
              <p className="mt-1 text-xs">
                {fuel.hasCv ? (
                  <span className="text-emerald-700">CV on file</span>
                ) : (
                  <span className="text-amber-700">
                    No CV uploaded — drafts won&apos;t claim an attachment
                  </span>
                )}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-4">
            <label className="text-xs font-medium text-muted-foreground">
              Cc (optional)
            </label>
            <Input
              className="mt-1.5"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="assistant@university.edu"
            />
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              Rewrite as…
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FORMAT_HINTS.map((f) => (
                <Button
                  key={f.id}
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => act("regenerate", f.hint)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button size="lg" disabled={busy} onClick={() => act("approve")}>
              {busy ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              Approve &amp; queue
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => (editing ? act("save") : setEditing(true))}
              >
                <Pencil data-icon="inline-start" />
                {editing ? "Save edits" : "Edit text"}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => act("regenerate")}
              >
                <RefreshCw data-icon="inline-start" />
                Rewrite
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => act("agent_review")}
                title="Scores the draft like a careful student. Does not send."
              >
                <Sparkles data-icon="inline-start" />
                Agent check
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => act("reject")}>
                <X data-icon="inline-start" />
                Skip
              </Button>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              <strong>Agent check</strong> scores tone, specificity, and profile
              fit. It never queues or sends — you still Approve.
            </p>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              type="button"
              className="inline-flex items-center gap-1 disabled:opacity-40"
              disabled={index === 0 || busy}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              <ChevronLeft className="size-3.5" /> Previous
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 disabled:opacity-40"
              disabled={index >= drafts.length - 1 || busy}
              onClick={() => setIndex((i) => Math.min(drafts.length - 1, i + 1))}
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
