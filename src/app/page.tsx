"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GraduationCap,
  Mail,
  Search,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { AcademicWindowSeal } from "@/components/AcademicWindowSeal";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { appHref, isStaticExport, LIVE_APP_URL } from "@/lib/live-app";
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Search,
    title: "Faculty discovery",
    desc: "Mine universities for labs that match your research interests and regions.",
  },
  {
    icon: Mail,
    title: "CV-aware drafts",
    desc: "Emails use your achievements, voice, and each professor’s recent work — not a generic template.",
  },
  {
    icon: ShieldCheck,
    title: "Private workspaces",
    desc: "Each account is isolated. Leads, drafts, and send history never mix between users.",
  },
  {
    icon: Clock,
    title: "Academic-window send",
    desc: "Tue–Thu 8–9 AM local, paced drip, human approval on every message.",
  },
];

export default function LandingPage() {
  const staticDemo = isStaticExport();
  const primaryCtaHref = staticDemo ? `${LIVE_APP_URL}/signup` : appHref("/signup");
  const primaryCtaLabel = staticDemo ? "Open the live app" : "Create free account";

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <BrandLogo height={36} priority />
          {/* Visible app name for Google OAuth brand checks (must match consent screen) */}
          <span className="font-display text-lg font-semibold tracking-tight text-[#1a6fb5]">
            ScholarReach
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={staticDemo ? `${LIVE_APP_URL}/login` : "/login"}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            {...(staticDemo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            Sign in
          </Link>
          <Link
            href={staticDemo ? `${LIVE_APP_URL}/signup` : "/signup"}
            className={cn(buttonVariants({ size: "sm" }))}
            {...(staticDemo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {staticDemo ? "Open the live app" : "Sign up free"}
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-2">
        <div>
          <Badge variant="secondary" className="mb-4">
            Free for everyone right now
          </Badge>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            ScholarReach — research outreach for students
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            ScholarReach helps students discover faculty, draft personalized
            research emails from their own Gmail, and track professor replies —
            privately, per account.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={primaryCtaHref}
              className={cn(buttonVariants({ size: "lg" }))}
              {...(staticDemo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {staticDemo ? "Open the live app" : "Create free workspace"}
              <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="#about-scholarreach"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              About this app
            </Link>
          </div>
        </div>
        <AcademicWindowSeal />
      </section>

      <Separator className="mx-auto max-w-6xl" />

      <section
        id="about-scholarreach"
        className="mx-auto max-w-6xl scroll-mt-24 px-6 py-16"
      >
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          About ScholarReach
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted-foreground">
          <strong className="text-foreground">ScholarReach</strong> is a web
          application for student research outreach. Students create a private
          workspace, upload a CV, set research interests and target regions, and
          use ScholarReach to find faculty matches, draft personalized emails,
          schedule sends during academic hours, and detect replies.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Why ScholarReach uses Google
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                ScholarReach requests Google Sign-In (name + email) so you can
                create or access your account securely. Separately, ScholarReach
                requests Gmail send and read access so outreach emails are sent
                from <em>your</em> address and so the app can detect when a
                professor replies. ScholarReach does not sell your data or send
                mail without your approval workflow.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Data &amp; privacy
              </CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Each ScholarReach account is isolated. Profile content, faculty
                leads, drafts, send history, and Gmail tokens stay with that
                user. See our{" "}
                <Link href="/privacy" className="underline">
                  Privacy
                </Link>{" "}
                and{" "}
                <Link href="/terms" className="underline">
                  Terms
                </Link>{" "}
                for details.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">
          Official home page for the ScholarReach application:{" "}
          <a
            className="font-medium text-foreground underline"
            href="https://scholarreach-ai.vercel.app/"
          >
            https://scholarreach-ai.vercel.app/
          </a>
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Built for the full outreach loop
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <Card key={f.title}>
              <CardHeader>
                <f.icon className="mb-2 size-5 text-primary" />
                <CardTitle className="font-display text-base">{f.title}</CardTitle>
                <CardDescription>{f.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Onboarding that actually feeds the emails
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              title: "CV ingest",
              desc: "Parse education, awards, projects, and skills from PDF or pasted text.",
            },
            {
              title: "Memory interview",
              desc: "Chat prompts help you recall wins the resume understates.",
            },
            {
              title: "Regions + voice",
              desc: "Target regions you care about and set tone before drafting.",
            },
          ].map((s, i) => (
            <Card key={s.title}>
              <CardHeader>
                <Badge variant="outline" className="w-fit">
                  {i + 1}
                </Badge>
                <CardTitle className="font-display text-lg">{s.title}</CardTitle>
                <CardDescription>{s.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Who it’s for
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[
            {
              icon: GraduationCap,
              title: "High school researchers",
              desc: "Early research students building a faculty outreach habit.",
            },
            {
              icon: Zap,
              title: "Undergraduates",
              desc: "RA searches across universities and labs worldwide.",
            },
            {
              icon: CheckCircle2,
              title: "Career offices & clubs",
              desc: "Repeatable outreach without spreadsheet chaos.",
            },
          ].map((a) => (
            <Card key={a.title}>
              <CardHeader>
                <a.icon className="mb-2 size-5 text-primary" />
                <CardTitle className="font-display text-lg">{a.title}</CardTitle>
                <CardDescription>{a.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <Badge className="w-fit">Free</Badge>
            <CardTitle className="font-display text-3xl">
              No paid plans right now
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              ScholarReach is free while we grow. Create an account, connect your
              Gmail, and run the full loop — profile, mining, drafts, queue, and
              reply tracking.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={primaryCtaHref}
              className={cn(buttonVariants({ size: "lg" }))}
              {...(staticDemo
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {primaryCtaLabel}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="font-display font-medium text-foreground">
            ScholarReach
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/#about-scholarreach" className="hover:text-foreground">
              About
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link
              href={staticDemo ? LIVE_APP_URL : "/login"}
              className="hover:text-foreground"
            >
              Live app
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
