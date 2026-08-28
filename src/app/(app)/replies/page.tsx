"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquareReply, RefreshCw, Ban } from "lucide-react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type ReplyItem = {
  id: string;
  toEmail: string;
  professorName: string | null;
  university: string | null;
  subject: string;
  body?: string | null;
  sentAt: string;
  replyDetected: boolean;
  replyAt: string | null;
  replySnippet: string | null;
  replyFrom: string | null;
};

export default function RepliesPage() {
  const [items, setItems] = useState<ReplyItem[]>([]);
  const [replied, setReplied] = useState(0);
  const [awaiting, setAwaiting] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [gmailOk, setGmailOk] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [res, dash] = await Promise.all([
        fetch("/api/replies"),
        fetch("/api/dashboard"),
      ]);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setItems(data.items || []);
      setReplied(data.replied || 0);
      setAwaiting(data.awaiting || 0);
      if (dash.ok) {
        const d = await dash.json();
        const provider = d.user?.mailProvider;
        setGmailOk(!!d.user?.gmailConnected && (!provider || provider === "gmail"));
      }
    } catch {
      toast.error("Could not load outreach history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/replies", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success(
        data.found
          ? `Found ${data.found} new reply${data.found === 1 ? "" : "ies"}`
          : "No new replies yet"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function suppress(email: string) {
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          reason: "Suppressed from Replies",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Won't contact ${email} again`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Suppress failed");
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Replies
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track professor responses. Open a row for the thread view (your
            send + reply snippet).
          </p>
        </div>
        <Button onClick={syncNow} disabled={syncing || !gmailOk}>
          <RefreshCw
            data-icon="inline-start"
            className={syncing ? "animate-spin" : undefined}
          />
          {syncing ? "Scanning…" : "Scan Gmail for replies"}
        </Button>
      </div>

      {!gmailOk && (
        <Alert>
          <AlertTitle>Gmail required for reply sync</AlertTitle>
          <AlertDescription>
            Reply detection only works with a connected Gmail inbox (send +
            read).{" "}
            <Link href="/connect-inbox" className="underline underline-offset-2">
              Connect Inbox
            </Link>
            . Outlook/SMTP sends won&apos;t appear in sync yet.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Replies detected</CardDescription>
            <CardTitle className="font-display text-3xl">{replied}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Awaiting response</CardDescription>
            <CardTitle className="font-display text-3xl">{awaiting}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Outreach history</CardTitle>
          <CardDescription>
            Click a row to expand the thread. Suppress stops all future sends.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageSquareReply />
                </EmptyMedia>
                <EmptyTitle>No sent outreach yet</EmptyTitle>
                <EmptyDescription>
                  Approve drafts and let the queue send. Then scan here for
                  replies.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Professor</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Snippet</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer"
                      onClick={() =>
                        setExpanded((id) => (id === row.id ? null : row.id))
                      }
                    >
                      <TableCell>
                        <div className="font-medium">
                          {row.professorName || row.toEmail}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.university || row.toEmail}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate text-sm">
                        {row.subject}
                      </TableCell>
                      <TableCell>
                        {row.replyDetected ? (
                          <Badge variant="secondary">Replied</Badge>
                        ) : (
                          <Badge variant="outline">Awaiting</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                        {row.replySnippet || "—"}
                      </TableCell>
                    </TableRow>
                    {expanded === row.id && (
                      <TableRow>
                        <TableCell colSpan={4} className="bg-muted/40">
                          <div className="space-y-3 p-2 text-sm">
                            <div>
                              <div className="text-xs font-medium text-muted-foreground">
                                You sent · {new Date(row.sentAt).toLocaleString()}
                              </div>
                              <p className="mt-1 whitespace-pre-wrap">
                                {(row.body || "(body not stored)").slice(0, 1200)}
                              </p>
                            </div>
                            {row.replyDetected && (
                              <div>
                                <div className="text-xs font-medium text-muted-foreground">
                                  Reply from {row.replyFrom || "professor"}
                                  {row.replyAt
                                    ? ` · ${new Date(row.replyAt).toLocaleString()}`
                                    : ""}
                                </div>
                                <p className="mt-1 whitespace-pre-wrap">
                                  {row.replySnippet || "—"}
                                </p>
                              </div>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void suppress(row.toEmail);
                              }}
                            >
                              <Ban data-icon="inline-start" />
                              Don&apos;t contact again
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
