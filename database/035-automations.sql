-- Things the business sets up once and the product does on its own.
--
-- Two kinds to begin with, because they are the two somebody actually asks
-- for: "remind me about this in a fortnight", and "send this to that group
-- in a month".
--
-- The schedule is a single `run_at` rather than a rule to be interpreted.
-- A row says when it next happens, and a repeating one moves its own date
-- forward after it fires. That means the cron query is an index lookup -
-- "what is due" - rather than a pass over every automation working out
-- whether today counts, and it means a row can be read by a person: the
-- date you are looking at is the date it will happen.
--
-- Safe to run twice: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS automations (
  id            CHAR(36)      NOT NULL,
  account_id    CHAR(36)      NOT NULL,
  -- What the business calls it, so a list of six is readable.
  name          VARCHAR(160)  NOT NULL,
  kind          VARCHAR(24)   NOT NULL,

  -- When it next happens. Written from "in N days" at the time it is set
  -- up, so the stored value is the answer rather than a sum to redo.
  run_at        DATETIME(3)   NOT NULL,
  -- Null means once and then done. Otherwise the gap to the next run.
  repeat_days   SMALLINT,

  -- For 'email_group': who it goes to and what it says.
  bundle_id     CHAR(36),
  subject       VARCHAR(200),
  body          TEXT,

  -- For 'remind_me': what to be reminded about.
  note          VARCHAR(500),

  status        VARCHAR(16)   NOT NULL DEFAULT 'scheduled',
  -- 'running' is the claim. Two cron calls a second apart must not both
  -- send the same email to the same group, and the claim is an UPDATE
  -- whose WHERE tests the status it is changing - so the database decides
  -- which one wins rather than the order they happened to arrive.
  last_run_at   DATETIME(3),
  last_error    VARCHAR(500),
  runs          INT           NOT NULL DEFAULT 0,

  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
                              ON UPDATE CURRENT_TIMESTAMP(3),

  PRIMARY KEY (id),
  -- The cron's only question, in the order it asks it.
  KEY automations_due_idx (status, run_at),
  KEY automations_account_idx (account_id, created_at),

  CONSTRAINT automations_account_fk FOREIGN KEY (account_id)
    REFERENCES profiles(id) ON DELETE CASCADE,
  -- A deleted group does not delete the automation: the row stays, loses
  -- its group, and fails loudly with a reason somebody can read. Removing
  -- it silently would be the product forgetting something it was asked to
  -- do, which is the one thing an automation must never do.
  CONSTRAINT automations_bundle_fk FOREIGN KEY (bundle_id)
    REFERENCES contact_bundles(id) ON DELETE SET NULL,

  CONSTRAINT automations_kind_check
    CHECK (kind IN ('remind_me', 'email_group')),
  CONSTRAINT automations_status_check
    CHECK (status IN ('scheduled', 'running', 'done', 'failed', 'cancelled')),
  -- A year is the longest gap worth calling a repeat, and a day the
  -- shortest worth calling a schedule.
  CONSTRAINT automations_repeat_check
    CHECK (repeat_days IS NULL OR repeat_days BETWEEN 1 AND 365),
  -- An email automation with no subject or no body is one that can only
  -- fail at the moment it runs, which is the worst moment to find out
  -- because nobody is watching.
  --
  -- `bundle_id` is deliberately NOT in this rule, and the reason is the
  -- foreign key above. MySQL refuses a CHECK over a column that a
  -- referential action writes to - ON DELETE SET NULL has to be able to
  -- put a NULL there - and the two together were a contradiction anyway:
  -- the column cannot both be allowed to become NULL and be forbidden
  -- from being NULL. The group is required when the automation is
  -- created, and a run whose group has since been deleted fails with a
  -- reason rather than quietly sending to nobody.
  CONSTRAINT automations_email_complete_check
    CHECK (
      kind <> 'email_group'
      OR (subject IS NOT NULL AND body IS NOT NULL)
    ),
  -- And a reminder with nothing to say is a notification that reads blank.
  CONSTRAINT automations_remind_complete_check
    CHECK (kind <> 'remind_me' OR note IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
