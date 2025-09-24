import 'dotenv/config';
import * as path from 'node:path';
import { logger } from '../lib/logger.ts';
import { getDriveAuthClient } from '../google/auth.ts';
import { uploadOrderPhotos } from '../google/drive.ts';

async function testMultiUpload() {
  logger.info('--- Starting Multi-Photo Upload Test ---');
  const mainFolderId = process.env.GOOGLE_DRIVE_ORDERS_FOLDER_ID;
  if (!mainFolderId) {
    logger.error('GOOGLE_DRIVE_ORDERS_FOLDER_ID is not set.');
    return;
  }

  try {
    const authClient = getDriveAuthClient();
    const testOrderId = 'YCF-TEST-002';

    const photoPaths = [
      path.resolve(process.cwd(), 'test-assets/photo1.jpg'),
      path.resolve(process.cwd(), 'test-assets/photo2.png'),
      path.resolve(process.cwd(), 'test-assets/photo3.jpg'),
    ];

    logger.info(
      `Preparing to upload ${photoPaths.length} file(s) for order ${testOrderId}`
    );

    const results = await uploadOrderPhotos(
      authClient,
      mainFolderId,
      testOrderId,
      photoPaths
    );

    logger.info({ uploadResults: results }, 'All uploads finished!');
    logger.info('--- Multi-Photo Upload Test Successful ---');
  } catch (error) {
    logger.error(error, '--- Multi-Photo Upload Test Failed ---');
  }
}

testMultiUpload();
