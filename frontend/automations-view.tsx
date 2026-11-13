"use client";

import { useState, useTransition } from "react";
import {
  AlarmClock,
  CalendarClock,
  Loader2,
  Mail,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PanelHead, Chip, type Tone } from "@/components/common/panel";
import {
  cancelAutomationAction,
  createAutomationAction,
  deleteAutomationAction,
  resumeAutomationAction,
} from "@/server/actions/automation-actions";
import type { Automation } from "@/server/repos/automations";

/**
 * What the product does on its own, and when.
 *
 * Two kinds, because they are the two people actually ask for: remind me
 * about this in a fortnight, and send this to that group in a month.
 *
 * Everything is written as "in N days" rather than as a date on a picker.
 * That is how the thing is thought about - "chase them in a week" - and a
 * date picker makes somebody do the arithmetic the product could do for
 * them. The row below then shows the date it came to, so the sum is
 * checkable.
 */

interface Group {
  id: string;
  name: string;
  members: number;
}

const STATUS: Record<string, { label: string; tone: Tone; pulse?: boolean }> = {
  scheduled: { label: "Waiting", tone: "brand" },
  running: { label: "Running now", tone: "info", pulse: true },
  done: { label: "Done", tone: "good" },
  failed: { label: "Did not run", tone: "bad" },
  cancelled: { label: "Stopped", tone: "plain" },
};

function whenLabel(iso: string): string {
  const at = new Date(iso);
  const days = Math.round((at.getTime() - Date.now()) / 86_400_000);
  const date = at.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  if (days < 0) return `${date} (overdue)`;
  if (days === 0) return `${date} (today)`;
  if (days === 1) return `${date} (tomorrow)`;
  return `${date} (in ${days} days)`;
}

export function AutomationsView({
  automations,
  groups,
}: {
  automations: Automation[];
  groups: Group[];
}) {
  const [adding, setAdding] = useState<"remind_me" | "email_group" | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel tone="brand">
          <PanelHead
            title="Remind me"
            hint="A note to yourself in the bell, on a day you choose. Nothing is emailed to anybody."
            Icon={AlarmClock}
          />
          <Button type="button" className="mt-4" onClick={() => setAdding("remind_me")}>
            <Plus className="size-4" aria-hidden="true" />
            Set a reminder
          </Button>
        </Panel>

        <Panel tone="info">
          <PanelHead
            title="Email a group"
            hint="Sends what you write to everyone in a group, on a day you choose. No review link, and anyone who unsubscribed is skipped."
            Icon={Mail}
          />
          <Button
            type="button"
            className="mt-4"
            disabled={groups.length === 0}
            onClick={() => setAdding("email_group")}
          >
            <Plus className="size-4" aria-hidden="true" />
            Schedule an email
          </Button>
          {groups.length === 0 && (
            <p className="tone-dim mt-2 text-xs">
              Make a group first — it is the list this sends to.
            </p>
          )}
        </Panel>
      </div>

      {adding && (
        <AutomationForm
          kind={adding}
          groups={groups}
          onDone={() => setAdding(null)}
        />
      )}

      <Panel>
        <PanelHead
          title="Scheduled"
          hint={
            automations.length === 0
              ? "Nothing scheduled yet."
              : `${automations.length} set up.`
          }
          Icon={CalendarClock}
        />
        {automations.length > 0 && (
          <ul className="mt-3 list-none">
            {automations.map((automation) => (
              <AutomationRow key={automation.id} automation={automation} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function AutomationRow({ automation }: { automation: Automation }) {
  const [pending, start] = useTransition();
  const look = STATUS[automation.status] ?? STATUS.scheduled;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
  ) {
    start(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? "That did not work.");
    });
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--tone-border)] py-3 last:border-0">
      <span className="min-w-0">
        <span className="tone-ink flex flex-wrap items-center gap-2 text-sm font-semibold">
          {automation.kind === "remind_me" ? (
            <AlarmClock className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Mail className="size-4 shrink-0" aria-hidden="true" />
          )}
          {automation.name}
          <Chip tone={look.tone} pulse={look.pulse}>
            {look.label}
          </Chip>
        </span>
        <span className="tone-dim mt-0.5 block text-xs">
          {automation.status === "done"
            ? `Ran ${automation.runs} ${automation.runs === 1 ? "time" : "times"}`
            : whenLabel(automation.runAt)}
          {automation.repeatDays
            ? ` · repeats every ${automation.repeatDays} days`
            : " · once"}
          {automation.kind === "email_group" &&
            ` · to ${automation.bundleName ?? "a group that has been deleted"}`}
        </span>
        {automation.lastError && (
          <span className="mt-1 block text-xs text-red-600 dark:text-red-400">
            {automation.lastError}
          </span>
        )}
      </span>

      <span className="flex shrink-0 flex-wrap gap-2">
        {automation.status === "scheduled" && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => cancelAutomationAction(automation.id), "Stopped.")
            }
          >
            <X className="size-3.5" aria-hidden="true" />
            Stop
          </Button>
        )}
        {(automation.status === "cancelled" || automation.status === "failed") && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => resumeAutomationAction(automation.id, 1),
                "Back on, running tomorrow.",
              )
            }
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Start again
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => deleteAutomationAction(automation.id), "Removed.")
          }
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
          Remove
        </Button>
      </span>
    </li>
  );
}

/**
 * The message under a field, or nothing.
 *
 * A plain function rather than a component, and deliberately so: a
 * component declared inside another component's body is a fresh component
 * type on every render, so React throws the old one away and mounts a new
 * one each time - which on a form being typed into means the field loses
 * focus between keystrokes.
 */
function fieldError(errors: Record<string, string>, name: string) {
  if (!errors[name]) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors[name]}</p>;
}

function AutomationForm({
  kind,
  groups,
  onDone,
}: {
  kind: "remind_me" | "email_group";
  groups: Group[];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [repeats, setRepeats] = useState(false);

  function submit(formData: FormData) {
    setErrors({});
    start(async () => {
      const result = await createAutomationAction({
        name: formData.get("name"),
        kind,
        afterDays: formData.get("afterDays"),
        repeatDays: repeats ? formData.get("repeatDays") : "",
        bundleId: formData.get("bundleId"),
        subject: formData.get("subject"),
        body: formData.get("body"),
        note: formData.get("note"),
      });

      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        if (result.error) toast.error(result.error);
        return;
      }
      toast.success("Scheduled.");
      onDone();
    });
  }

  return (
    <Panel tone={kind === "remind_me" ? "brand" : "info"}>
      <PanelHead
        title={kind === "remind_me" ? "New reminder" : "New scheduled email"}
        Icon={kind === "remind_me" ? AlarmClock : Mail}
        right={
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        }
      />

      <form action={submit} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">Call it</Label>
            <Input
              id="name"
              name="name"
              required
              className="mt-1.5"
              placeholder={
                kind === "remind_me" ? "Chase the Henderson job" : "October gutter offer"
              }
            />
            {fieldError(errors, "name")}
          </div>
          <div>
            <Label htmlFor="afterDays">In how many days?</Label>
            <Input
              id="afterDays"
              name="afterDays"
              type="number"
              min={1}
              max={730}
              defaultValue={7}
              required
              className="mt-1.5"
            />
            {fieldError(errors, "afterDays")}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={repeats}
              onChange={(event) => setRepeats(event.target.checked)}
              className="size-4 rounded border-border"
            />
            Keep repeating
          </label>
          {repeats && (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              every
              <Input
                name="repeatDays"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                className="h-9 w-20"
              />
              days
            </span>
          )}
        </div>
        {fieldError(errors, "repeatDays")}

        {kind === "remind_me" ? (
          <div>
            <Label htmlFor="note">Remind me about</Label>
            <Textarea
              id="note"
              name="note"
              rows={3}
              className="mt-1.5"
              placeholder="Ring them about the second half of the job."
            />
            {fieldError(errors, "note")}
          </div>
        ) : (
          <>
            <div>
              <Label htmlFor="bundleId">Send to</Label>
              <select
                id="bundleId"
                name="bundleId"
                className="mt-1.5 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name} ({group.members})
                  </option>
                ))}
              </select>
              {fieldError(errors, "bundleId")}
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" name="subject" className="mt-1.5" />
              {fieldError(errors, "subject")}
            </div>
            <div>
              <Label htmlFor="body">Message</Label>
              <Textarea id="body" name="body" rows={8} className="mt-1.5" />
              {fieldError(errors, "body")}
              <p className="tone-dim mt-1.5 text-xs">
                No review link is added. Your name and an unsubscribe line go at
                the bottom, and anyone who has unsubscribed is skipped.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--tone-border)] pt-4">
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarClock className="size-4" aria-hidden="true" />
            )}
            {pending ? "Scheduling" : "Schedule it"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}
