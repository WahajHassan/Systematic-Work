import "server-only";
import { execute, newId, query, queryOne } from "../db";

/**
 * Things the business set up once for the product to do on its own.
 *
 * Two rules run through this file.
 *
 * **The database decides what is due.** The cron asks "what is scheduled
 * and in the past" and gets an index lookup, rather than reading every
 * automation and working out whether today counts. A schedule that has to
 * be interpreted is a schedule that can be interpreted two ways.
 *
 * **Running one is a claim.** `claimDue` flips 'scheduled' to 'running' in
 * a statement whose WHERE tests the status it is changing, so two cron
 * calls a second apart cannot both send the same email to the same group.
 * That is the same discipline the publish queue uses, and for the same
 * reason: the failure it prevents is the one nobody sees until a customer
 * complains about being emailed twice.
 */

export type AutomationKind = "remind_me" | "email_group";
export type AutomationStatus =
  | "scheduled"
  | "running"
  | "done"
  | "failed"
  | "cancelled";

export interface Automation {
  id: string;
  accountId: string;
  name: string;
  kind: AutomationKind;
  runAt: string;
  repeatDays: number | null;
  bundleId: string | null;
  /** Null once the group it pointed at has been deleted. */
  bundleName: string | null;
  subject: string | null;
  body: string | null;
  note: string | null;
  status: AutomationStatus;
  lastRunAt: string | null;
  lastError: string | null;
  runs: number;
  createdAt: string;
}

interface Row {
  id: string;
  account_id: string;
  name: string;
  kind: string;
  run_at: Date;
  repeat_days: number | null;
  bundle_id: string | null;
  bundle_name: string | null;
  subject: string | null;
  body: string | null;
  note: string | null;
  status: string;
  last_run_at: Date | null;
  last_error: string | null;
  runs: number;
  created_at: Date;
}

const SELECT = `
  SELECT a.id, a.account_id, a.name, a.kind, a.run_at, a.repeat_days,
         a.bundle_id, b.name AS bundle_name, a.subject, a.body, a.note,
         a.status, a.last_run_at, a.last_error, a.runs, a.created_at
    FROM automations a
    LEFT JOIN contact_bundles b ON b.id = a.bundle_id`;

function toAutomation(r: Row): Automation {
  return {
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    kind: r.kind as AutomationKind,
    runAt: r.run_at.toISOString(),
    repeatDays: r.repeat_days === null ? null : Number(r.repeat_days),
    bundleId: r.bundle_id,
    bundleName: r.bundle_name,
    subject: r.subject,
    body: r.body,
    note: r.note,
    status: r.status as AutomationStatus,
    lastRunAt: r.last_run_at?.toISOString() ?? null,
    lastError: r.last_error,
    runs: Number(r.runs),
    createdAt: r.created_at.toISOString(),
  };
}

/* ------------------------------------------------------------------ reads */

export async function listAutomations(accountId: string): Promise<Automation[]> {
  const rows = await query<Row>(
    `${SELECT} WHERE a.account_id = $1
      ORDER BY a.status = 'scheduled' DESC, a.run_at, a.created_at DESC`,
    [accountId],
  );
  return rows.map(toAutomation);
}

/** One, scoped to its owner. The id comes from a browser, so it is a claim
 *  until a query against this account's own rows returns something. */
export async function automationFor(
  accountId: string,
  id: string,
): Promise<Automation | null> {
  const row = await queryOne<Row>(`${SELECT} WHERE a.id = $1 AND a.account_id = $2`, [
    id,
    accountId,
  ]);
  return row ? toAutomation(row) : null;
}

/* ---------------------------------------------------------------- writing */

export interface NewAutomation {
  accountId: string;
  name: string;
  kind: AutomationKind;
  /** When it first runs. */
  runAt: Date;
  repeatDays: number | null;
  bundleId: string | null;
  subject: string | null;
  body: string | null;
  note: string | null;
}

export async function createAutomation(input: NewAutomation): Promise<string> {
  const id = newId();
  await execute(
    `INSERT INTO automations
       (id, account_id, name, kind, run_at, repeat_days, bundle_id, subject,
        body, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      input.accountId,
      input.name,
      input.kind,
      input.runAt,
      input.repeatDays,
      input.bundleId,
      input.subject,
      input.body,
      input.note,
    ],
  );
  return id;
}

/**
 * Stops one without removing it.
 *
 * Cancelled rather than deleted, because "did I turn that off?" is a
 * question somebody asks a week later, and a row that is gone cannot
 * answer it. A cancelled automation is never picked up again - the cron
 * only ever looks at 'scheduled'.
 */
export async function cancelAutomation(
  accountId: string,
  id: string,
): Promise<boolean> {
  const result = await execute(
    `UPDATE automations SET status = 'cancelled'
      WHERE id = $1 AND account_id = $2 AND status IN ('scheduled', 'failed')`,
    [id, accountId],
  );
  return (result.affectedRows ?? 0) > 0;
}

/** Puts a cancelled or failed one back, running next at the given time. */
export async function resumeAutomation(
  accountId: string,
  id: string,
  runAt: Date,
): Promise<boolean> {
  const result = await execute(
    `UPDATE automations
        SET status = 'scheduled', run_at = $3, last_error = NULL
      WHERE id = $1 AND account_id = $2 AND status IN ('cancelled', 'failed')`,
    [id, accountId, runAt],
  );
  return (result.affectedRows ?? 0) > 0;
}

export async function deleteAutomation(
  accountId: string,
  id: string,
): Promise<boolean> {
  const result = await execute(
    "DELETE FROM automations WHERE id = $1 AND account_id = $2",
    [id, accountId],
  );
  return (result.affectedRows ?? 0) > 0;
}

/* ------------------------------------------------------------- the runner */

/**
 * Takes the next due automation, or nothing.
 *
 * One at a time, claimed by the statement rather than selected and then
 * updated. A SELECT followed by an UPDATE is two moments with a gap
 * between them, and the gap is where a second cron call reads the same row.
 *
 * `run_at <= now()` and not a window: an automation that was due while the
 * server was down is still due when it comes back. Dropping it would mean
 * an outage silently cancelling work somebody scheduled.
 */
export async function claimDue(): Promise<Automation | null> {
  const next = await queryOne<{ id: string }>(
    `SELECT id FROM automations
      WHERE status = 'scheduled' AND run_at <= now()
      ORDER BY run_at
      LIMIT 1`,
  );
  if (!next) return null;

  const claimed = await execute(
    `UPDATE automations SET status = 'running'
      WHERE id = $1 AND status = 'scheduled'`,
    [next.id],
  );
  // Lost the race to another call. The caller asks again rather than
  // treating this as "nothing to do" - there may be more behind it.
  if ((claimed.affectedRows ?? 0) === 0) return null;

  const row = await queryOne<Row>(`${SELECT} WHERE a.id = $1`, [next.id]);
  return row ? toAutomation(row) : null;
}

/**
 * Records what happened, and decides whether there is a next time.
 *
 * A repeating automation is scheduled forward from *now* rather than from
 * the date it was meant to run. After an outage, counting from the missed
 * date would fire it again immediately, and again, until it had caught up
 * with every run it slept through - which for an email to a group is the
 * same group emailed five times in a minute.
 */
export async function finishRun(
  id: string,
  outcome: { ok: boolean; error?: string },
): Promise<void> {
  const row = await queryOne<{ repeat_days: number | null }>(
    "SELECT repeat_days FROM automations WHERE id = $1",
    [id],
  );
  const repeat = row?.repeat_days ?? null;

  if (!outcome.ok) {
    await execute(
      `UPDATE automations
          SET status = 'failed', last_run_at = now(), last_error = $2,
              runs = runs + 1
        WHERE id = $1`,
      [id, (outcome.error ?? "It did not run.").slice(0, 500)],
    );
    return;
  }

  if (repeat === null) {
    await execute(
      `UPDATE automations
          SET status = 'done', last_run_at = now(), last_error = NULL,
              runs = runs + 1
        WHERE id = $1`,
      [id],
    );
    return;
  }

  await execute(
    `UPDATE automations
        SET status = 'scheduled', last_run_at = now(), last_error = NULL,
            runs = runs + 1,
            run_at = DATE_ADD(now(), INTERVAL $2 DAY)
      WHERE id = $1`,
    [id, repeat],
  );
}

/**
 * Puts anything stuck in 'running' back.
 *
 * A process killed mid-run leaves its claim behind, and a claim nobody
 * releases is an automation that never fires again. Anything claimed more
 * than fifteen minutes ago has not survived; a run takes seconds.
 */
export async function releaseStalled(minutes = 15): Promise<number> {
  const result = await execute(
    `UPDATE automations SET status = 'scheduled'
      WHERE status = 'running' AND updated_at < DATE_SUB(now(), INTERVAL $1 MINUTE)`,
    [minutes],
  );
  return result.affectedRows ?? 0;
}

/** How many are waiting, for the badge on the screen. */
export async function countScheduled(accountId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    "SELECT COUNT(*) AS n FROM automations WHERE account_id = $1 AND status = 'scheduled'",
    [accountId],
  );
  return Number(row?.n ?? 0);
}
