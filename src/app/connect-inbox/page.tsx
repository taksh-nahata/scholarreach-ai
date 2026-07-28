"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Shield } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

function ConnectInboxInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<{
    mailConnected?: boolean;
    gmailConnected?: boolean;
    mailProvider?: string | null;
  }>({});
  const [googleReady, setGoogleReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [setupUris, setSetupUris] = useState<{ login?: string; gmail?: string }>(
    {}
  );

  async function refresh() {
    const [smtpRes, provRes] = await Promise.all([
      fetch("/api/mail/smtp"),
      fetch("/api/auth/providers-status"),
    ]);
    if (smtpRes.ok) setStatus(await smtpRes.json());
    if (provRes.ok) {
      const p = await provRes.json();
      setGoogleReady(!!p.google);
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    if (params.get("connected") === "gmail") {
      toast.success("Gmail access granted — emails will send from your address");
    }
    if (params.get("error")) {
      const err = params.get("error") || "";
      toast.error(
        err === "access_denied"
          ? "Google/parent denied Gmail access. On Family Link use “Ask every time”, then approve when prompted."
          : `Gmail connect failed (${err}). Try again with your parent present.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function requestGmailAccess() {
    setBusy(true);
    try {
      const res = await fetch("/api/mail/gmail/connect");
      const data = await res.json();
      if (res.status === 503 && data.setupRequired) {
        setSetupUris(data.redirectUris || {});
        throw new Error(
          "Server is missing Google OAuth keys. Ask the admin to add GOOGLE_CLIENT_ID + SECRET (see setup below)."
        );
      }
      if (!res.ok) throw new Error(data.error || "Could not start Gmail connect");
      // Same pattern as Apps Script: Google consent screen for Gmail permission
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OAuth failed");
      setBusy(false);
    }
  }

  const gmailReady = !!(status.gmailConnected || status.mailProvider === "gmail");

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Connect Gmail
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Request permission to send from your Gmail — same idea as authorizing
          Apps Script, without Apps Script. Professors see your real address.
        </p>
      </div>

      {gmailReady && (
        <Alert>
          <Shield className="size-4" />
          <AlertTitle>Gmail connected</AlertTitle>
          <AlertDescription>
            Sending uses your Google account{" "}
            <Badge variant="secondary" className="ml-1">
              gmail.send
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Family Link (what your dad sees)</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 text-sm">
          <span>
            <strong>Basic info</strong> = Sign in with Google (name + email) —
            that matches login.
          </span>
          <span>
            <strong>Ask every time</strong> = when we request Gmail send below,
            Google should prompt him to approve (not the hard “not allowed”
            wall).
          </span>
          <span>
            After you connect once, it appears under{" "}
            <em>Manage third-party app access</em>.
          </span>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Request Gmail access
          </CardTitle>
          <CardDescription>
            Opens Google&apos;s permission screen for sending mail as you. Have
            your parent nearby if Family Link asks them to approve.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!googleReady && (
            <Alert variant="destructive">
              <AlertTitle>OAuth keys not on the server yet</AlertTitle>
              <AlertDescription className="text-sm">
                Create a Google Cloud OAuth client, enable Gmail API, add both
                redirect URIs, then run{" "}
                <code className="text-xs">
                  node scripts/set-google-oauth.cjs CLIENT_ID CLIENT_SECRET
                </code>
                .
                {setupUris.gmail && (
                  <span className="mt-2 block break-all text-xs">
                    Gmail callback: {setupUris.gmail}
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Button size="lg" onClick={requestGmailAccess} disabled={busy}>
            {busy ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Mail data-icon="inline-start" />
            )}
            {gmailReady ? "Reconnect Gmail access" : "Request Gmail access"}
          </Button>
          <p className="text-xs text-muted-foreground">
            First sign in with email/password (or Google basic info), then tap
            this. Scope: send email only — not full mailbox read.
          </p>
        </CardContent>
      </Card>

      <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
        Back to dashboard
      </Link>
    </div>
  );
}

export default function ConnectInboxPage() {
  return (
    <main className="min-h-screen px-4 py-10">
      <Suspense fallback={<Spinner />}>
        <ConnectInboxInner />
      </Suspense>
    </main>
  );
}
