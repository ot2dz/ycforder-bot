

# File: ./package.json

```

{
  "name": "ycf-orderbot",
  "version": "1.0.0",
  "description": "A Telegram bot for creating orders and uploading photos to Google Drive.",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start:dev": "tsx src/index.ts",
    "mint-token": "tsx src/scripts/mint-oauth-token.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js"
  },
  "keywords": [
    "telegram",
    "google-drive",
    "google-sheets",
    "nodejs",
    "typescript"
  ],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "dotenv": "^17.2.2",
    "google-auth-library": "^10.3.0",
    "googleapis": "^160.0.0",
    "mime-types": "^2.1.35",
    "pino": "^9.11.0",
    "telegraf": "^4.16.3"
  },
  "devDependencies": {
    "@types/mime-types": "^2.1.4",
    "@types/node": "^24.5.2",
    "pino-pretty": "^13.1.1",
    "ts-node": "^10.9.2",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2"
  },
  "engines": {
    "node": ">=20"
  },
  "pnpm": {
    "overrides": {
      "node-fetch@2.7.0>whatwg-url": "link:./packages/whatwg-url-shim"
    }
  }
}

```



# File: ./packages/whatwg-url-shim/index.js

```

'use strict';

const { URL, URLSearchParams, domainToASCII, domainToUnicode } = require('node:url');

if (typeof URL !== 'function') {
  throw new Error('URL constructor is not available in this version of Node.js');
}

module.exports = {
  URL,
  URLSearchParams,
  /**
   * Older versions of whatwg-url also exposed helper functions from tr46.
   * Re-export Node equivalents so dependent libraries keep working without
   * reaching for the deprecated punycode module.
   */
  domainToASCII: typeof domainToASCII === 'function' ? domainToASCII : undefined,
  domainToUnicode: typeof domainToUnicode === 'function' ? domainToUnicode : undefined
};

```



# File: ./packages/whatwg-url-shim/package.json

```

{
  "name": "whatwg-url",
  "version": "5.0.0-shim",
  "type": "commonjs",
  "main": "index.js"
}

```



# File: ./tsconfig.json

```

{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "**/*.spec.ts"]
}

```



# File: ./src/google/drive.ts

```

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

```



# File: ./src/google/auth.ts

```

import 'dotenv/config';
import { JWT, OAuth2Client } from 'google-auth-library';
import { logger } from '../lib/logger.ts';

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
};

/**
 * Creates an authenticated Google JWT client from a base64 encoded Service Account key.
 *
 * @returns An authenticated JWT client instance.
 * @throws An error if the service account JSON is missing or invalid.
 */
export function getServiceAccountAuth(): JWT {
  const serviceAccountJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!serviceAccountJsonBase64) {
    logger.error(
      'GOOGLE_SERVICE_ACCOUNT_JSON is not set in the environment variables.'
    );
    throw new Error('Missing Google Service Account configuration.');
  }

  try {
    const decodedJson = Buffer.from(
      serviceAccountJsonBase64,
      'base64'
    ).toString('utf-8');

    const credentials = JSON.parse(
      decodedJson
    ) as ServiceAccountCredentials & { [key: string]: unknown };

    if (!credentials.client_email || !credentials.private_key) {
      logger.error(
        'Service account JSON is missing client_email or private_key fields.'
      );
      throw new Error('Incomplete Google Service Account credentials.');
    }

    const auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets',
      ],
    });

    logger.info('Successfully created Google Service Account client.');
    return auth;
  } catch (error) {
    logger.error(
      error,
      'Failed to parse service account JSON or create auth client.'
    );
    throw new Error('Invalid Google Service Account configuration.');
  }
}

function getOAuthClient(): OAuth2Client {
  const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN } = process.env;

  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
    logger.error(
      'Missing OAuth credentials in .env file (OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REFRESH_TOKEN)'
    );
    throw new Error('Incomplete OAuth configuration.');
  }

  try {
    const oauth2Client = new OAuth2Client(
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      'urn:ietf:wg:oauth:2.0:oob'
    );

    oauth2Client.setCredentials({ refresh_token: OAUTH_REFRESH_TOKEN });
    logger.info('Successfully created Google OAuth2 client.');
    return oauth2Client;
  } catch (error) {
    logger.error(error, 'Failed to create OAuth2 client.');
    throw new Error('Invalid OAuth configuration.');
  }
}

/**
 * Returns the configured authentication client for Google Drive operations.
 * It uses OAuth if DRIVE_AUTH=OAUTH, otherwise falls back to the Service Account.
 */
export function getDriveAuthClient(): JWT | OAuth2Client {
  if (process.env.DRIVE_AUTH === 'OAUTH') {
    return getOAuthClient();
  }
  return getServiceAccountAuth();
}

```



# File: ./src/scripts/test-multi-upload.ts

```

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

```



# File: ./src/scripts/test-single-upload.ts

```

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

```



# File: ./src/scripts/test-drive-access.ts

```

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

```



# File: ./src/scripts/test-auth.ts

```

import 'dotenv/config';
import { logger } from '../lib/logger.ts';
import { getServiceAccountAuth } from '../google/auth.ts';

async function testAuthentication() {
  try {
    logger.info('Attempting to authenticate with Google...');
    const authClient = getServiceAccountAuth();

    const credentials = await authClient.authorize();

    if (credentials && credentials.access_token) {
      logger.info('Successfully retrieved Google API access token.');
      if (credentials.expiry_date) {
        logger.info(
          `Token expires at: ${new Date(credentials.expiry_date).toISOString()}`
        );
      }
    } else {
      logger.error('Authentication succeeded but failed to retrieve a token.');
    }
  } catch (error) {
    logger.error('Google authentication test failed.');
  }
}

testAuthentication();

```



# File: ./src/scripts/mint-oauth-token.ts

```

// src/scripts/mint-oauth-token.ts
import 'dotenv/config';
import { google } from 'googleapis';
import { createServer } from 'node:http';
import open from 'open';
import crypto from 'node:crypto';

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const PORT = Number(process.env.OAUTH_LOOPBACK_PORT ?? 53682);
const HOST = process.env.OAUTH_LOOPBACK_HOST ?? '127.0.0.1'; // لا تعبث بـ ::1
const REDIRECT = `http://${HOST}:${PORT}/callback`;

async function main() {
  const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_LOGIN_HINT } = process.env;
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
    console.error('Set OAUTH_CLIENT_ID and OAUTH_CLIENT_SECRET in .env');
    process.exit(1);
  }

  const oauth2 = new google.auth.OAuth2(OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, REDIRECT);
  const state = crypto.randomBytes(16).toString('hex');

  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    include_granted_scopes: true,
    state,
    ...(OAUTH_LOGIN_HINT ? { login_hint: OAUTH_LOGIN_HINT } : {}),
  });

  const code: string = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      server.close();
      reject(new Error('Timeout waiting for OAuth redirect'));
    }, 5 * 60 * 1000); // 5 دقائق

    const server = createServer((req, res) => {
      try {
        if (!req.url) return;
        // اقبل "/" أو "/callback" لتجنب 404
        const url = new URL(req.url, `http://${HOST}:${PORT}`);
        if (url.pathname !== '/' && url.pathname !== '/callback') return;

        const returnedState = url.searchParams.get('state') ?? '';
        const codeParam = url.searchParams.get('code');
        if (!codeParam) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('Missing code');
          return;
        }
        if (returnedState && returnedState !== state) {
          res.writeHead(400, { 'Content-Type': 'text/plain' });
          res.end('State mismatch');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Auth successful. You can close this window.');
        clearTimeout(timer);
        server.close();
        resolve(codeParam);
      } catch (e) {
        clearTimeout(timer);
        server.close();
        reject(e);
      }
    }).listen(PORT, HOST, () => {
      // افتح رابط Google (accounts.google.com). لا تفتح localhost يدويًا.
      open(authUrl).catch(() => {
        console.log('Open this URL in your browser:\n' + authUrl);
      });
      console.log('Waiting for Google OAuth redirect on', REDIRECT);
    });
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error('No refresh_token returned. Ensure prompt=consent + access_type=offline and use a new consent.');
    process.exit(1);
  }

  console.log('\n=== OAUTH_REFRESH_TOKEN ===\n' + tokens.refresh_token + '\n===========================\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

```



# File: ./src/lib/registerWhatwgUrlShim.ts

```

import Module from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const appliedSymbol = Symbol.for('whatwg-url-shim-applied');
const moduleAny = Module as typeof Module & { [appliedSymbol]?: boolean };

if (!moduleAny[appliedSymbol]) {
  const shimPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../packages/whatwg-url-shim/index.js'
  );

  const originalResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function patchedResolveFilename(
    request: string,
    parent: NodeModule | undefined,
    isMain: boolean,
    options?: { paths?: string[] }
  ) {
    if (request === 'whatwg-url') {
      return shimPath;
    }

    return originalResolveFilename.call(this, request, parent, isMain, options);
  } as typeof Module._resolveFilename;

  moduleAny[appliedSymbol] = true;
}

```



# File: ./src/lib/utils.ts

```

import { logger } from './logger.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type RetryableError = {
  code?: number;
  response?: {
    status?: number;
  };
};

export async function retry<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  delay = 1000,
  operationName = 'operation'
): Promise<T> {
  let attempt = 1;

  while (attempt <= maxRetries) {
    try {
      return await operation();
    } catch (error) {
      const retryableError = error as RetryableError;
      if (attempt === maxRetries) {
        logger.error(
          { error },
          `'${operationName}' failed after ${maxRetries} attempts.`
        );
        throw error;
      }

      const statusCode =
        typeof retryableError.code === 'number'
          ? retryableError.code
          : retryableError.response?.status;

      const isRetryable =
        typeof statusCode === 'number' &&
        (statusCode === 429 || statusCode >= 500);

      if (!isRetryable) {
        logger.error(
          { error },
          `'${operationName}' failed with a non-retryable error.`
        );
        throw error;
      }

      logger.warn(
        `'${operationName}' attempt ${attempt} failed. Retrying in ${delay / 1000}s...`
      );
      await sleep(delay);
      delay *= 2;
      attempt += 1;
    }
  }

  throw new Error('Retry logic exhausted unexpectedly.');
}

```



# File: ./src/lib/logger.ts

```

import pino from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
    },
  },
});

```



# File: ./src/bot/validation.ts

```

export function isValidPhoneNumber(phone: string): boolean {
  const trimmed = phone.trim();
  const phoneRegex = /^(0[5-7]\d{8}|\+213[5-7]\d{8})$/;
  return phoneRegex.test(trimmed);
}

export function isValidAmount(amount: string): boolean {
  if (!amount.trim()) return false;
  const parsed = Number(amount.replace(/\s+/g, ''));
  return Number.isFinite(parsed) && parsed > 0;
}

```



# File: ./src/bot/wizard.ts

```

import { Markup } from 'telegraf';
import type { Context } from 'telegraf';
import { logger } from '../lib/logger.ts';
import { userStates, type OrderState } from './types.ts';
import {
  L,
  formatReviewMessage,
  getMainMenuKeyboard,
  getOptionalStepKeyboard,
  getReviewKeyboard,
  getWizardNavKeyboard,
  removeKeyboard
} from './ui.ts';
import { isValidAmount, isValidPhoneNumber } from './validation.ts';

const MAX_PHOTOS = 10;
type InlineKeyboardMarkup = ReturnType<typeof Markup.inlineKeyboard>;

function ensureChatId(ctx: Context): number | undefined {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    logger.warn('Cannot proceed without chat id.');
    return undefined;
  }
  return chatId;
}

async function deleteMessageIfPossible(ctx: Context, messageId?: number) {
  const chatId = ensureChatId(ctx);
  if (!chatId || !messageId) return;
  try {
    await ctx.telegram.deleteMessage(chatId, messageId);
  } catch (error) {
    logger.warn({ error, messageId }, 'Failed to delete message (possibly already deleted).');
  }
}

async function cleanupReviewArtifacts(ctx: Context, state: OrderState) {
  const chatId = ensureChatId(ctx);
  if (!chatId) return;
  if (state.reviewMediaMessageIds && state.reviewMediaMessageIds.length > 0) {
    for (const mediaMessageId of state.reviewMediaMessageIds) {
      await deleteMessageIfPossible(ctx, mediaMessageId);
    }
    state.reviewMediaMessageIds = undefined;
  }
}

async function editWizardMessage(
  ctx: Context,
  state: OrderState,
  text: string,
  keyboard: InlineKeyboardMarkup = Markup.inlineKeyboard([])
) {
  const chatId = ensureChatId(ctx);
  if (!chatId) return;

  const extra = { parse_mode: 'Markdown', ...keyboard } as const;

  if (state.lastMessageId) {
    try {
      await ctx.telegram.editMessageText(chatId, state.lastMessageId, undefined, text, extra);
      return;
    } catch (error) {
      logger.warn({ error }, 'Failed to edit wizard message, sending a new one.');
    }
  }

  const sentMessage = await ctx.reply(text, extra);
  state.lastMessageId = sentMessage.message_id;
}

async function resetToPromptState(ctx: Context, state: OrderState) {
  if (state.step === 'reviewing' || (state.reviewMediaMessageIds && state.reviewMediaMessageIds.length > 0)) {
    await cleanupReviewArtifacts(ctx, state);
    if (state.lastMessageId) {
      await deleteMessageIfPossible(ctx, state.lastMessageId);
      state.lastMessageId = undefined;
    }
  }
}

async function transitionToStep(
  ctx: Context,
  state: OrderState,
  step: OrderState['step'],
  text: string,
  keyboard: InlineKeyboardMarkup = getWizardNavKeyboard()
) {
  state.step = step;
  await editWizardMessage(ctx, state, text, keyboard);
}

export async function startWizard(ctx: Context) {
  const userId = ctx.from?.id;
  if (userId === undefined) {
    logger.warn('Received start wizard request without user id.');
    return;
  }

  const existingState = userStates.get(userId);
  if (existingState) {
    await cleanupReviewArtifacts(ctx, existingState);
    await deleteMessageIfPossible(ctx, existingState.lastMessageId);
    userStates.delete(userId);
  }

  logger.info({ userId }, 'Starting new order wizard.');

  const message = await ctx.reply(L.wizardSendPhotos, { parse_mode: 'Markdown', ...getWizardNavKeyboard(), ...removeKeyboard() });
  userStates.set(userId, {
    step: 'awaiting_photos',
    telegramFileIds: [],
    paymentMethod: 'COD',
    lastMessageId: message.message_id
  });
}

export async function promptForCustomerName(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_customer_name', `${L.photosReceived}\n\n${L.askCustomerName}`);
}

export async function promptForPhone(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_phone', L.askPhone);
}

export async function promptForStateCommune(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_state_commune', L.askStateCommune);
}

export async function promptForAddress(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_address', L.askAddress, getOptionalStepKeyboard());
}

export async function promptForAmount(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_amount_total', L.askAmount);
}

export async function promptForNotes(ctx: Context, state: OrderState) {
  await resetToPromptState(ctx, state);
  await transitionToStep(ctx, state, 'awaiting_notes', L.askNotes, getOptionalStepKeyboard());
}

export async function showReview(ctx: Context, state: OrderState) {
  await cleanupReviewArtifacts(ctx, state);
  if (state.lastMessageId) {
    await deleteMessageIfPossible(ctx, state.lastMessageId);
    state.lastMessageId = undefined;
  }

  state.step = 'reviewing';

  const chatId = ensureChatId(ctx);
  if (!chatId) return;

  const escapedCaption = formatReviewMessage(state);
  const mediaGroup = state.telegramFileIds.slice(0, MAX_PHOTOS).map((fileId, index) => ({
    type: 'photo' as const,
    media: fileId,
    caption: index === 0 ? escapedCaption : undefined,
    parse_mode: index === 0 ? ('Markdown' as const) : undefined
  }));

  try {
    const sentMediaMessages = await ctx.replyWithMediaGroup(mediaGroup);
    state.reviewMediaMessageIds = sentMediaMessages.map(message => message.message_id);
  } catch (error) {
    logger.error({ error }, 'Failed to send review media group.');
  }

  const summaryMessage = await ctx.reply('هل تريد تأكيد هذا الطلب؟', getReviewKeyboard());
  state.lastMessageId = summaryMessage.message_id;
}

export async function handleCancel(ctx: Context) {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const state = userStates.get(userId);
  if (state) {
    await cleanupReviewArtifacts(ctx, state);
    await deleteMessageIfPossible(ctx, state.lastMessageId);
    state.lastMessageId = undefined;
  }
  userStates.delete(userId);
  await ctx.reply(L.orderCanceled, getMainMenuKeyboard());
}

export async function handleConfirm(ctx: Context, state: OrderState) {
  if (state.step === 'submitting') {
    logger.warn({ userId: ctx.from?.id }, 'Duplicate order confirmation tapped.');
    await ctx.answerCbQuery('الطلب قيد المعالجة بالفعل...');
    return;
  }

  state.step = 'submitting';
  await cleanupReviewArtifacts(ctx, state);
  await deleteMessageIfPossible(ctx, state.lastMessageId);
  state.lastMessageId = undefined;

  const processingMessage = await ctx.reply(L.processingOrder, removeKeyboard());

  logger.info({ userId: ctx.from?.id, order: { ...state, telegramFileIds: state.telegramFileIds.length } }, 'Submitting order to external services.');

  await new Promise(resolve => setTimeout(resolve, 2000));

  await deleteMessageIfPossible(ctx, processingMessage.message_id);
  await ctx.reply(L.orderConfirmed, getMainMenuKeyboard());
  userStates.delete(ctx.from!.id);
}

export async function handleTextInput(ctx: Context) {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const state = userStates.get(userId);
  if (!state) return;

  const text = (ctx.message as { text?: string }).text?.trim();
  if (!text) return;

  switch (state.step) {
    case 'awaiting_customer_name':
      state.customerName = text;
      await promptForPhone(ctx, state);
      break;
    case 'awaiting_phone':
      if (!isValidPhoneNumber(text)) {
        await editWizardMessage(ctx, state, L.invalidPhone, getWizardNavKeyboard());
        return;
      }
      state.phone = text;
      await promptForStateCommune(ctx, state);
      break;
    case 'awaiting_state_commune':
      state.stateCommune = text;
      await promptForAddress(ctx, state);
      break;
    case 'awaiting_address':
      state.address = text;
      await promptForAmount(ctx, state);
      break;
    case 'awaiting_amount_total':
      if (!isValidAmount(text)) {
        await editWizardMessage(ctx, state, L.invalidAmount, getWizardNavKeyboard());
        return;
      }
      state.amountTotal = Number(text.replace(/\s+/g, ''));
      await promptForNotes(ctx, state);
      break;
    case 'awaiting_notes':
      state.notes = text;
      await showReview(ctx, state);
      break;
    default:
      break;
  }
}

export async function finalizeMediaGroup(ctx: Context, mediaFiles: string[]) {
  const userId = ctx.from?.id;
  if (userId === undefined) return;
  const state = userStates.get(userId);
  if (!state || state.step !== 'awaiting_photos') return;

  const uniqueFiles = Array.from(new Set(mediaFiles));

  if (uniqueFiles.length === 0) {
    await editWizardMessage(ctx, state, L.noPhotos, getWizardNavKeyboard());
    return;
  }

  if (uniqueFiles.length > MAX_PHOTOS) {
    await editWizardMessage(ctx, state, L.tooManyPhotos, getWizardNavKeyboard());
    state.telegramFileIds = [];
    return;
  }

  state.telegramFileIds = uniqueFiles;
  await promptForCustomerName(ctx, state);
}

```



# File: ./src/bot/types.ts

```

export interface OrderState {
  step:
    | 'awaiting_photos'
    | 'awaiting_customer_name'
    | 'awaiting_phone'
    | 'awaiting_state_commune'
    | 'awaiting_address'
    | 'awaiting_amount_total'
    | 'awaiting_notes'
    | 'reviewing'
    | 'submitting';

  telegramFileIds: string[];
  customerName?: string;
  phone?: string;
  stateCommune?: string;
  address?: string;
  paymentMethod: 'COD';
  amountTotal?: number;
  notes?: string;
  lastMessageId?: number;
  reviewMediaMessageIds?: number[];
}

export const userStates = new Map<number, OrderState>();

```



# File: ./src/bot/ui.ts

```

import { Markup } from 'telegraf';
import type { OrderState } from './types.ts';

export const L = {
  welcome: 'مرحباً بك! كيف يمكنني خدمتك؟',
  wizardSendPhotos: 'الرجاء إرسال صور المنتج (من 1 إلى 10 صور). يمكنك إرسالها كألبوم واحد.',
  photosReceived: '📸 تم استلام الصور.',
  askCustomerName: 'الآن، يرجى إدخال *الاسم الكامل* للزبون:',
  askPhone: '👤 تم تسجيل الاسم.\n\nالآن، يرجى إدخال *رقم هاتف* الزبون:',
  askStateCommune: '📞 تم تسجيل رقم الهاتف.\n\nالآن، يرجى إدخال *الولاية والبلدية*:',
  askAddress: '📍 تم تسجيل الولاية/البلدية.\n\nالآن، أدخل *العنوان الكامل* للتوصيل (اختياري).',
  askAmount: '🏠 تم تسجيل العنوان.\n\nالآن، يرجى إدخال *المبلغ الإجمالي* للطلب (بالأرقام فقط):',
  askNotes: '💰 تم تسجيل المبلغ.\n\nهل لديك أي *ملاحظات* إضافية؟ (اختياري)',
  invalidPhone: '⚠️ رقم الهاتف غير صالح. يرجى المحاولة مرة أخرى:',
  invalidAmount: '⚠️ المبلغ غير صالح. يرجى إدخال أرقام فقط:',
  tooManyPhotos: '⚠️ يُسمح بحد أقصى 10 صور لكل طلب. يرجى إعادة المحاولة.',
  noPhotos: '⚠️ يجب إرسال صورة واحدة على الأقل.',
  newOrder: '🆕 إنشاء طلب جديد',
  myOrders: '📦 طلباتي',
  help: 'ℹ️ مساعدة',
  back: '⬅️ رجوع',
  cancel: '❌ إلغاء',
  skip: '⏩ تخطي',
  confirm: '✅ تأكيد الطلب',
  editName: '✏️ تعديل الاسم',
  editPhone: '✏️ تعديل الهاتف',
  editAddress: '✏️ تعديل العنوان',
  editAmount: '✏️ تعديل المبلغ',
  editNotes: '✏️ تعديل الملاحظات',
  orderCanceled: 'تم إلغاء الطلب.',
  orderConfirmed: '✅ تم إنشاء الطلب بنجاح!',
  processingOrder: '⏳ جارٍ تأكيد الطلب وتحميل الصور...'
} as const;

type InlineKeyboardMarkup = ReturnType<typeof Markup.inlineKeyboard>;
type ReplyKeyboardMarkup = ReturnType<typeof Markup.keyboard>;

export function getMainMenuKeyboard(): ReplyKeyboardMarkup {
  return Markup.keyboard([
    [Markup.button.text(L.newOrder)],
    [Markup.button.text(L.myOrders), Markup.button.text(L.help)]
  ]).resize();
}

export function removeKeyboard() {
  return Markup.removeKeyboard();
}

export function getWizardNavKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    Markup.button.callback(L.back, 'order:back'),
    Markup.button.callback(L.cancel, 'order:cancel')
  ]);
}

export function getOptionalStepKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback(L.skip, 'order:next')],
    [
      Markup.button.callback(L.back, 'order:back'),
      Markup.button.callback(L.cancel, 'order:cancel')
    ]
  ]);
}

export function getReviewKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback(L.confirm, 'order:confirm')],
    [
      Markup.button.callback(L.editName, 'order:edit:name'),
      Markup.button.callback(L.editPhone, 'order:edit:phone')
    ],
    [
      Markup.button.callback(L.editAddress, 'order:edit:address'),
      Markup.button.callback(L.editAmount, 'order:edit:amount')
    ],
    [Markup.button.callback(L.editNotes, 'order:edit:notes')],
    [Markup.button.callback(L.cancel, 'order:cancel')]
  ]);
}

const markdownEscapeRegex = /([\\_*\[\]()~`>#+=|{}.!-])/g;

export function escapeMarkdown(text?: string): string {
  if (!text) return '';
  return text.replace(markdownEscapeRegex, '\\$1');
}

export function formatReviewMessage(state: OrderState): string {
  const amountLabel =
    state.amountTotal !== undefined
      ? `${state.amountTotal.toLocaleString('ar-DZ')} د.ج`
      : '_غير محدد_';
  const amountText = state.amountTotal !== undefined ? escapeMarkdown(amountLabel) : amountLabel;
  return (
    '*يرجى مراجعة تفاصيل الطلب:*\n\n' +
    `👤 *الاسم الكامل:* ${escapeMarkdown(state.customerName)}\n` +
    `📞 *رقم الهاتف:* ${escapeMarkdown(state.phone)}\n` +
    `📍 *الولاية/البلدية:* ${escapeMarkdown(state.stateCommune)}\n` +
    `🏠 *العنوان:* ${escapeMarkdown(state.address) || '_لم يتم تحديده_'}\n` +
    `💳 *طريقة الدفع:* الدفع عند الاستلام\n` +
    `💰 *المبلغ الإجمالي:* ${amountText}\n` +
    `📝 *ملاحظات:* ${escapeMarkdown(state.notes) || '_لا يوجد_'}\n\n` +
    `🖼️ *الصور:* (${state.telegramFileIds.length} صور مرفقة)`
  );
}

```



# File: ./src/index.ts

```

import 'dotenv/config';
import './lib/registerWhatwgUrlShim.ts';
import type { Context, NarrowedContext } from 'telegraf';
import type { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { logger } from './lib/logger.ts';
import { L, getMainMenuKeyboard } from './bot/ui.ts';
import { userStates } from './bot/types.ts';
import {
  finalizeMediaGroup,
  handleCancel,
  handleConfirm,
  handleTextInput,
  promptForAddress,
  promptForAmount,
  promptForCustomerName,
  promptForNotes,
  promptForPhone,
  promptForStateCommune,
  showReview,
  startWizard
} from './bot/wizard.ts';

interface MediaGroupCacheEntry {
  fileIds: string[];
  timeout?: NodeJS.Timeout;
}

const mediaGroupCache = new Map<string, MediaGroupCacheEntry>();

async function main() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    logger.error('TELEGRAM_BOT_TOKEN is not set in the .env file. Aborting.');
    process.exit(1);
  }

  const { Telegraf } = await import('telegraf');
  const bot = new Telegraf(botToken);

  bot.hears(L.newOrder, async (ctx) => {
    if (userStates.has(ctx.from.id)) {
      await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
      return;
    }
    await startWizard(ctx);
  });

  bot.hears(L.myOrders, (ctx) => ctx.reply('هذه الميزة ستتوفر قريباً.'));
  bot.hears(L.help, (ctx) => ctx.reply('لإنشاء طلب جديد، اضغط على زر "🆕 إنشاء طلب جديد" في الأسفل. لإلغاء الطلب أثناء إدخاله، استخدم زر "❌ إلغاء" الموجود أسفل الرسالة.'));

  bot.start(async (ctx) => {
    logger.info({ user: ctx.from }, 'User started the bot.');
    await ctx.reply(L.welcome, getMainMenuKeyboard());
  });

  bot.command('neworder', async (ctx) => {
    if (userStates.has(ctx.from.id)) {
      await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
      return;
    }
    await startWizard(ctx);
  });

  bot.on('photo', async (ctx) => {
    const userId = ctx.from?.id;
    if (userId === undefined) return;

    const state = userStates.get(userId);
    if (!state || state.step !== 'awaiting_photos') return;

    const photoSizes = (ctx.message as any).photo;
    if (!photoSizes?.length) return;

    const fileId = photoSizes.at(-1)?.file_id;
    if (!fileId) return;

    const mediaGroupId = (ctx.message as any).media_group_id as string | undefined;

    if (mediaGroupId) {
      let entry = mediaGroupCache.get(mediaGroupId);
      if (!entry) {
        entry = { fileIds: [] };
        mediaGroupCache.set(mediaGroupId, entry);
      }
      entry.fileIds.push(fileId);

      if (entry.timeout) {
        clearTimeout(entry.timeout);
      }

      entry.timeout = setTimeout(async () => {
        mediaGroupCache.delete(mediaGroupId);
        try {
          await finalizeMediaGroup(ctx, entry!.fileIds);
        } catch (error) {
          logger.error({ error }, 'Failed to finalize media group.');
        }
      }, 600);
    } else {
      await finalizeMediaGroup(ctx, [fileId]);
    }
  });

  bot.on('text', handleTextInput);

  bot.on('callback_query', async (ctx: NarrowedContext<Context, CallbackQuery>) => {
    const action = ctx.callbackQuery.data ?? 'unknown';
    const userId = ctx.from?.id;
    const state = userStates.get(userId ?? -1);

    logger.info({ userId, action }, 'Button pressed.');

    let handled = true;

    switch (action) {
      case 'order:start':
        await ctx.answerCbQuery();
        if (userStates.has(ctx.from.id)) {
          await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
          break;
        }
        await startWizard(ctx);
        break;
      case 'order:cancel':
        await ctx.answerCbQuery();
        await handleCancel(ctx);
        break;
      case 'order:back':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        switch (state.step) {
          case 'awaiting_customer_name':
            await startWizard(ctx);
            break;
          case 'awaiting_phone':
            await promptForCustomerName(ctx, state);
            break;
          case 'awaiting_state_commune':
            await promptForPhone(ctx, state);
            break;
          case 'awaiting_address':
            await promptForStateCommune(ctx, state);
            break;
          case 'awaiting_amount_total':
            await promptForAddress(ctx, state);
            break;
          case 'awaiting_notes':
            await promptForAmount(ctx, state);
            break;
          case 'reviewing':
            await promptForNotes(ctx, state);
            break;
          default:
            handled = false;
            break;
        }
        break;
      case 'order:next':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        switch (state.step) {
          case 'awaiting_address':
            delete state.address;
            await promptForAmount(ctx, state);
            break;
          case 'awaiting_notes':
            delete state.notes;
            await showReview(ctx, state);
            break;
          default:
            handled = false;
            break;
        }
        break;
      case 'order:confirm':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await handleConfirm(ctx, state);
        break;
      case 'order:edit:name':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await promptForCustomerName(ctx, state);
        break;
      case 'order:edit:phone':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await promptForPhone(ctx, state);
        break;
      case 'order:edit:address':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await promptForAddress(ctx, state);
        break;
      case 'order:edit:amount':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await promptForAmount(ctx, state);
        break;
      case 'order:edit:notes':
        if (!state) {
          handled = false;
          break;
        }
        await ctx.answerCbQuery();
        await promptForNotes(ctx, state);
        break;
      case 'orders:list':
      case 'help':
        await ctx.answerCbQuery('قريباً...');
        break;
      default:
        handled = false;
        break;
    }

    if (!handled) {
      await ctx.answerCbQuery('تم استلام الإجراء.');
    }
  });

  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));

  logger.info('Bot is starting...');
  await bot.launch();
}

main().catch((error) => {
  logger.error(error, 'Unhandled error during service startup');
  process.exit(1);
});

```

