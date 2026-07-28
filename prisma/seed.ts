/**
 * Seed / migrate existing outreach JSON into ScholarReach AI default user.
 * Reads ../data/outreach_data.json and ../data/professors_directory.json
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { normalizeDedupeKey, toJsonArray } from "../src/lib/utils";

const prisma = new PrismaClient();

const DATA_DIR = path.resolve(__dirname, "../../data");
const DEFAULT_EMAIL = process.env.DEFAULT_USER_EMAIL || "takshnahata37@gmail.com";
const DEFAULT_NAME = process.env.DEFAULT_USER_NAME || "Taksh Nahata";

type DirProf = {
  id?: string;
  name: string;
  title?: string;
  email?: string;
  university: string;
  lab_name?: string;
  research_focus?: string;
  recent_paper?: string;
  location_mode?: string;
  tags?: string[];
};

type DraftRow = {
  id: string;
  professorId?: string;
  subject: string;
  body: string;
  status?: string;
  providerUsed?: string;
  isFallback?: boolean;
  recipientEmail?: string;
  scheduledIso?: string;
  scheduledTime?: string;
};

type SchedRow = {
  id: string;
  professorId?: string;
  professorName?: string;
  to?: string;
  university?: string;
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string;
  scheduledIso?: string;
  scheduledTime?: string;
  status?: string;
  createdAt?: string;
  sentAt?: string;
  lastError?: string;
};

async function main() {
  console.log("[Seed] ScholarReach AI migration starting...");
  console.log(`[Seed] Data dir: ${DATA_DIR}`);

  const outreachPath = path.join(DATA_DIR, "outreach_data.json");
  const directoryPath = path.join(DATA_DIR, "professors_directory.json");
  const contactedPath = path.join(DATA_DIR, "contacted_emails.json");

  if (!fs.existsSync(outreachPath)) {
    throw new Error(`Missing ${outreachPath}`);
  }

  const outreach = JSON.parse(fs.readFileSync(outreachPath, "utf8")) as {
    drafts?: DraftRow[];
    scheduled?: SchedRow[];
  };
  const directory: DirProf[] = fs.existsSync(directoryPath)
    ? JSON.parse(fs.readFileSync(directoryPath, "utf8"))
    : [];
  const contacted: string[] = fs.existsSync(contactedPath)
    ? JSON.parse(fs.readFileSync(contactedPath, "utf8"))
    : [];

  const user = await prisma.user.upsert({
    where: { email: DEFAULT_EMAIL },
    update: { name: DEFAULT_NAME },
    create: {
      email: DEFAULT_EMAIL,
      name: DEFAULT_NAME,
      gmailConnected: false,
    },
  });

  console.log(`[Seed] Default user: ${user.email} (${user.id})`);

  const legacyToId = new Map<string, string>();
  let professorsCreated = 0;
  let professorsSkipped = 0;

  for (const prof of directory) {
    const dedupeKey = normalizeDedupeKey(prof.name, prof.university);
    try {
      const created = await prisma.professor.upsert({
        where: { userId_dedupeKey: { userId: user.id, dedupeKey } },
        update: {
          email: prof.email || undefined,
          title: prof.title || undefined,
          labName: prof.lab_name || undefined,
          researchFocus: prof.research_focus || undefined,
          recentPaper: prof.recent_paper || undefined,
          locationMode: prof.location_mode || "Remote",
          tags: toJsonArray(prof.tags || []),
          legacyId: prof.id || undefined,
        },
        create: {
          userId: user.id,
          legacyId: prof.id || null,
          name: prof.name,
          title: prof.title || null,
          email: prof.email || null,
          university: prof.university,
          labName: prof.lab_name || null,
          researchFocus: prof.research_focus || null,
          recentPaper: prof.recent_paper || null,
          locationMode: prof.location_mode || "Remote",
          tags: toJsonArray(prof.tags || []),
          dedupeKey,
        },
      });
      if (prof.id) legacyToId.set(prof.id, created.id);
      professorsCreated++;
    } catch {
      professorsSkipped++;
    }
  }

  // Also collect professors referenced only in scheduled/drafts
  for (const item of outreach.scheduled || []) {
    if (!item.professorName || !item.university) continue;
    const dedupeKey = normalizeDedupeKey(item.professorName, item.university);
    const existing = await prisma.professor.findUnique({
      where: { userId_dedupeKey: { userId: user.id, dedupeKey } },
    });
    if (existing) {
      if (item.professorId) legacyToId.set(item.professorId, existing.id);
      continue;
    }
    const created = await prisma.professor.create({
      data: {
        userId: user.id,
        legacyId: item.professorId || null,
        name: item.professorName,
        email: item.to || null,
        university: item.university,
        dedupeKey,
      },
    });
    if (item.professorId) legacyToId.set(item.professorId, created.id);
    professorsCreated++;
  }

  let draftsCreated = 0;
  for (const d of outreach.drafts || []) {
    const existing = await prisma.draft.findFirst({
      where: { userId: user.id, legacyId: d.id },
    });
    if (existing) continue;

    const professorId = d.professorId ? legacyToId.get(d.professorId) : undefined;
    await prisma.draft.create({
      data: {
        userId: user.id,
        legacyId: d.id,
        professorId: professorId || null,
        subject: d.subject,
        body: d.body,
        recipientEmail: d.recipientEmail || null,
        status: d.status || "pending",
        providerUsed: d.providerUsed || null,
        isFallback: !!d.isFallback,
      },
    });
    draftsCreated++;
  }

  let scheduledCreated = 0;
  let sentHistoryCreated = 0;
  for (const s of outreach.scheduled || []) {
    const existing = await prisma.scheduledEmail.findFirst({
      where: { userId: user.id, legacyId: s.id },
    });
    if (existing) continue;

    const professorId = s.professorId ? legacyToId.get(s.professorId) : undefined;
    const scheduledIso = s.scheduledIso ? new Date(s.scheduledIso) : new Date();
    const status = s.status || "scheduled";

    await prisma.scheduledEmail.create({
      data: {
        userId: user.id,
        legacyId: s.id,
        professorId: professorId || null,
        professorName: s.professorName || null,
        university: s.university || null,
        toEmail: (s.to || "").toLowerCase(),
        ccEmails: s.cc || null,
        subject: s.subject,
        body: s.body,
        htmlBody: s.htmlBody || null,
        scheduledIso,
        scheduledTime: s.scheduledTime || null,
        status,
        sentAt: s.sentAt ? new Date(s.sentAt) : status === "sent" ? scheduledIso : null,
        lastError: s.lastError || null,
        createdAt: s.createdAt ? new Date(s.createdAt) : undefined,
      },
    });
    scheduledCreated++;

    if (status === "sent" && s.to) {
      await prisma.sentHistory.create({
        data: {
          userId: user.id,
          toEmail: s.to.toLowerCase(),
          professorName: s.professorName || null,
          university: s.university || null,
          subject: s.subject,
          sentAt: s.sentAt ? new Date(s.sentAt) : scheduledIso,
        },
      });
      sentHistoryCreated++;
    }
  }

  for (const email of contacted) {
    const clean = email.toLowerCase().trim();
    const exists = await prisma.sentHistory.findFirst({
      where: { userId: user.id, toEmail: clean },
    });
    if (!exists) {
      await prisma.sentHistory.create({
        data: {
          userId: user.id,
          toEmail: clean,
          subject: "(legacy contacted)",
        },
      });
      sentHistoryCreated++;
    }
  }

  const summary = {
    user: user.email,
    professors: await prisma.professor.count({ where: { userId: user.id } }),
    drafts: await prisma.draft.count({ where: { userId: user.id } }),
    scheduled: await prisma.scheduledEmail.count({
      where: { userId: user.id, status: "scheduled" },
    }),
    sent: await prisma.scheduledEmail.count({
      where: { userId: user.id, status: "sent" },
    }),
    sentHistory: await prisma.sentHistory.count({ where: { userId: user.id } }),
    thisRun: {
      professorsCreated,
      professorsSkipped,
      draftsCreated,
      scheduledCreated,
      sentHistoryCreated,
    },
  };

  console.log("[Seed] Migration complete:");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error("[Seed] FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
