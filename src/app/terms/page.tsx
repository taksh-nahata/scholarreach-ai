import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function TermsPage() {
  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 desk-grid opacity-40" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <BrandLogo height={32} className="mb-8" />

        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Terms of use
        </h1>
        <p className="mt-3 text-muted-foreground">
          Student research outreach tooling — free for all users right now.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold">Free access</h2>
            <p className="mt-2 text-muted-foreground">
              ScholarReach AI is free. No credit card is required. Paid plans are
              not offered at this time. Optional mining APIs (when configured by
              the operator) may consume operator-paid credits — not charged to
              students.
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
              drip (Tue–Thu 8–9 AM local, daily caps) protects sender reputation.
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
