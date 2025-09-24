

# File: ./README.md

```

# YCF Order Bot 📦

Telegram bot for order management with Airtable integration and Cloudinary photo storage.

## Features ✨

- 🤖 Telegram bot for order creation
- 📊 Airtable database integration
- 🖼️ Cloudinary photo storage
- 📢 Automatic channel posting
- 🔄 Real-time status management
- 🔐 Team-based authorization
- 📱 Arabic language support

## Setup 🚀

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TELEGRAM_CHANNEL_ID` - Channel ID for posting orders
- `AIRTABLE_API_KEY` - Airtable API key
- `AIRTABLE_BASE_ID` - Airtable base ID
- `AIRTABLE_TABLE_NAME` - Table name in Airtable
- `CLOUDINARY_CLOUD_NAME` - Cloudinary cloud name
- `CLOUDINARY_API_KEY` - Cloudinary API key
- `CLOUDINARY_API_SECRET` - Cloudinary API secret
- `AUTHORIZED_USER_IDS` - Comma-separated user IDs

### 2. Local Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Start production server
pnpm start
```

### 3. Deployment on Coolify

1. **Build Pack**: Choose "Nixpacks"
2. **Repository**: `https://github.com/ot2dz/ycforder-bot.git`
3. **Branch**: `main`
4. **Port**: `3000`
5. **Environment Variables**: Set all required variables
6. **Health Check**: `/health`

## Order Status Flow 🔄

- 🔍 قيد التجهيز (Preparing)
- ✅ تم التجهيز (Prepared)
- 🚚 تم الإرسال (Shipped)
- 📦 تم التسليم (Delivered)
- ❌ تم الإلغاء (Canceled)

## Commands 📝

- `/start` - Start the bot
- `🆕 طلب جديد` - Create new order
- `📦 عرض الطلبات` - View orders (authorized users only)

## Tech Stack 💻

- **Runtime**: Node.js 20
- **Language**: TypeScript
- **Bot Framework**: Telegraf
- **Database**: Airtable
- **File Storage**: Cloudinary
- **Package Manager**: pnpm
- **Build Tool**: TypeScript Compiler
- **Deployment**: Coolify with Nixpacks

## Project Structure 📁

```
src/
├── bot/           # Bot logic and handlers
├── services/      # External service integrations
├── lib/           # Utilities and helpers
└── index.ts       # Main application entry point
```

## Health Check 💚

The bot includes a health check endpoint at `/health` that returns:

```json
{
  "status": "healthy",
  "timestamp": "2024-09-24T..."
}
```

## License 📄

ISC License
```



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
    "start": "node dist/index.js",
    "postinstall": "pnpm run build"
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
    "airtable": "^0.12.2",
    "cloudinary": "^2.7.0",
    "dotenv": "^17.2.2",
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
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false,
    "sourceMap": false,
    "removeComments": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts"]
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
import type { Telegraf } from 'telegraf';
import { logger } from '../lib/logger.ts';
import { userStates, type OrderState } from './types.ts';
import {
  L,
  formatReviewMessage,
  getMainMenuKeyboard,
  getOptionalStepKeyboard,
  getReviewKeyboard,
  getWizardNavKeyboard,
  getWilayasKeyboard,
  removeKeyboard
} from './ui.ts';
import { isValidAmount, isValidPhoneNumber } from './validation.ts';
import { uploadOrderPhotosToCloudinary } from '../services/cloudinary.ts';
import { postOrderToChannel } from '../services/telegram.ts';
import { saveOrderToAirtable, generateOrderId } from '../services/airtable.ts';

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
  await transitionToStep(ctx, state, 'awaiting_state_commune', L.askStateCommune, getWilayasKeyboard());
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

export async function handleConfirm(bot: Telegraf, ctx: Context, state: OrderState) {
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

  try {
    // الخطوة 1: إنشاء معرف طلب بالتسلسل الجديد
    const orderId = await generateOrderId();
    
    // الخطوة 2: ارفع الصور إلى Cloudinary
    const cloudinaryResults = await uploadOrderPhotosToCloudinary(bot, state.telegramFileIds, orderId);
    state.cloudinaryPhotoData = cloudinaryResults; // تخزين البيانات للخطوات التالية

    // الخطوة 3: أرسل إلى القناة
    await postOrderToChannel(bot, state, orderId);

    // الخطوة 4: احفظ في Airtable
    await saveOrderToAirtable(state, orderId);

  } catch (error) {
    logger.error({ error, userId: ctx.from?.id }, 'Failed to process order submission.');

    // 1. احذف رسالة "جارِ المعالجة..."
    await deleteMessageIfPossible(ctx, processingMessage.message_id);

    // 2. أعد الحالة إلى "المراجعة" للسماح بمحاولة أخرى
    state.step = 'reviewing';

    // 3. أبلغ المستخدم بالخطأ واطلب منه المحاولة مرة أخرى
    await ctx.reply('⚠️ حدث خطأ أثناء تأكيد الطلب. يرجى مراجعة البيانات والمحاولة مرة أخرى بالضغط على زر التأكيد مجدداً.');
    
    // 4. أعد عرض شاشة المراجعة الكاملة (الصور + التفاصيل + الأزرار)
    await showReview(ctx, state);
    return;
  }

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
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForPhone(ctx, state);
      }
      break;
    case 'awaiting_phone':
      if (!isValidPhoneNumber(text)) {
        await editWizardMessage(ctx, state, L.invalidPhone, getWizardNavKeyboard());
        return;
      }
      state.phone = text;
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForStateCommune(ctx, state);
      }
      break;
    // تم إزالة حالة 'awaiting_state_commune' من هنا لأنها الآن عبر الأزرار
    case 'awaiting_address':
      state.address = text;
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForAmount(ctx, state);
      }
      break;
    case 'awaiting_amount_total':
      if (!isValidAmount(text)) {
        await editWizardMessage(ctx, state, L.invalidAmount, getWizardNavKeyboard());
        return;
      }
      state.amountTotal = Number(text.replace(/\s+/g, ''));
      if (state.isEditing) {
        state.isEditing = false;
        await showReview(ctx, state);
      } else {
        await promptForNotes(ctx, state);
      }
      break;
    case 'awaiting_notes':
      state.notes = text;
      if (state.isEditing) {
        state.isEditing = false;
      }
      await showReview(ctx, state); // دائماً نذهب للمراجعة بعد الملاحظات
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

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
}

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
  isEditing?: boolean; // حقل جديد لتتبع حالة التعديل
  cloudinaryPhotoData?: CloudinaryUploadResult[]; // لتخزين نتائج الرفع
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
  // الولايات الثابتة
  stateAinSalah: 'عين صالح',
  stateTamanrasset: 'تمنراست',
  stateAoulef: 'أولف',
  stateAdrar: 'أدرار',
  stateReggane: 'رقان',
  // Main Menu
  newOrder: '🆕 طلب جديد', // اختصار بسيط
  myOrders: '📦 عرض الطلبات', // <-- التغيير هنا
  help: 'ℹ️ مساعدة',
  back: '⬅️ رجوع',
  cancel: '❌ إلغاء',
  skip: '⏩ تخطي',
  confirm: '✅ تأكيد الطلب',
  editName: '✏️ تعديل الاسم',
  editPhone: '✏️ تعديل الهاتف',
  editStateCommune: '✏️ تعديل الولاية',
  editAddress: '✏️ تعديل العنوان',
  editAmount: '✏️ تعديل المبلغ',
  editNotes: '✏️ تعديل الملاحظات',
  // أزرار التحكم في القناة
  statusPrepared: '✅ تم التجهيز',
  statusShipped: '🚚 تم الإرسال',
  statusDelivered: '📦 تم التسليم',
  statusCanceled: '❌ إلغاء الطلبية',

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

export function getWilayasKeyboard(): InlineKeyboardMarkup {
  return Markup.inlineKeyboard([
    [Markup.button.callback(L.stateAinSalah, 'order:set_wilaya:عين صالح')],
    [Markup.button.callback(L.stateTamanrasset, 'order:set_wilaya:تمنراست')],
    [Markup.button.callback(L.stateAoulef, 'order:set_wilaya:أولف')],
    [Markup.button.callback(L.stateAdrar, 'order:set_wilaya:أدرار')],
    [Markup.button.callback(L.stateReggane, 'order:set_wilaya:رقان')],
    [Markup.button.callback(L.cancel, 'order:cancel')] // زر الإلغاء مهم هنا
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
      Markup.button.callback(L.editStateCommune, 'order:edit:state_commune'),
      Markup.button.callback(L.editAddress, 'order:edit:address'),
    ],
    [
      Markup.button.callback(L.editAmount, 'order:edit:amount')
    ],
    [Markup.button.callback(L.editNotes, 'order:edit:notes')],
    [Markup.button.callback(L.cancel, 'order:cancel')]
  ]);
}

const markdownEscapeRegex = /([\\_*\[\]()~`>#+=|{}!-])/g; // تم حذف النقطة (.) من هنا

export function escapeMarkdown(text?: string): string {
  if (!text) return '';
  return text.replace(markdownEscapeRegex, '\\$1');
}

/**
 * تنسق رسالة تفاصيل الطلب بالتنسيق الجديد المطلوب
 * @param state بيانات الطلب
 * @param orderId معرف الطلب (اختياري)
 * @param isReview هل هذا للمراجعة أم للعرض النهائي
 * @param status حالة الطلب (اختياري)
 */
export function formatOrderMessage(state: OrderState, orderId?: string, isReview: boolean = false, status?: string): string {
  const title = isReview ? 'يرجى مراجعة تفاصيل الطلب:' : `طلب جديد: ${orderId || 'غير محدد'}`;
  const separator = '———————————————';
  
  const amountLabel = state.amountTotal !== undefined ? 
    `${state.amountTotal.toLocaleString('ar-DZ', { useGrouping: false })} د.ج` 
    : 'غير محدد';
  
  const photosCount = state.telegramFileIds?.length || state.cloudinaryPhotoData?.length || 0;
  
  // إضافة حالة الطلب إذا كانت متوفرة
  const statusLine = status && !isReview ? 
    `${separator}\n✨ الحالة: ${getStatusDisplayText(status)}\n` 
    : '';
  
  return (
    `*${title}*\n` +
    `${separator}\n` +
    `👤 الاسم الكامل: ${escapeMarkdown(state.customerName) || 'غير محدد'}\n` +
    `${separator}\n` +
    `📞 رقم الهاتف: ${escapeMarkdown(state.phone) || 'غير محدد'}\n` +
    `${separator}\n` +
    `📍 الولاية/البلدية: ${escapeMarkdown(state.stateCommune) || 'غير محدد'}\n` +
    `${separator}\n` +
    `🏠 العنوان: ${escapeMarkdown(state.address) || 'وسط المدينة'}\n` +
    `${separator}\n` +
    `💳 طريقة الدفع: الدفع عند الاستلام\n` +
    `${separator}\n` +
    `💰 المبلغ الإجمالي: ${escapeMarkdown(amountLabel)}\n` +
    `${separator}\n` +
    `📝 ملاحظات: ${escapeMarkdown(state.notes) || 'لا يوجد'}\n` +
    `${separator}\n` +
    statusLine +
    `\n🖼 الصور: (${photosCount} صور مرفقة)`
  );
}

/**
 * تنسق رسالة مراجعة الطلب (للاستخدام في المعالج)
 */
export function formatReviewMessage(state: OrderState): string {
  return formatOrderMessage(state, undefined, true);
}

/**
 * يقوم بإنشاء أزرار التحكم بالطلبية التي ستظهر في القناة حسب الحالة
 * @param orderId المعرف الفريد للطلبية
 * @param currentStatus حالة الطلب الحالية
 */
export function getChannelControlKeyboard(orderId: string, currentStatus: string = 'preparing'): InlineKeyboardMarkup {
  const buttons = [];
  
  // بناء الأزرار حسب الحالة الحالية
  if (currentStatus === 'preparing') {
    buttons.push([
      Markup.button.callback(L.statusPrepared, `status:prepared:${orderId}`),
      Markup.button.callback(L.statusShipped, `status:shipped:${orderId}`),
    ]);
    buttons.push([
      Markup.button.callback(L.statusDelivered, `status:delivered:${orderId}`),
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'prepared') {
    buttons.push([
      Markup.button.callback('❌ إلغاء التجهيز', `cancel_status:prepared:${orderId}`),
      Markup.button.callback(L.statusShipped, `status:shipped:${orderId}`),
    ]);
    buttons.push([
      Markup.button.callback(L.statusDelivered, `status:delivered:${orderId}`),
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'shipped') {
    buttons.push([
      Markup.button.callback('❌ إلغاء الإرسال', `cancel_status:shipped:${orderId}`),
      Markup.button.callback(L.statusDelivered, `status:delivered:${orderId}`),
    ]);
    buttons.push([
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'delivered') {
    buttons.push([
      Markup.button.callback('❌ إلغاء التسليم', `cancel_status:delivered:${orderId}`),
      Markup.button.callback(L.statusCanceled, `status:canceled:${orderId}`),
    ]);
  } else if (currentStatus === 'canceled') {
    buttons.push([
      Markup.button.callback('🔄 إعادة تفعيل', `status:preparing:${orderId}`),
    ]);
  }
  
  return Markup.inlineKeyboard(buttons);
}

/**
 * يحول حالة الطلب إلى نص عربي مع الرموز التعبيرية
 */
export function getStatusDisplayText(status: string): string {
  switch (status) {
    case 'preparing': return '🔍 قيد التجهيز';
    case 'prepared': return '✅ تم التجهيز';
    case 'shipped': return '🚚 تم الإرسال';
    case 'delivered': return '📦 تم التسليم';
    case 'canceled': return '❌ تم الإلغاء';
    default: return '❓ غير معروف';
  }
}

```



# File: ./src/bot/auth.ts

```

import { logger } from '../lib/logger.ts';

let authorizedIds: Set<string>;

function getAuthorizedIds(): Set<string> {
    if (authorizedIds) {
        return authorizedIds;
    }

    const idsFromEnv = process.env.AUTHORIZED_USER_IDS;
    if (!idsFromEnv) {
        logger.warn('AUTHORIZED_USER_IDS is not set in .env. No user will be authorized.');
        authorizedIds = new Set();
        return authorizedIds;
    }

    const idArray = idsFromEnv.split(',').map(id => id.trim());
    authorizedIds = new Set(idArray);
    logger.info({ authorized_count: authorizedIds.size }, 'Authorized user IDs loaded.');
    return authorizedIds;
}

/**
 * يتحقق مما إذا كان معرف المستخدم موجوداً في قائمة المصرح لهم.
 * @param userId معرف مستخدم تيليجرام
 * @returns true إذا كان المستخدم مصرحاً له.
 */
export function isUserAuthorized(userId: number): boolean {
    const ids = getAuthorizedIds();
    return ids.has(String(userId));
}
```



# File: ./src/index.ts

```

import 'dotenv/config';
import './lib/registerWhatwgUrlShim.ts';
import { Telegraf, Markup, type Context, type NarrowedContext } from 'telegraf';
import type { CallbackQuery } from 'telegraf/typings/core/types/typegram';
import { logger } from './lib/logger.ts';
import { L, formatOrderMessage, getMainMenuKeyboard } from './bot/ui.ts';
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
import { fetchOrderById, fetchAllOrders, updateOrderStatus, getOrderStatus } from './services/airtable.ts';
import { isUserAuthorized } from './bot/auth.ts';
import { updateChannelOrderStatus } from './services/telegram.ts';

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

  // Add simple HTTP server for health checks
  const http = require('http');
  const server = http.createServer((req: any, res: any) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    logger.info(`Health check server running on port ${PORT}`);
  });

  bot.hears(L.newOrder, async (ctx) => {
    if (userStates.has(ctx.from.id)) {
      await ctx.reply('أنت بالفعل في عملية إنشاء طلب. يرجى إكمالها أو إلغاؤها أولاً.');
      return;
    }
    await startWizard(ctx);
  });

  bot.hears(L.myOrders, async (ctx) => { // الزر الآن اسمه "عرض الطلبات"
    // الخطوة 1: التحقق من الصلاحيات
    if (!isUserAuthorized(ctx.from.id)) {
        await ctx.reply('ليس لديك الصلاحية لعرض الطلبات.');
        return;
    }

    try {
        await ctx.reply('⏳ جارِ البحث عن الطلبات...');
        const orders = await fetchAllOrders(); // <-- جلب كل الطلبات

        if (orders.length === 0) {
            await ctx.reply('لا توجد أي طلبيات مسجلة حالياً.');
            return;
        }

        await ctx.reply(`لقد وجدت ${orders.length} طلبات:`);

        for (const order of orders) { 
            try {
                logger.debug({ order }, 'Processing order summary for display.');

                // --- بناء الملخص بطريقة آمنة ---
                logger.debug('Step 1: Processing customer name');
                const name = order.customerName || 'غير متوفر';
                logger.debug({ name }, 'Customer name processed');
                
                logger.debug('Step 2: Processing state commune');
                const state = order.stateCommune || 'غير متوفر';
                logger.debug({ state }, 'State commune processed');
                
                logger.debug('Step 3: Processing amount');
                const amount = order.amountTotal ? `${order.amountTotal} د.ج` : 'غير متوفر';
                logger.debug({ amount }, 'Amount processed');
                
                logger.debug('Step 4: Building summary string');
                const summary = `*الاسم:* ${name} | *البلد:* ${state} | *المبلغ:* ${amount}`;
                logger.debug({ summary }, 'Summary built successfully');
                
                logger.debug('Step 5: Building message string');
                const message = `*الطلبية رقم:* \`${order.orderId}\`\n------------------\n${summary}\n------------------`;
                logger.debug({ message }, 'Message built successfully');
                
                logger.debug('Step 6: Creating keyboard');
                const keyboard = Markup.inlineKeyboard([
                    Markup.button.callback('تفاصيل الطلبية', `details:${order.orderId}`)
                ]);
                logger.debug('Keyboard created successfully');
                
                logger.debug('Step 7: Sending reply to Telegram');
                await ctx.reply(message, { ...keyboard, parse_mode: 'Markdown' });
                logger.debug('Reply sent successfully');
                // ---------------------------------
            } catch (error: any) {
                // هذا الجزء سيخبرنا بالحقيقة
                logger.error({ 
                    error: {
                        message: error?.message || 'Unknown error',
                        stack: error?.stack || 'No stack trace',
                        name: error?.name || 'Unknown error type',
                        toString: error?.toString() || 'Error toString failed'
                    }, 
                    problematicOrder: order,
                    errorType: typeof error,
                    errorKeys: Object.keys(error || {})
                }, 'Failed to process and display a single order summary.');
                // سنستمر في عرض باقي الطلبات بدلاً من التوقف
                continue;
            }
        }
    } catch (error) {
        logger.error({ error, userId: ctx.from.id }, 'Failed to fetch all orders.');
        await ctx.reply('حدث خطأ أثناء جلب الطلبات. يرجى المحاولة مرة أخرى.');
    }
  });
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

  bot.action(/details:(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    await ctx.answerCbQuery(`جلب تفاصيل الطلب ${orderId}...`);

    try {
        const orderDetails = await fetchOrderById(orderId);
        if (!orderDetails) {
            await ctx.reply(`لم أتمكن من العثور على تفاصيل الطلبية رقم: ${orderId}`);
            return;
        }
        
        // عرض الصور أولاً
        const mediaGroup = (orderDetails.cloudinaryPhotoData || []).map(photo => ({
            type: 'photo' as const,
            media: photo.secure_url,
        }));
        if (mediaGroup.length > 0) await ctx.replyWithMediaGroup(mediaGroup as any);
        
        // ثم عرض النص بالتنسيق الجديد
        await ctx.reply(formatOrderMessage(orderDetails as any, orderId, false), { parse_mode: 'Markdown' });
    } catch (error) {
        logger.error({ error, orderId }, 'Failed to fetch order details.');
        await ctx.reply('حدث خطأ أثناء جلب تفاصيل الطلب.');
    }
  });

  // معالج أزرار إلغاء الحالات (يجب أن يكون دقيقاً ومحدداً ويأتي أولاً)
  bot.action(/^cancel_status:(prepared|shipped|delivered):(.+)$/, async (ctx) => {
    const previousStatus = ctx.match[1];
    const orderId = ctx.match[2];
    
    logger.info({ callbackData: ctx.callbackQuery.data, previousStatus, orderId }, 'Cancel status button clicked');
    await ctx.answerCbQuery(`إلغاء حالة الطلب ${orderId}...`);

    try {
        // تحقق من الحالة الحالية
        const currentStatus = await getOrderStatus(orderId);
        logger.info({ orderId, currentStatus, expectedStatus: previousStatus }, 'Status validation for cancellation');
        
        if (currentStatus !== previousStatus) {
            logger.warn({ orderId, currentStatus, previousStatus }, 'Current status does not match the status being cancelled');
            await ctx.answerCbQuery(`⚠️ الطلب ليس في حالة: ${getStatusText(previousStatus)}`);
            return;
        }
        
        logger.info({ orderId, from: currentStatus, to: 'preparing' }, 'Updating status to preparing');
        await updateOrderStatus(orderId, 'preparing');
        
        // تحديث رسالة القناة بالحالة الجديدة
        const messageId = ctx.callbackQuery.message?.message_id;
        await updateChannelOrderStatus(bot, orderId, 'preparing', messageId);
        
        logger.info({ orderId, previousStatus }, 'Order status reverted to preparing');
        await ctx.answerCbQuery(`✅ تم إلغاء حالة: ${getStatusText(previousStatus)}`);
    } catch (error) {
        logger.error({ error, orderId, previousStatus }, 'Failed to revert order status');
        await ctx.answerCbQuery('❌ حدث خطأ أثناء إلغاء حالة الطلب');
    }
  });

  // معالج أزرار تغيير حالة الطلبات في القناة (يجب أن يكون دقيقاً لتجنب تضارب مع cancel_status)
  bot.action(/^status:(prepared|shipped|delivered|canceled|preparing):(.+)$/, async (ctx) => {
    const newStatus = ctx.match[1];
    const orderId = ctx.match[2];
    
    await ctx.answerCbQuery(`تحديث حالة الطلب ${orderId}...`);

    try {
        // أولاً تحقق من الحالة الحالية لتجنب التحديثات المكررة
        const currentStatus = await getOrderStatus(orderId);
        
        if (currentStatus === newStatus) {
            logger.warn({ orderId, currentStatus, newStatus }, 'Status is already set to the requested value');
            await ctx.answerCbQuery(`⚠️ الطلب بالفعل في حالة: ${getStatusText(newStatus)}`);
            return;
        }
        
        await updateOrderStatus(orderId, newStatus);
        
        // تحديث رسالة القناة بالحالة الجديدة
        const messageId = ctx.callbackQuery.message?.message_id;
        await updateChannelOrderStatus(bot, orderId, newStatus, messageId);
        
        logger.info({ orderId, oldStatus: currentStatus, newStatus }, 'Order status updated successfully');
        await ctx.answerCbQuery(`✅ تم تحديث حالة الطلب إلى: ${getStatusText(newStatus)}`);
    } catch (error) {
        logger.error({ error, orderId, newStatus }, 'Failed to update order status');
        await ctx.answerCbQuery('❌ حدث خطأ أثناء تحديث حالة الطلب');
    }
  });

  bot.on('callback_query', async (ctx: NarrowedContext<Context, CallbackQuery>) => {
    const action = ctx.callbackQuery.data ?? 'unknown';
    const userId = ctx.from?.id;
    const state = userStates.get(userId ?? -1);

    logger.info({ userId, action }, 'Button pressed.');

    let handled = true;

    // معالجة أزرار الولايات
    if (action.startsWith('order:set_wilaya:')) {
        if (!state) return;
        const wilaya = action.replace('order:set_wilaya:', '');
        state.stateCommune = wilaya;
        await ctx.answerCbQuery(`${wilaya} ✅`);
        if (state.isEditing) {
            state.isEditing = false;
            await showReview(ctx, state);
        } else {
            await promptForAddress(ctx, state);
        }
        return; // تم التعامل مع الطلب
    }

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
        await handleConfirm(bot, ctx, state); // مرر نسخة البوت
        break;
      case 'order:edit:name':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true; // وضع علامة أننا في وضع التعديل
        await ctx.answerCbQuery();
        await promptForCustomerName(ctx, state);
        break;
      case 'order:edit:phone':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForPhone(ctx, state);
        break;
      case 'order:edit:state_commune': // زر تعديل الولاية الجديد
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForStateCommune(ctx, state);
        break;
      case 'order:edit:address':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForAddress(ctx, state);
        break;
      case 'order:edit:amount':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
        await ctx.answerCbQuery();
        await promptForAmount(ctx, state);
        break;
      case 'order:edit:notes':
        if (!state) {
          handled = false;
          break;
        }
        state.isEditing = true;
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

// دالة مساعدة لتحويل حالة الطلب إلى نص عربي
function getStatusText(status: string): string {
  switch (status) {
    case 'preparing': return 'قيد التجهيز';
    case 'prepared': return 'تم التجهيز';
    case 'shipped': return 'تم الإرسال';
    case 'delivered': return 'تم التسليم';
    case 'canceled': return 'تم الإلغاء';
    default: return 'غير معروف';
  }
}

main().catch((error) => {
  logger.error(error, 'Unhandled error during service startup');
  process.exit(1);
});

```



# File: ./src/services/cloudinary.ts

```

import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../lib/logger.ts';
import type { Telegraf } from 'telegraf';

let isCloudinaryConfigured = false;

function ensureCloudinaryConfigured() {
  if (isCloudinaryConfigured) return;

  if (!process.env.CLOUDINARY_URL) {
    logger.error('CLOUDINARY_URL is not set. Cloudinary service cannot be used.');
    throw new Error('Cloudinary configuration is missing.');
  }
  // تهيئة Cloudinary باستخدام متغير البيئة مباشرة
  cloudinary.config(); // المكتبة تقرأ CLOUDINARY_URL تلقائياً
  isCloudinaryConfigured = true;
  logger.info('Cloudinary service configured successfully.');
}

// نوع البيانات التي تعود بعد الرفع الناجح
export interface CloudinaryUploadResult {
  secure_url: string; // رابط الصورة المباشر (CDN)
  public_id: string; // المعرف الفريد للصورة في Cloudinary
}

/**
 * تأخذ معرف ملف من تيليجرام (file_id)، تحصل على رابط التحميل المؤقت،
 * وترفع الصورة مباشرة إلى Cloudinary.
 * @param bot - نسخة Telegraf للوصول إلى API تيليجرام
 * @param fileId - معرف الملف من تيليجرام
 * @param orderId - معرف الطلب لاستخدامه في تنظيم المجلدات
 * @returns Promise يحتوي على نتيجة الرفع من Cloudinary
 */
async function uploadTelegramFile(
  bot: Telegraf,
  fileId: string,
  orderId: string
): Promise<CloudinaryUploadResult> {
  ensureCloudinaryConfigured(); // تأكد من أن التهيئة قد تمت

  // 1. احصل على رابط التحميل المؤقت من تيليجرام
  const fileLink = await bot.telegram.getFileLink(fileId);

  // 2. ارفع الصورة إلى Cloudinary باستخدام الرابط مباشرة
  //    هذا أكثر كفاءة من تحميل الملف ثم إعادة رفعه
  logger.debug({ href: fileLink.href, folder: `orders/${orderId}` }, 'Attempting to upload to Cloudinary...');
  const result = await cloudinary.uploader.upload(fileLink.href, {
    folder: `orders/${orderId}`, // تنظيم الصور في مجلدات لكل طلب
    resource_type: 'image',
  });

  // --- التحقق الإضافي ---
  logger.info({ public_id: result.public_id, url: result.secure_url }, 'Cloudinary upload successful.');
  if (!result.public_id || !result.secure_url) {
      logger.error({ result }, 'Cloudinary returned a success status but missing critical data.');
      throw new Error('Invalid response from Cloudinary.');
  }

  return result as CloudinaryUploadResult;
}

/**
 * تأخذ مصفوفة من معرفات الملفات من تيليجرام وترفعها جميعاً إلى Cloudinary بالتوازي.
 * @param bot - نسخة Telegraf
 * @param fileIds - مصفوفة من معرفات الملفات
 * @param orderId - معرف الطلب الحالي
 * @returns مصفوفة من نتائج الرفع
 */
export async function uploadOrderPhotosToCloudinary(
  bot: Telegraf,
  fileIds: string[],
  orderId: string
): Promise<CloudinaryUploadResult[]> {
  ensureCloudinaryConfigured(); // تأكد من أن التهيئة قد تمت

  if (!fileIds || fileIds.length === 0) {
    logger.warn(`No file IDs provided for order '${orderId}'. Skipping Cloudinary upload.`);
    return [];
  }

  logger.info(`Uploading ${fileIds.length} photo(s) for order '${orderId}' to Cloudinary...`);

  const uploadPromises = fileIds.map(fileId =>
    uploadTelegramFile(bot, fileId, orderId)
  );

  const results = await Promise.all(uploadPromises);

  logger.info(`Successfully uploaded ${results.length} photo(s) to Cloudinary for order '${orderId}'.`);
  return results;
}
```



# File: ./src/services/airtable.ts

```

import 'dotenv/config';
import Airtable, { FieldSet, Record } from 'airtable';
import { logger } from '../lib/logger.ts';
import type { OrderState } from '../bot/types.ts';

// --- تهيئة Airtable ---
const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_NAME } = process.env;

if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_NAME) {
  throw new Error('Airtable configuration is missing in .env file.');
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const table = base(AIRTABLE_TABLE_NAME);

logger.info('Airtable service configured.');

/**
 * يولد معرف طلب جديد بالتسلسل اليومي
 * @returns معرف الطلب بصيغة YCF-YYYY-MM-DD-XXX
 */
export async function generateOrderId(): Promise<string> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const prefix = `YCF-${today}`;
    
    try {
        // جلب جميع الطلبات لهذا اليوم
        const records = await table.select({
            filterByFormula: `FIND("${prefix}", {order_id}) = 1`,
            fields: ['order_id'],
            sort: [{ field: 'created_at', direction: 'desc' }]
        }).all();
        
        // العثور على أعلى رقم تسلسلي لهذا اليوم
        let maxNumber = 0;
        records.forEach(record => {
            const orderId = record.get('order_id') as string;
            const match = orderId.match(/YCF-\d{4}-\d{2}-\d{2}-(\d{3})$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNumber) {
                    maxNumber = num;
                }
            }
        });
        
        // الرقم التالي
        const nextNumber = maxNumber + 1;
        const paddedNumber = nextNumber.toString().padStart(3, '0');
        
        const newOrderId = `${prefix}-${paddedNumber}`;
        logger.info({ newOrderId, todaysOrderCount: nextNumber }, 'Generated new order ID');
        
        return newOrderId;
    } catch (error) {
        logger.error({ error }, 'Failed to generate order ID, falling back to timestamp');
        // في حالة الخطأ، نستخدم الطريقة القديمة
        return `YCF-${today}-${String(Date.now()).slice(-3)}`;
    }
}
export async function saveOrderToAirtable(state: OrderState, orderId: string) {
  logger.info({ orderId }, 'Saving order to Airtable...');

  const cloudinaryUrls = state.cloudinaryPhotoData?.map(p => p.secure_url).join('\n') || '';

  const recordData: FieldSet = {
    order_id: orderId,
    // created_at يتم إنشاؤه تلقائياً بواسطة Airtable
    status: 'preparing',
    customer_name: state.customerName,
    phone: state.phone,
    state_commune: state.stateCommune,
    address: state.address,
    amount_total: state.amountTotal,
    notes: state.notes,
    photo_links: cloudinaryUrls,
  };

  try {
    await table.create([{ fields: recordData }]);
    logger.info({ orderId }, 'Successfully saved order to Airtable.');
  } catch (error) {
    logger.error({ error, orderId }, 'Failed to save order to Airtable.');
    throw error;
  }
}

/**
 * يجلب كل الطلبات من Airtable.
 */
export async function fetchAllOrders() {
    logger.info('Fetching all orders from Airtable...');
    try {
        const records = await table.select({
            // فرز حسب تاريخ الإنشاء (الأحدث أولاً)
            sort: [{ field: 'created_at', direction: 'desc' }],
            // جلب الحقول المطلوبة فقط للملخص
            fields: ['order_id', 'customer_name', 'state_commune', 'amount_total'],
        }).all();

        return records.map(record => ({
            orderId: record.get('order_id'),
            customerName: record.get('customer_name'),
            stateCommune: record.get('state_commune'),
            amountTotal: record.get('amount_total'),
        }));
    } catch (error) {
        logger.error({ error }, 'Failed to fetch all orders from Airtable.');
        throw error;
    }
}

/**
 * يحدث حالة طلب معين في Airtable
 * @param orderId معرف الطلب
 * @param newStatus الحالة الجديدة
 */
export async function updateOrderStatus(orderId: string, newStatus: string) {
    logger.info({ orderId, newStatus }, 'Updating order status in Airtable...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            throw new Error(`Order with ID ${orderId} not found`);
        }
        
        const record = records[0];
        await table.update(record.getId(), {
            status: newStatus
        });
        
        logger.info({ orderId, newStatus }, 'Successfully updated order status in Airtable.');
    } catch (error) {
        logger.error({ error, orderId, newStatus }, 'Failed to update order status in Airtable.');
        throw error;
    }
}

/**
 * يجلب حالة طلب معين من Airtable
 * @param orderId معرف الطلب
 * @returns حالة الطلب أو null إذا لم يتم العثور عليه
 */
export async function getOrderStatus(orderId: string): Promise<string | null> {
    logger.info({ orderId }, 'Fetching order status from Airtable...');
    
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            fields: ['status'],
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            return null;
        }
        
        const status = records[0].get('status') as string || 'preparing';
        logger.info({ orderId, status }, 'Successfully fetched order status from Airtable.');
        return status;
    } catch (error) {
        logger.error({ error, orderId }, 'Failed to fetch order status from Airtable.');
        throw error;
    }
}
export async function fetchOrderById(orderId: string) {
    logger.info({ orderId }, 'Fetching order details from Airtable...');
    try {
        const records = await table.select({
            filterByFormula: `{order_id} = "${orderId}"`,
            maxRecords: 1,
        }).firstPage();

        if (records.length === 0) {
            return null;
        }
        
        const record = records[0];
        const photoLinks = (record.get('photo_links') as string || '').split('\n').filter(Boolean);

        return {
            customerName: record.get('customer_name'),
            phone: record.get('phone'),
            stateCommune: record.get('state_commune'),
            address: record.get('address'),
            paymentMethod: 'COD', // ثابت
            amountTotal: record.get('amount_total'),
            notes: record.get('notes'),
            cloudinaryPhotoData: photoLinks.map(url => ({ secure_url: url })),
            telegramFileIds: photoLinks, // لحساب العدد فقط
        } as Partial<OrderState>;

    } catch (error) {
        logger.error({ error, orderId }, 'Failed to fetch order by ID from Airtable.');
        throw error;
    }
}
```



# File: ./src/services/telegram.ts

```

import { logger } from '../lib/logger.ts';
import type { Telegraf } from 'telegraf';
import type { OrderState } from '../bot/types.ts';
import { formatOrderMessage, getChannelControlKeyboard, getStatusDisplayText } from '../bot/ui.ts';
import { getOrderStatus } from './airtable.ts';

/**
 * يرسل تفاصيل الطلب المكتمل إلى القناة المحددة.
 * @param bot نسخة Telegraf
 * @param state بيانات الطلب المكتملة
 * @param orderId المعرف الفريد للطلب
 */
export async function postOrderToChannel(bot: Telegraf, state: OrderState, orderId: string) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    logger.error('TELEGRAM_CHANNEL_ID is not set. Cannot post to channel.');
    return;
  }

  if (!state.cloudinaryPhotoData || state.cloudinaryPhotoData.length === 0) {
    logger.error({ orderId }, 'No Cloudinary photos found in state. Cannot post to channel.');
    return;
  }

  logger.info({ orderId, channelId }, 'Posting new order to Telegram channel...');

  // 2. جهز مجموعة الصور (Media Group) مع الحالة
  const fullCaption = formatOrderMessage(state, orderId, false, 'preparing');

  // 2. جهز مجموعة الصور (Media Group)
  const mediaGroup = state.cloudinaryPhotoData.map((photo, index) => ({
    type: 'photo' as const,
    media: photo.secure_url, // استخدم رابط الصورة المباشر من Cloudinary
    caption: index === 0 ? fullCaption : '', // أضف الوصف الكامل على أول صورة فقط
    parse_mode: 'Markdown' as const,
  }));

  try {
    // 3. أرسل مجموعة الصور إلى القناة
    await bot.telegram.sendMediaGroup(channelId, mediaGroup);
    
    // 4. أرسل رسالة منفصلة تحتوي على أزرار التحكم بالحالة الابتدائية
    const keyboard = getChannelControlKeyboard(orderId, 'preparing');
    await bot.telegram.sendMessage(channelId, `*التحكم بالطلب: ${orderId}*`, {
        ...keyboard,
        parse_mode: 'Markdown',
    });

    logger.info({ orderId }, 'Successfully posted order to channel.');
  } catch (error) {
    logger.error({ error, orderId, channelId }, 'Failed to post order to Telegram channel.');
    // ألقِ خطأً لإعلام الدالة المستدعية بالفشل
    throw new Error('Failed to post to channel');
  }
}

/**
 * يحدث رسالة الطلب في القناة عند تغيير الحالة
 * @param bot نسخة Telegraf
 * @param orderId معرف الطلب
 * @param newStatus الحالة الجديدة
 * @param controlMessageId معرف رسالة أزرار التحكم
 */
export async function updateChannelOrderStatus(bot: Telegraf, orderId: string, newStatus: string, controlMessageId?: number) {
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!channelId) {
    logger.error('TELEGRAM_CHANNEL_ID is not set. Cannot update channel message.');
    return;
  }

  logger.info({ orderId, newStatus }, 'Updating order status in channel...');

  try {
    // الحصول على الحالة الحالية للطلب
    const currentStatus = await getOrderStatus(orderId);
    if (!currentStatus) {
      throw new Error(`Order ${orderId} not found`);
    }

    // تحديث الأزرار حسب الحالة الجديدة
    const newKeyboard = getChannelControlKeyboard(orderId, currentStatus);
    const statusText = getStatusDisplayText(currentStatus);
    
    const updatedMessage = `*التحكم بالطلب: ${orderId}*\n✨ *الحالة:* ${statusText}`;

    // إذا كان لدينا معرف رسالة التحكم، حدثها
    if (controlMessageId) {
      try {
        await bot.telegram.editMessageText(
          channelId,
          controlMessageId,
          undefined,
          updatedMessage,
          {
            parse_mode: 'Markdown',
            ...newKeyboard
          }
        );
      } catch (editError: any) {
        // إذا كان الخطأ هو "لم يتم تعديل الرسالة"، فهذا يعني أن الرسالة لا تحتاج لتحديث
        if (editError.response?.description?.includes('message is not modified')) {
          logger.info({ orderId, newStatus: currentStatus }, 'Channel message already has the correct status, no update needed');
          return; // لا ترمي خطأ في هذه الحالة
        }
        throw editError; // رمي أي خطأ آخر
      }
    } else {
      // إذا لم يكن لدينا معرف، أرسل رسالة جديدة
      await bot.telegram.sendMessage(channelId, updatedMessage, {
        parse_mode: 'Markdown',
        ...newKeyboard
      });
    }

    logger.info({ orderId, newStatus: currentStatus }, 'Successfully updated order status in channel.');
  } catch (error) {
    logger.error({ error, orderId, newStatus }, 'Failed to update order status in channel.');
    throw error;
  }
}
```

