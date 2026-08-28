import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PrivacyPage() {
  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 desk-grid opacity-40" />
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-12">
        <BrandLogo height={32} className="mb-8" />

        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Privacy
        </h1>
        <p className="mt-3 text-muted-foreground">
          How ScholarReach handles your profile, Gmail access, and outreach data.
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="font-display text-xl font-semibold">Your workspace</h2>
            <p className="mt-2 text-muted-foreground">
              Each account is private. Leads, drafts, send history, and connected
              inbox tokens belong to that user only and are not shared with other
              accounts.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">What we store</h2>
            <p className="mt-2 text-muted-foreground">
              Profile details you enter or upload (CV text, achievements, targets),
              faculty leads you mine, draft emails, queue state, and reply
              tracking metadata. Gmail OAuth tokens are stored encrypted so we can
              send as you and detect replies when you connect inbox.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">What we do not do</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Sell your personal data</li>
              <li>Put personal outreach JSON into the public GitHub Pages demo</li>
              <li>Share one student&apos;s queue with another account</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">Hosting</h2>
            <p className="mt-2 text-muted-foreground">
              The live app runs on Vercel with Neon Postgres. Accounts are
              private and scoped per user. The GitHub Pages site is a static
              marketing/demo surface with synthetic sample data only.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">Contact</h2>
            <p className="mt-2 text-muted-foreground">
              Questions about your data: open your workspace Account page or email the
              address you used to sign up.
            </p>
          </section>
        </div>

        <div className="mt-12 flex gap-3">
          <Link href="/terms" className={cn(buttonVariants({ variant: "outline" }))}>
            Terms
          </Link>
          <Link href="/signup" className={cn(buttonVariants())}>
            Get started free
          </Link>
        </div>
      </div>
    </main>
  );
}
