const fs = require("node:fs/promises");
const path = require("node:path");
const { google } = require("googleapis");
const { BACKUP_PREFIX, DRIVE_SCOPES } = require("./constants");
const { parseBackupTimestampFromName } = require("./util");

function createDriveClient(config) {
  let auth;

  if (config.type === "service_account") {
    auth = new google.auth.GoogleAuth({
      credentials: config.serviceAccount,
      scopes: DRIVE_SCOPES
    });
  } else if (config.type === "oauth_refresh_token") {
    auth = new google.auth.OAuth2(
      config.clientId,
      config.clientSecret
    );
    auth.setCredentials({
      refresh_token: config.refreshToken
    });
  } else {
    throw new Error("Unsupported Google Drive auth configuration.");
  }

  return google.drive({
    version: "v3",
    auth
  });
}

async function createDriveFile(drive, { folderId, name, mimeType, body, description }) {
  const response = await drive.files.create({
    supportsAllDrives: true,
    requestBody: {
      name,
      mimeType,
      parents: [folderId],
      description
    },
    media: {
      mimeType,
      body
    },
    fields: "id,name,createdTime,webViewLink,size"
  });

  return response.data;
}

async function listBackupArtifacts(drive, folderId) {
  const files = [];
  let pageToken;

  do {
    const response = await drive.files.list({
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageToken,
      q: [
        `'${folderId}' in parents`,
        "trashed = false",
        `name contains '${BACKUP_PREFIX}'`
      ].join(" and "),
      orderBy: "createdTime asc",
      fields: "nextPageToken, files(id,name,createdTime,size,webViewLink)",
      pageSize: 1000
    });

    files.push(...(response.data.files || []).map(file => ({
      ...file,
      backupTimestamp: parseBackupTimestampFromName(file.name)
    })));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return files;
}

async function downloadDriveFile(drive, fileId, outputPath) {
  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true
    },
    {
      responseType: "arraybuffer"
    }
  );

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, Buffer.from(response.data));
  return outputPath;
}

async function deleteDriveFile(drive, fileId) {
  await drive.files.delete({
    fileId,
    supportsAllDrives: true
  });
}

module.exports = {
  createDriveClient,
  createDriveFile,
  deleteDriveFile,
  downloadDriveFile,
  listBackupArtifacts
};
