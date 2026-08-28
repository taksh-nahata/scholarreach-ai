/**
 * Enrich Taksh profile with research experiences from successful prior outreach,
 * then regenerate pending drafts with professor-aware offer sections.
 *
 * Uses the existing app DB user (taksh.nahata37@gmail.com) — no backdoor.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { updateProfile } from "../src/services/profile_service";
import { generatePersonalizedDraft } from "../src/services/email_personalizer";
import { PENDING_APPROVAL_STATUSES } from "../src/lib/draft_status";
import { prepareEmailBodies } from "../src/services/email_format";

const prisma = new PrismaClient();

const RICH_PROJECTS = [
  {
    name: "Cal Poly BioResource Lab (Dr. Bo Liu)",
    role: "Developer",
    details:
      "Developed full-stack Python solutions using FastAPI to create web control bridges for hardware systems, utilizing the pypylon and VmbPy SDKs to synchronize hyperspectral cameras with motors. Built multi-threaded hardware abstraction and SDK integration for backend data ingestion.",
    tags: [
      "python",
      "fastapi",
      "hardware",
      "cameras",
      "vision",
      "systems",
      "data",
      "pipeline",
      "sdk",
      "sensors",
    ],
  },
  {
    name: "USC AIEA Lab (Prof. Leilani Gilpin)",
    role: "Simulation engineer",
    details:
      "Engineered CARLA autonomous vehicle simulation environments focused on anomaly detection and edge-case failure testing, including physics engine noise modeling to validate AI system reliability and performance.",
    tags: [
      "simulation",
      "carla",
      "autonomous",
      "anomaly",
      "ai",
      "ml",
      "testing",
      "robotics",
      "vision",
    ],
  },
  {
    name: "VEX Robotics Team 20000Z (Technical Difficulties)",
    role: "Lead Programmer and Hardware Designer",
    details:
      "Wrote C++ microcontroller firmware and implemented Monte Carlo localization state estimation using AprilTags. Ranked 12th of 80 teams at the California State Championship with custom autonomous routines and sensor-integrated driver control.",
    tags: [
      "c++",
      "robotics",
      "firmware",
      "hardware",
      "localization",
      "sensors",
      "systems",
      "autonomous",
    ],
  },
  {
    name: "Tech-Steps.org Platform",
    role: "Lead Developer",
    details:
      "Architected and launched a step-by-step technical help platform with generated flashcards, owning end-to-end UI and data flow for users who are not yet comfortable with technical devices.",
    tags: ["web", "javascript", "product", "ui", "python"],
  },
  {
    name: "Data Analysis System",
    role: "Developer",
    details:
      "Designed custom Python classes to ingest and process raw datasets, automate statistical summaries, and generate charts that surface trends.",
    tags: ["python", "data", "analysis", "visualization", "pipeline"],
  },
];

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: "taksh.nahata37@gmail.com" },
  });
  if (!user) throw new Error("Taksh user not found");

  console.log("Enriching profile projects…");
  await updateProfile(user.id, {
    projects: RICH_PROJECTS,
    skills: {
      languages: ["Python", "C++", "JavaScript", "HTML", "CSS"],
      frameworks: ["FastAPI", "CARLA"],
      expertise: [
        "Object-Oriented Programming (OOP)",
        "Robotics Control Systems",
        "Hardware-software integration",
        "Simulation & anomaly testing",
        "Data pipelines",
        "Web Dev",
      ],
    },
    researchInterests:
      "Computer vision, robotics, autonomous systems, hardware-software integration, AI systems infrastructure",
    availabilityNotes:
      "About 10 hours per week this fall (purely volunteer); open to a fuller summer stretch if the project needs it",
    writingStyleNotes:
      "Warm professional. No em dashes. Lead with concrete labs and competition results. Tailor which projects you highlight to the professor.",
  });

  // Pending drafts to rewrite
  const pending = await prisma.draft.findMany({
    where: {
      userId: user.id,
      status: { in: [...PENDING_APPROVAL_STATUSES, "pending", "approved"] },
    },
    select: { id: true, professorId: true, status: true },
  });

  // Scheduled outreach that is not a follow-up — rewrite bodies in place
  const scheduled = await prisma.scheduledEmail.findMany({
    where: {
      userId: user.id,
      status: "scheduled",
      NOT: { kind: "follow_up" },
    },
    select: { id: true, professorId: true, subject: true },
  });

  const professorIds = Array.from(
    new Set(
      [...pending, ...scheduled]
        .map((r) => r.professorId)
        .filter((id): id is string => !!id)
    )
  );

  console.log({
    pendingDrafts: pending.length,
    scheduledOutreach: scheduled.length,
    uniqueProfessors: professorIds.length,
  });

  // Clear pending so generatePersonalizedDraft can create fresh ones
  if (pending.length) {
    await prisma.draft.updateMany({
      where: { id: { in: pending.map((d) => d.id) } },
      data: {
        status: "rejected",
        reviewStatus: "rejected",
        reviewNotes: "superseded: professor-aware offer section 2026-08-03",
      },
    });
  }

  let ok = 0;
  let fail = 0;
  for (const professorId of professorIds) {
    try {
      const result = await generatePersonalizedDraft({
        userId: user.id,
        professorId,
      });
      const draft = result.draft;
      ok += 1;

      // Sync any still-scheduled outreach rows for this professor
      const prepared = prepareEmailBodies(draft.body, {
        willAttach: true,
        docType: "cv",
      });
      await prisma.scheduledEmail.updateMany({
        where: {
          userId: user.id,
          professorId,
          status: "scheduled",
          NOT: { kind: "follow_up" },
        },
        data: {
          subject: draft.subject,
          body: prepared.body,
        },
      });

      console.log(
        `OK ${ok}/${professorIds.length} · ${draft.providerUsed} · score=${result.formatScore}`
      );
    } catch (err) {
      fail += 1;
      console.warn(
        `FAIL ${professorId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log({ rewritten: ok, failed: fail });
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
