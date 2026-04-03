function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = undefined) {
  return process.env[name] || fallback;
}

function parseJsonEnv(name) {
  const raw = requiredEnv(name).trim();
  const normalized = raw.startsWith("{")
    ? raw
    : Buffer.from(raw, "base64").toString("utf8");

  try {
    return JSON.parse(normalized);
  } catch (error) {
    throw new Error(`Environment variable ${name} does not contain valid JSON or base64-encoded JSON.`);
  }
}

module.exports = {
  optionalEnv,
  parseJsonEnv,
  requiredEnv
};

