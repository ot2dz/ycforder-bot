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
