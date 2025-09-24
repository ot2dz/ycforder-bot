import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { lookup as lookupMimeType } from 'mime-types';
import { google, drive_v3 } from 'googleapis';
import { JWT, OAuth2Client } from 'google-auth-library';
import { logger } from '../lib/logger.ts';
import { retry } from '../lib/utils.ts';

type AuthClient = JWT | OAuth2Client;
type UploadResult = { fileId?: string; webViewLink?: string };

/**
 * Initializes and returns a Google Drive API v3 client.
 * @param authClient An authenticated JWT client.
 * @returns A Google Drive API client instance.
 */
function getDriveClient(authClient: AuthClient): drive_v3.Drive {
  return google.drive({ version: 'v3', auth: authClient });
}

/**
 * Verifies that the service account can access the specified folder by listing its contents.
 * @param authClient An authenticated JWT client.
 * @param folderId The ID of the Google Drive folder to check.
 * @returns A promise that resolves if access is successful, and rejects otherwise.
 */
export async function verifyDriveFolderAccess(
  authClient: AuthClient,
  folderId: string
) {
  const drive = getDriveClient(authClient);
  logger.info(`Checking access to Google Drive folder ID: ${folderId}`);

  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents`,
      fields: 'files(id, name)',
      pageSize: 5,
    });

    logger.info('Successfully connected to the Google Drive folder.');
    const files = response.data.files;
    if (files && files.length > 0) {
      logger.info(
        `Found ${files.length} item(s) in the folder: ${files
          .map((f) => f.name)
          .join(', ')}`
      );
    } else {
      logger.info('The folder is currently empty.');
    }
  } catch (error: unknown) {
    const err = error as { code?: number; response?: { data?: unknown } };
    logger.error(
      err.response?.data ?? err,
      'Failed to access Google Drive folder.'
    );
    if (err.code === 404) {
      logger.error(
        'The folder was not found. Please check if the GOOGLE_DRIVE_ORDERS_FOLDER_ID is correct.'
      );
    } else if (err.code === 403) {
      logger.error(
        'Permission denied. Please ensure the service account email has been shared with the folder with at least "Viewer" access.'
      );
    }
    throw new Error('Could not verify Google Drive folder access.');
  }
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  folderName: string,
  parentFolderId: string
): Promise<string> {
  const query =
    `'${parentFolderId}' in parents and ` +
    "mimeType = 'application/vnd.google-apps.folder' and " +
    `name = '${folderName}' and trashed = false`;

  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  if (response.data.files && response.data.files.length > 0) {
    const folderId = response.data.files[0].id!;
    logger.info(`Found existing subfolder '${folderName}' with ID: ${folderId}`);
    return folderId;
  }

  logger.info(`Subfolder '${folderName}' not found, creating it...`);
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
  });

  if (!folder.data.id) {
    throw new Error('Failed to create order subfolder in Google Drive.');
  }

  logger.info(`Created new subfolder with ID: ${folder.data.id}`);
  return folder.data.id;
}

async function uploadSingleFile(
  drive: drive_v3.Drive,
  parentFolderId: string,
  localFilePath: string
): Promise<UploadResult> {
  const baseName = basename(localFilePath);
  const fileName = `${Date.now()}_${baseName}`;
  const detectedMimeType = lookupMimeType(localFilePath);
  const fileMimeType =
    typeof detectedMimeType === 'string' ? detectedMimeType : 'application/octet-stream';

  logger.info(
    `Uploading '${fileName}' (MIME: ${fileMimeType}) to folder '${parentFolderId}'...`
  );

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
      // DO NOT set mimeType here. This was the source of the corruption.
    },
    media: {
      mimeType: fileMimeType,
      body: createReadStream(localFilePath),
    },
    fields: 'id, name, webViewLink',
  });

  const { id: fileId, name, webViewLink } = response.data;
  logger.info(`File uploaded successfully: ${name} (ID: ${fileId})`);

  return { fileId: fileId || undefined, webViewLink: webViewLink || undefined };
}

export async function uploadOrderPhotos(
  authClient: AuthClient,
  mainFolderId: string,
  orderId: string,
  localFilePaths: string[]
): Promise<UploadResult[]> {
  if (localFilePaths.length === 0) {
    logger.warn(`No files provided for order '${orderId}'. Skipping upload.`);
    return [];
  }

  const drive = getDriveClient(authClient);
  const orderFolderId = await findOrCreateFolder(drive, orderId, mainFolderId);

  logger.info(
    `Starting parallel upload of ${localFilePaths.length} file(s) to folder '${orderId}'.`
  );

  const uploads = localFilePaths.map((filePath) => {
    const operationName = `upload_${basename(filePath)}`;
    return retry(
      () => uploadSingleFile(drive, orderFolderId, filePath),
      3,
      1000,
      operationName
    );
  });

  const results = await Promise.all(uploads);
  logger.info(`All ${results.length} file(s) for order '${orderId}' uploaded successfully.`);
  return results;
}

export async function uploadPhotoToDrive(
  authClient: AuthClient,
  mainFolderId: string,
  orderId: string,
  localFilePath: string
): Promise<UploadResult> {
  const [result] = await uploadOrderPhotos(authClient, mainFolderId, orderId, [localFilePath]);
  return result ?? {};
}
