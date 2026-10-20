"use client";

import "./globals.css";

// The last resort: the root layout itself failed, so this page brings its own <html> and <body>. Same calm wording as
// error.tsx; a plain link (not next/link) because the router may be what broke.
export default function GlobalError({ error, retry, reset }: { error: unknown; retry?: () => void; reset?: () => void }) {
  const again = retry ?? reset;
  void error;
  return (
    <html lang="en">
      <head><title>Something went wrong | EgoQuant</title></head>
      <body>
        <main className="flex min-h-screen flex-col justify-center bg-white px-6 py-16 md:px-20">
          <div className="max-w-2xl">
            <p className="text-2xl text-zinc-500">EgoQuant</p>
            <h1 className="mt-8 text-4xl leading-[1.1] text-zinc-900 md:text-5xl">Something went wrong on our side.</h1>
            <div className="my-8 h-px bg-zinc-300" />
            <p className="text-base leading-relaxed text-zinc-600">
              The app could not be shown. Nothing you saved was lost. Please try again.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
              {again && (
                <button type="button" onClick={() => again()}
                        className="border-2 border-zinc-900 bg-zinc-900 px-8 py-3 text-sm font-semibold uppercase tracking-widest text-white">
                  Try again
                </button>
              )}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" className="text-sm font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-900">
                Go to the home page
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
