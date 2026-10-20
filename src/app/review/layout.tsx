import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountGate } from "@/components/account-gate";

export const metadata: Metadata = { title: "Review | EgoQuant" };

export default function Layout({ children }: { children: ReactNode }) {
  return <AccountGate>{children}</AccountGate>;
}
