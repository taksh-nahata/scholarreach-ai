"use client";

import { useEffect, useState } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Analytics = {
  summary: {
    sent: number;
    replied: number;
    replyRate: number;
    outreachSent: number;
    outreachReplyRate: number;
    followUpSent: number;
    followUpReplyRate: number;
    scheduledPending: number;
    last30Sent: number;
    last30ReplyRate: number;
    opportunitiesOpen: number;
  };
  abTests: {
    followUpVariants: Record<
      string,
      { sent: number; replies: number; replyRate: number }
    >;
    note: string;
  };
  sentiment: Record<string, number>;
  recentInsights: Array<{
    id?: string;
    sentiment: string;
    headline: string;
    professorName: string | null;
    university?: string | null;
    professorEmail?: string | null;
    replyToKind: string | null;
    replyToSubject?: string | null;
    recommendation?: string | null;
    rawReply?: string | null;
    opportunitiesJson?: string | null;
    linksJson?: string | null;
  }>;
  learnings: {
    lessons: string[];
    winningFollowUpVariant: string | null;
    sampleSize: number;
    promptBrief: string;
  };
};

function pct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [openInsight, setOpenInsight] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/analytics");
      if (!res.ok) throw new Error("Failed to load analytics");
      setData(await res.json());
    } catch {
      toast.error("Could not load analytics");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // If we have sends but zero reply insights, auto-scan Gmail once
  useEffect(() => {
    if (!data) return;
    if (data.summary.sent > 0 && data.summary.replied === 0 && !busy) {
      const key = "sr_auto_reply_scan_v1";
      if (typeof window !== "undefined" && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        void (async () => {
          try {
            const res = await fetch("/api/replies", { method: "POST" });
            if (res.ok) {
              await fetch("/api/analytics", { method: "POST" });
              await load();
              toast.success("Imported replies from Gmail");
            }
          } catch {
            /* ignore */
          }
        })();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.summary.sent, data?.summary.replied]);

  async function refreshLearnings() {
    setBusy(true);
    try {
      const res = await fetch("/api/analytics", { method: "POST" });
      if (!res.ok) throw new Error("Refresh failed");
      const json = await res.json();
      setData(json);
      toast.success("Learnings refreshed — new drafts will use them");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !data) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const s = data.summary;
  const variants = Object.entries(data.abTests.followUpVariants);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Analytics
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Reply rates, follow-up A/B tests, and lessons that feed back into
            better drafts.
          </p>
        </div>
        <Button onClick={refreshLearnings} disabled={busy} variant="outline">
          <RefreshCw
            data-icon="inline-start"
            className={busy ? "animate-spin" : undefined}
          />
          {busy ? "Working…" : "Refresh learnings"}
        </Button>
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch("/api/replies", { method: "POST" });
              const json = await res.json();
              if (!res.ok) throw new Error(json.error || "Scan failed");
              await fetch("/api/analytics", { method: "POST" });
              await load();
              toast.success(
                json.insightsCreated
                  ? `Imported ${json.insightsCreated} replies from Gmail`
                  : json.found
                    ? `Found ${json.found} replies`
                    : "No new replies in scanned threads"
              );
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Scan failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          Scan Gmail replies
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Overall reply rate</CardDescription>
            <CardTitle className="font-display text-3xl">
              {pct(s.replyRate)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {s.replied} replies / {s.sent} sent
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>First outreach</CardDescription>
            <CardTitle className="font-display text-3xl">
              {pct(s.outreachReplyRate)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {s.outreachSent} first emails
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Follow-up replies</CardDescription>
            <CardTitle className="font-display text-3xl">
              {pct(s.followUpReplyRate)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {s.followUpSent} follow-ups sent
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 30 days</CardDescription>
            <CardTitle className="font-display text-3xl">
              {pct(s.last30ReplyRate)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {s.last30Sent} sent · {s.opportunitiesOpen} open opportunities
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Follow-up A/B test
            </CardTitle>
            <CardDescription>{data.abTests.note}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {variants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No follow-up variants sent yet. New follow-ups randomly assign{" "}
                <Badge variant="outline">short_bump</Badge> vs{" "}
                <Badge variant="outline">value_nudge</Badge>.
              </p>
            ) : (
              variants.map(([name, v]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                >
                  <div>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">
                      {v.replies} replies / {v.sent} sent
                    </div>
                  </div>
                  <div className="font-display text-xl">{pct(v.replyRate)}</div>
                </div>
              ))
            )}
            {data.learnings.winningFollowUpVariant && (
              <p className="text-sm text-muted-foreground">
                Current leader (n≥3):{" "}
                <Badge>{data.learnings.winningFollowUpVariant}</Badge>
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">Reply mix</CardTitle>
            <CardDescription>
              How professors respond (including polite declines with referrals)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(data.sentiment).map(([k, v]) => (
              <Badge key={k} variant="secondary" className="text-sm">
                {k}: {v}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <BarChart3 className="size-5" />
            What we&apos;re learning
          </CardTitle>
          <CardDescription>
            Injected into new draft prompts so emails improve from real replies
            (sample size {data.learnings.sampleSize}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {data.learnings.lessons.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {data.recentInsights.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-xl">
              Recent reply insights
            </CardTitle>
            <CardDescription>
              Click a row to read the full professor reply
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentInsights.map((i, idx) => {
              const key = i.id || `${i.headline}-${idx}`;
              const open = openInsight === key;
              let links: Array<{ url: string; title?: string | null }> = [];
              let opps: Array<{ title: string; detail: string }> = [];
              try {
                if (i.linksJson) links = JSON.parse(i.linksJson);
              } catch {
                /* ignore */
              }
              try {
                if (i.opportunitiesJson) opps = JSON.parse(i.opportunitiesJson);
              } catch {
                /* ignore */
              }
              return (
                <div
                  key={key}
                  className={`rounded-lg border transition ${
                    open ? "border-primary/30 bg-muted/20" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="flex w-full flex-col gap-1 px-3 py-2.5 text-left text-sm hover:bg-muted/40"
                    onClick={() =>
                      setOpenInsight((cur) => (cur === key ? null : key))
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{i.sentiment}</Badge>
                      {i.replyToKind === "follow_up" && (
                        <Badge variant="secondary">via follow-up</Badge>
                      )}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {open ? "Hide" : "View reply"}
                      </span>
                    </div>
                    <div className="font-medium">{i.headline}</div>
                    {i.professorName && (
                      <div className="text-xs text-muted-foreground">
                        {i.professorName}
                        {i.university ? ` · ${i.university}` : ""}
                      </div>
                    )}
                  </button>
                  {open && (
                    <div className="space-y-3 border-t px-3 py-3 text-sm">
                      {i.recommendation && (
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Takeaway
                          </div>
                          <p className="mt-1 leading-relaxed">
                            {i.recommendation}
                          </p>
                        </div>
                      )}
                      {opps.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Opportunities
                          </div>
                          {opps.map((o) => (
                            <div
                              key={o.title}
                              className="rounded-md border bg-background px-2.5 py-2 text-xs"
                            >
                              <div className="font-medium">{o.title}</div>
                              <div className="mt-0.5 text-muted-foreground">
                                {o.detail}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {links.length > 0 && (
                        <div className="space-y-1">
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Links
                          </div>
                          {links.map((l) => (
                            <a
                              key={l.url}
                              href={l.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block truncate text-xs text-primary hover:underline"
                            >
                              {l.title || l.url}
                            </a>
                          ))}
                        </div>
                      )}
                      {i.rawReply && (
                        <div>
                          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                            Full reply
                            {i.replyToSubject
                              ? ` · re: ${i.replyToSubject}`
                              : ""}
                          </div>
                          <pre className="mt-1 whitespace-pre-wrap rounded-md bg-background p-3 text-xs leading-relaxed text-foreground/90">
                            {i.rawReply}
                          </pre>
                        </div>
                      )}
                      {!i.rawReply && !i.recommendation && (
                        <p className="text-xs text-muted-foreground">
                          No full text stored for this insight — open{" "}
                          <a href="/opportunities" className="text-primary underline">
                            Opportunities
                          </a>{" "}
                          or re-scan Gmail.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
