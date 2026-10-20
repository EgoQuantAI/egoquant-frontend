/** The assistant's first line in a chat. The name is only ever shown by the page (it comes from sign-up); it is never sent
 *  to the model: the greeting is not part of the conversation that goes to /chat. */
export function advisorGreeting(firstName: string | null): string {
  const name = firstName?.trim();
  return `Hi${name ? ` ${name}` : ""}, I'm Ego, your EgoQuant advisor. Ask me about your portfolio, a what-if, or a trade you are thinking about.`;
}
