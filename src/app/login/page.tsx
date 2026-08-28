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
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"pass" | "google" | null>(null);
  const [providers, setProviders] = useState({ google: false });
  const [familyLinkBlocked, setFamilyLinkBlocked] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers-status")
      .then((r) => r.json())
      .then((d) => setProviders({ google: !!d.google }))
      .catch(() => undefined);

    const err = (params.get("error") || "").toLowerCase();
    if (params.get("error")) {
      if (
        err.includes("access") ||
        err.includes("oauth") ||
        err.includes("callback")
      ) {
        setFamilyLinkBlocked(true);
        toast.error(
          "Google sign-in blocked or denied. Use password, or check supervised-account / OAuth settings."
        );
      } else {
        toast.error("Sign-in failed. Try email + password.");
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
      if (result?.error) throw new Error("Wrong email or password.");
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
        toast.error(
          "Google Sign-In isn’t configured yet (missing OAuth keys). Use password."
        );
        return;
      }
      const { signIn } = await import("next-auth/react");
      // Identity scopes only — Gmail is connected separately after login
      await signIn("google", { callbackUrl: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(null);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <BrandLogo height={32} className="mb-2" priority />
        <CardTitle className="font-display text-2xl">Sign in</CardTitle>
        <CardDescription>
          Password always works. Google login only asks for basic info (name +
          email). Gmail sending is a separate step after login.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Alert variant={familyLinkBlocked ? "destructive" : "default"}>
          <AlertTitle>Google access</AlertTitle>
          <AlertDescription className="text-sm">
            Sign-in only asks for basic info (name + email). To send outreach
            from your Gmail and track replies, connect inbox after login via{" "}
            <Link href="/connect-inbox" className="underline">
              Connect Gmail
            </Link>
            . Supervised accounts may need guardian approval when Google prompts.
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
          or
          <Separator className="flex-1" />
        </div>

        <Button
          size="lg"
          variant="outline"
          onClick={onGoogle}
          disabled={busy !== null || !providers.google}
        >
          {busy === "google" ? <Spinner data-icon="inline-start" /> : null}
          Continue with Google (basic info)
        </Button>
        {!providers.google && (
          <p className="text-xs text-muted-foreground">
            Google button is off until OAuth client keys are added on the
            server.
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-between text-sm">
        <Link
          href="/signup"
          className="text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
        <Link
          href="/"
          className={cn(buttonVariants({ variant: "link", size: "xs" }))}
        >
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
