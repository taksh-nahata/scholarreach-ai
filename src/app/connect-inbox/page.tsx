"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type PresetMap = Record<
  string,
  { label: string; host: string; port: number; help: string }
>;

function ConnectInboxInner() {
  const params = useSearchParams();
  const [status, setStatus] = useState<{
    mailConnected?: boolean;
    gmailConnected?: boolean;
    mailProvider?: string | null;
    presets?: PresetMap;
  }>({});
  const [platform, setPlatform] = useState<{
    configured?: boolean;
    connected?: boolean;
    replyTo?: string;
    fromHint?: string | null;
  }>({});
  const [preset, setPreset] = useState("outlook_smtp");
  const [host, setHost] = useState("smtp.office365.com");
  const [port, setPort] = useState("587");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"platform" | "oauth" | "smtp" | null>(null);

  async function refresh() {
    const [smtpRes, platRes] = await Promise.all([
      fetch("/api/mail/smtp"),
      fetch("/api/mail/platform"),
    ]);
    if (smtpRes.ok) {
      const data = await smtpRes.json();
      setStatus(data);
    }
    if (platRes.ok) {
      setPlatform(await platRes.json());
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    if (params.get("connected")) {
      toast.success(`Connected: ${params.get("connected")}`);
    }
    if (params.get("error")) {
      toast.error(
        `Google connect failed (${params.get("error")}). Use Platform sending instead — Gmail SMTP/App Passwords are unreliable.`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    const p = status.presets?.[preset];
    if (p) {
      if (p.host) setHost(p.host);
      setPort(String(p.port));
    }
  }, [preset, status.presets]);

  async function enablePlatform(enable: boolean) {
    setBusy("platform");
    try {
      const res = await fetch("/api/mail/platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Platform mail failed");
      toast.success(enable ? "Platform sending enabled" : "Platform sending off");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  async function connectGmailOAuth() {
    setBusy("oauth");
    try {
      const res = await fetch("/api/mail/gmail/connect");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "OAuth unavailable");
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "OAuth failed");
      setBusy(null);
    }
  }

  async function saveSmtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy("smtp");
    try {
      const res = await fetch("/api/mail/smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preset,
          host,
          port: Number(port),
          username,
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SMTP connect failed");
      toast.success("SMTP connected");
      setPassword("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "SMTP failed");
    } finally {
      setBusy(null);
    }
  }

  const ready = status.mailConnected || status.gmailConnected || platform.connected;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Connect sending
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scalable path uses Resend (not Gmail SMTP / Apps Script). Replies still
          go to your email.
        </p>
      </div>

      {ready && (
        <Alert>
          <Shield className="size-4" />
          <AlertTitle>Sending ready</AlertTitle>
          <AlertDescription>
            Provider:{" "}
            {status.mailProvider ||
              (platform.connected ? "platform" : "—")}{" "}
            <Badge variant="secondary" className="ml-2">
              ready
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Platform sending (recommended)
          </CardTitle>
          <CardDescription>
            Uses Resend on a verified domain — thousands/day when you upgrade the
            plan. Not capped by Gmail&apos;s ~100 Apps Script / personal SMTP
            limits. Professors reply to {platform.replyTo || "your account email"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {!platform.configured && (
            <Alert>
              <AlertTitle>Operator setup needed</AlertTitle>
              <AlertDescription>
                Add <code>RESEND_API_KEY</code> and <code>RESEND_FROM</code>{" "}
                (verified domain) on Vercel. Free Resend tier works for testing;
                paid/SES later for real volume.
              </AlertDescription>
            </Alert>
          )}
          {platform.fromHint && (
            <p className="text-xs text-muted-foreground">
              From: {platform.fromHint} · Reply-To: your login email
            </p>
          )}
          {platform.connected ? (
            <Button
              variant="outline"
              onClick={() => enablePlatform(false)}
              disabled={busy !== null}
            >
              {busy === "platform" ? <Spinner data-icon="inline-start" /> : null}
              Disable platform sending
            </Button>
          ) : (
            <Button onClick={() => enablePlatform(true)} disabled={busy !== null}>
              {busy === "platform" ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <Zap data-icon="inline-start" />
              )}
              Enable platform sending
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Gmail OAuth (optional)</CardTitle>
          <CardDescription>
            Sends from your Gmail via API. Family Link often blocks this, and
            personal Gmail still has low daily caps — prefer Platform sending for
            scale.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={connectGmailOAuth}
            disabled={busy !== null}
          >
            {busy === "oauth" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <Mail data-icon="inline-start" />
            )}
            Connect Gmail (OAuth)
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Outlook / Yahoo / school SMTP
          </CardTitle>
          <CardDescription>
            For non-Gmail mailboxes. Gmail App Passwords are no longer reliable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveSmtp} className="flex flex-col gap-4">
            <Field>
              <FieldLabel>Provider</FieldLabel>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={preset}
                onChange={(e) => setPreset(e.target.value)}
              >
                {Object.entries(status.presets || {})
                  .filter(([id]) => id !== "gmail_smtp")
                  .map(([id, p]) => (
                    <option key={id} value={id}>
                      {p.label}
                    </option>
                  ))}
                {!status.presets && (
                  <>
                    <option value="outlook_smtp">Outlook</option>
                    <option value="yahoo_smtp">Yahoo</option>
                    <option value="custom_smtp">Custom SMTP</option>
                  </>
                )}
              </select>
              <FieldDescription>
                {status.presets?.[preset]?.help ||
                  "Use your provider’s SMTP settings."}
              </FieldDescription>
            </Field>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="host">SMTP host</FieldLabel>
                <Input id="host" value={host} onChange={(e) => setHost(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="port">Port</FieldLabel>
                <Input id="port" value={port} onChange={(e) => setPort(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="user">Email / username</FieldLabel>
                <Input
                  id="user"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pass">Password / app password</FieldLabel>
                <Input
                  id="pass"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </FieldGroup>
            <Button type="submit" disabled={busy !== null}>
              {busy === "smtp" ? <Spinner data-icon="inline-start" /> : null}
              Verify & save
            </Button>
          </form>
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
