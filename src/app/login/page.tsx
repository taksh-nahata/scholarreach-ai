"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"pass" | "google" | "ms" | null>(null);
  const [providers, setProviders] = useState({ google: false, microsoft: false });
  const [familyLinkBlocked, setFamilyLinkBlocked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers-status")
      .then((r) => r.json())
      .then((d) =>
        setProviders({ google: !!d.google, microsoft: !!d.microsoft })
      )
      .catch(() => undefined);

    const err = (params.get("error") || "").toLowerCase();
    const msg = (params.get("error_description") || params.get("message") || "").toLowerCase();
    const family =
      err.includes("family") ||
      msg.includes("family link") ||
      msg.includes("managed") ||
      err === "accessdenied" ||
      err === "access_denied" ||
      err === "oauthsignin" ||
      err === "oauthcallback" ||
      err === "oauthcreateaccount" ||
      err === "callback";

    if (params.get("error")) {
      if (family || msg.includes("family")) {
        setFamilyLinkBlocked(true);
        toast.error(
          "Google blocked this Family Link account for third-party apps. Use email + password below."
        );
      } else {
        toast.error("Google sign-in failed. Use email + password instead.");
      }
    }
  }, [params]);

  async function afterAuth() {
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
      /* ignore */
    }
    router.push("/dashboard");
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pass");
    try {
      const { signIn } = await import("next-auth/react");
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) {
        throw new Error("Wrong email or password.");
      }
      toast.success("Signed in");
      await afterAuth();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  async function onGoogle() {
    setBusy("google");
    try {
      if (!providers.google) {
        toast.error("Google Sign-In is not configured. Use email + password.");
        return;
      }
      toast.message(
        "Family Link often blocks new apps. If Google says no, use password login."
      );
      const { signIn } = await import("next-auth/react");
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (err) {
      setFamilyLinkBlocked(true);
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(null);
    }
  }

  async function onMicrosoft() {
    setBusy("ms");
    try {
      if (!providers.microsoft) {
        toast.message("Use Connect Inbox after login for Outlook SMTP.");
        return;
      }
      const { signIn } = await import("next-auth/react");
      await signIn("azure-ad", { callbackUrl: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Microsoft sign-in failed");
      setBusy(null);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <Link href="/" className="mb-2 flex items-center gap-2 font-semibold">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-[11px] font-bold text-primary-foreground">
            SR
          </span>
          <span className="font-display">ScholarReach</span>
        </Link>
        <CardTitle className="font-display text-2xl">Sign in</CardTitle>
        <CardDescription>
          Family Link Google accounts should use email + password. Google Sign-In
          is optional and often blocked for supervised accounts.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant={familyLinkBlocked ? "destructive" : "default"}>
          <AlertTitle>
            {familyLinkBlocked
              ? "Google blocked your Family Link account"
              : "Using a Family Link Google account?"}
          </AlertTitle>
          <AlertDescription>
            {familyLinkBlocked
              ? "That's Google's restriction on supervised accounts for many new apps. Sign in with email + password below — it works with the same Gmail address."
              : "Skip Continue with Google. Use email + password (same Gmail is fine). Google often blocks supervised accounts on unverified apps."}
          </AlertDescription>
        </Alert>

        <form onSubmit={onPasswordLogin} className="flex flex-col gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </Field>
          </FieldGroup>
          <Button size="lg" type="submit" disabled={busy !== null}>
            {busy === "pass" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ArrowRight data-icon="inline-start" />
            )}
            Sign in with password
          </Button>
        </form>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Separator className="flex-1" />
          optional
          <Separator className="flex-1" />
        </div>

        <Button
          size="lg"
          variant="outline"
          onClick={onGoogle}
          disabled={busy !== null || !providers.google}
        >
          {busy === "google" ? <Spinner data-icon="inline-start" /> : null}
          Continue with Google
        </Button>
        {providers.microsoft && (
          <Button
            size="lg"
            variant="outline"
            onClick={onMicrosoft}
            disabled={busy !== null}
          >
            {busy === "ms" ? <Spinner data-icon="inline-start" /> : null}
            Continue with Microsoft
          </Button>
        )}
        {!providers.google && (
          <p className="text-xs text-muted-foreground">
            Google button is off until OAuth keys are added. Password login works
            now.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between text-sm">
        <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
        <Link href="/" className={cn(buttonVariants({ variant: "link", size: "xs" }))}>
          Home
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Suspense fallback={<Spinner />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
