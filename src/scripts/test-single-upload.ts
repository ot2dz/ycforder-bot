import 'dotenv/config';
import { resolve } from 'node:path';
import { logger } from '../lib/logger.ts';
import { getDriveAuthClient } from '../google/auth.ts';
import { uploadPhotoToDrive } from '../google/drive.ts';

async function testSingleUpload() {
  logger.info('--- Starting Single Photo Upload Test ---');
  const mainFolderId = process.env.GOOGLE_DRIVE_ORDERS_FOLDER_ID;
  if (!mainFolderId) {
    logger.error('GOOGLE_DRIVE_ORDERS_FOLDER_ID is not set.');
    return;
  }

  try {
    const authClient = getDriveAuthClient();
    const testOrderId = 'YCF-TEST-001';
    const testPhotoPath = resolve(process.cwd(), 'test-assets/photo.jpg');

    logger.info(`Uploading test photo from: ${testPhotoPath}`);

    const result = await uploadPhotoToDrive(
      authClient,
      mainFolderId,
      testOrderId,
      testPhotoPath
    );

    logger.info({ uploadResult: result }, 'Upload successful!');
    if (result.webViewLink) {
      logger.info(`You can view the file at: ${result.webViewLink}`);
    }
    logger.info('--- Single Photo Upload Test Successful ---');
  } catch (error) {
    logger.error(error, '--- Single Photo Upload Test Failed ---');
  }
}

testSingleUpload();
