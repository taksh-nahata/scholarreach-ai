"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Lightbulb, RefreshCw, Check, X } from "lucide-react";
import { toast } from "sonner";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

type Opportunity = {
  title: string;
  detail: string;
  type: string;
  keywords?: string[];
};

type ResearchedLink = {
  url: string;
  title: string | null;
  description: string | null;
  ok: boolean;
};

type Insight = {
  id: string;
  professorName: string | null;
  university: string | null;
  professorEmail: string | null;
  replyToKind: string | null;
  replyToSubject: string | null;
  sentiment: string;
  headline: string;
  recommendation: string | null;
  opportunitiesJson: string | null;
  linksJson: string | null;
  rawReply: string | null;
  status: string;
  createdAt: string;
};

function sentimentBadge(s: string) {
  if (s === "referral") return <Badge variant="secondary">Referral path</Badge>;
  if (s === "interested") return <Badge>Interested</Badge>;
  if (s === "decline") return <Badge variant="outline">Declined</Badge>;
  if (s === "question") return <Badge variant="outline">Question</Badge>;
  return <Badge variant="outline">Reply</Badge>;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Insight[]>([]);
  const [counts, setCounts] = useState({ new: 0, referral: 0, interested: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/opportunities");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setItems(data.items || []);
      setCounts(data.counts || { new: 0, referral: 0, interested: 0 });
    } catch {
      toast.error("Could not load opportunities");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function syncReplies() {
    setSyncing(true);
    try {
      const res = await fetch("/api/replies", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(
        data.insightsCreated
          ? `Parsed ${data.insightsCreated} new opportunity${data.insightsCreated === 1 ? "" : "ies"}`
          : data.found
            ? `Synced ${data.found} replies`
            : "No new replies"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch("/api/opportunities", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) {
      toast.error("Could not update");
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i))
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Opportunities
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            When professors reply — especially to follow-ups — with referrals,
            open-source paths, or alternative ways in, we extract and research
            them here (including links).
          </p>
        </div>
        <Button onClick={syncReplies} disabled={syncing}>
          <RefreshCw
            data-icon="inline-start"
            className={syncing ? "animate-spin" : undefined}
          />
          {syncing ? "Scanning Gmail…" : "Scan & parse replies"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>New to review</CardDescription>
            <CardTitle className="font-display text-3xl">{counts.new}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Referral paths</CardDescription>
            <CardTitle className="font-display text-3xl">{counts.referral}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Interested</CardDescription>
            <CardTitle className="font-display text-3xl">{counts.interested}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : items.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Lightbulb />
            </EmptyMedia>
            <EmptyTitle>No opportunities yet</EmptyTitle>
            <EmptyDescription>
              After professors reply (including to follow-ups), scan Gmail to
              extract referrals like open-source projects, labs, or programs.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => {
            const opps = parseJson<Opportunity[]>(item.opportunitiesJson, []);
            const links = parseJson<ResearchedLink[]>(item.linksJson, []);
            return (
              <Card key={item.id} className={item.status === "new" ? "border-primary/30" : ""}>
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {sentimentBadge(item.sentiment)}
                    {item.replyToKind === "follow_up" && (
                      <Badge variant="outline">Reply to follow-up</Badge>
                    )}
                    {item.status === "new" && (
                      <Badge variant="secondary">New</Badge>
                    )}
                  </div>
                  <CardTitle className="font-display text-lg">{item.headline}</CardTitle>
                  <CardDescription>
                    {item.professorName || item.professorEmail}
                    {item.university ? ` · ${item.university}` : ""}
                    {" · "}
                    {new Date(item.createdAt).toLocaleString()}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {item.recommendation && (
                    <p className="text-sm leading-relaxed">{item.recommendation}</p>
                  )}

                  {opps.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Suggested paths
                      </div>
                      {opps.map((o) => (
                        <div
                          key={`${item.id}-${o.title}`}
                          className="rounded-lg border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <div className="font-medium">{o.title}</div>
                          <div className="mt-1 text-muted-foreground">{o.detail}</div>
                          {o.keywords?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {o.keywords.map((k) => (
                                <Badge key={k} variant="outline" className="text-[10px]">
                                  {k}
                                </Badge>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  {links.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Researched links
                      </div>
                      {links.map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-accent/40"
                        >
                          <ExternalLink className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>
                            <span className="font-medium">{l.title || l.url}</span>
                            {l.description ? (
                              <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                                {l.description}
                              </span>
                            ) : null}
                          </span>
                        </a>
                      ))}
                    </div>
                  )}

                  {item.rawReply && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        Full reply text
                      </summary>
                      <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">
                        {item.rawReply}
                      </p>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {item.status !== "actioned" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setStatus(item.id, "actioned")}
                      >
                        <Check data-icon="inline-start" />
                        Mark actioned
                      </Button>
                    )}
                    {item.status !== "dismissed" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setStatus(item.id, "dismissed")}
                      >
                        <X data-icon="inline-start" />
                        Dismiss
                      </Button>
                    )}
                    <Link
                      href="/replies"
                      className="inline-flex h-8 items-center justify-center rounded-md px-3 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
                    >
                      View in Replies
                    </Link>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
