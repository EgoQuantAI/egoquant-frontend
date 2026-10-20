// Readable sentences for the HTTP statuses a person can run into. One place, used by every client-side call to our
// /api routes (callApi, account-api, the advisor chat), so the same problem is always worded the same way.

const TOO_LARGE = "That request was too large to send. If you attached an IBKR file, try a shorter period or a smaller file.";
const RATE_LIMIT = "Too many requests in a short time. Please wait a minute and try again.";
const TIMEOUT = "The server took too long to answer. Please try again; building a report can take up to two minutes.";
const BUILD_HINT = "If you chose many interest areas, try again with up to 8.";
const SIGNED_OUT = "You were signed out. Please log in again.";

/** "Please try again in 20 seconds." from a Retry-After header in seconds; null when there is none. */
function retryIn(retryAfter: string | null | undefined): string | null {
  const seconds = Number(retryAfter);
  if (!retryAfter || !Number.isInteger(seconds) || seconds <= 0) return null;
  return seconds < 90 ? `Please try again in ${seconds} seconds.` : `Please try again in about ${Math.ceil(seconds / 60)} minutes.`;
}

/**
 * The message for a status, or null when the backend's own sentence (or the caller's fallback) should be used.
 * 401 is only worded here for calls that need a signed-in user: a wrong password on the login form is a 401 too.
 * `retryAfter`: the answer's Retry-After header; with it a 429 says when to try again, and a 503 adds it to the backend's sentence.
 */
export function statusMessage(status: number, signedInCall = false, retryAfter?: string | null): string | null {
  switch (status) {
    case 411:
    case 413: return TOO_LARGE;
    case 429: {
      const when = retryIn(retryAfter);
      return when ? `Too many requests in a short time. ${when}` : RATE_LIMIT;
    }
    case 504: return TIMEOUT;
    case 401: return signedInCall ? SIGNED_OUT : null;
    default: return null;
  }
}

/** A 503 with Retry-After (the server is busy): the backend's sentence plus when to try again. */
export function busyMessage(status: number, detail: string, retryAfter?: string | null): string {
  const when = status === 503 ? retryIn(retryAfter) : null;
  return when && !detail.includes(when) ? `${detail} ${when}` : detail;
}

/** The sentence for a failed call that came back with no sentence of its own (the status number alone says nothing to a person). */
export function genericFailure(status: number): string {
  if (status === 422) return "The server did not accept that request. Reload the page and try again; if it keeps happening, rebuild your portfolio first.";
  if (status >= 500) return "Something went wrong on our side. Please try again in a moment.";
  return `Request failed (${status}).`;
}

/** True when `cause` is the readable timeout sentence (a 504 from our proxy, or the browser's own timeout, as callApi words it). */
export function isTimeoutMessage(cause: unknown): boolean {
  return cause instanceof Error && cause.message === TIMEOUT;
}

/** The timeout sentence for a portfolio build: the same wording, plus what usually helps. */
export const BUILD_TIMEOUT = `${TIMEOUT} ${BUILD_HINT}`;

/** True for the error fetch raises when AbortSignal.timeout() fired (the browser gave up waiting). */
export function isTimeout(cause: unknown): boolean {
  return typeof cause === "object" && cause !== null && (cause as { name?: unknown }).name === "TimeoutError";
}

/** The text for a failed fetch (nothing came back): a timeout is said to be a timeout, anything else is "could not reach". */
export function networkMessage(cause: unknown, fallback = "Could not reach the server. Please retry."): string {
  return isTimeout(cause) ? TIMEOUT : fallback;
}

/** The text for anything a send/read loop caught: a timeout is worded as one, an Error keeps its own message. */
export function failureMessage(cause: unknown, fallback: string): string {
  if (isTimeout(cause)) return TIMEOUT;
  return plainMessage(cause instanceof Error ? cause.message : fallback);
}

/** The backend's setup errors name environment variables and keys; a person should never read those. */
export function plainMessage(message: string): string {
  return /OPENAI|API[ _]?key|api configuration/i.test(message)
    ? "The advisor is not available right now. The rest of EgoQuant still works."
    : message;
}
