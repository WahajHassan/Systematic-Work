"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, GripVertical, RotateCcw } from "lucide-react";
import { dragHandlers, useReorder } from "@/lib/use-reorder";
import { cn } from "@/lib/utils";

/**
 * The second level of navigation, inside an area.
 *
 * The sidebar had grown to eleven entries, several of which were two names
 * for one job - inviting people is what you do with a customer list, and
 * connecting an account is part of deciding where testimonials go. Splitting
 * them across the top level made the product look bigger than it is and left
 * nobody sure which of two entries they wanted.
 *
 * So the sidebar now names the six things somebody actually sets out to do,
 * and the steps within each are these. Every route is unchanged; only where
 * they are reached from moved.
 */
export interface SectionTab {
  href: string;
  label: string;
}

export function SectionTabs({ tabs }: { tabs: SectionTab[] }) {
  const pathname = usePathname();

  /*
    One stored order per strip, keyed by the strip's first address.

    Keyed by what the strip is rather than by which screen is drawing it,
    because the same three tabs appear on all three screens of an area and
    somebody who rearranges them on one expects the other two to match. The
    first href is stable for that: it is the area's own entry in the
    sidebar, and it does not change when a tab is added beside it.
  */
  const key = `viewrec-tabs${tabs[0]?.href ?? ""}`;
  const byHref = new Map(tabs.map((tab) => [tab.href, tab]));
  const { order, arranging, setArranging, said, move, dropBefore, reset } =
    useReorder(
      key,
      tabs.map((tab) => tab.href),
      (href) => byHref.get(href)?.label ?? href,
    );

  return (
    <div className="border-b border-border bg-card/40 px-4 py-3 sm:px-6">
      {/*
        A panel of pills rather than words with a hairline under one of them.

        The underline was two pixels of brand colour under a word that was
        otherwise the same as its neighbours, which on the dark theme is
        close to no mark at all - and the tabs themselves sat loose on the
        bar with nothing around them, so they read as a sentence rather than
        as a control.

        It wraps instead of scrolling sideways. The strip used to be
        `overflow-x-auto`, and Windows draws its stepper arrows on any box
        with `auto` overflow - including the axis nobody asked about. Those
        two grey triangles at the end of the navigation looked like a
        control and were not one.
      */}
      <nav
        className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl border border-border bg-background/60 p-1.5 shadow-soft"
        aria-label="Section"
      >
        {order.map((orderedHref) => {
          const tab = byHref.get(orderedHref);
          // A stored order is filtered against this strip before it gets
          // here, so this cannot happen - and drawing nothing beats
          // drawing a tab that opens nowhere.
          if (!tab) return null;
          // A detail page under a tab keeps that tab lit, so opening one
          // template does not look like leaving the area.
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <TabPill
              key={tab.href}
              href={tab.href}
              label={tab.label}
              scope={key}
              arranging={arranging}
              onMove={(by) => move(tab.href, by)}
              onDropBefore={(dragged) => dropBefore(dragged, tab.href)}
            >
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                tabIndex={arranging ? -1 : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-xl px-4 py-2 text-sm transition-colors",
                  active
                    ? "bg-brand-500/15 font-semibold text-brand-700 ring-1 ring-inset ring-brand-400/40 dark:text-brand-200"
                    : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </TabPill>
          );
        })}

        {/*
          The handle, at the end of the strip rather than above it.

          Small and unlabelled while it is off, because it is not one of
          the tabs and must not read as one - a strip of three pills with a
          fourth thing in it that looks like a pill is a strip with a tab
          nobody can open. It says what it does on hover and to a screen
          reader.
        */}
        <span className="ml-0.5 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setArranging(!arranging)}
            aria-pressed={arranging}
            title={arranging ? "Done rearranging" : "Rearrange these tabs"}
            className={cn(
              "pressable flex size-7 items-center justify-center rounded-lg transition-colors",
              arranging
                ? "bg-brand-500/15 text-brand-700 dark:text-brand-200"
                : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
            )}
          >
            <GripVertical className="size-3.5" aria-hidden="true" />
            <span className="sr-only">
              {arranging ? "Done rearranging tabs" : "Rearrange these tabs"}
            </span>
          </button>
          {arranging && (
            <button
              type="button"
              onClick={reset}
              title="Put these tabs back in their original order"
              className="pressable flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Reset the tab order</span>
            </button>
          )}
        </span>
      </nav>

      {arranging && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Drag a tab, or use the arrows on it. The order is yours and is
          remembered on this device.
        </p>
      )}

      {/* Every move is announced, because a strip that rearranges itself in
          silence is one a screen reader user cannot tell has changed. */}
      <span className="sr-only" aria-live="polite">
        {said}
      </span>
    </div>
  );
}

/**
 * One tab, and the handle it is moved by.
 *
 * Its own component for the same reason the sidebar's row is: it holds the
 * "something is being dragged over me" state, and a component declared
 * inside another one is a fresh component type on every render, which
 * throws that state away.
 */
function TabPill({
  href,
  label,
  scope,
  arranging,
  onMove,
  onDropBefore,
  children,
}: {
  href: string;
  label: string;
  scope: string;
  arranging: boolean;
  onMove: (by: number) => void;
  onDropBefore: (draggedHref: string) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);

  return (
    <span
      {...dragHandlers(scope, href, arranging, onDropBefore, setOver)}
      className={cn(
        "relative inline-flex items-center",
        // While arranging, a click on a tab is a grab rather than a
        // journey: following the link would throw the drag away.
        arranging && "cursor-grab active:cursor-grabbing [&_a]:pointer-events-none",
        // A vertical rule down the leading edge, because these sit in a
        // row - the sidebar's horizontal bar would point the wrong way.
        over &&
          "before:absolute before:inset-y-1 before:-left-0.5 before:w-0.5 before:rounded-full before:bg-brand-500",
      )}
    >
      {children}
      {arranging && (
        <span className="ml-0.5 flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            aria-label={`Move ${label} left`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="size-3 rotate-90" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            aria-label={`Move ${label} right`}
            className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className="size-3 -rotate-90" aria-hidden="true" />
          </button>
        </span>
      )}
    </span>
  );
}

/** The four areas that have more than one screen in them. */

/**
 * Everyone you could ask, and everyone asking you.
 *
 * Groups and inbound requests were top-level entries of their own. Both are
 * the same list of people seen from a different side - a group is some of
 * them, a request is one of them arriving by themselves - so they belong
 * beside the list rather than beside it in the sidebar.
 */
export const COLLECT_TABS: SectionTab[] = [
  { href: "/customers", label: "Your customers" },
  { href: "/invitations", label: "Invitations sent" },
  { href: "/bundles", label: "Groups" },
];

/**
 * People arriving by themselves, which is a different job from a list you
 * built.
 *
 * These were tabs four and five of the phonebook, and also had a second
 * strip of their own inside the screen - so the same two destinations were
 * drawn twice, one above the other, with different labels. Their own area
 * now: one entry in the sidebar, two tabs inside it, and nothing borrowed
 * from the list of people you already know.
 */
export const REQUEST_TABS: SectionTab[] = [
  { href: "/review-requests", label: "Review requests" },
  { href: "/leads", label: "Leads" },
];

/**
 * Publishing: where a testimonial ends up.
 *
 * Connecting an account used to be the middle tab here, and it is not the
 * same job. Choosing which testimonials go out and on which schedule is
 * something you come back to; signing in to Facebook is something you do
 * once and then forget about for a year. One sat in the way of the other.
 * It has its own entry in the sidebar now, and is deliberately not
 * repeated here - a screen reachable from a sidebar row *and* a tab on
 * somebody else's screen reads as two different screens.
 */
export const PUBLISH_TABS: SectionTab[] = [
  { href: "/publishing", label: "Where they go" },
  { href: "/embed", label: "On your website" },
];

/** The two pages with your name on them, and what one of them asks. */
export const PAGE_TABS: SectionTab[] = [
  { href: "/review-page", label: "Your review page" },
  { href: "/templates", label: "What they are asked" },
  { href: "/business-page", label: "Your business page" },
];

/**
 * Settings, split into the three things people actually come here to do.
 *
 * It was one page carrying four unrelated panels stacked down it: the
 * account form, business verification, every automation knob, and the
 * security log. Anybody coming to change one reminder scrolled past two
 * screens of other people's business to reach it - and the automations in
 * particular are the half somebody returns to, so they get their own
 * address rather than a position on a long page.
 */
export const SETTINGS_TABS: SectionTab[] = [
  { href: "/settings", label: "Account" },
  { href: "/settings/security", label: "Security" },
];

/**
 * The automations area.
 *
 * "Scheduled" is the working half - what is waiting, what ran, what to
 * stop. "Defaults" is the half that was always here: how long to wait
 * before chasing an invitation, how many times, and the tags the analysis
 * uses. They sit together because both answer "what does this do on its
 * own", and apart from Settings because one of them is a thing you do
 * rather than a thing you configure once.
 */
export const AUTOMATION_TABS: SectionTab[] = [
  { href: "/automations", label: "Scheduled" },
  { href: "/automations/defaults", label: "Defaults" },
];

/** What you pay, and the credit that comes off it. */
export const BILLING_TABS: SectionTab[] = [
  { href: "/billing", label: "Plan & billing" },
  { href: "/referrals", label: "Refer and earn" },
];
