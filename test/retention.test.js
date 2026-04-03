const test = require("node:test");
const assert = require("node:assert/strict");
const { getPrunableDriveArtifacts } = require("../scripts/lib/retention");

test("retention keeps recent daily backups and one monthly backup", () => {
  const files = [
    { id: "1", name: "ehstl-backup-2026-03-30T06-00-00Z.json", backupTimestamp: new Date("2026-03-30T06:00:00Z") },
    { id: "2", name: "ehstl-backup-2026-03-30T06-00-00Z.sha256", backupTimestamp: new Date("2026-03-30T06:00:00Z") },
    { id: "3", name: "ehstl-backup-2025-11-01T06-00-00Z.json", backupTimestamp: new Date("2025-11-01T06:00:00Z") },
    { id: "4", name: "ehstl-backup-2025-11-01T06-00-00Z.sha256", backupTimestamp: new Date("2025-11-01T06:00:00Z") },
    { id: "5", name: "ehstl-backup-2025-11-15T06-00-00Z.json", backupTimestamp: new Date("2025-11-15T06:00:00Z") },
    { id: "6", name: "ehstl-backup-2025-11-15T06-00-00Z.sha256", backupTimestamp: new Date("2025-11-15T06:00:00Z") },
    { id: "7", name: "ehstl-backup-2023-12-01T07-00-00Z.json", backupTimestamp: new Date("2023-12-01T07:00:00Z") },
    { id: "8", name: "ehstl-backup-2023-12-01T07-00-00Z.sha256", backupTimestamp: new Date("2023-12-01T07:00:00Z") }
  ];

  const result = getPrunableDriveArtifacts(files, new Date("2026-04-03T12:00:00Z"));
  const deletedIds = result.deleteFiles.map(file => file.id).sort();
  const keptIds = result.keepFiles.map(file => file.id).sort();

  assert.deepEqual(deletedIds, ["5", "6", "7", "8"]);
  assert.deepEqual(keptIds, ["1", "2", "3", "4"]);
});
