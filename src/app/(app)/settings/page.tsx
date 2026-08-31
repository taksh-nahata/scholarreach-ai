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
  followUpEnabled: boolean;
  followUpAfterDays: number;
  followUpMaxCount: number;
  autopilotEnabled: boolean;
  autopilotMineWhenBelow: number;
  autopilotMineCount: number;
  autopilotMinFit: number;
  autopilotMaxDraftsPerRun: number;
};

function SuppressionPanel() {
  const [items, setItems] = useState<
    Array<{ id: string; email: string; reason: string | null }>
  >([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/suppressions");
    if (!res.ok) return;
    const data = await res.json();
    setItems(data.items || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function add() {
    setBusy(true);
    try {
      const res = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason: "Manual" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setEmail("");
      toast.success("Added to do-not-contact");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(addr: string) {
    const res = await fetch(
      `/api/suppressions?email=${encodeURIComponent(addr)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast.error("Could not remove");
      return;
    }
    toast.success("Removed");
    await load();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Input
          type="email"
          placeholder="professor@university.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button onClick={add} disabled={busy || !email.includes("@")}>
          Suppress
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No suppressed emails yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((i) => (
            <li
              key={i.id}
              className="flex items-center justify-between gap-2 rounded-md border px-2 py-1.5"
            >
              <span className="truncate">
                {i.email}
                {i.reason ? (
                  <span className="text-muted-foreground"> · {i.reason}</span>
                ) : null}
              </span>
              <Button size="xs" variant="ghost" onClick={() => remove(i.email)}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsState>({
    autoApproveMode: "manual",
    autoApproveMinApprovals: 5,
    followUpEnabled: true,
    followUpAfterDays: 7,
    followUpMaxCount: 1,
    autopilotEnabled: false,
    autopilotMineWhenBelow: 25,
    autopilotMineCount: 30,
    autopilotMinFit: 50,
    autopilotMaxDraftsPerRun: 30,
  });
  const [autopilotLastRunAt, setAutopilotLastRunAt] = useState<string | null>(
    null
  );
  const [humanApprovals, setHumanApprovals] = useState(0);
  const [pendingFollowUps, setPendingFollowUps] = useState(0);
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
        followUpEnabled: data.settings?.followUpEnabled !== false,
        followUpAfterDays: data.settings?.followUpAfterDays ?? 7,
        followUpMaxCount: data.settings?.followUpMaxCount ?? 1,
        autopilotEnabled: data.settings?.autopilotEnabled === true,
        autopilotMineWhenBelow: data.settings?.autopilotMineWhenBelow ?? 25,
        autopilotMineCount: data.settings?.autopilotMineCount ?? 30,
        autopilotMinFit: data.settings?.autopilotMinFit ?? 50,
        autopilotMaxDraftsPerRun: data.settings?.autopilotMaxDraftsPerRun ?? 30,
      });
      setAutopilotLastRunAt(data.settings?.autopilotLastRunAt || null);
      setHumanApprovals(data.humanApprovals || 0);
      setPendingFollowUps(data.pendingFollowUps || 0);
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

  async function queueFollowUpsNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "queue_followups_now" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const q = data.result?.queued ?? 0;
      toast.success(
        q
          ? `Queued ${q} follow-up${q === 1 ? "" : "s"} for the next send window`
          : "No follow-ups due right now"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runAutopilotNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_autopilot_now" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Autopilot failed");
      const actions = (data.result?.actions || []) as string[];
      toast.success(
        actions.length
          ? `Autopilot: ${actions.join(", ")}`
          : data.result?.reason || "Autopilot finished"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Autopilot failed");
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
          Auto-approve and daily API usage for your workspace.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Daily autopilot</CardTitle>
          <CardDescription>
            Once per day, ScholarReach can mine new leads, resolve emails, draft
            high-fit matches, and auto-queue drafts that pass the agent reviewer.
            Sends still go out Tue–Thu mornings in each professor&apos;s timezone.
            {autopilotLastRunAt ? (
              <>
                {" "}
                Last run: {new Date(autopilotLastRunAt).toLocaleString()}.
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings.autopilotEnabled}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  autopilotEnabled: e.target.checked,
                  autoApproveMode:
                    e.target.checked && s.autoApproveMode === "manual"
                      ? "agent_gate"
                      : s.autoApproveMode,
                }))
              }
            />
            <span>
              <span className="font-medium">Enable daily autopilot</span>
              <span className="mt-1 block text-muted-foreground">
                Requires connected inbox and agent gate (or auto) approval mode.
                Turning this on switches approval to agent gate if you were on
                manual.
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>Mine when ready leads below</FieldLabel>
              <Input
                type="number"
                min={1}
                max={40}
                value={settings.autopilotMineWhenBelow}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autopilotMineWhenBelow: Number(e.target.value) || 25,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>Leads per mine run</FieldLabel>
              <Input
                type="number"
                min={5}
                max={35}
                value={settings.autopilotMineCount}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autopilotMineCount: Number(e.target.value) || 30,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>Minimum fit to draft</FieldLabel>
              <Input
                type="number"
                min={30}
                max={90}
                value={settings.autopilotMinFit}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autopilotMinFit: Number(e.target.value) || 50,
                  }))
                }
              />
            </Field>
            <Field>
              <FieldLabel>Max drafts per day</FieldLabel>
              <Input
                type="number"
                min={1}
                max={35}
                value={settings.autopilotMaxDraftsPerRun}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    autopilotMaxDraftsPerRun: Number(e.target.value) || 30,
                  }))
                }
              />
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Save autopilot
            </Button>
            <Button variant="outline" onClick={runAutopilotNow} disabled={busy}>
              Run autopilot now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Draft approval</CardTitle>
          <CardDescription>
            You have {humanApprovals} human-approved drafts. The Approvals
            &quot;Agent&quot; button only scores drafts — it never queues or
            sends. Auto mode below can queue after the agent reviewer passes.
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
              <option value="manual">Manual — you approve every draft in Approvals</option>
              <option value="agent_gate">
                Agent gate — after you draft, auto-reviewer must pass before queue
              </option>
              <option value="auto">
                Auto-queue — after N human approvals, reviewer can queue without you
              </option>
            </select>
            <FieldDescription>
              Approvals swipe/Agent never sends by itself. Connect Inbox for live
              sends during professor-local Tue–Thu mornings (or Dispatch now).
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
          <CardTitle className="font-display text-xl">Auto follow-ups</CardTitle>
          <CardDescription>
            If a professor hasn&apos;t replied after about a week, ScholarReach
            queues a short follow-up for the next Tue–Thu morning window.
            Pending follow-ups in queue: {pendingFollowUps}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings.followUpEnabled}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  followUpEnabled: e.target.checked,
                }))
              }
            />
            <span>
              Automatically schedule follow-ups
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Cancelled automatically if a reply is detected before send.
              </span>
            </span>
          </label>

          <Field>
            <FieldLabel>Days to wait before follow-up</FieldLabel>
            <Input
              type="number"
              min={3}
              max={21}
              disabled={!settings.followUpEnabled}
              value={settings.followUpAfterDays}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  followUpAfterDays: Number(e.target.value) || 7,
                }))
              }
            />
            <FieldDescription>Default 7. Range 3–21 days.</FieldDescription>
          </Field>

          <Field>
            <FieldLabel>Max follow-ups per professor</FieldLabel>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={!settings.followUpEnabled}
              value={settings.followUpMaxCount}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  followUpMaxCount: Number(e.target.value) || 1,
                }))
              }
            >
              <option value={1}>1 follow-up</option>
              <option value={2}>2 follow-ups</option>
            </select>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button onClick={save} disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Save follow-up settings
            </Button>
            <Button
              variant="outline"
              disabled={busy || !settings.followUpEnabled}
              onClick={queueFollowUpsNow}
            >
              Queue due follow-ups now
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Do-not-contact</CardTitle>
          <CardDescription>
            Suppressed addresses are never sent again (and pending queue items
            are cancelled). Also auto-added when a reply looks like unsubscribe.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <SuppressionPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Today&apos;s API budget
          </CardTitle>
          <CardDescription>
            Daily caps for search and drafting so usage stays fair across
            accounts. Mining prefers cheaper calls first.
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
            <AlertTitle>How mining works</AlertTitle>
            <AlertDescription>
              Faculty mining uses your onboarding regions + research interests.
              Paid search (Tavily/Firecrawl/Exa) is tried when free results are
              thin — if credits run out, it falls back to OpenAlex and free web
              fetch automatically.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
