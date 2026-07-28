"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  GraduationCap,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
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
    title: "Faculty discovery at scale",
    desc: "Mine R1 and top global universities for professors in AI, robotics, CV, ML, and computational biology.",
  },
  {
    icon: Mail,
    title: "Publication-aware drafts",
    desc: "Every cold email references a real recent paper so outreach feels researched — not templated spam.",
  },
  {
    icon: ShieldCheck,
    title: "Verified contact emails",
    desc: "Live scraping + LLM reasoning unscrambles obfuscated addresses and captures assistant CC requests.",
  },
  {
    icon: Clock,
    title: "Academic-window dispatch",
    desc: "Send only Tue–Thu 8–9 AM local with 500/hr drip physics and automatic multi-day rollover.",
  },
];

const steps = [
  {
    title: "Connect your student inbox",
    desc: "One-click Google OAuth with gmail.send — no Apps Script, no app passwords.",
  },
  {
    title: "Mine & verify faculty leads",
    desc: "Discover labs, extract emails, and dedupe by name + university so you never double-message.",
  },
  {
    title: "Approve personalized drafts",
    desc: "Review AI-written research inquiries, add CCs, and queue instantly for the next academic window.",
  },
];

const audiences = [
  {
    icon: GraduationCap,
    title: "High school researchers",
    desc: "Dual-enrollment and early research students looking for remote lab mentorship.",
  },
  {
    icon: Zap,
    title: "Undergraduates",
    desc: "College students hunting Fall/Spring RA roles across R1 and international labs.",
  },
  {
    icon: CheckCircle2,
    title: "Career offices & clubs",
    desc: "Teams that want a repeatable outreach system without spreadsheet chaos.",
  },
];

const faqs = [
  {
    q: "Is ScholarReach really free for students?",
    a: "Yes — free forever on the student Hobby stack (Vercel + Neon). No credit card. Optional mining APIs are paid by the operator, never billed to you.",
  },
  {
    q: "Is my outreach data private?",
    a: "Yes. Faculty leads, drafts, scheduled sends, and contact history stay inside your workspace. The public GitHub Pages demo uses synthetic sample data only.",
  },
  {
    q: "Will professors know it’s automated?",
    a: "Drafts are personalized from recent publications and stay human-reviewed before send. You approve every message.",
  },
  {
    q: "Why only 8–9 AM Tue–Thu?",
    a: "That’s when faculty typically open email. Sending in that window improves reply odds and protects your sender reputation.",
  },
  {
    q: "Do you store my Gmail password?",
    a: "Never. Production sending uses official Google OAuth tokens with gmail.send scope only.",
  },
];

const pricing = [
  {
    name: "Student",
    price: "$0",
    note: "Forever",
    features: [
      "Private workspace",
      "Faculty directory & approvals",
      "Academic-window drip queue",
      "Gmail OAuth when you’re ready",
    ],
    cta: true,
  },
  {
    name: "Labs & clubs",
    price: "$0",
    note: "Same free stack",
    features: [
      "Shared workflow for career offices",
      "Human approval on every send",
      "500/hr drip physics",
      "No seat fees on Hobby",
    ],
    cta: false,
  },
];

export default function LandingPage() {
  const reduce = useReducedMotion();
  const staticDemo = isStaticExport();
  const primaryCtaHref = staticDemo ? LIVE_APP_URL : appHref("/login");
  const primaryCtaLabel = staticDemo ? "Open the live app" : "Get Started Free";

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 desk-grid opacity-50" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <span className="wax-seal flex size-9 items-center justify-center rounded-xl text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="font-display text-lg">
            ScholarReach <span className="text-primary">AI</span>
          </span>
        </div>
        <div className="flex items-center gap-3">
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

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-2 lg:pt-16">
        <div>
          <Badge variant="secondary" className="mb-5">
            Free student SaaS · Research outreach infrastructure
          </Badge>
          <motion.h1
            className="font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]"
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            Land university research positions on autopilot.
          </motion.h1>
          <motion.p
            className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg"
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08 }}
          >
            ScholarReach helps students discover faculty, write publication-aware
            inquiry emails, verify contacts with AI, and dispatch through Gmail
            during the morning academic window — with human approval on every send.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
          >
            <Link
              href={primaryCtaHref}
              className={cn(buttonVariants({ size: "lg" }))}
              {...(staticDemo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {staticDemo ? "Open the live app" : "Start free workspace"}
              <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="/directory"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Browse sample directory
            </Link>
          </motion.div>
          <div className="mt-8 flex flex-wrap gap-6 text-sm text-muted-foreground">
            <div>
              <div className="font-display text-2xl text-foreground">500/hr</div>
              drip capacity
            </div>
            <div>
              <div className="font-display text-2xl text-foreground">Tue–Thu</div>
              academic send window
            </div>
            <div>
              <div className="font-display text-2xl text-foreground">$0</div>
              student tier
            </div>
          </div>
        </div>

        <AcademicWindowSeal />
      </section>

      <Separator className="mx-auto max-w-6xl" />

      <section className="relative z-10 mx-auto max-w-6xl px-6 py-16">
        <div className="mb-8 max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Built as outreach infrastructure — not a one-off script.
          </h2>
          <p className="mt-3 text-muted-foreground">
            From lead mining to verified contacts to approved drip queues,
            ScholarReach is a multi-tenant student product with the workflow
            research applicants actually need.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.06 }}
            >
              <Card className="h-full">
                <CardHeader>
                  <div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
                    <Icon className="size-4" />
                  </div>
                  <CardTitle className="font-display text-base">{title}</CardTitle>
                  <CardDescription>{desc}</CardDescription>
                </CardHeader>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          How it works
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title}>
              <CardHeader>
                <Badge variant="outline" className="w-fit">
                  Step {i + 1}
                </Badge>
                <CardTitle className="font-display text-lg">{step.title}</CardTitle>
                <CardDescription>{step.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">
          Who ScholarReach is for
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {audiences.map(({ icon: Icon, title, desc }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="size-5 text-primary" />
                <CardTitle className="font-display text-lg">{title}</CardTitle>
                <CardDescription>{desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Human approval. Machine scale.
            </CardTitle>
            <CardDescription>
              Review AI-written research inquiries, attach CC instructions, and
              queue sends for the next academic window — without losing control of
              your voice.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/approvals" className={cn(buttonVariants())}>
              Preview approvals
            </Link>
            <Link
              href="/queue"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              See outreach queue
            </Link>
          </CardContent>
        </Card>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-8 max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight">
            Pricing that stays free
          </h2>
          <p className="mt-3 text-muted-foreground">
            Built on free Hobby hosting. Your account data stays private — the
            marketing site never ships your faculty list.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {pricing.map((tier) => (
            <Card key={tier.name} className={tier.cta ? "ring-1 ring-primary/40" : undefined}>
              <CardHeader>
                <Badge variant={tier.cta ? "default" : "secondary"} className="w-fit">
                  {tier.note}
                </Badge>
                <CardTitle className="font-display text-2xl">{tier.name}</CardTitle>
                <div className="font-display text-4xl font-semibold tracking-tight">
                  {tier.price}
                </div>
                <CardDescription>No credit card. No trial cliff.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                {tier.cta && (
                  <Link
                    href={primaryCtaHref}
                    className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
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

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-16">
        <h2 className="font-display text-3xl font-semibold tracking-tight">FAQ</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {faqs.map((item) => (
            <Card key={item.q}>
              <CardHeader>
                <CardTitle className="text-base">{item.q}</CardTitle>
                <CardDescription className="text-sm leading-relaxed">
                  {item.a}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <Card className="overflow-hidden">
          <CardHeader className="gap-4">
            <Badge variant="secondary" className="w-fit">
              Free forever for students (for now)
            </Badge>
            <CardTitle className="font-display text-3xl">
              Open your workspace and start mining leads today.
            </CardTitle>
            <CardDescription className="max-w-2xl text-base">
              No credit card. No waitlist. Create a free account, explore the
              directory, and connect Gmail when you&apos;re ready to dispatch.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={primaryCtaHref}
              className={cn(buttonVariants({ size: "lg" }))}
              {...(staticDemo ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              {primaryCtaLabel}
              <ArrowRight data-icon="inline-end" />
            </Link>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <span className="wax-seal flex size-7 items-center justify-center rounded-lg text-[10px] text-primary-foreground">
              SR
            </span>
            ScholarReach AI
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link
              href={staticDemo ? LIVE_APP_URL : "/login"}
              className="hover:text-foreground"
              {...(staticDemo
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              Live app
            </Link>
            <p>
              © {new Date().getFullYear()} ScholarReach AI · Free student SaaS
            </p>
          </div>
        </div>
      </footer>
    </main>
  );
}
