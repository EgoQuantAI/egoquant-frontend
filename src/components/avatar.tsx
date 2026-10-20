"use client";

import { type ChangeEvent, type ReactNode, useRef, useState } from "react";

// Profile pictures: five built-in marks in the app's own ink (black, white, zinc; square, like every other box
// here), or the person's own photo. A photo is cropped and shrunk to 160 px IN THE BROWSER and sent as a small
// JPEG; the backend accepts only real JPEG/PNG/WebP bytes, never SVG (egoquant/accounts/routes.py, valid_avatar).

export const PRESETS: { id: string; name: string; art: ReactNode }[] = [
  {
    id: "preset:p1", name: "Meridian",
    art: (
      <>
        <rect width="64" height="64" fill="#18181b" />
        <circle cx="32" cy="32" r="17" fill="none" stroke="#fafafa" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="9" fill="none" stroke="#a1a1aa" strokeWidth="1" />
        <line x1="32" y1="8" x2="32" y2="56" stroke="#fafafa" strokeWidth="1.5" />
      </>
    ),
  },
  {
    id: "preset:p2", name: "Eclipse",
    art: (
      <>
        <rect width="64" height="64" fill="#f4f4f5" />
        <circle cx="32" cy="32" r="18" fill="#18181b" />
        <circle cx="40" cy="27" r="15" fill="#f4f4f5" />
        <line x1="10" y1="54" x2="54" y2="54" stroke="#18181b" strokeWidth="1.5" />
      </>
    ),
  },
  {
    id: "preset:p3", name: "Column",
    art: (
      <>
        <rect width="64" height="64" fill="#fafafa" />
        <rect x="12" y="12" width="40" height="3" fill="#18181b" />
        <rect x="12" y="49" width="40" height="3" fill="#18181b" />
        {[16, 23, 30, 37, 44].map((x, i) => (
          <rect key={x} x={x} y="18" width={i === 2 ? 4 : 3} height="28" fill={i % 2 ? "#71717a" : "#18181b"} />
        ))}
      </>
    ),
  },
  {
    id: "preset:p4", name: "Quarters",
    art: (
      <>
        <rect width="64" height="64" fill="#e4e4e7" />
        <path d="M8 32 A24 24 0 0 1 32 8 V32 Z" fill="#18181b" />
        <path d="M56 32 A24 24 0 0 1 32 56 V32 Z" fill="#18181b" />
        <path d="M32 8 A24 24 0 0 1 56 32 H32 Z" fill="#fafafa" />
        <path d="M32 56 A24 24 0 0 1 8 32 H32 Z" fill="#71717a" />
      </>
    ),
  },
  {
    id: "preset:p5", name: "Horizon",
    art: (
      <>
        <rect width="64" height="64" fill="#18181b" />
        <path d="M16 38 A16 16 0 0 1 48 38 Z" fill="#fafafa" />
        <line x1="8" y1="38" x2="56" y2="38" stroke="#fafafa" strokeWidth="1.5" />
        <line x1="14" y1="44" x2="50" y2="44" stroke="#a1a1aa" strokeWidth="1" />
        <line x1="20" y1="49" x2="44" y2="49" stroke="#71717a" strokeWidth="1" />
        <line x1="26" y1="54" x2="38" y2="54" stroke="#52525b" strokeWidth="1" />
      </>
    ),
  },
];

export const DEFAULT_AVATAR = PRESETS[0].id;
const isPhoto = (value: string | null | undefined): value is string =>
  !!value && /^data:image\/(jpeg|png|webp);base64,/.test(value);

/** A picture by value: a preset, the person's photo, or (no value) a neutral blank mark. */
export function Avatar({ value, size = 40, label, className = "" }: {
  value: string | null | undefined; size?: number; label?: string; className?: string;
}) {
  const preset = PRESETS.find((p) => p.id === value);
  const box = `inline-block shrink-0 overflow-hidden border-2 border-zinc-900 bg-white ${className}`;
  if (isPhoto(value)) {
    // eslint-disable-next-line @next/next/no-img-element -- a small data URL; next/image would not help here
    return <img src={value} alt={label ?? "Profile picture"} width={size} height={size}
                className={`${box} object-cover`} style={{ width: size, height: size }} />;
  }
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label ?? preset?.name ?? "No picture"}
         className={box} style={{ width: size, height: size }}>
      {preset ? preset.art : (
        <>
          <rect width="64" height="64" fill="#fafafa" />
          <circle cx="32" cy="25" r="10" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
          <path d="M14 54 C16 41 48 41 50 54" fill="none" stroke="#a1a1aa" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );
}

const SIDE = 160;                    // px; the stored picture is SIDE x SIDE
const MAX_INPUT = 8 * 1024 * 1024;   // refuse huge files before decoding them
const MAX_DATA_URL = 85_000;         // characters; the backend allows up to 64 kB of image bytes

/** Crop the photo to a centred square, shrink it to 160 px and encode it as JPEG, smaller until it fits. */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIDE;
  canvas.height = SIDE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff";                       // transparent PNGs get a white ground, like the page
  ctx.fillRect(0, 0, SIDE, SIDE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIDE, SIDE);
  bitmap.close();
  for (const quality of [0.86, 0.72, 0.58, 0.45]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error("too large");
}

/** Five presets plus "Your photo". `value` is what will be saved. */
export function AvatarPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";                        // the same file can be chosen again
    if (!file) return;
    setError("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError("Use a JPEG, PNG or WebP photo.");
    if (file.size > MAX_INPUT) return setError("That photo is over 8 MB. Choose a smaller one.");
    setBusy(true);
    try {
      onChange(await shrink(file));
    } catch {
      setError("That photo could not be read. Try another one.");
    } finally {
      setBusy(false);
    }
  }

  const photo = isPhoto(value) ? value : null;
  return (
    <div>
      <div role="radiogroup" aria-label="Profile picture" className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={value === p.id} title={p.name}
                  onClick={() => { setError(""); onChange(p.id); }}
                  className={`p-0.5 transition-transform duration-300 hover:-translate-y-0.5 ${
                    value === p.id ? "outline-2 outline-offset-2 outline-zinc-900" : "opacity-70 hover:opacity-100"}`}>
            <Avatar value={p.id} size={44} label={p.name} />
          </button>
        ))}
        <button type="button" role="radio" aria-checked={!!photo} onClick={() => input.current?.click()} disabled={busy}
                title="Upload your own photo"
                className={`p-0.5 transition-transform duration-300 hover:-translate-y-0.5 ${
                  photo ? "outline-2 outline-offset-2 outline-zinc-900" : ""}`}>
          {photo ? <Avatar value={photo} size={44} label="Your photo" /> : (
            <span className="flex h-[44px] w-[44px] items-center justify-center border-2 border-dashed border-zinc-400 text-lg text-zinc-500 hover:border-zinc-900 hover:text-zinc-900">
              {busy ? "…" : "+"}
            </span>
          )}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
      </div>
      <p className={`mt-1 h-4 text-xs normal-case tracking-normal ${error ? "text-red-600" : "text-zinc-400"}`}>
        {error || (photo ? "Your photo, cropped to a square." : `${PRESETS.find((p) => p.id === value)?.name ?? ""} · or upload your own photo`)}
      </p>
    </div>
  );
}

/** The Advisor's own face, so the chat has a person on the other side (Bideci, 20 Oct). An original drawing in the app's
 *  ink (aviator sunglasses, short beard, dark coat and tie); not a photo and not modelled on any real person. */
export function AdvisorAvatar({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="The Advisor"
         className={`inline-block shrink-0 overflow-hidden border-2 border-zinc-900 bg-white ${className}`}
         style={{ width: size, height: size }}>
      <rect width="64" height="64" fill="#f4f4f5" />
      <path d="M1 64 C3 54 13 48 32 47 C51 48 61 54 63 64 Z" fill="#18181b" />
      <path d="M26 47 L32 57 L38 47 Z" fill="#fafafa" />
      <path d="M30.6 47.5 L33.4 47.5 L34.4 57.5 L32 61.5 L29.6 57.5 Z" fill="#52525b" />
      <path d="M23.5 48 L30 60" stroke="#71717a" strokeWidth="1" />
      <path d="M40.5 48 L34 60" stroke="#71717a" strokeWidth="1" />
      <rect x="28" y="38" width="8" height="9.5" fill="#d4d4d8" />
      <ellipse cx="32" cy="27" rx="11" ry="13" fill="#e4e4e7" stroke="#18181b" strokeWidth="1.2" />
      <path d="M20.6 26 C19.5 9.5 44.5 9.5 43.4 26 C42 20.5 38 18.8 32 18.8 C26 18.8 22 20.5 20.6 26 Z" fill="#18181b" />
      <path d="M21.6 30 C22 40.5 28 41.5 32 41.5 C36 41.5 42 40.5 42.4 30 C40 35.5 36 37.5 32 37.5 C28 37.5 24 35.5 21.6 30 Z" fill="#3f3f46" />
      <path d="M22.4 24.6 H30.6 C30.6 28.8 29 31.4 26.5 31.4 C24 31.4 22.4 28.8 22.4 24.6 Z" fill="#18181b" />
      <path d="M33.4 24.6 H41.6 C41.6 28.8 40 31.4 37.5 31.4 C35 31.4 33.4 28.8 33.4 24.6 Z" fill="#18181b" />
      <line x1="30.6" y1="25.6" x2="33.4" y2="25.6" stroke="#18181b" strokeWidth="1" />
      <path d="M24.5 26.5 L26 25.6" stroke="#71717a" strokeWidth="0.8" />
      <path d="M35.5 26.5 L37 25.6" stroke="#71717a" strokeWidth="0.8" />
      <line x1="29.6" y1="36.4" x2="34.4" y2="36.4" stroke="#18181b" strokeWidth="1" />
    </svg>
  );
}
