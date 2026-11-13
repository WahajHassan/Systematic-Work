import "server-only";
import { claimDue, finishRun, releaseStalled, type Automation } from "../repos/automations";
import { bundleMembers } from "../repos/contact-bundles";
import { notify } from "../repos/notifications";
import { sendMail, unsubscribeUrl } from "../notify";
import { isGloballySuppressed, marketingUnsubscribeToken } from "../compliance/unsubscribe";
import { queryOne } from "../db";

/**
 * Doing the things somebody scheduled.
 *
 * Called by the cron on a timer. Everything it decides comes from the
 * database - which row is due, whether it repeats - so calling it twice a
 * minute apart is safe and calling it late is harmless: an automation that
 * was due during an outage is still due afterwards.
 *
 * Every run is wrapped. A single automation that throws must not take the
 * sweep down with it, because the next row behind it has done nothing
 * wrong - that exact failure once left a publishing queue frozen for two
 * days with nothing written anywhere to say why.
 */

export interface RunSummary {
  ran: number;
  failed: number;
  released: number;
}

/** A ceiling per call, so one sweep cannot run for ever. */
const PER_SWEEP = 25;

export async function runDueAutomations(): Promise<RunSummary> {
  const released = await releaseStalled();
  let ran = 0;
  let failed = 0;

  for (let i = 0; i < PER_SWEEP; i += 1) {
    const automation = await claimDue();
    if (!automation) break;

    try {
      const outcome = await runOne(automation);
      await finishRun(automation.id, outcome);
      if (outcome.ok) ran += 1;
      else failed += 1;
    } catch (problem) {
      // Thrown rather than returned: a bug, a dropped connection, a mail
      // host refusing mid-call. The row is marked and the sweep carries on.
      console.error("[automations] threw:", automation.id, problem);
      await finishRun(automation.id, {
        ok: false,
        error: problem instanceof Error ? problem.message : String(problem),
      });
      failed += 1;
    }
  }

  return { ran, failed, released };
}

async function runOne(
  automation: Automation,
): Promise<{ ok: boolean; error?: string }> {
  if (automation.kind === "remind_me") return remindMe(automation);
  if (automation.kind === "email_group") return emailGroup(automation);
  return { ok: false, error: `Unknown automation kind: ${automation.kind}` };
}

/**
 * A note to the person who set it.
 *
 * In the notification bell rather than by email. This is somebody's own
 * reminder to themselves, and an email for it is one more message in an
 * inbox they are already trying to get through.
 */
async function remindMe(
  automation: Automation,
): Promise<{ ok: boolean; error?: string }> {
  await notify({
    accountId: automation.accountId,
    kind: "automation_reminder",
    title: automation.name,
    body: automation.note ?? "",
    href: "/automations",
  });
  return { ok: true };
}

/**
 * The scheduled email to a group.
 *
 * Built the same way the Marketing email box builds one, and for the same
 * reasons: no review link, an unsubscribe line that is not optional, and
 * anyone who has opted out skipped before anything is sent.
 */
async function emailGroup(
  automation: Automation,
): Promise<{ ok: boolean; error?: string }> {
  if (!automation.bundleId) {
    return {
      ok: false,
      error: "The group this was sending to has been deleted.",
    };
  }
  if (!automation.subject || !automation.body) {
    return { ok: false, error: "This automation has no subject or message." };
  }

  const owner = await queryOne<{ email: string; company_name: string | null; full_name: string }>(
    "SELECT email, company_name, full_name FROM profiles WHERE id = $1",
    [automation.accountId],
  );
  if (!owner) return { ok: false, error: "The account no longer exists." };

  const businessName = owner.company_name || owner.full_name;

  const members = await bundleMembers(automation.accountId, automation.bundleId);

  const recipients = members.filter((m) => m.email);
  if (recipients.length === 0) {
    return { ok: false, error: "Nobody in that group has an email address." };
  }

  let sent = 0;
  const refused: string[] = [];

  for (const member of recipients) {
    const email = member.email!;

    if (await isGloballySuppressed("email", email)) {
      refused.push(`${email} (unsubscribed)`);
      continue;
    }

    const token = marketingUnsubscribeToken(email);
    const stop = token ? unsubscribeUrl(token) : null;
    if (!stop) {
      // Commercial mail nobody can stop is the one outcome worse than
      // not sending it.
      refused.push(`${email} (no unsubscribe link)`);
      continue;
    }

    const result = await sendMail({
      to: email,
      subject: automation.subject,
      text: [
        member.name ? `${member.name},\n` : "",
        automation.body,
        "",
        `— ${businessName}`,
        "",
        `To stop hearing from us: ${stop}`,
      ].join("\n"),
      html: `
<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a;font-size:15px;line-height:1.6">
  ${member.name ? `<p style="margin:0 0 16px">${escapeHtml(member.name)},</p>` : ""}
  ${automation.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}
  <p style="margin:24px 0 0;color:#475569">— ${escapeHtml(businessName)}</p>
  <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">
    You are receiving this because you are a customer of
    ${escapeHtml(businessName)}.
    <a href="${stop}" style="color:#94a3b8">Unsubscribe</a>.
  </p>
</div>`.trim(),
      replyTo: owner.email,
    });

    if (result.status === "sent") sent += 1;
    else refused.push(`${email} (${result.error ?? result.status})`);
  }

  // One notification for the run, not one per recipient.
  await notify({
    accountId: automation.accountId,
    kind: refused.length === 0 ? "invitation_sent" : "invitation_failed",
    title:
      refused.length === 0
        ? `${automation.name}: sent to ${sent}`
        : `${automation.name}: ${sent} sent, ${refused.length} did not`,
    body: automation.subject,
    href: "/automations",
  });

  /*
    A run that reached nobody is a failure; a run that reached most of the
    group is not. Marking the whole thing failed because two addresses had
    unsubscribed would stop a repeating automation over something that is
    working as intended.
  */
  if (sent === 0) {
    return { ok: false, error: refused.slice(0, 3).join("; ") || "Nothing was sent." };
  }
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
