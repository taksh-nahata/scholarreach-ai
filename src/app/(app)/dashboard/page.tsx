import Link from "next/link";
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
import { cn } from "@/lib/utils";
import { getDemoBundle } from "@/lib/demo";

export const dynamic = "force-static";

async function loadMetrics() {
  if (process.env.STATIC_EXPORT === "true") {
    return getDemoBundle();
  }
  try {
    const { requireUser } = await import("@/lib/session");
    const { prisma } = await import("@/lib/prisma");
    const user = await requireUser();
    const [professors, draftsPending, scheduled, sent, recentScheduled] =
      await Promise.all([
        prisma.professor.count({ where: { userId: user.id } }),
        prisma.draft.count({
          where: {
            userId: user.id,
            status: { in: ["pending", "pending_review"] },
          },
        }),
        prisma.scheduledEmail.count({
          where: { userId: user.id, status: "scheduled" },
        }),
        prisma.scheduledEmail.count({
          where: { userId: user.id, status: "sent" },
        }),
        prisma.scheduledEmail.findMany({
          where: { userId: user.id },
          orderBy: { updatedAt: "desc" },
          take: 6,
        }),
      ]);
    return {
      user: {
        email: user.email,
        name: user.name,
        gmailConnected: user.gmailConnected,
      },
      metrics: {
        totalLeads: professors,
        pendingApprovals: draftsPending,
        scheduledSends: scheduled,
        emailsDelivered: sent,
      },
      queue: recentScheduled.map((item) => ({
        id: item.id,
        professorName: item.professorName,
        university: item.university,
        scheduledTime: item.scheduledTime,
        scheduledIso: item.scheduledIso.toISOString(),
        status: item.status,
        toEmail: item.toEmail,
        subject: item.subject,
        lastError: item.lastError,
      })),
    };
  } catch {
    return getDemoBundle();
  }
}

export default async function DashboardPage() {
  const data = await loadMetrics();
  const { metrics, user, queue } = data;

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
            Welcome back, {user.name || user.email}
          </p>
        </div>
        <Badge variant={user.gmailConnected ? "secondary" : "outline"}>
          {user.gmailConnected
            ? `Connected · ${user.email}`
            : `Inbox · ${user.email}`}
        </Badge>
      </div>

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
            {(queue || []).slice(0, 6).map((item, idx) => (
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
              Mine fresh faculty leads
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
              Connect Gmail OAuth
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
