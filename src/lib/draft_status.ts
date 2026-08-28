/**
 * Draft.status values that still need human approval.
 * Older rows used "pending_review" on status (that belongs on reviewStatus).
 */
export const PENDING_APPROVAL_STATUSES = ["pending", "pending_review"] as const;

export type PendingApprovalStatus = (typeof PENDING_APPROVAL_STATUSES)[number];

export function isPendingApprovalStatus(status: string | null | undefined) {
  return !!status && (PENDING_APPROVAL_STATUSES as readonly string[]).includes(status);
}
