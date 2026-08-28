"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, Eye, Play, RefreshCw, X, Zap } from "lucide-react";
import { toast } from "sonner";
import { getDemoBundle } from "@/lib/demo";
import { allowDemoFallback } from "@/lib/live-mode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

type QueueItem = {
  id: string;
  professorName: string | null;
  university: string | null;
  toEmail: string;
  ccEmails?: string | null;
  subject: string;
  body?: string | null;
  htmlBody?: string | null;
  scheduledIso: string;
  scheduledTime: string | null;
  status: string;
  kind?: string | null;
  lastError: string | null;
  sentAt?: string | null;
};

function cleanPreviewText(text: string) {
  return (text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("");
}

function ScheduledEmailDetail({
  item,
  onClose,
}: {
  item: QueueItem;
  onClose: () => void;
}) {
  const body = cleanPreviewText(item.body || "(No body saved for this send.)");

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-background shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Scheduled email preview"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Approved email
            </p>
            <p className="mt-0.5 truncate font-display text-lg font-semibold">
              {item.professorName || item.toEmail}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.university || "—"} ·{" "}
              {item.scheduledTime ||
                new Date(item.scheduledIso).toLocaleString()}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {item.kind === "follow_up" ? (
              <Badge variant="outline">Follow-up</Badge>
            ) : null}
            <Badge variant="secondary">{item.status}</Badge>
            <Button
              size="icon-sm"
              variant="ghost"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto px-4 py-4 sm:px-5">
          <div className="overflow-hidden rounded-2xl border border-border/80 bg-white shadow-[0_12px_40px_-18px_rgba(15,23,42,0.35)]">
            <div className="flex items-center gap-1.5 border-b border-border/70 bg-[#f6f7f9] px-3 py-2.5 sm:px-4">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
              <span className="ml-2 truncate text-[11px] text-muted-foreground">
                What you approved
              </span>
            </div>

            <div className="space-y-3 border-b border-border/60 px-4 py-4 sm:px-5">
              <h2 className="font-display text-lg font-semibold leading-snug tracking-tight text-slate-900 sm:text-xl">
                {cleanPreviewText(item.subject)}
              </h2>
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {initials(item.professorName)}
                </div>
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-slate-600">To:</span>{" "}
                    {item.toEmail}
                  </div>
                  {item.ccEmails?.trim() ? (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-slate-600">Cc:</span>{" "}
                      {item.ccEmails}
                    </div>
                  ) : null}
                  {item.sentAt ? (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-slate-600">Sent:</span>{" "}
                      {new Date(item.sentAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="px-4 py-5 sm:px-5">
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                {body}
              </div>
            </div>
          </div>

          {item.lastError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Send error</AlertTitle>
              <AlertDescription>{item.lastError}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

export default function QueuePage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <QueuePageInner />
    </Suspense>
  );
}

function QueuePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const openId = searchParams.get("open");

  const [items, setItems] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [health, setHealth] = useState<{
    liveSend?: boolean;
    dryRun?: boolean;
    inWindow?: boolean;
    timeZone?: string;
    issues?: Array<{ code: string; severity: string; message: string; fix?: string }>;
  } | null>(null);

  function closeDetail() {
    setSelected(null);
    if (openId) router.replace("/queue");
  }

  async function loadHealth() {
    try {
      const res = await fetch("/api/outreach/health");
      if (res.ok) setHealth(await res.json());
    } catch {
      /* ignore */
    }
  }

  async function fetchDetail(
    id: string,
    fallback?: QueueItem | null,
    useOffline = offline
  ) {
    setDetailLoading(true);
    try {
      if (useOffline && allowDemoFallback()) {
        const demo = getDemoBundle();
        const found = (demo.queue as QueueItem[]).find((i) => i.id === id);
        setSelected(found || fallback || null);
        return;
      }
      const res = await fetch(`/api/queue?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      setSelected(data.item as QueueItem);
    } catch {
      if (fallback) setSelected(fallback);
      else toast.error("Could not load that email");
    } finally {
      setDetailLoading(false);
    }
  }

  function openItem(item: QueueItem) {
    if (item.body != null && item.body !== "") {
      setSelected(item);
      return;
    }
    void fetchDetail(item.id, item);
  }

  async function load(status = filter) {
    setLoading(true);
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const res = await fetch(`/api/queue${qs}`);
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      const list = (data.items || []) as QueueItem[];
      setItems(list);
      setOffline(false);
      await loadHealth();
      if (openId) {
        const match = list.find((i) => i.id === openId);
        if (match?.body) setSelected(match);
        else await fetchDetail(openId, match || null, false);
      }
    } catch {
      if (!allowDemoFallback()) {
        setItems([]);
        setOffline(false);
        toast.error("Could not load queue — sign in and retry");
      } else {
        const demo = getDemoBundle();
        let list = demo.queue as QueueItem[];
        if (status !== "all") list = list.filter((i) => i.status === status);
        setItems(list);
        setOffline(true);
        if (openId) {
          const match = list.find((i) => i.id === openId);
          if (match) setSelected(match);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function patch(id: string, action: string, scheduledIso?: string) {
    if (offline) {
      if (action === "cancel") {
        setItems((prev) =>
          prev.map((i) => (i.id === id ? { ...i, status: "cancelled" } : i))
        );
        if (selected?.id === id) {
          setSelected((s) => (s ? { ...s, status: "cancelled" } : s));
        }
      }
      toast.message(`Demo ${action}`);
      return;
    }
    const res = await fetch("/api/queue", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action, scheduledIso }),
    });
    const data = await res.json();
    toast.message(
      action === "dispatch_now"
        ? `Dispatch: ${JSON.stringify(data.dispatchResult)}`
        : `${action} ok`
    );
    await load();
  }

  async function dispatchBatch() {
    if (offline) {
      toast.message("Batch dispatch requires the live API");
      return;
    }
    const res = await fetch("/api/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dispatch_batch", force: true }),
    });
    const data = await res.json();
    const sent = (data.results || []).filter((r: { sent?: boolean }) => r.sent);
    toast.success(
      data.liveSend === false
        ? "Server still in dry-run — no real mail sent"
        : `Dispatched ${sent.length} live email(s)`
    );
    await load();
  }

  async function runSelfHeal() {
    const res = await fetch("/api/outreach/health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error("Health check failed");
      return;
    }
    const errs = (data.after?.issues || []).filter(
      (i: { severity: string }) => i.severity === "error"
    );
    toast.message(
      errs.length
        ? `Found ${errs.length} issue(s) — see alert below`
        : "Send path looks healthy"
    );
    await load();
  }

  function reschedule(id: string) {
    const next = prompt(
      "New ISO datetime (e.g. 2026-07-29T15:00:00.000Z)",
      new Date().toISOString()
    );
    if (!next) return;
    patch(id, "reschedule", next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Outreach Queue
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tap any row to read the email you approved · Tue–Thu 8–9 AM professor-local
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
          <Button variant="outline" onClick={runSelfHeal}>
            Self-check
          </Button>
          <Button onClick={dispatchBatch}>
            <Zap data-icon="inline-start" />
            Dispatch Batch Now
          </Button>
        </div>
      </div>

      {health && (
        <Alert
          variant={
            health.dryRun || health.issues?.some((i) => i.severity === "error")
              ? "destructive"
              : "default"
          }
        >
          <AlertTitle>
            {health.liveSend ? "Live sending on" : "Dry-run (not sending)"}
            {health.inWindow ? " · in academic window" : " · outside window"}
          </AlertTitle>
          <AlertDescription className="space-y-1 text-sm">
            <p>
              Each email is scheduled for Tue–Thu ~8 AM in that professor&apos;s
              university timezone. Cron only sends during that hour; missed slots
              roll to the next Tue–Thu morning. Use Now / Dispatch for an immediate send.
            </p>
            {(health.issues || [])
              .filter((i) => i.severity !== "info")
              .map((i) => (
                <p key={i.code}>
                  {i.message}
                  {i.fix ? ` → ${i.fix}` : ""}
                </p>
              ))}
          </AlertDescription>
        </Alert>
      )}

      {offline && (
        <Alert>
          <AlertTitle>Static demo mode</AlertTitle>
          <AlertDescription>
            Showing exported queue snapshot for GitHub Pages.
          </AlertDescription>
        </Alert>
      )}

      <Tabs
        value={filter}
        onValueChange={(v) => {
          setFilter(v);
          load(v);
        }}
      >
        <TabsList>
          {["all", "scheduled", "sent", "failed", "cancelled"].map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">
              {s}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Zap />
            </EmptyMedia>
            <EmptyTitle>Queue empty</EmptyTitle>
            <EmptyDescription>
              Approve drafts to fill the academic send window.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display">Live queue</CardTitle>
            <CardDescription>
              {items.length} items · click a row to preview the approved body
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Professor</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow
                    key={item.id}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-muted/50",
                      selected?.id === item.id && "bg-muted/40"
                    )}
                    onClick={() => openItem(item)}
                  >
                    <TableCell>
                      <div className="font-medium">
                        {item.professorName || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.university}
                      </div>
                      <div className="mt-1 max-w-xs truncate text-xs text-muted-foreground">
                        {item.subject}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{item.toEmail}</TableCell>
                    <TableCell className="text-xs">
                      {item.scheduledTime ||
                        new Date(item.scheduledIso).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="secondary">{item.status}</Badge>
                        {item.kind === "follow_up" ? (
                          <Badge variant="outline">Follow-up</Badge>
                        ) : null}
                        {item.lastError && (
                          <div className="mt-1 max-w-[180px] text-[10px] text-destructive">
                            {item.lastError}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-start gap-1">
                        <Button
                          size="xs"
                          variant="ghost"
                          onClick={() => openItem(item)}
                        >
                          <Eye data-icon="inline-start" />
                          View
                        </Button>
                        {item.status === "scheduled" && (
                          <>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => patch(item.id, "dispatch_now")}
                            >
                              <Play data-icon="inline-start" />
                              Now
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => reschedule(item.id)}
                            >
                              <RefreshCw data-icon="inline-start" />
                              Reschedule
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => patch(item.id, "cancel")}
                            >
                              <Ban data-icon="inline-start" />
                              Cancel
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {detailLoading && !selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <Skeleton className="h-48 w-full max-w-md rounded-2xl" />
        </div>
      )}

      {selected && (
        <ScheduledEmailDetail item={selected} onClose={closeDetail} />
      )}
    </div>
  );
}
