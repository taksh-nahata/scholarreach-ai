"use client";

import { useEffect, useState } from "react";
import { Play, Ban, RefreshCw, Zap } from "lucide-react";
import { toast } from "sonner";
import { getDemoBundle } from "@/lib/demo";
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

type QueueItem = {
  id: string;
  professorName: string | null;
  university: string | null;
  toEmail: string;
  subject: string;
  scheduledIso: string;
  scheduledTime: string | null;
  status: string;
  lastError: string | null;
};

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  async function load(status = filter) {
    setLoading(true);
    try {
      const qs = status !== "all" ? `?status=${status}` : "";
      const res = await fetch(`/api/queue${qs}`);
      if (!res.ok) throw new Error("api");
      const data = await res.json();
      setItems(data.items || []);
      setOffline(false);
    } catch {
      const demo = getDemoBundle();
      let list = demo.queue as QueueItem[];
      if (status !== "all") list = list.filter((i) => i.status === status);
      setItems(list);
      setOffline(true);
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
      body: JSON.stringify({ action: "dispatch_batch" }),
    });
    const data = await res.json();
    toast.message(`Batch: ${JSON.stringify(data.results)}`);
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
            Academic window drip · Tue–Thu 8:00–9:00 AM · up to 500/hr
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => load()}>
            <RefreshCw data-icon="inline-start" />
            Refresh
          </Button>
          <Button onClick={dispatchBatch}>
            <Zap data-icon="inline-start" />
            Dispatch Batch Now
          </Button>
        </div>
      </div>

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
            <CardDescription>{items.length} items</CardDescription>
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
                  <TableRow key={item.id}>
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
                      <Badge variant="secondary">{item.status}</Badge>
                      {item.lastError && (
                        <div className="mt-1 max-w-[180px] text-[10px] text-destructive">
                          {item.lastError}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.status === "scheduled" && (
                        <div className="flex flex-col items-start gap-1">
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
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
