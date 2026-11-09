import type { CSSProperties, ReactNode } from "react";

// The landing hero's illustration: Matchie open on a laptop and an iPhone,
// wired into a circuit board whose signals (job boards, inbox, AI scoring)
// run into the devices. Drawn in HTML, SVG and CSS, so it is sharp at any size
// and needs no JavaScript. Every name on the screens is invented.
//
// Everything sits on one 1600 x 900 grid: the SVG uses it as its viewBox, and
// the devices are placed with the same numbers as percentages, so the traces
// meet the device edges at every width. Beside the hero text (lg), the stage
// is wider than its column so the devices (x 230-1370) fill the column and
// the traces run on under the text and off the page. Inside the devices, sizes are in cqw
// (container width), so each screen scales like a screenshot.

type Trace = { d: string; end: [number, number]; start?: [number, number]; dur: number; delay: number };

// Live traces end a few units outside a device edge (laptop screen x 280-1180,
// y 110-672; phone x 1100-1370, y 210-795).
const TRACES: Trace[] = [
  { d: "M190 205 H226 L262 241 H274", start: [190, 205], end: [274, 241], dur: 3.6, delay: -0.4 },
  { d: "M190 235 H206 L236 265 V330 L260 354 H274", start: [190, 235], end: [274, 354], dur: 4.4, delay: -2.1 },
  { d: "M0 470 H160 L200 430 H274", end: [274, 430], dur: 5.2, delay: -1.2 },
  { d: "M200 575 H230 L256 549 H274", start: [200, 575], end: [274, 549], dur: 3.8, delay: -3 },
  { d: "M130 620 V870 H1170 L1210 830 V801", start: [130, 620], end: [1210, 801], dur: 6.5, delay: -2.6 },
  { d: "M500 0 V50 L540 90 V104", end: [540, 104], dur: 4.1, delay: -0.9 },
  { d: "M820 0 V36 L780 76 V104", end: [780, 104], dur: 4.8, delay: -3.4 },
  { d: "M1410 140 H1290 L1260 170 H1186", start: [1410, 140], end: [1186, 170], dur: 3.9, delay: -1.7 },
  { d: "M1480 160 V270 L1440 310 H1376", start: [1480, 160], end: [1376, 310], dur: 4.3, delay: -0.2 },
  { d: "M1600 450 H1490 L1450 410 H1376", end: [1376, 410], dur: 5, delay: -2.4 },
  { d: "M1600 620 H1520 L1470 670 H1376", end: [1376, 670], dur: 4.6, delay: -3.8 },
];

// Quiet traces with no signal: texture, so the board does not look like a diagram.
const IDLE_TRACES = [
  { d: "M0 120 H90 L120 90 H230", via: [230, 90] },
  { d: "M0 880 H100", via: [100, 880] },
  { d: "M1600 820 H1460 L1420 860 H1300", via: [1300, 860] },
  { d: "M1260 0 V40 L1300 80 H1390", via: [1390, 80] },
  { d: "M1000 0 V30 L1030 60 H1110", via: [1110, 60] },
  { d: "M0 330 H40 L70 300 H120", via: [120, 300] },
  { d: "M1600 260 H1560 L1530 230", via: [1530, 230] },
];

const CHIPS = [
  { x: 50, y: 190, label: "JOB BOARDS", sub: "ATS · ALERTS" },
  { x: 60, y: 560, label: "INBOX", sub: "IMAP · 2H" },
  { x: 1410, y: 100, label: "AI SCORING", sub: "PII SCRUBBED" },
];

export function HeroStage() {
  return (
    <div
      role="img"
      aria-label="Matchie on a laptop, showing this morning's job matches, and on an iPhone lock screen, showing a digest and an interview invite."
      className="relative left-1/2 aspect-[16/9] w-[max(100%,540px)] max-w-[1400px] -translate-x-1/2 lg:left-[-20.2%] lg:w-[140.4%] lg:max-w-none lg:translate-x-0"
    >
      <Circuit />
      <div aria-hidden="true" className="absolute inset-0">
        {/* Floor shadow and warm light under the devices. */}
        <div className="absolute top-[70%] left-[18%] h-[14%] w-[64%] rounded-[50%] bg-black/30 blur-2xl dark:bg-black/60" />
        <div className="absolute top-[30%] left-[30%] h-[40%] w-[45%] rounded-full bg-orange-500/20 blur-[80px]" />
        {/* The devices float out of step; the shadow under them stays put. */}
        <div className="absolute inset-0 motion-safe:animate-float">
          <Laptop />
        </div>
        <div className="absolute inset-0 motion-safe:animate-float motion-safe:[animation-delay:-3.5s]">
          <Phone />
        </div>
      </div>
    </div>
  );
}

// --- Circuit board ------------------------------------------------------------------

function Circuit() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1600 900"
      className="absolute inset-0 size-full [mask-image:radial-gradient(ellipse_75%_80%_at_50%_45%,black_55%,transparent_100%)] lg:[mask-image:linear-gradient(to_right,transparent_12%,black_30%,black_85%,transparent)]"
      fill="none"
    >
      <g className="stroke-zinc-300 dark:stroke-zinc-800" strokeWidth="1.5" strokeLinejoin="round">
        {IDLE_TRACES.map((trace) => (
          <path key={trace.d} d={trace.d} />
        ))}
        {TRACES.map((trace) => (
          <path key={trace.d} d={trace.d} />
        ))}
      </g>
      <g className="fill-cream stroke-zinc-300 dark:fill-zinc-950 dark:stroke-zinc-700" strokeWidth="1.5">
        {IDLE_TRACES.map(({ via: [cx, cy] }) => (
          <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="4" />
        ))}
        {TRACES.flatMap(({ start }) => (start ? [<circle key={`${start[0]},${start[1]}`} cx={start[0]} cy={start[1]} r="3.5" />] : []))}
      </g>

      {CHIPS.map((chip) => (
        <Chip key={chip.label} {...chip} />
      ))}

      {/* The signals. Hidden for reduced motion: a still dash would read as a glitch. */}
      <g className="stroke-orange-400 motion-reduce:hidden" strokeWidth="2.5" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 5px rgb(248 112 47 / 0.9))" }}>
        {TRACES.map((trace) => (
          <path key={trace.d} d={trace.d} pathLength={1000} strokeDasharray="70 930" className="motion-safe:animate-trace" style={timing(trace)} />
        ))}
      </g>
      <g className="fill-orange-400" style={{ filter: "drop-shadow(0 0 6px rgb(248 112 47 / 0.9))" }}>
        {TRACES.map((trace) => (
          <circle key={trace.d} cx={trace.end[0]} cy={trace.end[1]} r="4.5" className="opacity-60 motion-safe:animate-pad" style={timing(trace)} />
        ))}
      </g>
    </svg>
  );
}

function timing({ dur, delay }: Trace): CSSProperties {
  return { animationDuration: `${dur}s`, animationDelay: `${delay}s` };
}

/** A chip package with pins top and bottom: one of the sources feeding Matchie. */
function Chip({ x, y, label, sub }: { x: number; y: number; label: string; sub: string }) {
  const width = 140;
  const pins = Array.from({ length: 8 }, (_, index) => x + 14 + index * 16);
  return (
    <g>
      <g className="stroke-zinc-300 dark:stroke-zinc-700" strokeWidth="2" strokeLinecap="round">
        {pins.map((px) => (
          <path key={px} d={`M${px} ${y - 7} V${y} M${px} ${y + 60} V${y + 67}`} />
        ))}
      </g>
      <rect x={x} y={y} width={width} height="60" rx="7" className="fill-white stroke-zinc-300 dark:fill-zinc-900 dark:stroke-zinc-700" strokeWidth="1.5" />
      <circle cx={x + 11} cy={y + 11} r="2.5" className="fill-orange-500" />
      <text x={x + width / 2} y={y + 29} textAnchor="middle" fontSize="13" fontWeight="600" letterSpacing="1.5" className="fill-zinc-700 font-mono dark:fill-zinc-300">
        {label}
      </text>
      <text x={x + width / 2} y={y + 46} textAnchor="middle" fontSize="10" letterSpacing="1" className="fill-zinc-400 font-mono dark:fill-zinc-500">
        {sub}
      </text>
    </g>
  );
}

// --- Laptop ------------------------------------------------------------------------

function Laptop() {
  return (
    <>
      <div className="@container absolute top-[12.222%] left-[17.5%] h-[62.444%] w-[56.25%]">
        <div className="h-full rounded-t-[2.4cqw] bg-black p-[1.1cqw] pb-[1.6cqw] shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_40px_100px_-40px_rgb(0_0_0/0.9)]">
          <div className="relative h-full overflow-hidden rounded-[0.8cqw] bg-zinc-950 text-[1.7cqw] text-zinc-50">
            <DesktopApp />
            {/* Camera notch, and a faint glare across the glass. */}
            <div className="absolute top-0 left-1/2 h-[1.7cqw] w-[11cqw] -translate-x-1/2 rounded-b-[0.9cqw] bg-black" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgb(255_255_255/0.07)_0%,transparent_35%)]" />
          </div>
        </div>
      </div>
      {/* The base, with the thumb scoop in the middle. */}
      <div className="absolute top-[74.667%] left-[14.375%] h-[3.111%] w-[62.5%] rounded-t-[0.3%] rounded-b-[3%_100%] bg-linear-to-b from-zinc-300 via-zinc-400 to-zinc-600 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)]">
        <div className="mx-auto h-[45%] w-[14%] rounded-b-[40%] bg-zinc-500/70" />
      </div>
    </>
  );
}

const DESKTOP_JOBS = [
  { score: 92, title: "Frontend Developer", meta: "Acme Corp · Makati · Hybrid", skills: ["React", "TypeScript"] },
  { score: 84, title: "Full Stack Engineer", meta: "Northwind · Remote (PH)", skills: ["Node.js", "Postgres"] },
  { score: 71, title: "React Native Developer", meta: "Initech · BGC · Hybrid", skills: ["React"] },
  { score: 63, title: "Web Developer", meta: "Globex · Cebu · On-site", skills: ["Tailwind"] },
  { score: 48, title: "UI Engineer", meta: "Umbrella · Remote", skills: ["CSS"] },
];

function DesktopApp() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[3.2em] shrink-0 items-center gap-[0.7em] border-b border-white/[0.06] bg-zinc-900/70 px-[1.4em]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="size-[1.6em]" />
        <span className="font-display font-semibold">Matchie</span>
        <span className="ml-[1.2em] flex gap-[0.3em] text-[0.85em] text-zinc-400">
          {["Dashboard", "Discover", "Tracker", "Analytics"].map((item) => (
            <span key={item} className={`rounded-full px-[0.8em] py-[0.3em] ${item === "Discover" ? "bg-zinc-800 text-orange-400" : ""}`}>
              {item}
            </span>
          ))}
        </span>
        <span className="bg-accent ml-auto size-[1.7em] rounded-full" />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[1.75fr_1fr] gap-[1.2em] p-[1.4em]">
        <div className="flex min-w-0 flex-col gap-[0.65em]">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[0.75em] text-zinc-400">Tuesday · 6:00 AM digest</p>
              <p className="font-display text-[2.1em] leading-[1.05] font-medium tracking-tight">
                Disc<em className="accent-word">o</em>ver
              </p>
            </div>
            <span className="rounded-full border border-white/10 px-[0.8em] py-[0.35em] text-[0.75em] text-zinc-300">12 new</span>
          </div>
          <div className="flex gap-[0.4em] text-[0.72em] text-zinc-300">
            {["PH + Remote", "0-3 yrs", "Score 40+"].map((filter) => (
              <span key={filter} className="rounded-full bg-zinc-800/80 px-[0.8em] py-[0.3em]">
                {filter}
              </span>
            ))}
          </div>
          {DESKTOP_JOBS.map((job, index) => (
            <div
              key={job.title}
              className={`flex items-center gap-[0.8em] rounded-[0.9em] border p-[0.65em] ${
                index === 0 ? "border-orange-500/40 bg-zinc-900 shadow-[0_0_2em_-0.8em_rgb(240_83_43/0.8)]" : "border-white/[0.06] bg-zinc-900/60"
              }`}
            >
              <Ring score={job.score} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{job.title}</p>
                <p className="truncate text-[0.78em] text-zinc-400">{job.meta}</p>
              </div>
              <span className="hidden gap-[0.3em] text-[0.7em] @[28rem]:flex">
                {job.skills.map((skill) => (
                  <span key={skill} className="rounded-full bg-green-500/12 px-[0.7em] py-[0.25em] text-green-400">
                    {skill}
                  </span>
                ))}
              </span>
              <span
                className={`rounded-full px-[0.9em] py-[0.35em] text-[0.75em] font-semibold ${index === 0 ? "bg-accent text-zinc-950" : "border border-white/10 text-zinc-300"}`}
              >
                Save
              </span>
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-[0.8em]">
          <Panel title="Your funnel">
            {[
              { label: "Applied", value: 24, width: "100%" },
              { label: "Screening", value: 11, width: "46%" },
              { label: "Interview", value: 5, width: "21%" },
              { label: "Offer", value: 1, width: "6%" },
            ].map((stage) => (
              <div key={stage.label} className="flex flex-col gap-[0.25em]">
                <div className="flex justify-between text-[0.75em]">
                  <span className="text-zinc-400">{stage.label}</span>
                  <span className="font-medium">{stage.value}</span>
                </div>
                <div className="h-[0.45em] rounded-full bg-zinc-800">
                  <div className="bg-accent h-full rounded-full" style={{ width: stage.width }} />
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="From your inbox">
            {[
              { company: "Globex", move: "Interview", time: "2h" },
              { company: "Initech", move: "Assessment", time: "1d" },
            ].map((event) => (
              <div key={event.company} className="flex items-center gap-[0.6em] text-[0.78em]">
                <span className="size-[0.55em] shrink-0 rounded-full bg-orange-400" />
                <span className="min-w-0 flex-1 truncate">
                  {event.company} <span className="text-zinc-500">→</span> {event.move}
                </span>
                <span className="text-zinc-500">{event.time}</span>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-[0.6em] rounded-[0.9em] border border-white/[0.06] bg-zinc-900/60 p-[0.9em]">
      <p className="text-[0.7em] font-semibold tracking-wider text-zinc-400 uppercase">{title}</p>
      {children}
    </div>
  );
}

/** A score ring sized in em, so it scales with the screen around it. */
function Ring({ score }: { score: number }) {
  const tone = score >= 80 ? "stroke-ios-green" : score >= 60 ? "stroke-orange-400" : "stroke-zinc-400";
  return (
    <span className="relative flex size-[2.5em] shrink-0 items-center justify-center">
      {/* r = 15.915 makes the circumference 100, so the dash is the score. */}
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" fill="none" strokeWidth="3.2">
        <circle cx="18" cy="18" r="15.915" className="stroke-zinc-800" />
        <circle cx="18" cy="18" r="15.915" className={tone} strokeDasharray={`${score} 100`} strokeLinecap="round" />
      </svg>
      <span className="text-[0.8em] font-semibold">{score}</span>
    </span>
  );
}

// --- iPhone ------------------------------------------------------------------------

function Phone() {
  return (
    <div className="@container absolute top-[23.333%] left-[68.75%] h-[65%] w-[16.875%]">
      {/* Side buttons: action and volume on the left, power on the right. */}
      <span className="absolute top-[17%] -left-[1.1cqw] h-[5%] w-[1.6cqw] rounded-l-full bg-zinc-600" />
      <span className="absolute top-[25%] -left-[1.1cqw] h-[9%] w-[1.6cqw] rounded-l-full bg-zinc-600" />
      <span className="absolute top-[36%] -left-[1.1cqw] h-[9%] w-[1.6cqw] rounded-l-full bg-zinc-600" />
      <span className="absolute top-[28%] -right-[1.1cqw] h-[14%] w-[1.6cqw] rounded-r-full bg-zinc-600" />

      <div className="relative h-full rounded-[17cqw] bg-linear-to-br from-zinc-400 via-zinc-700 to-zinc-500 p-[1.3cqw] shadow-[0_50px_90px_-30px_rgb(0_0_0/0.85),0_0_70px_-20px_rgb(240_83_43/0.5)]">
        <div className="h-full rounded-[15.8cqw] bg-black p-[2.6cqw]">
          <LockScreen />
        </div>
      </div>
    </div>
  );
}

function LockScreen() {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-[13.4cqw] bg-zinc-950 text-[4.4cqw] text-white">
      {/* Wallpaper: warm light rising from the bottom. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_105%,var(--color-orange-600)_0%,var(--color-orange-900)_45%,transparent_75%),radial-gradient(80%_40%_at_100%_0%,rgb(124_92_255/0.25),transparent_70%)]" />

      <div className="absolute top-[3.2cqw] left-1/2 h-[8.6cqw] w-[30cqw] -translate-x-1/2 rounded-full bg-black" />
      <div className="relative flex items-center justify-end gap-[0.35em] px-[8cqw] pt-[5cqw] text-[0.75em]">
        <SignalBars />
        <span className="h-[0.75em] w-[1.6em] rounded-[0.25em] border border-white/60 p-[0.1em]">
          <span className="block h-full w-[80%] rounded-[0.12em] bg-white" />
        </span>
      </div>

      <div className="relative mt-[6cqw] flex flex-col items-center">
        <p className="text-[0.85em] font-medium text-white/80">Tuesday, 10 November</p>
        <p className="font-display text-[4.6em] leading-[1] font-semibold tracking-tight">6:00</p>
        <div className="mt-[0.8em] flex gap-[0.5em] text-[0.68em]">
          <Widget label="Interview" value="Tue 2:00 PM" />
          <Widget label="Top match" value="92 · Acme" />
        </div>
      </div>

      <div className="relative mt-auto flex flex-col gap-[0.45em] px-[4cqw] pb-[3cqw]">
        <Notification time="now" title="10 new matches this morning" body="Frontend Developer at Acme Corp scored 92." />
        <Notification time="2h ago" title="Interview invite" body="Globex moved to Interview." />
        <div className="mx-auto -mt-[0.9em] h-[0.9em] w-[88%] rounded-b-[0.8em] bg-white/10" />

        <div className="mt-[1.2em] flex items-center justify-between px-[3cqw]">
          <span className="size-[2.4em] rounded-full bg-white/15 backdrop-blur" />
          <span className="size-[2.4em] rounded-full bg-white/15 backdrop-blur" />
        </div>
        <span className="mx-auto mt-[0.6em] h-[0.3em] w-[36%] rounded-full bg-white" />
      </div>
    </div>
  );
}

function Widget({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col rounded-[0.9em] bg-white/10 px-[0.8em] py-[0.45em] leading-[1.25] backdrop-blur-md">
      <span className="text-white/60">{label}</span>
      <span className="font-semibold">{value}</span>
    </span>
  );
}

function Notification({ time, title, body }: { time: string; title: string; body: string }) {
  return (
    <div className="relative flex gap-[0.55em] rounded-[1.1em] bg-zinc-200/15 p-[0.6em] backdrop-blur-md">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" className="size-[2em] shrink-0 rounded-[0.5em]" />
      <div className="min-w-0 flex-1 leading-[1.25]">
        <p className="flex justify-between text-[0.72em]">
          <span className="font-semibold">Matchie</span>
          <span className="text-white/60">{time}</span>
        </p>
        <p className="truncate text-[0.72em] font-semibold">{title}</p>
        <p className="truncate text-[0.72em] text-white/80">{body}</p>
      </div>
    </div>
  );
}

function SignalBars() {
  return (
    <span className="flex h-[0.7em] items-end gap-[0.1em]">
      {[35, 55, 75, 100].map((height) => (
        <span key={height} className="w-[0.18em] rounded-[0.05em] bg-white" style={{ height: `${height}%` }} />
      ))}
    </span>
  );
}
