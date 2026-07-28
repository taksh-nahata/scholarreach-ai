"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Clock,
  Mail,
  Search,
  ShieldCheck,
  Sparkles,
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
import { cn } from "@/lib/utils";

const features = [
  {
    icon: Search,
    title: "Publication-aware personalization",
    desc: "Mine recent lab papers and tailor every inquiry to real research, not generic templates.",
  },
  {
    icon: Mail,
    title: "One-click Gmail OAuth",
    desc: "Connect Gmail with official OAuth2 — no Apps Script, no app passwords.",
  },
  {
    icon: ShieldCheck,
    title: "Verified email unscrambler",
    desc: "Qwen 3.6 unscrambles obfuscated faculty emails and extracts assistant CCs.",
  },
  {
    icon: Clock,
    title: "Academic 8 AM scheduler",
    desc: "500/hr drip physics, Tue–Thu 8–9 AM local, with multi-day rollover.",
  },
];

export default function LandingPage() {
  const reduce = useReducedMotion();

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
            href="/dashboard"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            Dashboard
          </Link>
          <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
            Get Started Free
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-2 lg:pt-16">
        <div>
          <Badge variant="secondary" className="mb-5">
            Free for students · Research outreach autopilot
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
            Discover R1 & global faculty, write publication-aware inquiry emails,
            verify contacts with live AI scraping, and dispatch via Gmail during
            the morning academic window.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.16 }}
          >
            <Link href="/login" className={cn(buttonVariants({ size: "lg" }))}>
              Get Started Free
              <ArrowRight data-icon="inline-end" />
            </Link>
            <Link
              href="/dashboard"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              Open Dashboard
            </Link>
          </motion.div>
        </div>

        <AcademicWindowSeal />
      </section>

      <Separator className="mx-auto max-w-6xl" />

      <section className="relative z-10 mx-auto grid max-w-6xl gap-4 px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
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
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-24">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-2xl">
              Built for the cold-email that still feels hand-written.
            </CardTitle>
            <CardDescription>
              ScholarReach keeps your drafts reviewable, verifies emails before
              send, and only fires during Tue–Thu 8–9 AM when faculty inboxes
              open.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Link href="/approvals" className={cn(buttonVariants())}>
              Review drafts
            </Link>
            <Link
              href="/directory"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              Browse faculty directory
            </Link>
          </CardContent>
        </Card>
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ScholarReach AI · Free for students seeking
        research roles
      </footer>
    </main>
  );
}
