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
    desc: "Mine universities for labs in AI, robotics, CV, ML, and computational biology.",
  },
  {
    icon: Mail,
    title: "CV-aware drafts",
    desc: "Emails use your achievements, voice, and each professor’s recent work — not a generic template.",
  },
  {
    icon: ShieldCheck,
    title: "Private workspaces",
    desc: "Your leads, drafts, and send history stay isolated. Public demos never include your data.",
  },
  {
    icon: Clock,
    title: "Academic-window send",
    desc: "Tue–Thu 8–9 AM local, 500/hr drip, human approval on every message.",
  },
];

const pricing = [
  {
    name: "Student",
    price: "$0",
    note: "Forever",
    features: [
      "Private workspace + onboarding",
      "CV upload & achievement interview",
      "Region targeting",
      "Personalized drafts",
    ],
    cta: true,
  },
  {
    name: "Clubs & offices",
    price: "$0",
    note: "Hobby stack",
    features: [
      "Same free hosting tier",
      "Human approval workflow",
      "Queue + contact history",
      "No seat fees",
    ],
    cta: false,
  },
];

export default function LandingPage() {
  const staticDemo = isStaticExport();
  const primaryCtaHref = staticDemo ? LIVE_APP_URL : appHref("/login");
  const primaryCtaLabel = staticDemo ? "Open the live app" : "Start free";

  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            SR
          </span>
          <span className="font-display text-lg">ScholarReach</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={staticDemo ? `${LIVE_APP_URL}/dashboard` : "/dashboard"}
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Product
          </Link>
          <Link
            href={primaryCtaHref}
            className={cn(buttonVariants({ size: "sm" }))}
            {...(staticDemo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {primaryCtaLabel}
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-2">
        <div>
          <Badge variant="secondary" className="mb-4">
            Free student research outreach
          </Badge>
          <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            Email professors like you already know your own story.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            Upload a CV, answer a short interview, pick regions, and ScholarReach
            drafts messages that sound like you — personalized to each lab.
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
              href="/directory"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Browse sample directory
            </Link>
          </div>
        </div>
        <AcademicWindowSeal />
      </section>

      <Separator className="mx-auto max-w-6xl" />

      <section className="mx-auto max-w-6xl px-6 py-16">
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
              desc: "Target US West, Europe, remote-first, and set tone before drafting.",
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
              desc: "Dual-enrollment and early research students.",
            },
            {
              icon: Zap,
              title: "Undergraduates",
              desc: "RA searches across R1 and international labs.",
            },
            {
              icon: CheckCircle2,
              title: "Career offices",
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
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Pricing
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {pricing.map((tier) => (
            <Card key={tier.name}>
              <CardHeader>
                <Badge variant={tier.cta ? "default" : "secondary"} className="w-fit">
                  {tier.note}
                </Badge>
                <CardTitle className="font-display text-2xl">{tier.name}</CardTitle>
                <div className="font-display text-4xl font-semibold">{tier.price}</div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {tier.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                {tier.cta && (
                  <Link
                    href={primaryCtaHref}
                    className={cn(buttonVariants({ size: "lg" }))}
                    {...(staticDemo
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {primaryCtaLabel}
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="font-display font-medium text-foreground">ScholarReach</div>
          <div className="flex flex-wrap gap-4">
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
