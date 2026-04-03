# EHSTL Restore Runbook

This runbook restores the app from a single offsite backup file without using the EHSTL UI.

## Preconditions

- You have the Firebase credentials available as environment variables:
  - `FIREBASE_DATABASE_URL`
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
- You have either:
  - the latest backup file already downloaded locally, or
  - Google Drive credentials available to download it:
    - `GOOGLE_DRIVE_FOLDER_ID`
    - `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`

## 1. Read the Latest Backup

Download the newest backup file from Google Drive:

```bash
npm ci
npm run backup:download-latest -- --output ./backups/latest-backup.json
```

If you already have a specific backup file, skip this step.

## 2. Verify the Backup Before Restoring

```bash
npm run backup:verify -- --input ./backups/latest-backup.json
```

This checks:

- the backup is valid JSON
- the embedded checksum matches
- metadata counts are consistent
- `state`, `matches`, and `matchIndex` are present

## 3. Dry-Run the Restore

```bash
npm run backup:restore -- --input ./backups/latest-backup.json --dry-run
```

This validates the file again and confirms it is structurally safe to restore.

## 4. Restore `/ehstl/state`, `/ehstl/matches`, and `/ehstl/matchIndex`

```bash
npm run backup:restore -- --input ./backups/latest-backup.json --force
```

The restore script writes:

- `/ehstl/state`
- `/ehstl/matches`
- `/ehstl/matchIndex`

It then reads the three paths back from Firebase and fails if the live data does not exactly match the backup file.

## 5. Validate the Restored App

After the restore command succeeds:

1. Open the EHSTL app.
2. Confirm the active season year matches `metadata.seasonYear`.
3. Confirm rosters are visible in active divisions.
4. Confirm current-season match history is present.
5. Confirm archived seasons are still available.
6. Submit no admin changes until spot checks are complete.

For a second command-line check, rerun backup verification against live data by triggering a fresh manual backup from GitHub Actions and confirming the reported `matchCount` and `seasonYear`.

## Manual Test Restore Procedure

Use this after initial setup:

1. Trigger a manual backup from GitHub Actions.
2. Download that backup with `npm run backup:download-latest`.
3. Make a temporary, known-safe test change in Firebase to one of the restored paths.
4. Run the restore command with `--force`.
5. Confirm the temporary change is gone and the backed-up data is back in place.
6. Trigger another manual backup to confirm the pipeline still runs cleanly after restore.

## Safety Notes

- `restore --force` overwrites the three live Firebase paths.
- Do not run restore from an unverified or hand-edited backup file.
- Prefer triggering a manual backup immediately before any archive, restore, or bulk admin operation.

