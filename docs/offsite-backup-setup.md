# EHSTL Offsite Backup Setup

This implementation keeps the backup pipeline at `$0` added platform cost by using:

- GitHub Actions for scheduling and logs
- A Google Drive folder you already control for offsite storage
- A small Node.js job in this repo

No Codex Google Drive plugin is required. The runtime talks to the Google Drive API directly.

## Architecture

- Source: Firebase Realtime Database
- Required paths:
  - `/ehstl/state`
  - `/ehstl/matches`
  - `/ehstl/matchIndex`
- Destination: one immutable JSON file per run in a dedicated Google Drive folder
- Schedule: daily at 2:00 AM `America/New_York`
- DST note: on the spring-forward day, GitHub Actions cannot hit a nonexistent 2:00 AM local time, so the workflow accepts the first valid post-jump slot instead
- Manual trigger: GitHub Actions `workflow_dispatch`
- Alerting: GitHub issue auto-opened if the job fails twice
- Retention:
  - keep every backup for 90 days
  - after 90 days, keep one monthly backup for 2 years
  - never overwrite an existing backup file

## Files Added

- `.github/workflows/ehstl-offsite-backup.yml`
- `scripts/ehstl-backup.js`
- `docs/offsite-backup-restore.md`

## Required Secrets

Add these GitHub Actions repository secrets:

- `FIREBASE_DATABASE_URL`
  - Example: `https://ehstl-ca834-default-rtdb.firebaseio.com`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
  - Full JSON service account key for the Firebase project
- `GOOGLE_DRIVE_FOLDER_ID`
  - The destination Drive folder ID
- `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`
  - Full JSON service account key for the Drive uploader

The scripts also accept these locally as normal environment variables.

## Google Drive Setup

1. In Google Cloud, enable the Google Drive API.
2. Create a dedicated service account for backup uploads.
3. Generate a JSON key for that service account.
4. In Google Drive, create a dedicated folder for EHSTL backups.
5. Share that folder with the service account email as `Editor`.

Use a dedicated folder. That is the practical least-privilege boundary for this design.

## Firebase Setup

1. Create or reuse a service account from the EHSTL Firebase project.
2. Generate a JSON key.
3. Store that JSON in `FIREBASE_SERVICE_ACCOUNT_JSON`.
4. Store the Realtime Database URL in `FIREBASE_DATABASE_URL`.

The backup workflow reads live data directly from the server side. It does not rely on browser credentials or client-side Firebase access.

## GitHub Setup

1. Commit these files to the repo default branch.
2. Confirm GitHub Actions is enabled for the repo.
3. Confirm GitHub Issues is enabled for the repo.
4. Add the four secrets above.
5. Run the workflow manually once from the Actions tab.

## Manual Commands

Run a backup locally:

```bash
npm ci
npm run backup
```

Download the latest Drive backup:

```bash
npm run backup:download-latest -- --output ./backups/latest-backup.json
```

Verify a backup file:

```bash
npm run backup:verify -- --input ./backups/latest-backup.json
```

## Backup File Contents

Each backup includes:

- `timestamp`
- `source`
- `metadata`
- `state`
- `matches`
- `matchIndex`

Metadata includes:

- `seasonYear`
- `matchCount`
- `archivedSeasonCount`
- `matchIndexEntryCount`
- `schemaVersion`
- `checksumSha256`

## Integrity Checks

Every backup run validates:

- `state` exists
- `matches` field exists, even if `null`
- `matchIndex` field exists, even if `null`
- JSON round-trips cleanly
- metadata counts match the payload
- `seasonYear` matches `state.seasonInfo.year`
- every active match has a corresponding `matchIndex` entry for the current season
- the embedded SHA-256 checksum matches the snapshot contents

Each run also writes a sidecar `.sha256` file to Drive.

## Failure Handling

- first failure does not delete prior backups
- the workflow waits 5 minutes and retries once
- if both attempts fail, a GitHub issue is opened or updated
- logs remain preserved in the failed GitHub Actions run

## Retention Behavior

The job prunes only files it created in the configured Drive folder:

- all backup JSON files newer than 90 days are kept
- between 90 days and 2 years, one backup per month is kept
- files older than 2 years are removed
- checksum sidecars are deleted only when their matching JSON backup is deleted

## Cost Notes

This design avoids extra service cost as long as:

- your repo can use GitHub Actions within its included allowance
- your Google Drive account already has enough storage

It does not require Render, Cloud Run, Netlify, or S3.
