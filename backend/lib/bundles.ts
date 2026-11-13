/**
 * How big a contact bundle may be, and what the sizes mean.
 *
 * Pure, and shared by both ends for the same reason `lib/attachments` is:
 * the screen needs the limit while somebody is ticking boxes, and the
 * server needs the same answer because a form is a suggestion and the
 * action behind it can be posted to directly.
 *
 * Twenty is the ceiling, and above it the message stops being written for
 * anybody in particular - which is the entire reason for grouping people
 * rather than sending to the whole list.
 *
 * There used to be a floor of ten as well, on the argument that below ten
 * it is quicker to pick people by hand. The argument was fine and the rule
 * was not, because it was only ever enforced in one of the two places that
 * send to a group: a scheduled automation would email a group of two
 * happily, while the Groups screen greyed out its own send button for the
 * same group and explained that a bundle sends at ten. One rule, two
 * answers, and the one somebody saw depended on which screen they were
 * standing on. The floor is gone rather than copied into the second place,
 * because a group of two is a real thing somebody made on purpose.
 */

export const MAX_BUNDLE = 20;

export type BundleKind = "offer" | "cold";

export interface BundleKindInfo {
  key: BundleKind;
  label: string;
  /** What this kind is for, in the words the screen uses. */
  detail: string;
  /**
   * What the business has to be able to say about everybody in it.
   *
   * Written down because the two kinds are not the same thing in law. A
   * discount to somebody who has bought from you is a message to an
   * existing customer; the same words to somebody who has not is
   * marketing to a stranger, and the rules are different. The screen says
   * so rather than leaving a business to find out.
   */
  rule: string;
}

export const BUNDLE_KINDS: BundleKindInfo[] = [
  {
    key: "offer",
    label: "An offer for past customers",
    detail:
      "A discount or a thank-you to people who have already bought from you.",
    rule:
      "Everybody in this group has bought from you before. That is what makes it an offer rather than an approach.",
  },
  {
    key: "cold",
    label: "A first approach",
    detail: "An introduction to people who have not bought from you yet.",
    rule:
      "These people have not bought from you. Only send it where you have a reason to be writing to them, and expect a lower answer rate than an offer.",
  },
];

export function bundleKind(key: string | null | undefined): BundleKindInfo {
  return BUNDLE_KINDS.find((k) => k.key === key) ?? BUNDLE_KINDS[0];
}

export interface SizeVerdict {
  ok: boolean;
  /** Set when it cannot be sent, in words for the person who built it. */
  reason?: string;
}

/**
 * Whether a bundle is the right size to send.
 *
 * Two answers only now: empty, and too many. An empty group is not a size
 * problem, it is nothing to send - and the message says that rather than
 * naming a number, because there is no number to reach any more.
 */
export function canSend(count: number): SizeVerdict {
  if (count === 0) {
    return { ok: false, reason: "Add somebody to this group before sending." };
  }

  if (count > MAX_BUNDLE) {
    return {
      ok: false,
      reason: `${count} is too many. ${MAX_BUNDLE} is the most in one bundle — split it in two.`,
    };
  }

  return { ok: true };
}

/** Whether one more may be added. */
export function canAdd(count: number): boolean {
  return count < MAX_BUNDLE;
}
