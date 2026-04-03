const crypto = require("node:crypto");

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortKeysDeep(value[key]);
      return acc;
    }, {});
}

function stableStringify(value, space = 0) {
  return JSON.stringify(sortKeysDeep(value), null, space);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function deepEqual(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function parseBackupTimestampFromName(name) {
  const match = /^ehstl-backup-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.(json|sha256)$/.exec(String(name || ""));
  if (!match) return null;
  return new Date(match[1].replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, "T$1:$2:$3Z"));
}

function monthKeyUtc(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function subtractDays(date, days) {
  return new Date(date.getTime() - (days * 24 * 60 * 60 * 1000));
}

function subtractYears(date, years) {
  const next = new Date(date.getTime());
  next.setUTCFullYear(next.getUTCFullYear() - years);
  return next;
}

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

module.exports = {
  deepEqual,
  formatBackupTimestamp,
  formatJson,
  isPlainObject,
  monthKeyUtc,
  parseBackupTimestampFromName,
  sha256,
  sortKeysDeep,
  stableStringify,
  subtractDays,
  subtractYears
};

