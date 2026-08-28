"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { FileUp, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { OUTREACH_REGIONS } from "@/lib/regions";
import { cn } from "@/lib/utils";

type AttachmentRow = {
  id: string;
  label: string;
  kind: string;
  fileName: string;
  mimeType: string;
  attachMode: string;
  ruleHint: string | null;
  detectedDocType: string | null;
  textExcerpt: string | null;
};

type FormState = {
  displayName: string;
  headline: string;
  school: string;
  schoolLocation: string;
  gradeOrYear: string;
  location: string;
  phone: string;
  githubUrl: string;
  linkedinUrl: string;
  personalSite: string;
  socialsText: string;
  researchInterests: string;
  availabilityNotes: string;
  workModePref: string;
  maxMilesInPerson: string;
  maxMilesHybrid: string;
  tonePreference: string;
  writingStyleNotes: string;
  customRules: string;
  targetRegions: string[];
  achievementsText: string;
  projectsText: string;
  skillsLanguages: string;
  skillsFrameworks: string;
  skillsExpertise: string;
  attachCvToEmails: boolean;
  credentialDocType: string;
};

function linesToObjects(text: string, kind: "achievement" | "project") {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [head, ...rest] = line.split(" — ");
      const detail = rest.join(" — ").trim();
      if (kind === "achievement") {
        return { title: head.trim(), detail: detail || head.trim() };
      }
      return { name: head.trim(), details: detail || head.trim() };
    });
}

function objectsToLines(
  items: Array<Record<string, unknown>> | undefined,
  kind: "achievement" | "project"
) {
  if (!items?.length) return "";
  return items
    .map((item) => {
      if (kind === "achievement") {
        const title = String(item.title || item.name || "");
        const detail = String(item.detail || "");
        return detail && detail !== title ? `${title} — ${detail}` : title;
      }
      const name = String(item.name || "");
      const details = String(item.details || item.detail || "");
      return details && details !== name ? `${name} — ${details}` : name;
    })
    .filter(Boolean)
    .join("\n");
}

const emptyForm: FormState = {
  displayName: "",
  headline: "",
  school: "",
  schoolLocation: "",
  gradeOrYear: "",
  location: "",
  phone: "",
  githubUrl: "",
  linkedinUrl: "",
  personalSite: "",
  socialsText: "",
  researchInterests: "",
  availabilityNotes: "",
  workModePref: "remote",
  maxMilesInPerson: "25",
  maxMilesHybrid: "60",
  tonePreference: "warm_professional",
  writingStyleNotes: "",
  customRules: "",
  targetRegions: ["us_west", "remote_first"],
  achievementsText: "",
  projectsText: "",
  skillsLanguages: "",
  skillsFrameworks: "",
  skillsExpertise: "",
  attachCvToEmails: true,
  credentialDocType: "unknown",
};

export default function ProfilePage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cvBusy, setCvBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [hasCvFile, setHasCvFile] = useState(false);
  const [cvPreview, setCvPreview] = useState("");
  const [brief, setBrief] = useState("");
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);

  const set =
    (key: keyof FormState) =>
    (value: string | boolean | string[]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [res, attRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/profile/attachments"),
      ]);
      if (!res.ok) throw new Error("Could not load profile");
      const data = await res.json();
      const p = data.profile || {};
      const skills = (p.skills || {}) as {
        languages?: string[];
        frameworks?: string[];
        expertise?: string[];
      };
      const socials = (p.socials || []) as Array<{ label?: string; url?: string }>;
      setEmail(data.user?.email || "");
      setCvFileName(p.cvFileName || null);
      setHasCvFile(!!p.hasCvFile);
      setCvPreview(p.cvText ? String(p.cvText).slice(0, 800) : "");
      setBrief(p.profileBrief || "");
      if (attRes.ok) {
        const attData = await attRes.json();
        setAttachments(attData.attachments || []);
      }
      setForm({
        displayName: p.displayName || data.user?.name || "",
        headline: p.headline || "",
        school: p.school || "",
        schoolLocation: p.schoolLocation || "",
        gradeOrYear: p.gradeOrYear || "",
        location: p.location || "",
        phone: p.phone || "",
        githubUrl: p.githubUrl || "",
        linkedinUrl: p.linkedinUrl || "",
        personalSite: p.personalSite || "",
        socialsText: socials
          .filter((s) => s.label && s.url)
          .map((s) => `${s.label} | ${s.url}`)
          .join("\n"),
        researchInterests: p.researchInterests || "",
        availabilityNotes: p.availabilityNotes || "",
        workModePref: p.workModePref || "remote",
        maxMilesInPerson: String(p.maxMilesInPerson ?? 25),
        maxMilesHybrid: String(p.maxMilesHybrid ?? 60),
        tonePreference: p.tonePreference || "warm_professional",
        writingStyleNotes: p.writingStyleNotes || "",
        customRules: p.customRules || "",
        targetRegions: p.targetRegions?.length
          ? p.targetRegions
          : ["us_west", "remote_first"],
        achievementsText: objectsToLines(p.achievements, "achievement"),
        projectsText: objectsToLines(p.projects, "project"),
        skillsLanguages: (skills.languages || []).join(", "),
        skillsFrameworks: (skills.frameworks || []).join(", "),
        skillsExpertise: (skills.expertise || []).join(", "),
        attachCvToEmails: p.attachCvToEmails !== false,
        credentialDocType: p.credentialDocType || "unknown",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        displayName: form.displayName,
        headline: form.headline,
        school: form.school,
        schoolLocation: form.schoolLocation,
        gradeOrYear: form.gradeOrYear,
        location: form.location,
        phone: form.phone,
        githubUrl: form.githubUrl,
        linkedinUrl: form.linkedinUrl,
        personalSite: form.personalSite,
        socials: form.socialsText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line) => {
            const [label, ...rest] = line.split("|");
            return {
              label: (label || "").trim(),
              url: rest.join("|").trim(),
            };
          })
          .filter((s) => s.label && s.url),
        researchInterests: form.researchInterests,
        availabilityNotes: form.availabilityNotes,
        workModePref: form.workModePref,
        maxMilesInPerson: Number(form.maxMilesInPerson) || 25,
        maxMilesHybrid: Number(form.maxMilesHybrid) || 60,
        tonePreference: form.tonePreference,
        writingStyleNotes: form.writingStyleNotes,
        customRules: form.customRules,
        targetRegions: form.targetRegions,
        attachCvToEmails: form.attachCvToEmails,
        achievements: linesToObjects(form.achievementsText, "achievement"),
        projects: linesToObjects(form.projectsText, "project"),
        skills: {
          languages: form.skillsLanguages
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          frameworks: form.skillsFrameworks
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          expertise: form.skillsExpertise
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      };
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Profile saved — drafts will use this");
      setBrief(data.bundle?.profile?.profileBrief || brief);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    setCvBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/profile/attachments", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const detected = data.detectedDocType || "unknown";
      if (data.warning) {
        toast.message(`Saved file, but text extract had issues: ${data.warning}`);
      } else {
        toast.success(
          detected === "resume" || detected === "cv"
            ? `Uploaded — detected as ${detected.toUpperCase()}`
            : `Uploaded ${file.name}`
        );
      }
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setCvBusy(false);
    }
  }

  async function patchAttachment(
    id: string,
    patch: Partial<Pick<AttachmentRow, "label" | "kind" | "attachMode" | "ruleHint">>
  ) {
    const res = await fetch("/api/profile/attachments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error || "Could not update file");
      return;
    }
    await load();
  }

  async function removeAttachment(id: string) {
    if (!confirm("Remove this file?")) return;
    setCvBusy(true);
    try {
      const res = await fetch(
        `/api/profile/attachments?id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Could not remove file");
      toast.success("File removed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setCvBusy(false);
    }
  }

  async function removeCv() {
    if (!confirm("Remove primary CV/resume from your profile?")) return;
    setCvBusy(true);
    try {
      const res = await fetch("/api/profile/cv", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not remove CV");
      toast.success("CV/resume removed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setCvBusy(false);
    }
  }

  function toggleRegion(id: string) {
    setForm((f) => ({
      ...f,
      targetRegions: f.targetRegions.includes(id)
        ? f.targetRegions.filter((r) => r !== id)
        : [...f.targetRegions, id],
    }));
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Profile
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything ScholarReach knows about you — edit anytime. This fuels
            every draft.
          </p>
          {email ? (
            <p className="mt-1 text-xs text-muted-foreground">{email}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/onboarding?edit=1"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            Redo interview
          </Link>
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Save profile
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Files & attachments</CardTitle>
          <CardDescription>
            Upload anything — CV, resume, portfolio, transcript, writing sample.
            We detect CV vs resume from the file and attach based on your rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasCvFile || cvFileName ? "secondary" : "outline"}>
              {form.credentialDocType === "resume"
                ? "Primary: Resume"
                : form.credentialDocType === "cv"
                  ? "Primary: CV"
                  : hasCvFile || cvFileName
                    ? `Primary · ${cvFileName || "credentials"}`
                    : "No primary credential"}
            </Badge>
            <Badge variant="outline">{attachments.length} file(s)</Badge>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center hover:bg-muted/50">
            <Upload className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">
              {cvBusy ? "Uploading…" : "Upload any file"}
            </span>
            <span className="text-xs text-muted-foreground">
              PDF, DOCX, TXT, images, etc. · max 8MB each · up to 12 files
            </span>
            <input
              type="file"
              className="hidden"
              disabled={cvBusy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
                e.target.value = "";
              }}
            />
          </label>

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.attachCvToEmails}
              onChange={(e) => set("attachCvToEmails")(e.target.checked)}
              disabled={!hasCvFile && !cvFileName}
            />
            <span>
              Attach primary CV/resume by default
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Emails will say &quot;CV&quot; or &quot;resume&quot; based on what we detected.
              </span>
            </span>
          </label>

          {attachments.length > 0 && (
            <div className="space-y-3">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-border bg-muted/20 p-3 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.fileName}
                        {a.detectedDocType && a.detectedDocType !== "unknown"
                          ? ` · detected ${a.detectedDocType}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={cvBusy}
                      onClick={() => removeAttachment(a.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={a.label}
                      onChange={(e) =>
                        setAttachments((prev) =>
                          prev.map((x) =>
                            x.id === a.id ? { ...x, label: e.target.value } : x
                          )
                        )
                      }
                      onBlur={(e) =>
                        patchAttachment(a.id, { label: e.target.value })
                      }
                      placeholder="Label"
                    />
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={a.attachMode}
                      onChange={(e) =>
                        patchAttachment(a.id, { attachMode: e.target.value })
                      }
                    >
                      <option value="always">Attach always</option>
                      <option value="never">Never attach (context only)</option>
                      <option value="on_rule">Attach when rule matches</option>
                    </select>
                  </div>
                  {a.attachMode === "on_rule" && (
                    <Input
                      value={a.ruleHint || ""}
                      placeholder="When: robotics, computer vision, HCI…"
                      onChange={(e) =>
                        setAttachments((prev) =>
                          prev.map((x) =>
                            x.id === a.id
                              ? { ...x, ruleHint: e.target.value }
                              : x
                          )
                        )
                      }
                      onBlur={(e) =>
                        patchAttachment(a.id, { ruleHint: e.target.value })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {(hasCvFile || cvFileName) && attachments.length === 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={cvBusy}
              onClick={removeCv}
            >
              <Trash2 data-icon="inline-start" />
              Remove primary credential
            </Button>
          )}

          {cvPreview ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Extracted text (preview)
              </p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
                {cvPreview}
                {cvPreview.length >= 800 ? "…" : ""}
              </pre>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Display name</FieldLabel>
            <Input
              value={form.displayName}
              onChange={(e) => set("displayName")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>School</FieldLabel>
            <Input
              value={form.school}
              onChange={(e) => set("school")(e.target.value)}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Headline</FieldLabel>
            <Input
              value={form.headline}
              onChange={(e) => set("headline")(e.target.value)}
              placeholder="Dual-enrollment student · robotics + CV"
            />
          </Field>
          <Field>
            <FieldLabel>Year / status</FieldLabel>
            <Input
              value={form.gradeOrYear}
              onChange={(e) => set("gradeOrYear")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Where you live</FieldLabel>
            <Input
              value={form.location}
              onChange={(e) => set("location")(e.target.value)}
              placeholder="Folsom, CA"
            />
          </Field>
          <Field>
            <FieldLabel>School / campus location</FieldLabel>
            <Input
              value={form.schoolLocation}
              onChange={(e) => set("schoolLocation")(e.target.value)}
              placeholder="City of campus if different"
            />
          </Field>
          <Field>
            <FieldLabel>Phone</FieldLabel>
            <Input
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>GitHub</FieldLabel>
            <Input
              value={form.githubUrl}
              onChange={(e) => set("githubUrl")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>LinkedIn</FieldLabel>
            <Input
              value={form.linkedinUrl}
              onChange={(e) => set("linkedinUrl")(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Personal site</FieldLabel>
            <Input
              value={form.personalSite}
              onChange={(e) => set("personalSite")(e.target.value)}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel>Other socials / links</FieldLabel>
            <Textarea
              value={form.socialsText}
              onChange={(e) => set("socialsText")(e.target.value)}
              rows={3}
              placeholder={"Google Scholar | https://scholar.google.com/…\nTwitter | https://x.com/…\nDiscord | handle"}
            />
            <FieldDescription>
              One per line: Label | URL (or handle)
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Research & availability
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>Research interests</FieldLabel>
            <Textarea
              value={form.researchInterests}
              onChange={(e) => set("researchInterests")(e.target.value)}
              rows={3}
              placeholder="Robot learning, perception, embedded systems…"
            />
          </Field>
          <Field>
            <FieldLabel>Availability notes</FieldLabel>
            <Textarea
              value={form.availabilityNotes}
              onChange={(e) => set("availabilityNotes")(e.target.value)}
              rows={2}
              placeholder="~10 hrs/week · Fall term"
            />
          </Field>
          <Field>
            <FieldLabel>Work mode</FieldLabel>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.workModePref}
              onChange={(e) => set("workModePref")(e.target.value)}
            >
              <option value="remote">Strictly remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="in_person">In person</option>
              <option value="flexible">Flexible</option>
              <option value="location_based">
                Based on distance from where I live
              </option>
            </select>
          </Field>
          {form.workModePref === "location_based" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Max miles for in-person</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={form.maxMilesInPerson}
                  onChange={(e) => set("maxMilesInPerson")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Max miles for hybrid</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={form.maxMilesHybrid}
                  onChange={(e) => set("maxMilesHybrid")(e.target.value)}
                />
              </Field>
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Drafts use your home location vs the professor&apos;s university.
                If distance is unclear or far, emails default to remote.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Tone & custom rules
          </CardTitle>
          <CardDescription>
            How every email should sound — plus hard rules the writer must
            follow.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>Tone</FieldLabel>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.tonePreference}
              onChange={(e) => set("tonePreference")(e.target.value)}
            >
              <option value="warm_professional">Warm professional</option>
              <option value="concise">Concise</option>
              <option value="formal">Formal academic</option>
              <option value="enthusiastic">Enthusiastic</option>
            </select>
          </Field>
          <Field>
            <FieldLabel>Writing style notes</FieldLabel>
            <Textarea
              value={form.writingStyleNotes}
              onChange={(e) => set("writingStyleNotes")(e.target.value)}
              rows={3}
              placeholder="Short paragraphs, specific bullets, no fluff, sign off as Taksh…"
            />
          </Field>
          <Field>
            <FieldLabel>Custom rules (must follow)</FieldLabel>
            <Textarea
              value={form.customRules}
              onChange={(e) => set("customRules")(e.target.value)}
              rows={5}
              placeholder={`Examples:\n• Always say “strictly remote volunteer”\n• Never mention GPA\n• Always ask for a 10–15 min Zoom\n• attach "Portfolio" when robotics or computer vision\n• attach "Transcript" if they ask about coursework`}
            />
            <FieldDescription>
              Hard constraints for every draft. Use{" "}
              <code className="text-[11px]">attach &quot;Label&quot; when …</code>{" "}
              to auto-attach files for matching professors.
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            What it knows about you
          </CardTitle>
          <CardDescription>
            Edit freely. One item per line. Optional detail after an em dash.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field>
            <FieldLabel>Achievements</FieldLabel>
            <Textarea
              value={form.achievementsText}
              onChange={(e) => set("achievementsText")(e.target.value)}
              rows={5}
              placeholder="VEX Worlds — Lead Programmer&#10;4.0 GPA across 34 college units"
            />
          </Field>
          <Field>
            <FieldLabel>Projects</FieldLabel>
            <Textarea
              value={form.projectsText}
              onChange={(e) => set("projectsText")(e.target.value)}
              rows={5}
              placeholder="CARLA anomaly detection — USC AIEA Lab&#10;DissolvaGum — FastAPI dashboards"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel>Languages</FieldLabel>
              <Input
                value={form.skillsLanguages}
                onChange={(e) => set("skillsLanguages")(e.target.value)}
                placeholder="Python, C++"
              />
            </Field>
            <Field>
              <FieldLabel>Frameworks / tools</FieldLabel>
              <Input
                value={form.skillsFrameworks}
                onChange={(e) => set("skillsFrameworks")(e.target.value)}
                placeholder="FastAPI, CARLA"
              />
            </Field>
            <Field>
              <FieldLabel>Expertise</FieldLabel>
              <Input
                value={form.skillsExpertise}
                onChange={(e) => set("skillsExpertise")(e.target.value)}
                placeholder="CV, localization"
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Target regions</CardTitle>
          <CardDescription>
            Used when mining faculty leads for your directory.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {OUTREACH_REGIONS.map((r) => {
            const on = form.targetRegions.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRegion(r.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-left text-xs transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                <span className="font-medium">{r.label}</span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">
            Compiled brief (read-only)
          </CardTitle>
          <CardDescription>
            Auto-built from your fields and fed into the email writer. Updates
            when you save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {brief ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/20 p-4 text-xs leading-relaxed">
              {brief}
            </pre>
          ) : (
            <Alert>
              <FileUp className="size-4" />
              <AlertTitle>Nothing compiled yet</AlertTitle>
              <AlertDescription>
                Fill in the fields above (or upload a CV) and hit Save.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Approval automation lives in{" "}
          <Link href="/settings" className="underline underline-offset-2">
            Settings
          </Link>
          .
        </p>
        <Button size="lg" onClick={save} disabled={busy}>
          {busy ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          Save profile
        </Button>
      </div>
    </div>
  );
}
