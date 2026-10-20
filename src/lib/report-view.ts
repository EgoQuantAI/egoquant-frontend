import { useSyncExternalStore } from "react";

// The report tab on screen, for the Advisor panel beside it: ReportSections sets it, every question sends it (the chat's
// `view`, one of the backend's fixed ids in chat.py REPORT_VIEWS), so "what does this mean?" is answered about what the
// investor is looking at. Module state: a page shows one report.

export type ReportView = { id: string; title: string };

let current: ReportView | null = null;
const listeners = new Set<() => void>();

export function setReportView(view: ReportView | null) {
  if (current?.id === view?.id) return;
  current = view;
  listeners.forEach((listener) => listener());
}

export const reportView = () => current;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** The tab on screen, re-rendering when it changes (null on the server and when no report is shown). */
export function useReportView(): ReportView | null {
  return useSyncExternalStore(subscribe, reportView, () => null);
}
