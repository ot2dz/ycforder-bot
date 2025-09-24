import 'dotenv/config';
import { logger } from '../lib/logger.ts';
import { getDriveAuthClient } from '../google/auth.ts';
import { verifyDriveFolderAccess } from '../google/drive.ts';

async function testDriveAccess() {
  logger.info('--- Starting Google Drive Access Test ---');

  const folderId = process.env.GOOGLE_DRIVE_ORDERS_FOLDER_ID;
  if (!folderId) {
    logger.error('GOOGLE_DRIVE_ORDERS_FOLDER_ID is not set in the .env file.');
    return;
  }

  try {
    const authClient = getDriveAuthClient();
    await verifyDriveFolderAccess(authClient, folderId);
    logger.info('--- Google Drive Access Test Successful ---');
  } catch (error) {
    logger.error('--- Google Drive Access Test Failed ---');
  }
}

testDriveAccess();
