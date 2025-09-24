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
