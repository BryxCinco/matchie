"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

// Same storage key and class as the inline theme script in app/layout.tsx and
// the navbar toggle. The selected segment is styled with `dark:` classes, so
// the server render is already correct and nothing flashes; state only
// drives aria-pressed after mount.
export function ThemeSetting() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(root.classList.contains("dark") ? "dark" : "light");
    sync();
    // The navbar toggle changes the class too; keep this control in step.
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  function choose(next: Theme) {
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Storage blocked: the choice still applies to this page.
    }
  }

  const options: { value: Theme; label: string; preview: string; selected: string }[] = [
    // Each option owns its full border/ring colors, so no two classes compete.
    { value: "dark", label: "Dark", preview: "bg-zinc-950 border-zinc-700", selected: "border-zinc-200 dark:border-orange-500 dark:ring-2 dark:ring-orange-500/30" },
    { value: "light", label: "Cream", preview: "bg-cream border-zinc-300", selected: "border-orange-500 ring-2 ring-orange-500/30 dark:border-zinc-800 dark:ring-0" },
  ];

  return (
    <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:max-w-md">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          aria-pressed={theme === null ? undefined : theme === option.value}
          className={`pressable flex flex-col gap-3 rounded-2xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-orange-500 ${option.selected}`}
        >
          {/* Mini preview of the theme: page, card, accent pill. */}
          <span aria-hidden="true" className={`flex h-16 flex-col justify-end gap-1.5 rounded-xl border p-2 ${option.preview}`}>
            <span className={`h-2 w-3/4 rounded-full ${option.value === "dark" ? "bg-zinc-800" : "bg-white"}`} />
            <span className="bg-accent h-2 w-1/3 rounded-full" />
          </span>
          <span className="text-sm font-medium">{option.label}</span>
        </button>
      ))}
    </div>
  );
}
