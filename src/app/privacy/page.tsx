import Link from "next/link";
import { Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function PrivacyPage() {
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
          Privacy
        </h1>
        <p className="mt-3 text-muted-foreground">
          Last updated {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>

        <div className="mt-10 space-y-8 text-sm leading-relaxed text-foreground/90">
          <section>
            <h2 className="font-display text-xl font-semibold">Private workspaces</h2>
            <p className="mt-2 text-muted-foreground">
              Each student account is isolated. Faculty leads, draft emails, scheduled
              sends, and delivery history belong only to the signed-in workspace.
              We do not publish your outreach data on the marketing site or public demos.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">What we store</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Account email and display name</li>
              <li>Professor leads and research notes you create or import</li>
              <li>Email drafts, scheduled queue items, and send history</li>
              <li>Optional Gmail OAuth tokens (gmail.send scope) when you connect inbox</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">What we never do</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Sell your faculty lists or draft content</li>
              <li>Store your Gmail password</li>
              <li>Put personal outreach JSON into the public GitHub Pages demo</li>
              <li>Share one student&apos;s queue with another account</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-semibold">Hosting</h2>
            <p className="mt-2 text-muted-foreground">
              The live app runs on Vercel (Hobby) with Neon Postgres (free tier).
              The GitHub Pages site is a static marketing/demo surface with synthetic sample data only.
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
          <Link href="/login" className={cn(buttonVariants())}>
            Open workspace
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
