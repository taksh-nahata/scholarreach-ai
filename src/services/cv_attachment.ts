/**
 * Load CV bytes for attaching to outbound mail.
 */
import { prisma } from "@/lib/prisma";
import { hasUploadedCv } from "@/services/email_format";

export type CvAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

export async function getCvAttachmentForUser(
  userId: string
): Promise<CvAttachment | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
  });
  if (!profile || !hasUploadedCv(profile)) return null;
  if (profile.attachCvToEmails === false) return null;
  if (!profile.cvFileData) return null;

  return {
    filename: profile.cvFileName || "CV.pdf",
    mimeType: profile.cvMimeType || "application/pdf",
    contentBase64: profile.cvFileData,
  };
}
