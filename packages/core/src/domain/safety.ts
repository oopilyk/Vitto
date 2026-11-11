/**
 * Reporting and blocking another user (see the migration
 * 20261110120000_report_and_block.sql for what the server enforces).
 */
export const REPORT_REASONS = ['offensive_profile', 'harassment', 'spam', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  offensive_profile: 'Offensive name, bio or pet',
  harassment: 'Harassment or bullying',
  spam: 'Spam',
  other: 'Something else',
};

export interface BlockedUser {
  userId: string;
  /** Their username when blocked; null if they had none. */
  username: string | null;
  blockedAt: string;
}

/** Said after a report goes in, so the person knows it went somewhere. */
export const REPORT_THANKS = 'Thanks for telling us. We review every report within 24 hours.';
