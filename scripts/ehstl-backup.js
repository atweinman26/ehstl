#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const {
  BACKUP_PREFIX,
  BACKUP_SOURCE
} = require("./lib/constants");
const { createDriveClient, createDriveFile, deleteDriveFile, downloadDriveFile, listBackupArtifacts } = require("./lib/drive");
const { optionalEnv, parseJsonEnv, requiredEnv } = require("./lib/env");
const { createFirebaseClient } = require("./lib/firebase");
const { getPrunableDriveArtifacts } = require("./lib/retention");
const { buildSnapshot, getSnapshotChecksum, validateSnapshot } = require("./lib/snapshot");
const { deepEqual, formatBackupTimestamp, formatJson } = require("./lib/util");

function parseArgs(argv) {
  const args = {
    _: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      args._.push(value);
      continue;
    }

    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function getDriveConfig() {
  const hasOauth =
    optionalEnv("GOOGLE_DRIVE_CLIENT_ID")
    && optionalEnv("GOOGLE_DRIVE_CLIENT_SECRET")
    && optionalEnv("GOOGLE_DRIVE_REFRESH_TOKEN");

  if (hasOauth) {
    return {
      type: "oauth_refresh_token",
      folderId: requiredEnv("GOOGLE_DRIVE_FOLDER_ID"),
      clientId: requiredEnv("GOOGLE_DRIVE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
      refreshToken: requiredEnv("GOOGLE_DRIVE_REFRESH_TOKEN")
    };
  }

  const serviceAccountJson = optionalEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
  if (serviceAccountJson) {
    return {
      type: "service_account",
      folderId: requiredEnv("GOOGLE_DRIVE_FOLDER_ID"),
      serviceAccount: parseJsonEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON")
    };
  }

  return {
    type: "oauth_refresh_token",
    folderId: requiredEnv("GOOGLE_DRIVE_FOLDER_ID"),
    clientId: requiredEnv("GOOGLE_DRIVE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_DRIVE_CLIENT_SECRET"),
    refreshToken: requiredEnv("GOOGLE_DRIVE_REFRESH_TOKEN")
  };
}

function getFirebaseConfig() {
  return {
    databaseURL: requiredEnv("FIREBASE_DATABASE_URL"),
    serviceAccount: parseJsonEnv("FIREBASE_SERVICE_ACCOUNT_JSON")
  };
}

async function fetchLiveSnapshot(firebase) {
  const [state, matches, matchIndex] = await Promise.all([
    firebase.get("ehstl/state"),
    firebase.get("ehstl/matches"),
    firebase.get("ehstl/matchIndex")
  ]);

  return buildSnapshot({
    state,
    matches,
    matchIndex
  });
}

async function backupCommand() {
  const firebase = createFirebaseClient(getFirebaseConfig());
  const driveConfig = getDriveConfig();
  const drive = createDriveClient(driveConfig.serviceAccount);

  try {
    const snapshot = await fetchLiveSnapshot(firebase);
    const validation = validateSnapshot(snapshot);
    if (!validation.ok) {
      throw new Error(`Backup validation failed:\n- ${validation.errors.join("\n- ")}`);
    }

    const fileTimestamp = formatBackupTimestamp(new Date(snapshot.timestamp));
    const backupName = `${BACKUP_PREFIX}${fileTimestamp}.json`;
    const checksumName = `${BACKUP_PREFIX}${fileTimestamp}.sha256`;
    const backupJson = formatJson(snapshot);
    const checksumLine = `${getSnapshotChecksum(snapshot)}  ${backupName}\n`;

    const uploadedBackup = await createDriveFile(drive, {
      folderId: driveConfig.folderId,
      name: backupName,
      mimeType: "application/json",
      body: backupJson,
      description: `${BACKUP_SOURCE} ${snapshot.timestamp}`
    });

    await createDriveFile(drive, {
      folderId: driveConfig.folderId,
      name: checksumName,
      mimeType: "text/plain",
      body: checksumLine,
      description: `SHA-256 for ${backupName}`
    });

    const artifacts = await listBackupArtifacts(drive, driveConfig.folderId);
    const retention = getPrunableDriveArtifacts(artifacts, new Date(snapshot.timestamp));

    for (const artifact of retention.deleteFiles) {
      await deleteDriveFile(drive, artifact.id);
    }

    console.log(formatJson({
      status: "ok",
      uploadedBackupId: uploadedBackup.id,
      uploadedBackupName: backupName,
      uploadedBackupUrl: uploadedBackup.webViewLink,
      snapshotTimestamp: snapshot.timestamp,
      matchCount: snapshot.metadata.matchCount,
      archivedSeasonCount: snapshot.metadata.archivedSeasonCount,
      matchIndexEntryCount: snapshot.metadata.matchIndexEntryCount,
      prunedArtifacts: retention.summary
    }));
  } finally {
    await firebase.close();
  }
}

async function loadSnapshotFromFile(inputPath) {
  const contents = await fs.readFile(inputPath, "utf8");
  const snapshot = JSON.parse(contents);
  const validation = validateSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`Backup file failed validation:\n- ${validation.errors.join("\n- ")}`);
  }
  return snapshot;
}

async function downloadLatestCommand(args) {
  const driveConfig = getDriveConfig();
  const drive = createDriveClient(driveConfig.serviceAccount);
  const outputPath = path.resolve(args.output || path.join(process.cwd(), "backups", "latest-backup.json"));
  const artifacts = await listBackupArtifacts(drive, driveConfig.folderId);
  const latest = artifacts
    .filter(file => String(file.name || "").endsWith(".json") && file.backupTimestamp)
    .sort((left, right) => right.backupTimestamp - left.backupTimestamp)[0];

  if (!latest) {
    throw new Error("No backup JSON files were found in the configured Google Drive folder.");
  }

  await downloadDriveFile(drive, latest.id, outputPath);

  console.log(formatJson({
    status: "ok",
    fileId: latest.id,
    fileName: latest.name,
    outputPath,
    backupTimestamp: latest.backupTimestamp.toISOString()
  }));
}

async function verifyCommand(args) {
  if (!args.input) {
    throw new Error("verify requires --input <path-to-backup.json>.");
  }

  const inputPath = path.resolve(args.input);
  const snapshot = await loadSnapshotFromFile(inputPath);
  console.log(formatJson({
    status: "ok",
    inputPath,
    timestamp: snapshot.timestamp,
    seasonYear: snapshot.metadata.seasonYear,
    matchCount: snapshot.metadata.matchCount,
    archivedSeasonCount: snapshot.metadata.archivedSeasonCount,
    checksumSha256: snapshot.metadata.checksumSha256
  }));
}

async function restoreCommand(args) {
  if (!args.input) {
    throw new Error("restore requires --input <path-to-backup.json>.");
  }

  if (!args.force && !args["dry-run"]) {
    throw new Error("restore requires --force for a live write, or use --dry-run to validate without changing Firebase.");
  }

  const snapshot = await loadSnapshotFromFile(path.resolve(args.input));

  if (args["dry-run"]) {
    console.log(formatJson({
      status: "ok",
      dryRun: true,
      timestamp: snapshot.timestamp,
      seasonYear: snapshot.metadata.seasonYear,
      matchCount: snapshot.metadata.matchCount
    }));
    return;
  }

  const firebase = createFirebaseClient(getFirebaseConfig());

  try {
    await firebase.set("ehstl/state", snapshot.state);
    await firebase.set("ehstl/matches", snapshot.matches);
    await firebase.set("ehstl/matchIndex", snapshot.matchIndex);

    const [state, matches, matchIndex] = await Promise.all([
      firebase.get("ehstl/state"),
      firebase.get("ehstl/matches"),
      firebase.get("ehstl/matchIndex")
    ]);

    if (!deepEqual(state, snapshot.state) || !deepEqual(matches, snapshot.matches) || !deepEqual(matchIndex, snapshot.matchIndex)) {
      throw new Error("Firebase read-back verification failed after restore.");
    }

    console.log(formatJson({
      status: "ok",
      restoredFrom: path.resolve(args.input),
      timestamp: snapshot.timestamp,
      seasonYear: snapshot.metadata.seasonYear,
      matchCount: snapshot.metadata.matchCount
    }));
  } finally {
    await firebase.close();
  }
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts/ehstl-backup.js backup",
    "  node scripts/ehstl-backup.js download-latest [--output ./backups/latest-backup.json]",
    "  node scripts/ehstl-backup.js verify --input ./backups/latest-backup.json",
    "  node scripts/ehstl-backup.js restore --input ./backups/latest-backup.json --dry-run",
    "  node scripts/ehstl-backup.js restore --input ./backups/latest-backup.json --force"
  ].join("\n"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];

  if (!command || command === "help" || command === "--help") {
    printUsage();
    return;
  }

  if (command === "backup") {
    await backupCommand();
    return;
  }

  if (command === "download-latest") {
    await downloadLatestCommand(args);
    return;
  }

  if (command === "verify") {
    await verifyCommand(args);
    return;
  }

  if (command === "restore") {
    await restoreCommand(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
