"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, ArrowRight, ShieldCheck } from "lucide-react";
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

async function routeAfterAuth(router: ReturnType<typeof useRouter>) {
  try {
    const res = await fetch("/api/profile");
    if (res.ok) {
      const data = await res.json();
      if (!data.user?.onboardingComplete) {
        router.push("/onboarding");
        return;
      }
    }
  } catch {
    /* fall through */
  }
  router.push("/dashboard");
}

export default function LoginPage() {
  const router = useRouter();
  const { isStatic } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [busy, setBusy] = useState<"free" | "gmail" | null>(null);
  const staticMode =
    isStatic || process.env.NEXT_PUBLIC_STATIC_EXPORT === "true";

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
      await routeAfterAuth(router);
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
          "Workspace ready. Finish onboarding, then add Google OAuth for Connect Gmail."
        );
        await routeAfterAuth(router);
        return;
      }

      const result = await signIn("google", {
        callbackUrl: "/onboarding",
        redirect: false,
      });
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      await routeAfterAuth(router);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link href="/" className="mb-2 flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
              SR
            </span>
            <span className="font-display">ScholarReach</span>
          </Link>
          <CardTitle className="font-display text-2xl">
            Open your free workspace
          </CardTitle>
          <CardDescription>
            New accounts start with onboarding (CV, interview, regions). Returning
            accounts with data need an access code.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {staticMode && (
            <Alert>
              <AlertTitle>Marketing demo</AlertTitle>
              <AlertDescription>
                Sample-only on GitHub Pages.{" "}
                <a
                  href={LIVE_APP_URL}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the live app
                </a>
                .
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Private by default</AlertTitle>
            <AlertDescription>
              Your CV, interview answers, and outreach queue stay inside your
              workspace.
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
            Free forever on Vercel Hobby + Neon. See{" "}
            <Link
              href="/privacy"
              className="text-primary underline-offset-4 hover:underline"
            >
              Privacy
            </Link>
            .
          </p>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "link", size: "xs" }))}
          >
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
