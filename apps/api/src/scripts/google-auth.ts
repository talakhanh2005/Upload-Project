import { config } from 'dotenv';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { URL } from 'node:url';
import { google } from 'googleapis';

config({ path: [resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '.env')] });

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI ?? 'http://127.0.0.1:4001/oauth2/callback';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the root .env file first.');
  process.exit(1);
}

const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
const authUrl = oauth.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

const callback = new URL(redirectUri);
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', redirectUri);
  if (url.pathname !== callback.pathname) { response.writeHead(404).end('Not found'); return; }
  const code = url.searchParams.get('code');
  if (!code) { response.writeHead(400).end('Missing authorization code'); return; }
  try {
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    const drive = google.drive({ version: 'v3', auth: oauth });
    const rootFolder = await drive.files.create({
      requestBody: {
        name: 'Student Uploads',
        mimeType: 'application/vnd.google-apps.folder',
        parents: ['root'],
      },
      fields: 'id,name',
    });
    if (!rootFolder.data.id) throw new Error('Google Drive returned no root folder ID');
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Google Drive connected and the Student Uploads folder was created. You can close this tab and return to the terminal.');
    console.log('\nAdd these values to the root .env file:');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token ?? ''}`);
    console.log(`GOOGLE_DRIVE_ROOT_FOLDER_ID=${rootFolder.data.id}`);
    console.log('\nKeep this token private.');
  } catch (error) {
    response.writeHead(500).end('OAuth exchange failed. Check the terminal.');
    console.error(error);
  } finally {
    server.close();
  }
});

server.listen(Number(callback.port || 80), callback.hostname, () => {
  console.log('Open this URL in a browser and approve access:\n');
  console.log(authUrl);
});
