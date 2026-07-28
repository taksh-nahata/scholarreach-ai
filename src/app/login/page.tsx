"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { Mail, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <span className="wax-seal flex size-9 items-center justify-center rounded-xl text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <span className="font-display">ScholarReach AI</span>
          </div>
          <CardTitle className="font-display text-2xl">
            Sign in & Connect Gmail
          </CardTitle>
          <CardDescription>
            One-click Google OAuth grants{" "}
            <code className="text-primary">gmail.send</code> so ScholarReach can
            dispatch during the academic window — no Apps Script, no app
            passwords.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            size="lg"
            onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          >
            <Mail data-icon="inline-start" />
            Connect Gmail with Google
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() =>
              signIn("dev-login", {
                email: "takshnahata37@gmail.com",
                callbackUrl: "/dashboard",
              })
            }
          >
            Continue as takshnahata37@gmail.com (dev)
          </Button>
        </CardContent>
        <CardFooter className="justify-center text-xs text-muted-foreground">
          Free for all students.{" "}
          <Link href="/" className={cn(buttonVariants({ variant: "link", size: "xs" }))}>
            Back to home
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}
