const { BACKUP_SOURCE, SCHEMA_VERSION } = require("./constants");
const {
  buildFirebaseKeySegment,
  buildMatchupKey,
  countMatchIndexLeaves,
  getSeasonMatchIndexKey
} = require("./firebase-paths");
const { formatJson, sha256, stableStringify } = require("./util");

function countMatches(matches) {
  if (!matches || typeof matches !== "object") return 0;
  return Object.keys(matches).length;
}

function buildBackupMetadata({ state, matches, matchIndex }) {
  const seasonYear = String(state && state.seasonInfo && state.seasonInfo.year ? state.seasonInfo.year : "");
  const archivedSeasonCount = Array.isArray(state && state.archivedSeasons) ? state.archivedSeasons.length : 0;

  return {
    seasonYear,
    matchCount: countMatches(matches),
    archivedSeasonCount,
    matchIndexEntryCount: countMatchIndexLeaves(matchIndex),
    schemaVersion: SCHEMA_VERSION
  };
}

function buildSnapshot({ state, matches, matchIndex, timestamp = new Date().toISOString() }) {
  const snapshot = {
    timestamp,
    source: BACKUP_SOURCE,
    metadata: buildBackupMetadata({ state, matches, matchIndex }),
    state: state ?? null,
    matches: matches ?? null,
    matchIndex: matchIndex ?? null
  };

  const checksumSha256 = sha256(stableStringify(snapshot));
  snapshot.metadata.checksumSha256 = checksumSha256;
  return snapshot;
}

function getSnapshotChecksum(snapshot) {
  const clone = JSON.parse(JSON.stringify(snapshot));
  if (clone.metadata) {
    delete clone.metadata.checksumSha256;
  }
  return sha256(stableStringify(clone));
}

function getExpectedIndexEntries(snapshot) {
  const seasonKey = getSeasonMatchIndexKey(snapshot.state && snapshot.state.seasonInfo);
  const matches = snapshot.matches || {};

  return Object.entries(matches).map(([matchKey, match]) => {
    if (!match || typeof match !== "object") {
      return {
        error: `Active match ${matchKey} is not an object.`
      };
    }

    if (!match.divCode || !match.winner || !match.loser) {
      return {
        error: `Active match ${matchKey} is missing divCode, winner, or loser.`
      };
    }

    const divKey = buildFirebaseKeySegment(match.divCode);
    const pairKey = buildMatchupKey(match.winner, match.loser);

    return {
      seasonKey,
      divKey,
      pairKey,
      matchKey
    };
  });
}

function validateSnapshot(snapshot) {
  const errors = [];

  if (!snapshot || typeof snapshot !== "object") {
    return {
      ok: false,
      errors: ["Snapshot is missing or not an object."]
    };
  }

  if (!snapshot.state || typeof snapshot.state !== "object") {
    errors.push("Snapshot state is missing.");
  }

  if (!Object.prototype.hasOwnProperty.call(snapshot, "matches")) {
    errors.push("Snapshot matches field is missing.");
  }

  if (!Object.prototype.hasOwnProperty.call(snapshot, "matchIndex")) {
    errors.push("Snapshot matchIndex field is missing.");
  }

  const metadata = buildBackupMetadata({
    state: snapshot.state,
    matches: snapshot.matches,
    matchIndex: snapshot.matchIndex
  });

  if (!snapshot.metadata || typeof snapshot.metadata !== "object") {
    errors.push("Snapshot metadata is missing.");
  } else {
    if (String(snapshot.metadata.seasonYear || "") !== String(metadata.seasonYear || "")) {
      errors.push(`Snapshot metadata seasonYear does not match state.seasonInfo.year (${metadata.seasonYear}).`);
    }

    if (Number(snapshot.metadata.matchCount) !== metadata.matchCount) {
      errors.push(`Snapshot metadata matchCount does not match matches payload (${metadata.matchCount}).`);
    }

    if (Number(snapshot.metadata.archivedSeasonCount) !== metadata.archivedSeasonCount) {
      errors.push(`Snapshot metadata archivedSeasonCount does not match state.archivedSeasons (${metadata.archivedSeasonCount}).`);
    }

    if (Number(snapshot.metadata.matchIndexEntryCount) !== metadata.matchIndexEntryCount) {
      errors.push(`Snapshot metadata matchIndexEntryCount does not match matchIndex payload (${metadata.matchIndexEntryCount}).`);
    }

    if (Number(snapshot.metadata.schemaVersion) !== SCHEMA_VERSION) {
      errors.push(`Snapshot metadata schemaVersion must be ${SCHEMA_VERSION}.`);
    }

    const expectedChecksum = getSnapshotChecksum(snapshot);
    if (snapshot.metadata.checksumSha256 !== expectedChecksum) {
      errors.push("Snapshot checksum does not match the file contents.");
    }
  }

  const expectedEntries = getExpectedIndexEntries(snapshot);
  const matchIndex = snapshot.matchIndex || {};

  for (const entry of expectedEntries) {
    if (entry.error) {
      errors.push(entry.error);
      continue;
    }

    const indexedValue = matchIndex
      && matchIndex[entry.seasonKey]
      && matchIndex[entry.seasonKey][entry.divKey]
      && matchIndex[entry.seasonKey][entry.divKey][entry.pairKey];

    if (!indexedValue) {
      errors.push(`matchIndex is missing an entry for active matchup ${entry.matchKey}.`);
      continue;
    }

    if (String(indexedValue) !== String(entry.matchKey)) {
      errors.push(`matchIndex entry for ${entry.matchKey} points to ${indexedValue} instead of the active match key.`);
    }
  }

  let parsedRoundTrip;
  try {
    parsedRoundTrip = JSON.parse(formatJson(snapshot));
  } catch (error) {
    errors.push(`Snapshot JSON is not parseable: ${error.message}`);
  }

  return {
    ok: errors.length === 0,
    errors,
    parsedRoundTrip
  };
}

module.exports = {
  buildSnapshot,
  countMatches,
  getSnapshotChecksum,
  validateSnapshot
};

