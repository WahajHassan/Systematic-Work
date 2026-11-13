import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The block every screen is built out of.
 *
 * Before this, a panel was a hand-written string of eight utilities, and
 * every screen wrote a slightly different one: different radius, different
 * padding, and colour reached for ad hoc, so `bg-amber-50 text-amber-900
 * dark:bg-amber-950/40` meant "warning" on one page and something subtly
 * different two pages later. A reader learns nothing from a colour that
 * does not mean the same thing twice.
 *
 * A Panel takes a `tone` instead. The tone sets four CSS variables and the
 * panel renders against them, so changing what a block *means* is changing
 * one word - and the dark theme follows without the call site knowing it
 * exists.
 *
 * `interactive` adds the hover lift and the press response, and is only
 * ever set by the variants that are genuinely a control: a static panel
 * that moves under the cursor is telling the reader to click something
 * that does nothing.
 */

export type Tone = "plain" | "brand" | "good" | "warn" | "bad" | "info";

const TONE_CLASS: Record<Tone, string> = {
  plain: "tone-plain",
  brand: "tone-brand",
  good: "tone-good",
  warn: "tone-warn",
  bad: "tone-bad",
  info: "tone-info",
};

/** Three sizes, because a KPI tile and a form panel are not the same thing. */
const PAD = {
  sm: "p-3.5",
  md: "p-4 sm:p-5",
  lg: "p-5 sm:p-6",
} as const;

export interface PanelProps {
  tone?: Tone;
  pad?: keyof typeof PAD;
  className?: string;
  children: React.ReactNode;
  /**
   * Position in a list, for the entrance stagger. Omit outside a list -
   * a lone panel that waits its turn is a lone panel that looks slow.
   */
  index?: number;
}

export function Panel({
  tone = "plain",
  pad = "md",
  className,
  children,
  index,
}: PanelProps) {
  return (
    <section
      className={cn(
        "tone-surface rounded-2xl border",
        TONE_CLASS[tone],
        PAD[pad],
        index !== undefined && "rise-in",
        className,
      )}
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
    >
      {children}
    </section>
  );
}

/**
 * A panel that is a link.
 *
 * Its own component rather than a prop on Panel, because the element has
 * to change: a `<section>` with an onClick is not reachable by keyboard
 * and is not announced as a link, and the usual fix - wrapping the card in
 * an anchor - breaks the moment the card contains a button.
 */
export function PanelLink({
  href,
  tone = "plain",
  pad = "md",
  className,
  children,
  index,
}: PanelProps & { href: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "tone-surface pressable liftable block rounded-2xl border",
        "outline-none focus-visible:ring-2 focus-visible:ring-[var(--tone-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        TONE_CLASS[tone],
        PAD[pad],
        index !== undefined && "rise-in",
        className,
      )}
      style={index !== undefined ? ({ "--i": index } as React.CSSProperties) : undefined}
    >
      {children}
    </Link>
  );
}

/**
 * A heading inside a panel, with its icon in a tinted tile.
 *
 * The tile is what makes a wall of panels scannable: at a glance the eye
 * sorts them by the colour of a 40px square long before it reads any of
 * the headings.
 */
export function PanelHead({
  title,
  hint,
  Icon,
  right,
  live,
}: {
  title: string;
  hint?: string;
  Icon?: LucideIcon;
  right?: React.ReactNode;
  /** Draws the pulsing ring: something here is happening right now. */
  live?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <span
            className={cn(
              "tone-chip flex size-8 shrink-0 items-center justify-center rounded-xl",
              live && "live-dot",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="tone-ink text-sm font-semibold">{title}</h2>
          {hint && <p className="tone-dim mt-0.5 text-xs leading-relaxed">{hint}</p>}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

/**
 * One big number.
 *
 * `changed` turns on a single wash of the tone colour behind the figure.
 * It runs once and stops: a value that pulses for ever stops meaning "this
 * just happened" and starts meaning nothing at all.
 */
export function Stat({
  label,
  value,
  foot,
  Icon,
  tone = "plain",
  changed,
  index,
}: {
  label: string;
  value: string;
  foot?: string;
  Icon?: LucideIcon;
  tone?: Tone;
  changed?: boolean;
  index?: number;
}) {
  return (
    <Panel tone={tone} pad="md" index={index}>
      <div className="flex items-center gap-2">
        {Icon && <Icon className="tone-mark size-4 shrink-0" aria-hidden="true" />}
        <p className="tone-dim text-xs font-medium">{label}</p>
      </div>
      <p
        className={cn(
          "tone-ink mt-2 text-2xl font-semibold tracking-[-0.02em]",
          changed && "flash-once",
        )}
      >
        {value}
      </p>
      {foot && <p className="tone-dim mt-1 text-xs leading-relaxed">{foot}</p>}
    </Panel>
  );
}

/** A small coloured label. Reads its tone from whatever panel it sits in
 *  unless it is given one of its own. */
export function Chip({
  children,
  tone,
  className,
  pulse,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
  /** For a state that is ongoing: queued, uploading, waiting. */
  pulse?: boolean;
}) {
  return (
    <span
      className={cn(
        "tone-chip inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold",
        tone && TONE_CLASS[tone],
        pulse && "breathe",
        className,
      )}
    >
      {children}
    </span>
  );
}
