"use client";

import { useActionState, useMemo, useState } from "react";
import { parseResumeText } from "@/lib/resume-parser";
import { saveResume, type FormState } from "../actions";

export function ResumeForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveResume, { error: null });
  const [text, setText] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);

  // Same parser the server runs on save, so the preview is what gets stored.
  const preview = useMemo(() => (text.trim().length >= 100 ? parseResumeText(text) : null), [text]);

  async function handleFile(file: File | undefined) {
    setFileNote(null);
    if (!file) return;
    const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
    if (!isText) {
      setFileNote("PDF and Word files aren't supported yet. Open the file, select all, copy, and paste the text below.");
      return;
    }
    setText(await file.text());
    setFileNote(`Loaded ${file.name}. Check the preview, then save.`);
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <label htmlFor="resume-file" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Upload a .txt file
        </label>
        <input
          id="resume-file"
          type="file"
          accept=".txt,.md,text/plain"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="mt-2 block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:text-zinc-400 dark:file:bg-zinc-800 dark:file:text-zinc-100"
        />
        {fileNote && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{fileNote}</p>}

        <label htmlFor="resume-text" className="mt-6 block text-sm font-medium text-zinc-800 dark:text-zinc-200">
          Or paste your resume
        </label>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Keep headings like &ldquo;Skills&rdquo; and &ldquo;Experience&rdquo; on their own lines.
        </p>
        <textarea
          id="resume-text"
          name="resume_text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={14}
          maxLength={50_000}
          className="mt-2 w-full resize-y rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-950 outline-none focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300"
        />
      </div>

      {preview && <Preview content={preview} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || !preview}
          className="rounded-lg bg-zinc-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
        >
          {pending ? "Saving…" : "Save resume"}
        </button>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Only your skills and role highlights are ever sent to the AI. Contact details stay in your account.
        </p>
      </div>
    </form>
  );
}

function Preview({ content }: { content: ReturnType<typeof parseResumeText> }) {
  return (
    <section aria-live="polite" className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <h2 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">What Matchie found</h2>

      <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Skills ({content.skills.length})
      </h3>
      {content.skills.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {content.skills.map((skill) => (
            <li key={skill} className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {skill}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">No Skills section found.</p>
      )}

      <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Experience ({content.experience.length})
      </h3>
      {content.experience.length ? (
        <ul className="mt-2 flex flex-col gap-3">
          {content.experience.map((role, i) => (
            <li key={`${role.title}-${i}`} className="text-sm">
              <p className="font-medium text-zinc-950 dark:text-zinc-50">
                {role.title}
                {role.company && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {role.company}</span>}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {role.start ?? "?"} to {role.end ?? "present"} · {role.highlights.length} highlight{role.highlights.length === 1 ? "" : "s"}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">No Experience section found.</p>
      )}
    </section>
  );
}
