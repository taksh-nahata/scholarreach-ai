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
  const [preset, setPreset] = useState("gmail_smtp");
  const [host, setHost] = useState("smtp.gmail.com");
  const [port, setPort] = useState("465");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"oauth" | "smtp" | null>(null);

  async function refresh() {
    const res = await fetch("/api/mail/smtp");
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
      if (data.presets?.[preset]) {
        setHost(data.presets[preset].host || host);
        setPort(String(data.presets[preset].port || port));
      }
    }
  }

  useEffect(() => {
    refresh().catch(() => undefined);
    if (params.get("connected")) {
      toast.success(`Connected: ${params.get("connected")}`);
    }
    if (params.get("error")) {
      toast.error(
        `Google connect failed (${params.get("error")}). Try App Password below — Family Link often blocks Gmail API scopes.`
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
      toast.success("Inbox connected");
      setPassword("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "SMTP failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Connect inbox
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gmail, Outlook, Yahoo, or school SMTP. Sending stays off until you connect.
        </p>
      </div>

      {(status.mailConnected || status.gmailConnected) && (
        <Alert>
          <Shield className="size-4" />
          <AlertTitle>Inbox connected</AlertTitle>
          <AlertDescription>
            Provider: {status.mailProvider || "gmail"}{" "}
            <Badge variant="secondary" className="ml-2">
              ready
            </Badge>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Gmail via Google</CardTitle>
          <CardDescription>
            Opens Google consent for send permission. Family Link / supervised
            accounts: if Google blocks this, use App Password below (same method
            other apps use when OAuth scopes are restricted).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={connectGmailOAuth} disabled={busy !== null}>
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
            App password / SMTP
          </CardTitle>
          <CardDescription>
            Works for Gmail (Family Link), Outlook, Yahoo, and custom school mail.
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
                {Object.entries(status.presets || {}).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
                {!status.presets && (
                  <>
                    <option value="gmail_smtp">Gmail (App Password)</option>
                    <option value="outlook_smtp">Outlook</option>
                    <option value="yahoo_smtp">Yahoo</option>
                    <option value="custom_smtp">Custom SMTP</option>
                  </>
                )}
              </select>
              <FieldDescription>
                {status.presets?.[preset]?.help ||
                  "Create an app password in your mail provider’s security settings."}
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
                  placeholder="you@gmail.com"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="pass">App password</FieldLabel>
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
