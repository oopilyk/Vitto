import { describe, expect, it } from 'vitest';
import { NEW_PASSWORD_MIN_LENGTH, passwordErrorMessage } from './auth';

describe('password reset and change messages', () => {
  it('turns Supabase codes into something a person can act on', () => {
    expect(passwordErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'x')).toBe(
      "That isn't your current password.",
    );
    expect(passwordErrorMessage({ code: 'otp_expired', message: 'Token has expired or is invalid' }, 'x')).toBe(
      "That code didn't work. Check it, or send a new one.",
    );
    expect(passwordErrorMessage({ code: 'same_password', message: 'New password should be different from the old password.' }, 'x')).toBe(
      "That's your current password. Choose a new one.",
    );
    expect(passwordErrorMessage({ code: 'weak_password', message: 'Password should be at least 8 characters.' }, 'x')).toContain(
      String(NEW_PASSWORD_MIN_LENGTH),
    );
    expect(passwordErrorMessage({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, 'x')).toMatch(/too many/i);
  });

  it('recognises the wording when a code is missing', () => {
    expect(passwordErrorMessage(new Error('Invalid login credentials'), 'x')).toBe("That isn't your current password.");
    expect(passwordErrorMessage(new Error('Token has expired or is invalid'), 'x')).toMatch(/code didn't work/);
  });

  it('falls back to the general message for anything else', () => {
    expect(passwordErrorMessage(new Error('Something odd'), 'Could not change it.')).toBe('Something odd');
    expect(passwordErrorMessage(null, 'Could not change it.')).toBe('Could not change it.');
  });
});
