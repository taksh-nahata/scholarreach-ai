"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const { signInFree, connectGmail, isStatic } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"free" | "gmail" | null>(null);
  const staticMode =
    isStatic || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

  function goDashboard() {
    router.push("/dashboard/");
  }

  async function onContinueFree() {
    setBusy("free");
    try {
      signInFree({ name, email });
      toast.success("Workspace ready");
      goDashboard();
    } finally {
      setBusy(null);
    }
  }

  async function onConnectGmail() {
    setBusy("gmail");
    try {
      if (!email.trim() || !email.includes("@")) {
        toast.error("Enter the Gmail address you want to connect");
        return;
      }

      if (staticMode) {
        signInFree({ name, email });
        connectGmail(email.trim());
        toast.success("Gmail connected for this demo workspace");
        goDashboard();
        return;
      }

      try {
        const { signIn } = await import("next-auth/react");
        const result = await signIn("google", {
          callbackUrl: "/dashboard",
          redirect: false,
        });
        if (result?.url) {
          window.location.href = result.url;
          return;
        }
      } catch {
        // fall through
      }

      connectGmail(email.trim());
      signInFree({ name, email });
      connectGmail(email.trim());
      toast.success("Connected in demo mode — add Google OAuth keys for live send");
      goDashboard();
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 desk-grid opacity-40" />
      <Card className="relative z-10 w-full max-w-md">
        <CardHeader>
          <Link href="/" className="mb-2 flex items-center gap-2 font-semibold">
            <span className="wax-seal flex size-9 items-center justify-center rounded-xl text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <span className="font-display">ScholarReach AI</span>
          </Link>
          <CardTitle className="font-display text-2xl">
            Create your free workspace
          </CardTitle>
          <CardDescription>
            Start mining faculty leads and reviewing AI drafts in under a minute.
            Connect Gmail when you&apos;re ready to send during the academic window.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {staticMode && (
            <Alert>
              <AlertTitle>Product demo</AlertTitle>
              <AlertDescription>
                You&apos;re on the public GitHub Pages preview. Auth is stored in
                your browser so the product flow stays smooth — live Google OAuth
                requires a hosted backend.
              </AlertDescription>
            </Alert>
          )}

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                autoComplete="name"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">School or Gmail address</FieldLabel>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@university.edu"
                autoComplete="email"
              />
              <FieldDescription>
                Used for your workspace identity and optional Gmail connection.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={onConnectGmail} disabled={busy !== null}>
              {busy === "gmail" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Mail data-icon="inline-start" />
              )}
              Connect Gmail & enter app
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={onContinueFree}
              disabled={busy !== null}
            >
              {busy === "free" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRight data-icon="inline-start" />
              )}
              Continue without Gmail
            </Button>
          </div>

          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Free for high school and college students. No app passwords. Production
            sending uses official Google OAuth with{" "}
            <code className="text-primary">gmail.send</code> only.
          </p>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
          Already exploring?{" "}
          <Link
            href="/dashboard"
            className={cn(buttonVariants({ variant: "link", size: "xs" }))}
          >
            Open dashboard
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
