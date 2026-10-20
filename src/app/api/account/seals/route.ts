import { forwardAccountGet } from "@/lib/anchoring-proxy";

// "My seals": the signed-in user's confirmed reports with their block and transaction.
export const GET = () => forwardAccountGet("/account/seals");
