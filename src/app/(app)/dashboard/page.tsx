"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, Clock, Send, Inbox, ArrowRight, History } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { getDemoBundle } from "@/lib/demo";
import { getDemoSession } from "@/lib/demo-auth";
import { allowDemoFallback } from "@/lib/live-mode";
import { toast } from "sonner";

type QueueItem = {
  id: string;
  professorName?: string | null;
  university?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  scheduledIso?: string | null;
  scheduledTime?: string | null;
  status: string;
};

type DashData = {
  metrics: {
    totalLeads: number;
    pendingApprovals: number;
    scheduledSends: number;
    emailsDelivered: number;
    contacted?: number;
  };
  queue: QueueItem[];
};

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [name, setName] = useState("there");
  const [email, setEmail] = useState("");
  const [gmailConnected, setGmailConnected] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    const session = getDemoSession();
    if (session) {
      setName(session.name || "there");
      setEmail(session.email);
      setGmailConnected(session.gmailConnected);
    }

    async function load() {
      try {
        const res = await fetch("/api/dashboard");
        if (res.status === 401 || res.status === 500) {
          const text = await res.text();
          if (/Unauthorized/i.test(text) || res.status === 401) {
            setUnauthorized(true);
            return;
          }
        }
        if (!res.ok) throw new Error("api");
        const json = await res.json();
        setData({
          metrics: {
            totalLeads: json.metrics.totalLeads,
            pendingApprovals: json.metrics.pendingApprovals,
            scheduledSends: json.metrics.scheduledSends,
            emailsDelivered: json.metrics.emailsDelivered,
            contacted: json.metrics.contacted,
          },
          queue: json.queue || [],
        });
        if (!session) {
          setName(json.user?.name || "there");
          setEmail(json.user?.email || "");
          setGmailConnected(!!json.user?.gmailConnected);
        }
      } catch {
        if (allowDemoFallback()) {
          const demo = getDemoBundle();
          setData({
            metrics: demo.metrics,
            queue: demo.queue as QueueItem[],
          });
        } else {
          setData({
            metrics: {
              totalLeads: 0,
              pendingApprovals: 0,
              scheduledSends: 0,
              emailsDelivered: 0,
              contacted: 0,
            },
            queue: [],
          });
          toast.error("Could not load dashboard");
        }
      }
    }
    load();
  }, []);

  if (unauthorized) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert>
          <AlertTitle>Sign in required</AlertTitle>
          <AlertDescription>
            Your outreach data is private.{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Open your workspace
            </Link>{" "}
            to continue.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const metrics = data?.metrics || {
    totalLeads: 0,
    pendingApprovals: 0,
    scheduledSends: 0,
    emailsDelivered: 0,
    contacted: 0,
  };
  const queue = data?.queue || [];

  const cards = [
    {
      label: "Faculty leads",
      value: metrics.totalLeads,
      icon: Users,
      href: "/directory",
    },
    {
      label: "Pending approvals",
      value: metrics.pendingApprovals,
      icon: Inbox,
      href: "/approvals",
    },
    {
      label: "Scheduled sends",
      value: metrics.scheduledSends,
      icon: Clock,
      href: "/queue",
    },
    {
      label: "Emails delivered",
      value: metrics.emailsDelivered,
      icon: Send,
      href: "/queue",
    },
    {
      label: "Contact history",
      value: metrics.contacted || 0,
      icon: History,
      href: "/queue",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome back{name ? `, ${name}` : ""}
          </p>
        </div>
        <Badge variant={gmailConnected ? "secondary" : "outline"}>
          {gmailConnected
            ? `Gmail · ${email}`
            : email
              ? `Workspace · ${email}`
              : "Private workspace"}
        </Badge>
      </div>

      {!gmailConnected && (
        <Alert>
          <AlertTitle>Connect Gmail to send live</AlertTitle>
          <AlertDescription>
            Mining and approvals work now. Emails send from your Gmail on the
            scheduled times (Tue–Thu 8–9 AM in the professor&apos;s timezone)
            once inbox is connected.{" "}
            <Link
              href="/connect-inbox"
              className="text-primary underline-offset-4 hover:underline"
            >
              Connect inbox
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="h-full transition hover:ring-primary/30">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardDescription>{label}</CardDescription>
                <Icon className="size-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">
                  {value}
                </div>
                <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                  View <ArrowRight className="size-3" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display">Your outreach queue</CardTitle>
          <CardDescription>
              Active and upcoming sends (cancelled items stay in the full queue)
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-0">
            {queue.slice(0, 8).map((item, idx) => (
              <div key={item.id}>
                {idx > 0 && <Separator className="my-3" />}
                <Link
                  href={`/queue?open=${encodeURIComponent(item.id)}`}
                  className="flex items-center justify-between gap-3 rounded-lg outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {item.professorName || item.toEmail || item.subject}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.university || "—"} ·{" "}
                      {item.scheduledTime || item.scheduledIso || "unscheduled"}
                    </div>
                    {item.subject ? (
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.subject}
                      </div>
                    ) : null}
                  </div>
                  <Badge variant="secondary">{item.status}</Badge>
                </Link>
              </div>
            ))}
            {queue.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No queue items yet — approve a draft to schedule your first send.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link
              href="/directory"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              Explore faculty directory
            </Link>
            <Link
              href="/approvals"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "justify-start"
              )}
            >
              Review pending drafts ({metrics.pendingApprovals})
            </Link>
            <Link href="/queue" className={cn(buttonVariants(), "justify-start")}>
              Open full outreach queue
            </Link>
            <Link
              href="/replies"
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              Track professor replies
            </Link>
            <Link
              href="/connect-inbox"
              className={cn(buttonVariants({ variant: "ghost" }), "justify-start")}
            >
              {gmailConnected ? "Manage inbox" : "Connect inbox"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
