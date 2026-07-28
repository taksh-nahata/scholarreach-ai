"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Pickaxe, Mail } from "lucide-react";
import { toast } from "sonner";
import { parseJsonArray } from "@/lib/utils";
import { getDemoBundle } from "@/lib/demo";
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

type Professor = {
  id: string;
  name: string;
  email: string | null;
  university: string;
  researchFocus: string | null;
  recentPaper: string | null;
  labName: string | null;
  tags: string | null;
  emailVerified: boolean;
  drafts?: Array<{ id: string }>;
};

export default function DirectoryPage() {
  const [professors, setProfessors] = useState<Professor[]>([]);
  const [q, setQ] = useState("");
  const [university, setUniversity] = useState("");
  const [loading, setLoading] = useState(true);
  const [mining, setMining] = useState(false);
  const [drafting, setDrafting] = useState(false);

  async function load(nextQ = q, nextUniversity = university) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (nextQ) params.set("q", nextQ);
      if (nextUniversity) params.set("university", nextUniversity);
      const res = await fetch(`/api/directory?${params}`);
      if (!res.ok) throw new Error("api unavailable");
      const data = await res.json();
      setProfessors(data.professors || []);
    } catch {
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
      toast.message("Showing demo directory (static / offline mode)");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const universities = useMemo(
    () => Array.from(new Set(professors.map((p) => p.university))).sort(),
    [professors]
  );

  async function mine() {
    setMining(true);
    try {
      const res = await fetch("/api/directory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 20 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Mining failed");
      toast.success(`Mined ${data.mined} fresh leads`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mining unavailable offline");
    } finally {
      setMining(false);
    }
  }

  async function draftForVisible() {
    const ids = professors
      .filter((p) => !p.drafts?.length)
      .slice(0, 10)
      .map((p) => p.id);
    if (!ids.length) {
      toast.message("Visible leads already have pending drafts");
      return;
    }
    setDrafting(true);
    try {
      const res = await fetch("/api/drafts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorIds: ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Draft generation failed");
      toast.success(`Created ${data.count || 0} personalized drafts`);
      await load();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Draft generation failed"
      );
    } finally {
      setDrafting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Faculty Directory
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Search leads, then generate drafts using your onboarding profile
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={draftForVisible}
            disabled={drafting || loading}
          >
            {drafting ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Mail data-icon="inline-start" />
            )}
            Draft emails (profile-aware)
          </Button>
          <Button onClick={mine} disabled={mining}>
            {mining ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Pickaxe data-icon="inline-start" />
            )}
            Mine 20 Fresh Leads
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
              Try another filter or mine fresh leads when APIs are configured.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">{professors.length} professors</p>
          {professors.map((p) => (
            <Card key={p.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-base">{p.name}</CardTitle>
                  <CardDescription>
                    {p.university}
                    {p.labName ? ` · ${p.labName}` : ""}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.emailVerified && <Badge variant="secondary">Verified</Badge>}
                  {(p.drafts?.length || 0) > 0 && (
                    <Badge variant="outline">Pre-draft ready</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-2 sm:grid-cols-2">
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
