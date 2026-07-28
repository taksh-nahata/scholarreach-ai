import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TermsPage() {
  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 desk-grid opacity-40" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="mb-8 inline-flex items-center gap-2 font-semibold">
          <span className="wax-seal flex size-8 items-center justify-center rounded-lg text-primary-foreground">
            <Sparkles className="size-3.5" />
          </span>
          <span className="font-display">ScholarReach AI</span>
        </Link>

        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Terms of use
        </h1>
        <p className="mt-3 text-muted-foreground">
          Student research outreach tooling — free forever on the Hobby plan.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold">Free student tier</h2>
            <p className="mt-2 text-muted-foreground">
              ScholarReach AI is free for high school and college students. No credit
              card is required. Hosting uses Vercel Hobby and Neon free Postgres.
              Optional mining APIs (when configured by the operator) may consume
              operator-paid credits — not charged to students.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">Acceptable use</h2>
            <p className="mt-2 text-muted-foreground">
              Use ScholarReach for genuine research inquiries. You must approve
              drafts before send. Do not spam faculty, harvest emails for resale,
              or misrepresent your identity or affiliation.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">Email sending</h2>
            <p className="mt-2 text-muted-foreground">
              Live Gmail dispatch requires your OAuth consent. Academic-window
              drip (Tue–Thu 8–9 AM, 500/hr cap) protects sender reputation.
              Dry-run mode may be enabled to prevent accidental sends.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">No warranty</h2>
            <p className="mt-2 text-muted-foreground">
              The product is provided as-is for student research workflows.
              Reply rates and faculty availability are never guaranteed.
            </p>
          </section>
        </div>

        <div className="mt-12 flex gap-3">
          <Link href="/privacy" className={cn(buttonVariants({ variant: "outline" }))}>
            Privacy
          </Link>
          <Link href="/login" className={cn(buttonVariants())}>
            Get started free
          </Link>
        </div>
      </div>
    </main>
  );
}
