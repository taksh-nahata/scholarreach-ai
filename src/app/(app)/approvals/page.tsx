"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { getDemoBundle } from "@/lib/demo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Draft = {
  id: string;
  subject: string;
  body: string;
  recipientEmail: string | null;
  ccEmails: string | null;
  specialNotes?: string | null;
  matchScore?: number | null;
  reviewStatus?: string | null;
  reviewNotes?: string | null;
  professor: {
    name: string;
    university: string;
    researchFocus: string | null;
    recentPaper: string | null;
    email: string | null;
    specialInstructions: string | null;
    matchScore?: number | null;
    matchReason?: string | null;
  } | null;
};

export default function ApprovalsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ccMap, setCcMap] = useState<Record<string, string>>({});
  const [offline, setOffline] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals?status=pending");
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      setDrafts(data.drafts || []);
      const initial: Record<string, string> = {};
      for (const d of data.drafts || []) initial[d.id] = d.ccEmails || "";
      setCcMap(initial);
      setOffline(false);
    } catch {
      const demo = getDemoBundle();
      setDrafts(demo.drafts as Draft[]);
      const initial: Record<string, string> = {};
      for (const d of demo.drafts) initial[d.id] = d.ccEmails || "";
      setCcMap(initial);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function act(
    draftId: string,
    action: "approve" | "reject" | "agent_review"
  ) {
    setBusyId(draftId);
    const started = performance.now();
    try {
      if (offline) {
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
        toast.success(
          action === "approve"
            ? `Demo approved in ${Math.round(performance.now() - started)}ms`
            : `Demo ${action} in ${Math.round(performance.now() - started)}ms`
        );
        return;
      }
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId,
          action,
          ccEmails: ccMap[draftId] || "",
          autoSchedule: action === "agent_review",
        }),
      });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - started);
      if (!res.ok) throw new Error(data.error || "Action failed");
      if (action === "agent_review" && !data.scheduledTime) {
        toast.message(
          data.verdict?.approve
            ? `Agent liked it (${data.verdict.score}) — still pending schedule`
            : `Agent held it: ${data.verdict?.notes || "needs edits"}`
        );
        await load();
        return;
      }
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
      toast.success(
        action === "reject"
          ? `Rejected in ${elapsed}ms`
          : `Queued in ${elapsed}ms · ${data.scheduledTime || "ok"}`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Draft Approvals
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review profile-matched drafts. Use Agent review to simulate your
          approval bar, or enable auto-approve in Settings after you trust the
          voice.
        </p>
      </div>

          {offline && (
        <Alert>
          <AlertTitle>Sample workspace data</AlertTitle>
          <AlertDescription>
            You&apos;re viewing commercial sample drafts for the public demo.
            Approvals update locally in this browser session.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-64 w-full" />
        </div>
      ) : drafts.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Check />
            </EmptyMedia>
            <EmptyTitle>No pending drafts</EmptyTitle>
            <EmptyDescription>
              Inbox zero — generate or mine new outreach drafts to review.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {drafts.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="font-display text-base">
                      {d.professor?.name || "Professor"} ·{" "}
                      {d.professor?.university || ""}
                    </CardTitle>
                    <CardDescription>
                      {d.professor?.researchFocus || "Research focus n/a"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="outline">
                      To: {d.recipientEmail || d.professor?.email || "—"}
                    </Badge>
                    {(d.matchScore != null || d.professor?.matchScore != null) && (
                      <Badge variant="secondary">
                        Fit {d.matchScore ?? d.professor?.matchScore}/100
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {d.reviewNotes && (
                  <Alert>
                    <AlertTitle>Reviewer notes</AlertTitle>
                    <AlertDescription>{d.reviewNotes}</AlertDescription>
                  </Alert>
                )}
                {d.professor?.matchReason && (
                  <p className="text-xs text-muted-foreground">
                    Why this professor: {d.professor.matchReason}
                  </p>
                )}
                {d.professor?.recentPaper && (
                  <Alert>
                    <AlertTitle>Publication</AlertTitle>
                    <AlertDescription>{d.professor.recentPaper}</AlertDescription>
                  </Alert>
                )}
                {(d.professor?.specialInstructions || d.specialNotes) && (
                  <p className="text-xs text-primary">
                    Special instructions:{" "}
                    {d.professor?.specialInstructions || d.specialNotes}
                  </p>
                )}
                <div>
                  <p className="mb-2 text-sm font-medium">{d.subject}</p>
                  <Textarea
                    readOnly
                    value={d.body}
                    className="min-h-40 font-mono text-xs"
                  />
                </div>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor={`cc-${d.id}`}>CC Email(s)</FieldLabel>
                    <Input
                      id={`cc-${d.id}`}
                      value={ccMap[d.id] || ""}
                      onChange={(e) =>
                        setCcMap((m) => ({ ...m, [d.id]: e.target.value }))
                      }
                      placeholder="assistant@university.edu"
                    />
                  </Field>
                </FieldGroup>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-2 border-t">
                <Button
                  onClick={() => act(d.id, "approve")}
                  disabled={busyId === d.id}
                >
                  {busyId === d.id ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Check data-icon="inline-start" />
                  )}
                  Approve Instantly
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => act(d.id, "agent_review")}
                  disabled={busyId === d.id}
                >
                  Agent review
                </Button>
                <Button
                  variant="outline"
                  onClick={() => act(d.id, "reject")}
                  disabled={busyId === d.id}
                >
                  <X data-icon="inline-start" />
                  Reject
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
