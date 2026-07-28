/**
 * Print Google Cloud Console steps for ScholarReach Gmail OAuth.
 * After you create the client, run:
 *   node scripts/set-google-oauth.cjs <CLIENT_ID> <CLIENT_SECRET>
 */
const LIVE =
  process.env.NEXT_PUBLIC_LIVE_APP_URL || "https://scholarreach-ai.vercel.app";

console.log(`
ScholarReach AI — Google OAuth setup
====================================

1. Open https://console.cloud.google.com/apis/credentials
2. Create OAuth client ID → Application type: Web application
   Name: ScholarReach AI
3. Authorized JavaScript origins:
   - ${LIVE}
   - http://localhost:3001
4. Authorized redirect URIs:
   - ${LIVE}/api/auth/callback/google
   - http://localhost:3001/api/auth/callback/google
5. Enable Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com
6. Save Client ID + Client Secret, then:

   node scripts/set-google-oauth.cjs YOUR_CLIENT_ID YOUR_CLIENT_SECRET

Scopes used by the app (NextAuth + Gmail send):
  openid email profile
  https://www.googleapis.com/auth/gmail.send
  https://www.googleapis.com/auth/gmail.compose
  https://www.googleapis.com/auth/gmail.readonly
`);
