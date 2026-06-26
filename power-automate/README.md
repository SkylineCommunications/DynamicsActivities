# Weekly PO escalation digest flow

This folder contains a source-controlled Power Automate definition for a scheduled weekly escalation digest.

## Files

- `escalation-digest-flow.json` - flow definition with recurrence trigger, Dataverse reads, PO grouping, HTML email rendering, and try/catch error handling.
- `README.md` - deployment and customization notes.

## What the flow does

1. Runs on a weekly recurrence (default: Monday 08:00, `W. Europe Standard Time`).
2. Reads `slc_escalation` records where:
   - `slc_status` is `1` (open) or `2` (in-progress), or
   - `modifiedon` is within the last 7 days.
3. Keeps only escalations whose `regardingobjectid` is an Account.
4. Groups escalations by Account.
5. Resolves the Account owner (`_ownerid_value`) as the Product Owner.
6. Groups accounts by Product Owner and sends one HTML digest email per owner.

> Note: escalations regarding Contacts or Opportunities are intentionally excluded because this digest is account-owned.

## Required connections

Map these connections when importing the flow:

1. **Microsoft Dataverse** (`shared_commondataserviceforapps`)
2. **Office 365 Outlook** (`shared_office365`)

If you use a shared mailbox, the Outlook connection account must already have **Send As** or **Send on behalf** permission on that mailbox.

## Import / deployment options

### Option A - solution source control / PAC pipeline (recommended)

Use `escalation-digest-flow.json` as the flow definition artifact inside your solution source tree or deployment pipeline. The file already contains:

- recurrence trigger
- Dataverse connector actions
- Office 365 Outlook actions
- connection references
- try/catch scope pattern

If your ALM process stores cloud flows as unpacked solution artifacts, place this JSON where your pipeline expects the flow definition and bind the connection references during import.

### Option B - maker portal rebuild from the definition

If you prefer to create the flow manually in the maker portal:

1. Create a **Scheduled cloud flow** in the target solution.
2. Recreate the actions from `escalation-digest-flow.json` in the same order.
3. Map the two connections above.
4. Save, turn on the flow, and run a test.

This JSON is intended as the deployable source artifact; some tenants still require packaging into a solution ZIP before direct import.

## Parameters / values to configure

The definition exposes these parameters:

| Parameter | Default | Purpose |
|---|---|---|
| `dataverseBaseUrl` | `https://skyline365-qa.crm4.dynamics.com` | Base URL used for the deep link to each escalation record |
| `sharedMailboxAddress` | blank | If blank, the flow sends as the Outlook connection account; if set, it uses the shared mailbox action |
| `digestLookbackDays` | `7` | Number of days included for recently modified/resolved escalations |
| `maxDescriptionLength` | `200` | Description truncation length in the email |

### Dataverse table names to verify

The flow assumes these Dataverse entity set names:

- `slc_escalations`
- `accounts`
- `systemusers`

For the custom activity table, verify the collection name in Dataverse. If your environment uses a different entity set name, update the `List_Escalations` action's `entityName` value.

## Changing the cadence (D4)

The trigger is intentionally simple to reconfigure:

- Current default: **weekly, Monday, 08:00, W. Europe Standard Time**
- To change it, edit the `Recurrence` trigger schedule in Power Automate:
  - `frequency`
  - `interval`
  - `timeZone`
  - `schedule.weekDays`
  - `schedule.hours`
  - `schedule.minutes`

Examples:

- Tuesday 07:30 CET -> `weekDays = ["Tuesday"]`, `hours = [7]`, `minutes = [30]`
- Every 2 weeks -> `interval = 2`

## PO targeting (D3) and future subscription-table swap

Current routing is based on **Account ownership**:

- `Get_Account` reads `_ownerid_value`
- `Get_Owning_User` resolves the `systemuser`
- `Apply_to_each_Owner` sends one email per owner

To swap in a future subscription table later:

1. Leave the escalation query and account grouping unchanged.
2. Replace the owner-resolution block (`Get_Account` + `Get_Owning_User`) with a `List rows` or `Get row` against a subscription table such as `slc_escalationsubscriptions`.
3. Populate the same digest object fields currently appended in `Append_Account_Digest`:
   - `ownerId`
   - `ownerName`
   - `ownerEmail`
   - `accountId`
   - `accountName`
   - `activeCount`
   - `accountHtml`
4. Keep `Compose_Unique_Owner_Ids` and `Apply_to_each_Owner` as-is.

That makes the targeting mechanism pluggable without changing the email assembly or the escalation formatting.

## Deep link format

Each escalation row links to Dynamics using:

```text
https://skyline365-qa.crm4.dynamics.com/main.aspx?etn=slc_escalation&id={activityid}&pagetype=entityrecord
```

The base URL comes from `dataverseBaseUrl`.

## Email contents

Each PO receives:

- Subject: `Weekly Escalation Digest — {date range}`
- Summary line: `X active escalations across Y accounts`
- One section per account
- For each escalation:
  - subject
  - description (trimmed to 200 chars)
  - status
  - start date
  - record link

The summary count uses only active statuses (`open`, `in-progress`). The detail section also includes recently modified items from the lookback window so recent resolutions are visible.

## Error handling

The definition uses a standard scope pattern:

- `Try` scope: all recurrence, Dataverse, grouping, and email logic
- `Catch` scope: terminates the flow with a clear failure message if the `Try` scope fails or times out

If you want operational alerting later, add a Teams post or admin email action inside the `Catch` scope before `Terminate_Flow`.

## Post-import validation checklist

After import:

1. Turn the flow on.
2. Run a manual test or temporarily shorten the recurrence window.
3. Confirm at least one PO receives a digest.
4. Verify the deep link opens the `slc_escalation` record.
5. Verify accounts with non-user owners or missing owner email are handled as expected in your environment.
6. If needed, adjust the custom activity entity set name in `List_Escalations`.

