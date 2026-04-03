const { monthKeyUtc, parseBackupTimestampFromName, subtractDays, subtractYears } = require("./util");

function getPrunableDriveArtifacts(files, now = new Date()) {
  const jsonFiles = files
    .filter(file => String(file.name || "").endsWith(".json"))
    .map(file => ({
      ...file,
      backupTimestamp: file.backupTimestamp || parseBackupTimestampFromName(file.name)
    }))
    .filter(file => file.backupTimestamp instanceof Date && !Number.isNaN(file.backupTimestamp.getTime()))
    .sort((left, right) => left.backupTimestamp - right.backupTimestamp);

  const keepJsonIds = new Set();
  const dailyCutoff = subtractDays(now, 90);
  const monthlyCutoff = subtractYears(now, 2);
  const monthlyKeepers = new Map();

  for (const file of jsonFiles) {
    if (file.backupTimestamp >= dailyCutoff) {
      keepJsonIds.add(file.id);
      continue;
    }

    if (file.backupTimestamp < monthlyCutoff) {
      continue;
    }

    const key = monthKeyUtc(file.backupTimestamp);
    const existing = monthlyKeepers.get(key);
    if (!existing || file.backupTimestamp < existing.backupTimestamp) {
      monthlyKeepers.set(key, file);
    }
  }

  for (const file of monthlyKeepers.values()) {
    keepJsonIds.add(file.id);
  }

  const deleteJsonFiles = jsonFiles.filter(file => !keepJsonIds.has(file.id));
  const deleteBaseNames = new Set(deleteJsonFiles.map(file => file.name.replace(/\.json$/, "")));
  const deleteChecksumFiles = files.filter(file => {
    if (!String(file.name || "").endsWith(".sha256")) return false;
    return deleteBaseNames.has(file.name.replace(/\.sha256$/, ""));
  });

  return {
    keepFiles: files.filter(file => {
      if (String(file.name || "").endsWith(".json")) return keepJsonIds.has(file.id);
      if (String(file.name || "").endsWith(".sha256")) return !deleteChecksumFiles.some(candidate => candidate.id === file.id);
      return true;
    }),
    deleteFiles: [...deleteJsonFiles, ...deleteChecksumFiles],
    summary: {
      totalArtifacts: files.length,
      backupJsonFiles: jsonFiles.length,
      keptJsonFiles: keepJsonIds.size,
      deletedJsonFiles: deleteJsonFiles.length,
      deletedChecksumFiles: deleteChecksumFiles.length
    }
  };
}

module.exports = {
  getPrunableDriveArtifacts
};

