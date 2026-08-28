"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  ChevronRight,
  Loader2,
  Mail,
  Sparkles,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SourceProfessor = {
  id: string;
  name: string;
  university: string;
  researchFocus: string | null;
  recentPaper: string | null;
};

export type NearbySuggestion = {
  openAlexId?: string;
  name: string;
  university: string;
  researchFocus: string | null;
  recentPaper: string | null;
  tags: string[];
  worksCount: number;
  homepageUrl: string | null;
  rank: number;
  rankReasons: string[];
  emailConfidence: {
    tier: "high" | "medium" | "low";
    score: number;
    reason: string;
  };
};

type SimilarProfessorsPanelProps = {
  open: boolean;
  source: SourceProfessor | null;
  onClose: () => void;
  onImported: (opts?: { professorIds: string[]; verifiedIds: string[] }) => void;
  onDraft?: (professorIds: string[]) => void;
};

function rankBarColor(rank: number) {
  if (rank >= 75) return "bg-emerald-500";
  if (rank >= 55) return "bg-primary";
  return "bg-amber-500";
}

function confidenceBadge(tier: NearbySuggestion["emailConfidence"]["tier"]) {
  if (tier === "high") {
    return <Badge variant="secondary">Likely reachable</Badge>;
  }
  if (tier === "medium") {
    return <Badge variant="outline">Needs verify</Badge>;
  }
  return <Badge variant="destructive">Email unknown</Badge>;
}

export function SimilarProfessorsPanel({
  open,
  source,
  onClose,
  onImported,
  onDraft,
}: SimilarProfessorsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [suggestions, setSuggestions] = useState<NearbySuggestion[]>([]);
  const [topic, setTopic] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const fetchSimilar = useCallback(async (prof: SourceProfessor) => {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    setSelected(new Set());
    try {
      const res = await fetch("/api/directory/nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professorId: prof.id, limit: 10 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not find similar professors");
      }
      const list = (data.suggestions || []) as NearbySuggestion[];
      setSuggestions(list);
      setTopic(data.topic || prof.researchFocus || prof.recentPaper || "");
      const preselect = new Set<number>();
      list.slice(0, 5).forEach((_, i) => preselect.add(i));
      setSelected(preselect);
      if (!list.length) {
        setError("No new authors at this university matched that topic.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && source) void fetchSimilar(source);
  }, [open, source, fetchSimilar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selectedList = useMemo(
    () => [...selected].sort((a, b) => a - b).map((i) => suggestions[i]),
    [selected, suggestions]
  );

  function toggleIndex(i: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function selectTop(n: number) {
    const next = new Set<number>();
    suggestions.slice(0, n).forEach((_, i) => next.add(i));
    setSelected(next);
  }

  async function importSelected(opts?: { draftVerified?: boolean }) {
    if (!selectedList.length) {
      toast.message("Select at least one professor to add");
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/directory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates: selectedList.map((s) => ({
            name: s.name,
            university: s.university,
            researchFocus: s.researchFocus,
            recentPaper: s.recentPaper,
            tags: s.tags,
            homepageUrl: s.homepageUrl,
            worksCount: s.worksCount,
            rank: s.rank,
            fitNote: `Similar to ${source?.name || "source"} · rank=${s.rank}`,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Import failed");
      }

      const imported = (data.imported || []) as Array<{
        id: string;
        name: string;
        emailVerified: boolean;
      }>;
      const skipped = (data.skipped || []) as Array<{ name: string; reason: string }>;
      const verifiedIds = (data.verifiedIds || []) as string[];

      if (imported.length) {
        toast.success(
          `Added ${imported.length} professor${imported.length === 1 ? "" : "s"} to your directory`
        );
      }
      if (skipped.length) {
        toast.message(
          `${skipped.length} skipped (${skipped.slice(0, 2).map((s) => s.reason).join(", ")}${skipped.length > 2 ? "…" : ""})`
        );
      }

      onImported({
        professorIds: imported.map((p) => p.id),
        verifiedIds,
      });

      if (opts?.draftVerified && verifiedIds.length && onDraft) {
        onDraft(verifiedIds.slice(0, 8));
      }

      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <AnimatePresence>
      {open && source && (
        <>
          <motion.button
            type="button"
            aria-label="Close similar professors panel"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-labelledby="similar-panel-title"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-primary">
                  <Sparkles className="size-4 shrink-0" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Similar professors
                  </span>
                </div>
                <h2
                  id="similar-panel-title"
                  className="font-display mt-1 truncate text-lg font-semibold"
                >
                  Near {source.name}
                </h2>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {source.university}
                  {topic ? ` · topic: ${topic}` : ""}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={onClose}>
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
              <Button
                variant="outline"
                size="sm"
                disabled={loading || !suggestions.length}
                onClick={() => selectTop(5)}
              >
                Select top 5
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || !suggestions.length}
                onClick={() => setSelected(new Set(suggestions.map((_, i) => i)))}
              >
                Select all
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                {selected.size} selected
              </span>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-3 p-5">
                {loading ? (
                  <>
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                    <Skeleton className="h-28 w-full" />
                  </>
                ) : error ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
                    {error}
                  </div>
                ) : (
                  suggestions.map((s, i) => {
                    const picked = selected.has(i);
                    return (
                      <button
                        key={`${s.openAlexId || s.name}-${i}`}
                        type="button"
                        onClick={() => toggleIndex(i)}
                        className={cn(
                          "w-full rounded-xl border p-4 text-left transition-colors",
                          picked
                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                            : "border-border bg-background hover:bg-accent/40"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                              picked
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input bg-background"
                            )}
                          >
                            {picked && <Check className="size-3" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{s.name}</span>
                              <Badge variant="secondary">Rank {s.rank}</Badge>
                              {confidenceBadge(s.emailConfidence.tier)}
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  rankBarColor(s.rank)
                                )}
                                style={{ width: `${Math.min(100, s.rank)}%` }}
                              />
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              {s.researchFocus || "Research focus unknown"}
                            </p>
                            {s.recentPaper && (
                              <p className="mt-1 line-clamp-2 text-xs">
                                <span className="text-muted-foreground">
                                  Paper:{" "}
                                </span>
                                {s.recentPaper}
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {s.tags.slice(0, 4).map((t) => (
                                <Badge key={t} variant="outline" className="text-[10px]">
                                  {t}
                                </Badge>
                              ))}
                              {s.worksCount > 0 && (
                                <Badge variant="outline" className="text-[10px]">
                                  {s.worksCount} works
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-40" />
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="flex flex-col gap-2 border-t border-border bg-muted/30 p-5">
              <Button
                disabled={importing || loading || !selectedList.length}
                onClick={() => importSelected()}
              >
                {importing ? (
                  <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
                ) : (
                  <UserPlus data-icon="inline-start" />
                )}
                Add {selectedList.length || ""} to pipeline
              </Button>
              <Button
                variant="outline"
                disabled={importing || loading || !selectedList.length || !onDraft}
                onClick={() => importSelected({ draftVerified: true })}
              >
                <Mail data-icon="inline-start" />
                Add & draft verified
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                Imports resolve emails from faculty pages — unverified leads can
                be re-checked from Directory.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
