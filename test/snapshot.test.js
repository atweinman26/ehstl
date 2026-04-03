const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSnapshot, validateSnapshot } = require("../scripts/lib/snapshot");

function createValidSnapshot() {
  return buildSnapshot({
    timestamp: "2026-04-03T18:30:00.000Z",
    state: {
      seasonInfo: {
        year: "2026"
      },
      archivedSeasons: [
        { year: "2025" }
      ]
    },
    matches: {
      "-Nx1": {
        divCode: "MS-A",
        winner: "Alice Smith",
        loser: "Bob Jones"
      }
    },
    matchIndex: {
      "2026": {
        "MS-A": {
          "alice%20smith__vs__bob%20jones": "-Nx1"
        }
      }
    }
  });
}

test("validateSnapshot accepts a well-formed snapshot", () => {
  const snapshot = createValidSnapshot();
  const result = validateSnapshot(snapshot);
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validateSnapshot rejects a missing index entry", () => {
  const snapshot = createValidSnapshot();
  snapshot.matchIndex = {};
  snapshot.metadata.matchIndexEntryCount = 0;
  snapshot.metadata.checksumSha256 = "invalid";

  const result = validateSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /matchIndex is missing an entry/);
});

test("validateSnapshot rejects a checksum mismatch", () => {
  const snapshot = createValidSnapshot();
  snapshot.metadata.checksumSha256 = "deadbeef";

  const result = validateSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /checksum/);
});

