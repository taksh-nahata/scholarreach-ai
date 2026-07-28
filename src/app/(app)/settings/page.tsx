"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

type SettingsState = {
  autoApproveMode: "manual" | "agent_gate" | "auto";
  autoApproveMinApprovals: number;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    autoApproveMode: "manual",
    autoApproveMinApprovals: 5,
  });
  const [humanApprovals, setHumanApprovals] = useState(0);
  const [usage, setUsage] = useState<{
    used: Record<string, number>;
    limits: Record<string, number>;
    remaining: Record<string, number>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      const data = await res.json();
      setSettings({
        autoApproveMode: data.settings?.autoApproveMode || "manual",
        autoApproveMinApprovals: data.settings?.autoApproveMinApprovals ?? 5,
      });
      setHumanApprovals(data.humanApprovals || 0);
      setUsage(data.usage || null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Settings saved");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-approve and free-tier search budgets for your workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Draft approval</CardTitle>
          <CardDescription>
            You have {humanApprovals} human-approved drafts. Agent mode reviews
            emails in your voice before queueing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel>Approval mode</FieldLabel>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={settings.autoApproveMode}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  autoApproveMode: e.target.value as SettingsState["autoApproveMode"],
                }))
              }
            >
              <option value="manual">Manual — you approve every draft</option>
              <option value="agent_gate">
                Agent gate — reviewer agent must approve before queue
              </option>
              <option value="auto">
                Auto — after N human approvals, agent can auto-queue
              </option>
            </select>
            <FieldDescription>
              Start on Manual until drafts look like you. Then enable Agent gate
              or Auto.
            </FieldDescription>
          </Field>

          {settings.autoApproveMode === "auto" && (
            <Field>
              <FieldLabel>Human approvals required first</FieldLabel>
              <Input
                type="number"
                min={1}
                max={50}
                value={settings.autoApproveMinApprovals}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autoApproveMinApprovals: Number(e.target.value) || 5,
                  }))
                }
              />
            </Field>
          )}

          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Save approval settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Today&apos;s API budget
          </CardTitle>
          <CardDescription>
            Shared free-tier caps so Exa / Tavily / Firecrawl stay affordable.
            Mining prefers cheaper calls first.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {usage &&
            (["exa", "tavily", "firecrawl", "llm"] as const).map((k) => (
              <div
                key={k}
                className="flex items-center justify-between text-sm"
              >
                <span className="capitalize">{k}</span>
                <Badge variant="secondary">
                  {usage.used[k]}/{usage.limits[k]} · {usage.remaining[k]} left
                </Badge>
              </div>
            ))}
          <Alert className="mt-2">
            <AlertTitle>Commercial free path</AlertTitle>
            <AlertDescription>
              Faculty mining uses your onboarding regions + research interests.
              Exa is only used when Tavily/Firecrawl are thin or email needs a
              check — not on every lead.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
