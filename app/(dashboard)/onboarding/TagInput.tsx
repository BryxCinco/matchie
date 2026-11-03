"use client";

import { useState } from "react";

type TagInputProps = {
  /** Form field name; each tag is submitted as its own value (formData.getAll). */
  name: string;
  label: string;
  hint?: string;
  initial?: string[];
  placeholder?: string;
  max?: number;
};

// Type and press Enter or comma to add. Pasting "React, Go, SQL" adds three.
export function TagInput({ name, label, hint, initial = [], placeholder, max = 50 }: TagInputProps) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const incoming = raw.split(",").map((t) => t.trim()).filter(Boolean);
    if (incoming.length === 0) return;
    setTags((current) => {
      const seen = new Set(current.map((t) => t.toLowerCase()));
      const next = [...current];
      for (const tag of incoming) {
        if (next.length >= max) break;
        if (!seen.has(tag.toLowerCase())) {
          seen.add(tag.toLowerCase());
          next.push(tag.slice(0, 80));
        }
      }
      return next;
    });
    setDraft("");
  }

  function remove(index: number) {
    setTags((current) => current.filter((_, i) => i !== index));
  }

  const inputId = `${name}-input`;

  return (
    <div>
      <label htmlFor={inputId} className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg border border-zinc-300 bg-white p-2 focus-within:border-zinc-950 focus-within:ring-2 focus-within:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:focus-within:border-zinc-300">
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md bg-zinc-100 py-1 pl-2 pr-1 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove ${tag}`}
              className="rounded px-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-50"
            >
              ×
            </button>
            <input type="hidden" name={name} value={tag} />
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          placeholder={tags.length >= max ? `Maximum of ${max}` : placeholder}
          disabled={tags.length >= max}
          onChange={(e) => {
            const value = e.target.value;
            if (value.includes(",")) add(value);
            else setDraft(value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
            } else if (e.key === "Backspace" && !draft && tags.length) {
              remove(tags.length - 1);
            }
          }}
          onBlur={() => add(draft)}
          className="min-w-32 flex-1 bg-transparent px-1 py-1 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 dark:text-zinc-50"
        />
      </div>
    </div>
  );
}
