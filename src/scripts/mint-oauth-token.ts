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
