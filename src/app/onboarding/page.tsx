"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  FileUp,
  MapPin,
  MessageSquare,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { OUTREACH_REGIONS } from "@/lib/regions";

type Step = "welcome" | "cv" | "interview" | "regions" | "style" | "review";

type ChatMessage = { role: "assistant" | "user"; content: string };

const STEPS: Step[] = ["welcome", "cv", "interview", "regions", "style", "review"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [school, setSchool] = useState("");
  const [headline, setHeadline] = useState("");
  const [cvText, setCvText] = useState("");
  const [cvPreview, setCvPreview] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [answer, setAnswer] = useState("");
  const [regions, setRegions] = useState<string[]>(["us_west", "remote_first"]);
  const [tone, setTone] = useState("warm_professional");
  const [styleNotes, setStyleNotes] = useState("");
  const [workMode, setWorkMode] = useState("remote");
  const [interests, setInterests] = useState("");
  const [availability, setAvailability] = useState("");
  const [achievements, setAchievements] = useState<Array<{ title?: string; detail?: string }>>([]);

  const stepIndex = STEPS.indexOf(step);

  const loadProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (!res.ok) {
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      return;
    }
    const data = await res.json();
    if (data.user?.onboardingComplete) {
      router.replace("/dashboard");
      return;
    }
    const p = data.profile;
    if (!p) return;
    setDisplayName(p.displayName || data.user?.name || "");
    setSchool(p.school || "");
    setHeadline(p.headline || "");
    setRegions(p.targetRegions?.length ? p.targetRegions : ["us_west"]);
    setTone(p.tonePreference || "warm_professional");
    setStyleNotes(p.writingStyleNotes || "");
    setWorkMode(p.workModePref || "remote");
    setInterests(p.researchInterests || "");
    setAvailability(p.availabilityNotes || "");
    setAchievements(p.achievements || []);
    if (p.cvText) setCvPreview(p.cvText.slice(0, 500));
    if (p.onboardingStep && STEPS.includes(p.onboardingStep as Step)) {
      setStep(p.onboardingStep as Step);
    }
  }, [router]);

  useEffect(() => {
    loadProfile().catch(() => undefined);
  }, [loadProfile]);

  useEffect(() => {
    if (step !== "interview") return;
    fetch("/api/onboarding/chat")
      .then((r) => r.json())
      .then((d) => setMessages(d.messages || []))
      .catch(() => undefined);
  }, [step]);

  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / STEPS.length) * 100),
    [stepIndex]
  );

  async function savePartial(extra: Record<string, unknown> = {}) {
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        school,
        headline,
        targetRegions: regions,
        tonePreference: tone,
        writingStyleNotes: styleNotes,
        workModePref: workMode,
        researchInterests: interests,
        availabilityNotes: availability,
        ...extra,
      }),
    });
  }

  async function onUploadFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/cv", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setCvPreview(data.preview || "");
      if (data.extracted?.displayName) setDisplayName(data.extracted.displayName);
      if (data.extracted?.school) setSchool(data.extracted.school);
      if (data.extracted?.headline) setHeadline(data.extracted.headline);
      if (data.extracted?.achievements) setAchievements(data.extracted.achievements);
      if (data.extracted?.researchInterests) {
        setInterests(data.extracted.researchInterests);
      }
      toast.success("Resume parsed into your profile");
      setStep("interview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onPasteCv() {
    if (!cvText.trim()) {
      toast.error("Paste your resume text first");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/profile/cv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Parse failed");
      setCvPreview(data.preview || "");
      if (data.extracted?.displayName) setDisplayName(data.extracted.displayName);
      if (data.extracted?.school) setSchool(data.extracted.school);
      if (data.extracted?.achievements) setAchievements(data.extracted.achievements);
      toast.success("Resume text ingested");
      setStep("interview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendAnswer() {
    if (!answer.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onboarding/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
      setMessages(data.messages || []);
      setAnswer("");
      if (data.complete) {
        toast.success("Interview complete");
        setStep("regions");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chat failed");
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    try {
      await savePartial({ onboardingStep: "done" });
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          profile: {
            displayName,
            school,
            headline,
            targetRegions: regions,
            tonePreference: tone,
            writingStyleNotes: styleNotes,
            workModePref: workMode,
            researchInterests: interests,
            availabilityNotes: availability,
          },
        }),
      });
      if (!res.ok) throw new Error("Could not finish onboarding");
      toast.success("Workspace ready");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  function toggleRegion(id: string) {
    setRegions((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              SR
            </span>
            <span className="font-display text-lg">ScholarReach</span>
          </Link>
          <span className="text-xs text-muted-foreground">{progress}% set up</span>
        </div>

        <div className="mb-8 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {step === "welcome" && (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Step 1 · About you
              </Badge>
              <CardTitle className="font-display text-3xl">
                Build the profile professors actually need to see
              </CardTitle>
              <CardDescription className="text-base">
                Upload a CV, answer a short interview, pick regions, and set your
                writing voice. Every outreach email will use this — not a generic
                template.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="name">Your name</FieldLabel>
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Rivera"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="school">School</FieldLabel>
                  <Input
                    id="school"
                    value={school}
                    onChange={(e) => setSchool(e.target.value)}
                    placeholder="Folsom High School / UC Davis"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="headline">One-line headline</FieldLabel>
                  <Input
                    id="headline"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Dual-enrollment student · robotics + computer vision"
                  />
                </Field>
              </FieldGroup>
              <Button
                size="lg"
                disabled={busy || !displayName.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await savePartial({ onboardingStep: "cv" });
                    setStep("cv");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Continue
                <ArrowRight data-icon="inline-end" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "cv" && (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Step 2 · Resume / CV
              </Badge>
              <CardTitle className="font-display text-3xl">
                Drop your resume — we&apos;ll extract the story
              </CardTitle>
              <CardDescription>
                PDF or plain text. We pull education, awards, projects, and skills
                into your private workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-6 py-10 text-center transition hover:bg-muted">
                <FileUp className="size-8 text-primary" />
                <div className="text-sm font-medium">Upload PDF or .txt</div>
                <div className="text-xs text-muted-foreground">Max 8MB</div>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.txt,.md,application/pdf,text/plain"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUploadFile(f);
                  }}
                />
              </label>

              <Separator />
              <Field>
                <FieldLabel htmlFor="cvtext">Or paste resume text</FieldLabel>
                <Textarea
                  id="cvtext"
                  value={cvText}
                  onChange={(e) => setCvText(e.target.value)}
                  rows={8}
                  placeholder="Paste your CV here…"
                />
              </Field>
              {cvPreview && (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Parsed preview: {cvPreview}…
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={onPasteCv} disabled={busy}>
                  {busy ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
                  Parse pasted text
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    await savePartial({ onboardingStep: "interview" });
                    setStep("interview");
                  }}
                >
                  Skip for now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "interview" && (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Step 3 · Memory interview
              </Badge>
              <CardTitle className="font-display text-3xl">
                Answer a few prompts so we catch what the CV missed
              </CardTitle>
              <CardDescription>
                Short answers are fine. Specifics (team names, placements, mentors)
                make emails much stronger.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto rounded-lg border border-border p-4">
                {messages.map((m, i) => (
                  <div
                    key={`${m.role}-${i}`}
                    className={cn(
                      "max-w-[90%] rounded-lg px-3 py-2 text-sm",
                      m.role === "assistant"
                        ? "self-start bg-muted"
                        : "self-end bg-primary text-primary-foreground"
                    )}
                  >
                    {m.content}
                  </div>
                ))}
                {messages.length === 0 && (
                  <p className="text-sm text-muted-foreground">Loading questions…</p>
                )}
              </div>
              <Field>
                <FieldLabel htmlFor="answer">Your answer</FieldLabel>
                <Textarea
                  id="answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  placeholder="Type naturally — like texting a mentor"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button onClick={sendAnswer} disabled={busy || !answer.trim()}>
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <MessageSquare data-icon="inline-start" />
                  )}
                  Send answer
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    await savePartial({
                      onboardingStep: "regions",
                      interviewComplete: true,
                    });
                    setStep("regions");
                  }}
                >
                  Continue to regions
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "regions" && (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Step 4 · Where to email
              </Badge>
              <CardTitle className="font-display text-3xl">
                Choose outreach regions
              </CardTitle>
              <CardDescription>
                Mining and queue suggestions bias toward these areas. You can change
                this anytime.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {OUTREACH_REGIONS.map((r) => {
                  const on = regions.includes(r.id);
                  return (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => toggleRegion(r.id)}
                      className={cn(
                        "rounded-lg border p-4 text-left transition",
                        on
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{r.label}</div>
                        {on && <Check className="size-4 text-primary" />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{r.blurb}</p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {r.examples.join(" · ")}
                      </p>
                    </button>
                  );
                })}
              </div>
              <Button
                size="lg"
                disabled={!regions.length || busy}
                onClick={async () => {
                  await savePartial({ onboardingStep: "style" });
                  setStep("style");
                }}
              >
                <MapPin data-icon="inline-start" />
                Save regions
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "style" && (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Step 5 · Voice
              </Badge>
              <CardTitle className="font-display text-3xl">
                How should your emails sound?
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { id: "warm_professional", label: "Warm & professional" },
                  { id: "concise", label: "Short & direct" },
                  { id: "formal", label: "Formal academic" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTone(t.id)}
                    className={cn(
                      "rounded-lg border px-3 py-3 text-sm",
                      tone === t.id
                        ? "border-primary bg-primary/5 font-medium"
                        : "border-border"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="style">Style notes</FieldLabel>
                  <Textarea
                    id="style"
                    value={styleNotes}
                    onChange={(e) => setStyleNotes(e.target.value)}
                    placeholder="e.g. Never use em dashes. Mention VEX and Cal Poly early. Keep under 180 words."
                    rows={3}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="interests">Research interests</FieldLabel>
                  <Textarea
                    id="interests"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="Computer vision, robotics, autonomous systems…"
                    rows={2}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="avail">Availability</FieldLabel>
                  <Input
                    id="avail"
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                    placeholder="8–10 hrs/week, evenings OK"
                  />
                </Field>
                <Field>
                  <FieldLabel>Work mode</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {["remote", "hybrid", "in_person", "flexible"].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setWorkMode(m)}
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-xs capitalize",
                          workMode === m
                            ? "border-primary bg-primary/5"
                            : "border-border"
                        )}
                      >
                        {m.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </Field>
              </FieldGroup>
              <Button
                size="lg"
                onClick={async () => {
                  await savePartial({ onboardingStep: "review" });
                  setStep("review");
                }}
              >
                Review profile
              </Button>
            </CardContent>
          </Card>
        )}

        {step === "review" && (
          <Card>
            <CardHeader>
              <Badge variant="secondary" className="w-fit">
                Step 6 · Lock it in
              </Badge>
              <CardTitle className="font-display text-3xl">
                Ready to personalize every draft
              </CardTitle>
              <CardDescription>
                This profile stays private to your workspace and feeds subject lines,
                bullet highlights, and sign-offs.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="rounded-lg border border-border p-4 text-sm">
                <div className="font-display text-xl">{displayName || "Student"}</div>
                <p className="text-muted-foreground">{headline || school}</p>
                <Separator className="my-3" />
                <p>
                  <span className="text-muted-foreground">Regions: </span>
                  {regions
                    .map((id) => OUTREACH_REGIONS.find((r) => r.id === id)?.label || id)
                    .join(", ")}
                </p>
                <p className="mt-1">
                  <span className="text-muted-foreground">Tone: </span>
                  {tone.replace("_", " ")} · {workMode}
                </p>
                {achievements.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-muted-foreground">
                    {achievements.slice(0, 5).map((a, i) => (
                      <li key={i}>{a.title || a.detail}</li>
                    ))}
                  </ul>
                )}
              </div>
              <Button size="lg" onClick={finish} disabled={busy}>
                {busy ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Sparkles data-icon="inline-start" />
                )}
                Finish & open dashboard
              </Button>
              <Link
                href="/dashboard"
                className={cn(buttonVariants({ variant: "ghost" }), "justify-center")}
              >
                Skip and explore (you can finish later)
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
