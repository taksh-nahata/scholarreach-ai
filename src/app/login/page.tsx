"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, Sparkles, ArrowRight, ShieldCheck } from "lucide-react";
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
import { LIVE_APP_URL } from "@/lib/live-app";

export default function LoginPage() {
  const router = useRouter();
  const { isStatic } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState<"free" | "gmail" | null>(null);
  const staticMode =
    isStatic || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

  function goDashboard() {
    router.push("/dashboard");
  }

  async function workspaceSignIn() {
    const { signIn } = await import("next-auth/react");
    const result = await signIn("workspace-login", {
      email: email.trim().toLowerCase(),
      name: name.trim() || "Student Researcher",
      accessCode: accessCode.trim(),
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (result?.error) {
      throw new Error(
        "Sign-in failed. New workspaces are free — if this email already has private data, enter your workspace access code."
      );
    }
    if (result?.url) {
      window.location.href = result.url;
      return;
    }
    goDashboard();
  }

  async function onContinueFree() {
    setBusy("free");
    try {
      if (staticMode) {
        window.location.href = `${LIVE_APP_URL}/login`;
        return;
      }
      if (!email.trim() || !email.includes("@")) {
        toast.error("Enter a valid email for your workspace");
        return;
      }
      await workspaceSignIn();
      toast.success("Signed in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  async function onConnectGmail() {
    setBusy("gmail");
    try {
      if (staticMode) {
        window.location.href = `${LIVE_APP_URL}/login`;
        return;
      }

      if (!email.trim() || !email.includes("@")) {
        toast.error("Enter the Gmail address you want to connect");
        return;
      }

      await workspaceSignIn();

      const { signIn, getProviders } = await import("next-auth/react");
      const providers = await getProviders();
      if (!providers?.google) {
        toast.message(
          "Workspace ready. Add Google OAuth keys to enable Connect Gmail."
        );
        goDashboard();
        return;
      }

      const result = await signIn("google", {
        callbackUrl: "/dashboard",
        redirect: false,
      });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }

      toast.message("Workspace signed in");
      goDashboard();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
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
            Open your free workspace
          </CardTitle>
          <CardDescription>
            Create a private student account in seconds. Your faculty leads,
            drafts, and send history stay isolated to your workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {staticMode && (
            <Alert>
              <AlertTitle>Marketing demo</AlertTitle>
              <AlertDescription>
                This GitHub Pages preview is sample-only.{" "}
                <a
                  href={LIVE_APP_URL}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the live app
                </a>{" "}
                for your private account.
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Private by default</AlertTitle>
            <AlertDescription>
              Existing workspaces with outreach data require an access code.
              Brand-new student accounts are free — no credit card.
            </AlertDescription>
          </Alert>

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
                Used as your workspace identity. Never shared publicly.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="accessCode">
                Access code (returning accounts)
              </FieldLabel>
              <Input
                id="accessCode"
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                placeholder="Required if this email already has data"
                autoComplete="current-password"
              />
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
              Continue free without Gmail
            </Button>
          </div>

          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Free forever for students on the Hobby stack (Vercel + Neon).
            Production sending uses Google OAuth with{" "}
            <code className="text-primary">gmail.send</code> — never app
            passwords. See{" "}
            <Link href="/privacy" className="text-primary underline-offset-4 hover:underline">
              Privacy
            </Link>
            .
          </p>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
          <Link href="/" className={cn(buttonVariants({ variant: "link", size: "xs" }))}>
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
