"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Users, Clock, Send, Inbox, ArrowRight } from "lucide-react";
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

type DashData = ReturnType<typeof getDemoBundle>;

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [name, setName] = useState("there");
  const [email, setEmail] = useState("student@university.edu");
  const [gmailConnected, setGmailConnected] = useState(false);

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
        if (!res.ok) throw new Error("api");
        const json = await res.json();
        setData({
          generatedAt: new Date().toISOString(),
          user: json.user,
          metrics: {
            totalLeads: json.metrics.totalLeads,
            pendingApprovals: json.metrics.pendingApprovals,
            scheduledSends: json.metrics.scheduledSends,
            emailsDelivered: json.metrics.emailsDelivered,
          },
          professors: [],
          drafts: [],
          queue: [],
        });
        if (!session) {
          setName(json.user?.name || "there");
          setEmail(json.user?.email || email);
          setGmailConnected(!!json.user?.gmailConnected);
        }
      } catch {
        setData(getDemoBundle());
      }
    }
    load();
  }, [email]);

  const metrics = data?.metrics || {
    totalLeads: 0,
    pendingApprovals: 0,
    scheduledSends: 0,
    emailsDelivered: 0,
  };
  const queue = data?.queue || [];

  const cards = [
    {
      label: "Total Leads Mined",
      value: metrics.totalLeads,
      icon: Users,
      href: "/directory",
    },
    {
      label: "Pending Approvals",
      value: metrics.pendingApprovals,
      icon: Inbox,
      href: "/approvals",
    },
    {
      label: "Scheduled Sends",
      value: metrics.scheduledSends,
      icon: Clock,
      href: "/queue",
    },
    {
      label: "Emails Delivered",
      value: metrics.emailsDelivered,
      icon: Send,
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
            Welcome back, {name}
          </p>
        </div>
        <Badge variant={gmailConnected ? "secondary" : "outline"}>
          {gmailConnected ? `Gmail · ${email}` : `Workspace · ${email}`}
        </Badge>
      </div>

      {!gmailConnected && (
        <Alert>
          <AlertTitle>Connect Gmail to unlock sending</AlertTitle>
          <AlertDescription>
            You can mine leads and approve drafts now. Connect Gmail from Account
            when you&apos;re ready for academic-window dispatch.{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Connect inbox
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="transition hover:ring-primary/30">
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
            <CardTitle className="font-display">Recent queue activity</CardTitle>
            <CardDescription>
              Latest scheduled and delivered outreach
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-0">
            {queue.slice(0, 6).map((item, idx) => (
              <div key={item.id}>
                {idx > 0 && <Separator className="my-3" />}
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">
                      {item.professorName || item.toEmail}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.university} ·{" "}
                      {item.scheduledTime || item.scheduledIso}
                    </div>
                  </div>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
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
              className={cn(buttonVariants({ variant: "outline" }), "justify-start")}
            >
              Review pending drafts ({metrics.pendingApprovals})
            </Link>
            <Link href="/queue" className={cn(buttonVariants(), "justify-start")}>
              Open outreach queue
            </Link>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "ghost" }), "justify-start")}
            >
              {gmailConnected ? "Manage account" : "Connect Gmail"}
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
