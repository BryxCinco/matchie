"use client";

import { useRef, useState, useTransition, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ResumeContent } from "@/lib/resume";
import { parseResumeText } from "@/lib/resume-parser";
import { ACCEPTED_RESUME_TYPES, ResumeExtractError, extractResumeText, type ExtractMethod, type ExtractProgress } from "@/lib/resume-extract";
import { saveResumeContent } from "./actions";

type Mode = "view" | "upload" | "review";

const EMPTY: ResumeContent = { contact: { name: null, email: null, phone: null, location: null }, summary: null, skills: [], experience: [] };

/**
 * The resume, on the Profile page: upload (PDF, Word, photo or text), read it
 * in the browser, review and correct what was found, then save. The file is
 * never uploaded; only the reviewed result is saved (see lib/resume-extract.ts).
 */
export function ResumeManager({ saved, updatedLabel }: { saved: ResumeContent | null; updatedLabel: string | null }) {
  const [mode, setMode] = useState<Mode>(saved ? "view" : "upload");
  const [draft, setDraft] = useState<ResumeContent>(saved ?? EMPTY);
  const [rawText, setRawText] = useState("");
  const [method, setMethod] = useState<ExtractMethod | null>(null);

  function review(content: ResumeContent, text: string, how: ExtractMethod | null) {
    setDraft(content);
    setRawText(text);
    setMethod(how);
    setMode("review");
  }

  if (mode === "upload") {
    return <UploadPanel onRead={(text, how) => review(parseResumeText(text), text, how)} onCancel={saved ? () => setMode("view") : undefined} />;
  }
  if (mode === "review") {
    return (
      <ReviewEditor
        initial={draft}
        rawText={rawText}
        method={method}
        onReparse={(text) => review(parseResumeText(text), text, method)}
        onCancel={() => setMode(saved ? "view" : "upload")}
        onSaved={() => setMode("view")}
      />
    );
  }
  return <SavedSummary content={saved!} updatedLabel={updatedLabel} onEdit={() => review(saved!, "", null)} onReplace={() => setMode("upload")} />;
}

// --- 1. Saved resume ------------------------------------------------------------------

function SavedSummary({ content, updatedLabel, onEdit, onReplace }: { content: ResumeContent; updatedLabel: string | null; onEdit: () => void; onReplace: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display truncate text-xl font-medium">{content.contact.name ?? "Your resume"}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {content.skills.length} skills · {content.experience.length} role{content.experience.length === 1 ? "" : "s"}
            {updatedLabel ? ` · updated ${updatedLabel}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onEdit} className="btn-secondary min-h-11 px-5">
            Edit
          </button>
          <button type="button" onClick={onReplace} className="btn-primary min-h-11 px-5">
            Upload new
          </button>
        </div>
      </div>
      {content.skills.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {content.skills.slice(0, 24).map((skill) => (
            <li key={skill} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {skill}
            </li>
          ))}
          {content.skills.length > 24 && <li className="px-1 py-1 text-xs text-zinc-500">+{content.skills.length - 24} more</li>}
        </ul>
      )}
      {content.experience.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {content.experience.slice(0, 4).map((role, i) => (
            <li key={i} className="rounded-2xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <p className="truncate text-sm font-medium">{role.title}</p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {[role.company, [role.start, role.end ?? "present"].filter(Boolean).join(" – ")].filter(Boolean).join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// --- 2. Upload ------------------------------------------------------------------------

function UploadPanel({ onRead, onCancel }: { onRead: (text: string, method: ExtractMethod | null) => void; onCancel?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  async function read(file: File | undefined) {
    if (!file || progress) return;
    setError(null);
    setProgress({ label: "Opening file…", percent: null });
    try {
      const { text, method } = await extractResumeText(file, setProgress);
      if (text.replace(/\s+/g, "").length < 40) {
        setError("Almost no text was found. If it's a photo, try a sharper, well-lit one taken straight on.");
        return;
      }
      onRead(text, method);
    } catch (err) {
      setError(err instanceof ResumeExtractError ? err.message : "Could not read that file. Try a PDF, or paste the text instead.");
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    read(event.dataTransfer.files[0]);
  }

  if (pasting) {
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor="resume-paste" className="text-sm font-medium">
          Paste your resume
        </label>
        <textarea
          id="resume-paste"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          rows={12}
          maxLength={50_000}
          className="field resize-y font-mono text-sm"
          placeholder={"Name\nemail · phone\n\nSkills\nReact, TypeScript…\n\nExperience\nFrontend Developer · Company   Jan 2023 – Present\n• What you did…"}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pasted.trim().length < 40} onClick={() => onRead(pasted, "text")} className="btn-primary min-h-11 px-5">
            Continue to review
          </button>
          <button type="button" onClick={() => setPasting(false)} className="btn-secondary min-h-11 px-5">
            Upload a file instead
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="button"
        tabIndex={0}
        aria-busy={!!progress}
        aria-describedby="resume-upload-hint"
        onClick={() => !progress && inputRef.current?.click()}
        onKeyDown={(e: KeyboardEvent) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), inputRef.current?.click())}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`pressable flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed px-6 py-10 text-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${
          dragging ? "border-orange-500 bg-orange-500/[0.06]" : "border-zinc-300 hover:border-orange-500/60 dark:border-zinc-700"
        }`}
      >
        {progress ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-3" aria-live="polite">
            <span aria-hidden="true" className="size-8 animate-spin rounded-full border-[3px] border-orange-500 border-t-transparent" />
            <p className="text-sm font-medium">{progress.label}</p>
            {progress.percent !== null && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div className="bg-accent h-full rounded-full transition-[width] duration-300" style={{ width: `${progress.percent}%` }} />
              </div>
            )}
          </div>
        ) : (
          <>
            <span className="bg-accent flex size-12 items-center justify-center rounded-2xl text-zinc-950">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
              </svg>
            </span>
            <p className="font-display text-lg font-medium">
              <span className="hidden sm:inline">Drop your resume here, or </span>
              <span className="text-orange-600 dark:text-orange-400">choose a file</span>
            </p>
            <p id="resume-upload-hint" className="text-sm text-zinc-500 dark:text-zinc-400">
              PDF, Word (.docx), photo (JPG, PNG) or text
            </p>
          </>
        )}
      </div>
      <input ref={inputRef} type="file" accept={ACCEPTED_RESUME_TYPES} hidden onChange={(e) => read(e.target.files?.[0])} />

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          <LockIcon />
          Read on your device. The file is never uploaded or sent to the AI.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setPasting(true)} disabled={!!progress} className="btn-secondary min-h-11 px-4">
            Paste text
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} disabled={!!progress} className="btn-secondary min-h-11 px-4">
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- 3. Review and correct ------------------------------------------------------------

type RoleDraft = { title: string; company: string; start: string; end: string; current: boolean; highlights: string };

function toRoleDraft(role: ResumeContent["experience"][number]): RoleDraft {
  return {
    title: role.title,
    company: role.company ?? "",
    start: role.start?.slice(0, 7) ?? "",
    end: role.end?.slice(0, 7) ?? "",
    current: !role.end,
    highlights: role.highlights.join("\n"),
  };
}

function ReviewEditor({
  initial,
  rawText,
  method,
  onReparse,
  onCancel,
  onSaved,
}: {
  initial: ResumeContent;
  rawText: string;
  method: ExtractMethod | null;
  onReparse: (text: string) => void;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const [contact, setContact] = useState({
    name: initial.contact.name ?? "",
    email: initial.contact.email ?? "",
    phone: initial.contact.phone ?? "",
    location: initial.contact.location ?? "",
  });
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [skills, setSkills] = useState(initial.skills);
  const [roles, setRoles] = useState(initial.experience.map(toRoleDraft));
  const [text, setText] = useState(rawText);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const updateRole = (index: number, patch: Partial<RoleDraft>) => setRoles((all) => all.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  function save() {
    setError(null);
    const content: ResumeContent = {
      contact,
      summary,
      skills,
      experience: roles
        .filter((r) => r.title.trim())
        .map((r) => ({
          title: r.title,
          company: r.company,
          start: r.start,
          end: r.current ? null : r.end,
          highlights: r.highlights
            .split("\n")
            .map((h) => h.replace(/^[-•*·\s]+/, "").trim())
            .filter(Boolean),
        })),
    };
    startSave(async () => {
      const result = await saveResumeContent(content);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl bg-orange-500/[0.08] px-4 py-3 text-sm text-zinc-700 dark:text-zinc-200">
        <p className="font-medium">Check what Matchie found{method === "ocr" ? " (scanned from an image, so look closely)" : ""}.</p>
        <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">Fix anything that is wrong or missing, then save. Only skills and role bullets are ever used for matching.</p>
        {(skills.length === 0 || roles.length === 0) && (
          <p className="mt-1.5 font-medium text-orange-700 dark:text-orange-300">
            {skills.length === 0 && roles.length === 0
              ? "No skills or roles were recognized. Add them below, or fix the extracted text at the bottom and read it again."
              : skills.length === 0
                ? "No skills were recognized. Add them below."
                : "No roles were recognized. Add them below."}
          </p>
        )}
      </div>

      <Fieldset title="Contact" note="Stays in your account. Never sent to the AI.">
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["name", "Full name", "text", "name"],
              ["email", "Email", "email", "email"],
              ["phone", "Phone", "tel", "tel"],
              ["location", "City", "text", "address-level2"],
            ] as const
          ).map(([key, label, type, autoComplete]) => (
            <label key={key} className="flex flex-col gap-1.5 text-sm font-medium">
              {label}
              <input type={type} autoComplete={autoComplete} value={contact[key]} onChange={(e) => setContact({ ...contact, [key]: e.target.value })} className="field" />
            </label>
          ))}
        </div>
      </Fieldset>

      <Fieldset title="Summary">
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={2000} className="field resize-y" />
      </Fieldset>

      <Fieldset title={`Skills (${skills.length})`} note="Used to find and score jobs. Enter or comma adds one.">
        <SkillsInput skills={skills} onChange={setSkills} />
      </Fieldset>

      <Fieldset title={`Experience (${roles.length})`}>
        <ol className="flex flex-col gap-4">
          {roles.map((role, i) => (
            <li key={i} className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Job title
                  <input value={role.title} onChange={(e) => updateRole(i, { title: e.target.value })} className="field" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Company
                  <input value={role.company} onChange={(e) => updateRole(i, { company: e.target.value })} className="field" />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium">
                  Start
                  <input type="month" placeholder="YYYY-MM" value={role.start} onChange={(e) => updateRole(i, { start: e.target.value })} className="field" />
                </label>
                <div className="flex flex-col gap-1.5 text-sm font-medium">
                  <label htmlFor={`role-end-${i}`}>End</label>
                  <input
                    id={`role-end-${i}`}
                    type="month"
                    placeholder="YYYY-MM"
                    value={role.current ? "" : role.end}
                    disabled={role.current}
                    onChange={(e) => updateRole(i, { end: e.target.value })}
                    className="field disabled:opacity-50"
                  />
                  <label className="flex items-center gap-2 text-xs font-normal text-zinc-600 dark:text-zinc-400">
                    <input type="checkbox" checked={role.current} onChange={(e) => updateRole(i, { current: e.target.checked })} className="size-4 accent-orange-500" />
                    I work here now
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm font-medium sm:col-span-2">
                  What you did <span className="text-xs font-normal text-zinc-500">One per line</span>
                  <textarea value={role.highlights} onChange={(e) => updateRole(i, { highlights: e.target.value })} rows={4} className="field resize-y" />
                </label>
              </div>
              <button type="button" onClick={() => setRoles((all) => all.filter((_, j) => j !== i))} className="mt-3 text-sm font-medium text-red-600 hover:underline dark:text-red-400">
                Remove this role
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setRoles((all) => [...all, { title: "", company: "", start: "", end: "", current: false, highlights: "" }])}
          className="btn-secondary min-h-11 self-start px-5"
        >
          + Add a role
        </button>
      </Fieldset>

      {text && (
        <details className="group rounded-2xl border border-zinc-200 dark:border-zinc-800">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
            Extracted text
            <span className="text-xs font-normal text-zinc-500 group-open:hidden">Fix the source and read it again</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Tip: put headings like &ldquo;Skills&rdquo; and &ldquo;Experience&rdquo; on their own lines. Reading again replaces the fields above.
            </p>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={12} className="field resize-y font-mono text-xs" />
            <button type="button" onClick={() => onReparse(text)} className="btn-secondary min-h-11 self-start px-5">
              Read this text again
            </button>
          </div>
        </details>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {/* Sticky on phones so Save is always within reach of a long form. */}
      <div className="glass sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-5 flex gap-2 border-t px-5 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none md:bottom-0">
        <button type="button" onClick={save} disabled={saving} className="btn-primary min-h-11 flex-1 px-6 sm:flex-none">
          {saving ? "Saving…" : "Save resume"}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="btn-secondary min-h-11 px-5">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Fieldset({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <span className="font-display text-lg font-medium">{title}</span>
        {note && <span className="text-xs text-zinc-500 dark:text-zinc-400">{note}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function SkillsInput({ skills, onChange }: { skills: string[]; onChange: (skills: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const seen = new Set(skills.map((s) => s.toLowerCase()));
    const next = [...skills];
    for (const skill of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
      if (!seen.has(skill.toLowerCase()) && next.length < 100) {
        seen.add(skill.toLowerCase());
        next.push(skill.slice(0, 80));
      }
    }
    onChange(next);
    setDraft("");
  }

  return (
    <div className="flex flex-wrap gap-1.5 rounded-xl border border-zinc-300 bg-white p-2 focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/15 dark:border-zinc-800 dark:bg-zinc-900">
      {skills.map((skill, i) => (
        <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 py-1 pr-1 pl-2.5 text-sm dark:bg-zinc-800">
          {skill}
          <button
            type="button"
            onClick={() => onChange(skills.filter((_, j) => j !== i))}
            aria-label={`Remove ${skill}`}
            className="inline-flex size-6 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-700 dark:hover:text-zinc-100"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && skills.length) {
            onChange(skills.slice(0, -1));
          }
        }}
        onBlur={() => draft.trim() && add(draft)}
        placeholder={skills.length ? "Add a skill" : "e.g. React, SQL, Figma"}
        aria-label="Add a skill"
        className="min-w-32 flex-1 bg-transparent px-1.5 py-1 text-base outline-none sm:text-sm"
      />
    </div>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <rect x="4" y="9" width="12" height="8" rx="2" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" />
    </svg>
  );
}
