/**
 * ScholarReach AI — Qwen 3.6 Deep Reasoning Faculty Email Verifier
 */
import { ExaClient } from "./exa_client";

export function unscrambleEmail(str: string): string {
  if (!str || typeof str !== "string") return "";
  return str
    .replace(/\[\s*at\s*\]|\(\s*at\s*\)|\s+at\s+/gi, "@")
    .replace(/\[\s*dot\s*\]|\(\s*dot\s*\)|\s+dot\s+/gi, ".")
    .replace(/\s+/g, "")
    .trim();
}

export function isPlaceholderEmail(email: string): boolean {
  if (!email || typeof email !== "string") return true;
  const lower = email.toLowerCase().trim();
  if (!lower.includes("@") || !lower.includes(".")) return true;
  const localPart = lower.split("@")[0] || "";
  const placeholders = [
    "my-last-name",
    "lastname",
    "firstname",
    "firstnamelastname",
    "first.last",
    "your-name",
    "yourname",
    "username",
    "placeholder",
    "example",
    "email",
    "info",
    "contact",
    "admin",
    "support",
    "help",
    "office",
    "department",
  ];
  return placeholders.some((p) => localPart.includes(p));
}

export interface VerifyResult {
  primaryEmail: string;
  ccEmails: string[];
  verified: boolean;
  reasoning: string;
}

export async function verifyFacultyEmail(
  profName: string,
  university: string,
  currentEmail = ""
): Promise<VerifyResult> {
  console.log(`[EmailVerifier] Deep Qwen Audit for: ${profName} (${university})...`);

  const pagesText: string[] = [];
  try {
    const exa = new ExaClient(process.env.EXA_API_KEY || "");
    const query = `"${profName}" "${university}" email contact homepage`;
    const textResult = await exa.searchWeb(query);
    if (textResult && typeof textResult === "string" && textResult.length > 50) {
      pagesText.push(textResult);
    }
  } catch (err) {
    console.warn(
      `[EmailVerifier] Search warning for ${profName}:`,
      err instanceof Error ? err.message : err
    );
  }

  if (pagesText.length === 0) {
    return {
      primaryEmail: currentEmail,
      ccEmails: [],
      verified: false,
      reasoning: "No web text retrieved for deep audit.",
    };
  }

  const combinedText = pagesText.join("\n\n");
  const prompt = `You are an expert academic investigator. Analyze the webpage text below from official faculty directories and personal homepages for ${profName} at ${university}.

Your goal: Discern the EXACT, VERIFIED primary contact email address(es) for ${profName}.

CRITICAL REASONING RULES:
1. UNSCRAMBLE OBFUSCATED EMAILS: Convert any anti-bot obfuscation (e.g. "vondrick at cs dot columbia dot edu") into standard "user@domain.edu".
2. PREFER NAME-BASED EMAILS OVER NUMERIC NETIDS: Always prefer emails containing the professor's last name or first name over short numeric netIDs.
3. DISCERN PROFESSOR vs ASSISTANT: Put assistant emails in "ccEmails".
4. MULTIPLE PROFESSOR EMAILS: primaryEmail = most specific; secondary in ccEmails.
5. REJECT PLACEHOLDERS & INVALID DOMAINS.

Provided Webpage Text:
${combinedText.substring(0, 7000)}

Return ONLY valid JSON:
{
  "valid": true,
  "primaryEmail": "exact primary email",
  "ccEmails": ["assistant_or_secondary_email@domain.edu"],
  "reasoning": "Clear 1-sentence reasoning"
}`;

  try {
    const base = process.env.PROVOCATIVE_BASE_URL;
    const key = process.env.PROVOCATIVE_API_KEY;
    if (!base || !key) {
      return {
        primaryEmail: currentEmail,
        ccEmails: [],
        verified: false,
        reasoning: "LLM API not configured.",
      };
    }

    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.PRIMARY_MODEL || "qwen3.6-35b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    const data = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message: { content: string } }>;
    };
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));

    let content = data.choices?.[0]?.message?.content?.trim() || "";
    if (content.startsWith("```json")) {
      content = content.replace(/```json/g, "").replace(/```/g, "").trim();
    }

    const parsed = JSON.parse(content) as {
      valid?: boolean;
      primaryEmail?: string;
      ccEmails?: string[];
      reasoning?: string;
    };

    if (parsed.valid && parsed.primaryEmail) {
      let primary = unscrambleEmail(parsed.primaryEmail);
      const ccs = (parsed.ccEmails || [])
        .map(unscrambleEmail)
        .filter((e) => e.includes("@") && !isPlaceholderEmail(e));

      if (isPlaceholderEmail(primary)) primary = currentEmail;

      const unscrambledText = unscrambleEmail(combinedText);
      const rawMatches = Array.from(
        new Set(
          unscrambledText.match(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/gi) || []
        )
      );
      const validCandidates = rawMatches.filter((e) => !isPlaceholderEmail(e));
      const lastName = profName
        .replace(/^dr\.\s*/i, "")
        .trim()
        .split(" ")
        .pop()
        ?.toLowerCase();

      if (lastName && lastName.length > 2) {
        const nameMatchingCandidate = validCandidates.find((e) =>
          e.toLowerCase().includes(lastName)
        );
        if (
          nameMatchingCandidate &&
          primary.match(/\d+/) &&
          !primary.toLowerCase().includes(lastName)
        ) {
          console.log(
            `[EmailVerifier] Corrected numeric netID ${primary} -> ${nameMatchingCandidate}`
          );
          primary = nameMatchingCandidate;
        }
      }

      return {
        primaryEmail: primary,
        ccEmails: ccs,
        verified: true,
        reasoning: parsed.reasoning || "",
      };
    }
  } catch (err) {
    console.warn(
      `[EmailVerifier] Qwen audit failed for ${profName}:`,
      err instanceof Error ? err.message : err
    );
  }

  return {
    primaryEmail: currentEmail,
    ccEmails: [],
    verified: false,
    reasoning: "Fallback to current email",
  };
}
