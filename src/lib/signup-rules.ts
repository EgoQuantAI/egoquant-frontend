// The sign-up rules, shared by the onboarding screens (instant inline messages) and the /api/auth routes (which
// decide). Pure: no server or browser API, so both sides import the same values.

/** This tab's sign-up draft (name and email, never the password): components/welcome/signed-out.tsx. */
export const SIGNUP_DRAFT_KEY = "egoquant.signup";

export const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;   // longer passwords are cut by bcrypt, so refuse them rather than surprise the user

// What a person may be called: letters (any script), spaces, apostrophes, dots and hyphens; 1-40 characters.
export const NAME = /^[\p{L}\p{M}][\p{L}\p{M}'’ .-]{0,39}$/u;
export const tidyName = (raw: string) => raw.normalize("NFC").split(/\s+/).filter(Boolean).join(" ");

/** The first problem with a name, or "" when it is fine. */
export function nameProblem(raw: string): string {
  const name = tidyName(raw);
  if (!name) return "Tell us what to call you.";
  if (name.length > 40) return "Keep it to 40 characters or fewer.";
  if (!NAME.test(name)) return "Use letters only (spaces, hyphens and apostrophes are fine).";
  return "";
}

export function emailProblem(raw: string): string {
  const email = raw.trim();
  if (!email) return "Enter your email address.";
  if (!EMAIL.test(email)) return "That does not look like an email address. Check for a typo.";
  return "";
}

export function passwordProblem(password: string): string {
  if (!password) return "Choose a password.";
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters (${PASSWORD_MIN - password.length} more).`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  if (password.trim() !== password) return "A password cannot start or end with a space.";
  return "";
}
