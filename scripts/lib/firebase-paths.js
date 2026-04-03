function normalizeParticipantName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function buildFirebaseKeySegment(value) {
  return encodeURIComponent(normalizeParticipantName(value)).replace(/[.#$\/\[\]]/g, "_");
}

function buildMatchupKey(nameA, nameB) {
  return [normalizeParticipantName(nameA).toLowerCase(), normalizeParticipantName(nameB).toLowerCase()]
    .sort()
    .map(buildFirebaseKeySegment)
    .join("__vs__");
}

function getSeasonMatchIndexKey(seasonInfo) {
  const year = seasonInfo && seasonInfo.year ? seasonInfo.year : new Date().getUTCFullYear();
  return buildFirebaseKeySegment(String(year));
}

function countMatchIndexLeaves(node) {
  if (node == null) return 0;
  if (typeof node !== "object") return 1;

  return Object.values(node).reduce((count, child) => count + countMatchIndexLeaves(child), 0);
}

module.exports = {
  buildFirebaseKeySegment,
  buildMatchupKey,
  countMatchIndexLeaves,
  getSeasonMatchIndexKey,
  normalizeParticipantName
};

