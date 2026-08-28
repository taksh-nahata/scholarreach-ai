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
    needsGmailReconnect?: boolean;
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
      const friendly: Record<string, string> = {
        access_denied:
          "Gmail access was denied. If this is a supervised Google account, set third-party access to “Ask every time”, then approve when Google prompts.",
        no_refresh_token:
          "Google did not return a lasting login. Tap Reconnect again and accept ALL permissions on the consent screen.",
        no_access_token: "Google did not return an access token. Try reconnecting again.",
        gmail_probe_failed:
          "Connected, but Gmail API rejected the login. Revoke ScholarReach under Google Account → Security → Third-party access, then reconnect.",
        token_exchange_failed:
          "Token exchange failed. Try again — if it keeps failing, the Google OAuth client may be misconfigured.",
      };
      toast.error(
        friendly[err] ||
          `Gmail connect failed (${err}). Try again, or approve when Google asks a guardian.`
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

  const gmailReady = !!(
    status.gmailConnected &&
    status.mailProvider === "gmail" &&
    !status.needsGmailReconnect
  );

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Connect Gmail
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authorize ScholarReach to send from your Gmail and detect professor
          replies. Professors see your real address — not a shared platform inbox.
        </p>
      </div>

      {gmailReady && (
        <Alert>
          <Shield className="size-4" />
          <AlertTitle>Gmail connected</AlertTitle>
          <AlertDescription>
            Sending and reply tracking use your Google account{" "}
            <Badge variant="secondary" className="ml-1">
              send + read
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      {!gmailReady && (
        <Alert variant="destructive">
          <AlertTitle>Gmail needs reconnect</AlertTitle>
          <AlertDescription className="text-sm">
            Google rejected the saved login (
            <code className="text-xs">invalid_grant</code>
            ). Queued emails are on hold until you reconnect below. Tap{" "}
            <strong>Request Gmail access</strong>, approve every permission
            Google shows, then the next Tue–Thu morning window will send again.
          </AlertDescription>
        </Alert>
      )}

      <Alert>
        <AlertTitle>Supervised Google accounts</AlertTitle>
        <AlertDescription className="flex flex-col gap-2 text-sm">
          <span>
            Sign-in only requests basic profile info (name + email). Connecting
            Gmail separately requests send and read access so outreach can go
            out from your address and replies can be tracked.
          </span>
          <span>
            If a guardian manages the account, choose{" "}
            <strong>Ask every time</strong> for third-party apps, then approve
            when Google prompts. After connecting, manage access under Google
            Account → Security → Third-party access.
          </span>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Request Gmail access
          </CardTitle>
          <CardDescription>
            Opens Google&apos;s permission screen for send + inbox read (reply
            detection). Approve when prompted.
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
            Sign in first, then tap this. Scopes: send mail from your address and
            read mail to detect professor replies. Reconnect after any permission
            update.
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
