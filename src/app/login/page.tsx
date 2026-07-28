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
import { LIVE_APP_URL } from "@/lib/live-app";

export default function LoginPage() {
  const router = useRouter();
  const { isStatic } = useAuth();
  const [name, setName] = useState("Taksh Nahata");
  const [email, setEmail] = useState("taksh.nahata37@gmail.com");
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
      redirect: false,
      callbackUrl: "/dashboard",
    });
    if (result?.error) throw new Error(result.error);
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
        // Prefer the real hosted account over browser-only demo auth
        window.location.href = `${LIVE_APP_URL}/login`;
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

      // Ensure workspace user exists first
      await workspaceSignIn();

      const { signIn, getProviders } = await import("next-auth/react");
      const providers = await getProviders();
      if (!providers?.google) {
        toast.message(
          "Google OAuth keys not set yet — signed into workspace. Add GOOGLE_CLIENT_ID/SECRET on Vercel to enable Connect Gmail."
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

      toast.message("Google OAuth not configured yet — workspace signed in");
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
            Sign in to your workspace
          </CardTitle>
          <CardDescription>
            Access your faculty leads, draft approvals, and academic-window queue.
            Connect Gmail when you&apos;re ready to send.
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
                to use your real account ({" "}
                <code className="text-xs">taksh.nahata37@gmail.com</code>).
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
              Sign in without Gmail
            </Button>
          </div>

          <Separator />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Free for high school and college students. Production sending uses
            official Google OAuth with <code className="text-primary">gmail.send</code>{" "}
            only — never app passwords.
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
