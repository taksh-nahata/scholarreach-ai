"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Pickaxe, Mail, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { parseJsonArray } from "@/lib/utils";
import { getDemoBundle } from "@/lib/demo";
import { allowDemoFallback } from "@/lib/live-mode";
import { useJobsOptional } from "@/lib/jobs-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { SimilarProfessorsPanel } from "@/components/SimilarProfessorsPanel";

type Professor = {
  id: string;
  name: string;
  email: string | null;
  university: string;
  title?: string | null;
  researchFocus: string | null;
  recentPaper: string | null;
  labName: string | null;
  tags: string | null;
  emailVerified: boolean;
  matchScore?: number | null;
  matchReason?: string | null;
  contacted?: boolean;
  drafts?: Array<{ id: string }>;
  emailConfidence?: {
    tier: "high" | "medium" | "low";
    score: number;
    reason: string;
  };
};

function emailBadge(p: Professor) {
  if (p.emailVerified && p.email) {
    return <Badge variant="secondary">Verified</Badge>;
  }
  if (p.email) {
    return <Badge variant="outline">Unverified</Badge>;
  }
  return <Badge variant="destructive">Missing email</Badge>;
}

function readyToDraft(p: Professor) {
  return (
    !p.contacted &&
    !p.drafts?.length &&
    !!p.emailVerified &&
    !!p.email
  );
}

export default function DirectoryPage() {
  const jobs = useJobsOptional();
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [q, setQ] = useState("");
  const [university, setUniversity] = useState("");
  const [loading, setLoading] = useState(true);
  const rechecking = !!jobs?.jobs.some(
    (j) => j.type === "email_reverify" && j.status === "running"
  );
  const mining = !!jobs?.jobs.some(
    (j) => j.type === "mine_leads" && j.status === "running"
  );
  const drafting = !!jobs?.jobs.some(
    (j) => j.type === "draft_generate" && j.status === "running"
  );
  const [similarSource, setSimilarSource] = useState<Professor | null>(null);
  const [similarOpen, setSimilarOpen] = useState(false);

  async function load(
    nextQ = q,
    nextUniversity = university,
    opts?: { silent?: boolean }
  ) {
    if (!opts?.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextQ) params.set("q", nextQ);
      if (nextUniversity) params.set("university", nextUniversity);
      const res = await fetch(`/api/directory?${params}`);
      if (!res.ok) throw new Error("api unavailable");
      const data = await res.json();
      setProfessors(data.professors || []);
    } catch {
      if (!allowDemoFallback()) {
        if (!opts?.silent) {
          setProfessors([]);
          toast.error("Could not load directory — sign in and retry");
        }
        return;
      }
      const demo = getDemoBundle();
      let list = demo.professors as Professor[];
      if (nextQ) {
        const qq = nextQ.toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(qq) ||
            p.university.toLowerCase().includes(qq) ||
            (p.researchFocus || "").toLowerCase().includes(qq)
        );
      }
      if (nextUniversity) {
        list = list.filter((p) => p.university.includes(nextUniversity));
      }
      setProfessors(list);
      if (!opts?.silent) {
        toast.message("Showing demo directory (static / offline mode)");
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!rechecking && !mining && !drafting) return;
    const id = setInterval(() => void load(q, university, { silent: true }), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rechecking, mining, drafting]);

  const universities = useMemo(
    () => Array.from(new Set(professors.map((p) => p.university))).sort(),
    [professors]
  );

  const counts = useMemo(() => {
    const contacted = professors.filter((p) => p.contacted).length;
    const ready = professors.filter((p) => readyToDraft(p)).length;
    const needEmail = professors.filter(
      (p) => !p.contacted && !(p.emailVerified && p.email)
    ).length;
    return { contacted, ready, needEmail, total: professors.length };
  }, [professors]);

  async function mine() {
    if (!jobs?.startMine) {
      toast.error("Background jobs unavailable — refresh the page");
      return;
    }
    try {
      const job = await jobs.startMine({ count: 20 });
      toast.success(
        job
          ? `Mining up to ${job.total} leads — watch the activity card`
          : "Mine started"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mining failed");
    }
  }

  async function recheckEmails() {
    if (!jobs) {
      toast.error("Background jobs unavailable — refresh the page");
      return;
    }
    try {
      const job = await jobs.startReverify({ all: true });
      toast.success(
        job
          ? `Re-checking all ${job.total} leads — watch the activity card`
          : "Re-check started"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-check failed");
    }
  }

  async function draftVerifiedHighFit() {
    const minFit = 50;
    const ids = professors
      .filter((p) => readyToDraft(p) && (p.matchScore ?? 0) >= minFit)
      .slice(0, 15)
      .map((p) => p.id);
    if (!ids.length) {
      toast.message(
        `No uncontacted verified leads with fit ≥ ${minFit} ready to draft`
      );
      return;
    }
    if (!jobs?.startDraft) {
      toast.error("Background jobs unavailable — refresh the page");
      return;
    }
    try {
      const job = await jobs.startDraft({ professorIds: ids });
      toast.success(
        job
          ? `Drafting ${job.total} best matches — watch the activity card`
          : "Drafting started"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draft failed");
    }
  }

  async function draftForVisible() {
    const ids = professors
      .filter((p) => readyToDraft(p))
      .slice(0, 10)
      .map((p) => p.id);
    const skippedMissing = professors.filter(
      (p) => !p.contacted && !p.drafts?.length && !(p.emailVerified && p.email)
    ).length;
    if (!ids.length) {
      toast.message(
        skippedMissing
          ? "No verified emails on uncontacted leads — re-check emails first"
          : "Visible uncontacted leads already have pending drafts (or were already emailed)"
      );
      return;
    }
    if (!jobs?.startDraft) {
      toast.error("Background jobs unavailable — refresh the page");
      return;
    }
    try {
      const job = await jobs.startDraft({ professorIds: ids });
      toast.success(
        job
          ? `Drafting ${job.total} emails — watch the activity card`
          : "Drafting started"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draft generation failed");
    }
  }

  function openSimilar(p: Professor) {
    setSimilarSource(p);
    setSimilarOpen(true);
  }

  async function handleSimilarImported(opts?: {
    professorIds: string[];
    verifiedIds: string[];
  }) {
    await load(q, university, { silent: true });
    const needVerify = (opts?.professorIds || []).filter(
      (id) => !(opts?.verifiedIds || []).includes(id)
    );
    if (needVerify.length && jobs?.startReverify) {
      try {
        await jobs.startReverify({
          all: false,
          professorIds: needVerify,
        });
        toast.message(`Resolving emails for ${needVerify.length} new lead(s)…`);
      } catch {
        /* optional background job */
      }
    }
  }

  async function draftProfessorIds(ids: string[]) {
    if (!ids.length) return;
    if (!jobs?.startDraft) {
      toast.error("Background jobs unavailable — refresh the page");
      return;
    }
    try {
      const job = await jobs.startDraft({ professorIds: ids });
      toast.success(
        job
          ? `Drafting ${job.total} verified matches — watch the activity card`
          : "Drafting started"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Draft failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Faculty Directory
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Your lead list from mining — mix of people you already emailed and
            new ones. Draft only creates emails for{" "}
            <span className="font-medium text-foreground">Verified</span> leads
            you have <span className="font-medium text-foreground">not</span>{" "}
            contact history (progress in the corner while it runs).
          </p>
          {!loading && counts.total > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {counts.total} total · {counts.ready} ready to draft ·{" "}
              {counts.needEmail} need email · {counts.contacted} already emailed
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={recheckEmails}
            disabled={rechecking || loading || !!jobs?.refreshing}
            title="Find/confirm emails for people already in your directory"
          >
            {rechecking || jobs?.refreshing ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" />
            )}
            {rechecking ? "Re-checking emails…" : "Re-check emails"}
          </Button>
          <Button
            variant="outline"
            onClick={draftVerifiedHighFit}
            disabled={drafting || loading || !!jobs?.refreshing}
            title="Write drafts for verified, high-fit leads you have not emailed yet"
          >
            {drafting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Mail data-icon="inline-start" />
            )}
            Draft best matches
          </Button>
          <Button
            variant="outline"
            onClick={draftForVisible}
            disabled={drafting || loading || !!jobs?.refreshing}
            title="Write drafts for verified leads currently on screen (skips already emailed)"
          >
            {drafting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Mail data-icon="inline-start" />
            )}
            Draft visible
          </Button>
          <Button
            onClick={mine}
            disabled={mining || !!jobs?.refreshing}
            title="Find ~20 new faculty matching your profile (keeps running if you leave this page)"
          >
            {mining ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Pickaxe data-icon="inline-start" />
            )}
            {mining ? "Mining leads…" : "Mine 20 fresh leads"}
          </Button>
        </div>
      </div>

      <FieldGroup className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field className="min-w-[220px] flex-1">
          <FieldLabel htmlFor="search">Search</FieldLabel>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              className="pl-9"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
              placeholder="Name, email, focus…"
            />
          </div>
        </Field>
        <Field className="sm:w-56">
          <FieldLabel htmlFor="uni">University</FieldLabel>
          <select
            id="uni"
            value={university}
            onChange={(e) => setUniversity(e.target.value)}
            className="flex h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
          >
            <option value="">All universities</option>
            {universities.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
        <Button variant="outline" onClick={() => load()}>
          Filter
        </Button>
      </FieldGroup>

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : professors.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>No professors found</EmptyTitle>
            <EmptyDescription>
              Click &quot;Mine 20 fresh leads&quot; to find faculty matching your
              profile.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          {professors.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-base">{p.name}</CardTitle>
                  <CardDescription>
                    {p.title ? `${p.title} · ` : ""}
                    {p.university}
                    {p.labName ? ` · ${p.labName}` : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.matchScore != null && (
                    <Badge variant="secondary">Fit {p.matchScore}</Badge>
                  )}
                  {emailBadge(p)}
                  {p.emailConfidence?.tier === "high" && (
                    <Badge variant="outline">High confidence</Badge>
                  )}
                  {p.contacted && <Badge>Already emailed</Badge>}
                  {!p.contacted && readyToDraft(p) && (
                    <Badge variant="outline">Ready to draft</Badge>
                  )}
                  {!p.contacted && (p.drafts?.length || 0) > 0 && (
                    <Badge variant="outline">Draft pending</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
                {p.matchReason && (
                  <div className="sm:col-span-2 text-xs text-muted-foreground">
                    {p.matchReason}
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Email: </span>
                  {p.email || "—"}
                </div>
                <div>
                  <span className="text-muted-foreground">Focus: </span>
                  {p.researchFocus || "—"}
                </div>
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Recent paper: </span>
                  {p.recentPaper || "—"}
                </div>
                <div className="flex flex-wrap gap-1.5 sm:col-span-2">
                  {parseJsonArray(p.tags).map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openSimilar(p)}
                    title="Find ranked similar authors at the same university"
                  >
                    <Sparkles data-icon="inline-start" />
                    Find similar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SimilarProfessorsPanel
        open={similarOpen}
        source={
          similarSource
            ? {
                id: similarSource.id,
                name: similarSource.name,
                university: similarSource.university,
                researchFocus: similarSource.researchFocus,
                recentPaper: similarSource.recentPaper,
              }
            : null
        }
        onClose={() => {
          setSimilarOpen(false);
          setSimilarSource(null);
        }}
        onImported={handleSimilarImported}
        onDraft={draftProfessorIds}
      />
    </div>
  );
}
