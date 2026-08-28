"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BrandLogo } from "@/components/BrandLogo";
import { cn } from "@/lib/utils";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"form" | "google" | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    fetch("/api/auth/providers-status")
      .then((r) => r.json())
      .then((d) => setGoogleReady(!!d.google))
      .catch(() => undefined);
  }, []);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setBusy("form");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      const { signIn } = await import("next-auth/react");
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (result?.error) throw new Error("Account created but sign-in failed");
      toast.success(data.claimed ? "Password saved — welcome back" : "Account created");
      router.push("/onboarding");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setBusy(null);
    }
  }

  async function onGoogle() {
    setBusy("google");
    try {
      if (!googleReady) {
        toast.error("Google Sign-In is not configured yet. Use email signup.");
        return;
      }
      toast.message(
        "If Google blocks sign-up on a supervised account, use email + password instead."
      );
      const { signIn } = await import("next-auth/react");
      await signIn("google", { callbackUrl: "/onboarding" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-up failed");
      setBusy(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandLogo height={32} className="mb-2" priority />
          <CardTitle className="font-display text-2xl">Create account</CardTitle>
          <CardDescription>
            Free student workspace. You can use your school or Gmail address with
            a ScholarReach password.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert>
            <AlertTitle>Supervised Google accounts</AlertTitle>
            <AlertDescription>
              If Google blocks Sign up with Google, create an account with email +
              password instead. You can still connect Gmail later for sending.
            </AlertDescription>
          </Alert>

          <form onSubmit={onSignup} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Full name</FieldLabel>
                <Input
                  id="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@gmail.com"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <FieldDescription>At least 8 characters. Not your Google password.</FieldDescription>
              </Field>
            </FieldGroup>
            <Button size="lg" type="submit" disabled={busy !== null}>
              {busy === "form" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <ArrowRight data-icon="inline-start" />
              )}
              Create account
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
            disabled={busy !== null || !googleReady}
          >
            {busy === "google" ? <Spinner data-icon="inline-start" /> : null}
            Sign up with Google
          </Button>
        </CardContent>
        <CardFooter className="justify-between text-sm">
          <Link href="/login" className="text-primary underline-offset-4 hover:underline">
            Already have an account?
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "link", size: "xs" }))}>
            Home
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
