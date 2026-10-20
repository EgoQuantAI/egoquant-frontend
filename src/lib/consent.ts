// What a person agrees to, in plain words: the account page and the sign-up's last step show the same text. The
// version comes from the backend (/api/account/me consent_version): when the text changes there, the backend
// refuses an old version and the person is asked again.

export type Scope = "ibkr_data" | "trade_check";

export const CONSENT: Record<Scope, { title: string; text: string }> = {
  ibkr_data: {
    title: "Keep my connected IBKR data",
    text:
      "I agree that EgoQuant stores the trades and cash movements I connect from Interactive Brokers (date, symbol, " +
      "side, quantity, price, currency) in my account for up to 180 days, to study how I behave in market falls. " +
      "No account number, IBKR token or uploaded file is stored. EgoQuant is read-only: it never trades for me and never asks for or stores my IBKR username or password. I can delete all of it here at any time.",
  },
  trade_check: {
    title: "Keep my trade checks",
    text:
      "I agree that EgoQuant stores the trades I ask it to check, its verdicts and my own decisions in my account " +
      "for up to 180 days. Nothing is bought or sold for me, and EgoQuant never asks for or stores my IBKR username or password. I can delete all of it here at any time.",
  },
};

export const SCOPES = Object.keys(CONSENT) as Scope[];
