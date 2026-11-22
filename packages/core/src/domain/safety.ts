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

/**
 * Reporting one of the pet's AI-written replies (see the migration
 * 20261122120000_ai_reply_reports.sql).
 */
export const REPLY_REPORT_REASONS = ['offensive', 'sexual', 'harmful', 'wrong', 'other'] as const;
export type ReplyReportReason = (typeof REPLY_REPORT_REASONS)[number];

export const REPLY_REPORT_REASON_LABEL: Record<ReplyReportReason, string> = {
  offensive: 'Offensive or hateful',
  sexual: 'Sexual content',
  harmful: 'Harmful or dangerous advice',
  wrong: 'Wrong or made up',
  other: 'Something else',
};
