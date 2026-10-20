// One-question-per-screen flows (questionnaire, investments) replace the whole screen after every answer, which would
// drop a keyboard or screen-reader user's focus back to the top of the page. Passed as a ref, this puts focus on the
// new question's text when the screen appears, so the next Tab reaches its first option. A module-level function
// keeps one identity, so React calls it only when the element mounts, never on a later re-render.
export function focusOnMount(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
}
