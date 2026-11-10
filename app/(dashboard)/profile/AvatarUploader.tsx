"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "../Avatar";
import { DemoLocked, DemoLockNote } from "../DemoLock";
import { removeAvatar, uploadAvatar } from "./actions";

const SIZE = 256;

export function AvatarUploader({ initialUrl, name, email, demo = false }: { initialUrl: string | null; name: string; email: string; demo?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    let blob: Blob;
    try {
      blob = await squareResize(file);
    } catch {
      setError("Could not read that image. Try a JPEG or PNG.");
      return;
    }
    const form = new FormData();
    form.set("avatar", new File([blob], `avatar.${blob.type.split("/")[1]}`, { type: blob.type }));
    startTransition(async () => {
      const result = await uploadAvatar(form);
      if (result.ok) setUrl(result.url);
      else setError(result.error);
    });
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending || demo}
        aria-label="Change profile photo"
        className="group pressable relative rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500"
      >
        {/* Gradient ring around the photo. */}
        <span className="bg-accent block rounded-full p-[3px]">
          <span className="block rounded-full bg-white p-[3px] dark:bg-zinc-900">
            <Avatar url={url} name={name} className="size-24 text-4xl sm:size-28" />
          </span>
        </span>
        <span className="absolute inset-[6px] flex items-center justify-center rounded-full bg-black/45 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          {pending ? "Saving…" : "Change"}
        </span>
        {pending && <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-orange-500" />}
      </button>

      <div className="flex min-w-0 flex-col gap-3">
        <div className="min-w-0">
          <p className="font-display truncate text-2xl font-medium">{name}</p>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{email}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <DemoLocked locked={demo}>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={pending || demo} className="btn-primary min-h-11 px-5">
              {url ? "Change photo" : "Upload photo"}
            </button>
          </DemoLocked>
          {url && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await removeAvatar();
                  if (result.ok) setUrl(null);
                  else setError(result.error);
                })
              }
              className="btn-secondary min-h-11 px-5"
            >
              Remove
            </button>
          )}
        </div>
        {demo && <DemoLockNote className="justify-center sm:justify-start" />}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>

      <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
    </div>
  );
}

/**
 * Center-crops to a square and scales to 256px in the browser. Re-encoding
 * drops EXIF metadata (iPhone photos can carry GPS coordinates) and turns a
 * multi-megabyte photo into a few dozen KB. WebP where the browser can
 * encode it; Safari cannot, so it falls back to JPEG.
 */
async function squareResize(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86));
  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}
