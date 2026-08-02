import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { AnyApiClient } from './api.js';
import { getConfigPath, mergeConfig, readConfig } from './config.js';
import { OAUTH_SCOPE } from './constants.js';
import { CliError } from './errors.js';
import { writeLine, type CommandContext } from './io.js';
import {
  connectionConfigFromToken,
  openBrowser,
  resolveClientId,
  resolveOAuthEndpoints,
} from './oauth.js';
import { buildAuthorizeUrl, createPkce, randomState } from './pkce.js';
import type { TokenResponse } from './types.js';

export { connectionConfigFromToken, resolveClientId } from './oauth.js';

const CALLBACK_PATH = '/callback';
const CONNECT_TIMEOUT_MS = 5 * 60 * 1000;
// connectCommand connects an AnyAPI wallet with a one-URL OAuth 2.1 Authorization
// Code + PKCE approval over a loopback callback. It resolves an OAuth client id
// (trial client, a previously registered CLI client, or a fresh Dynamic Client
// Registration), runs the browser consent, exchanges the code, and stores the
// access token as the active apiKey. Works from a cold start with no trial key.
export async function connectCommand(ctx: CommandContext): Promise<void> {
  const configPath = getConfigPath(ctx.homeDir);
  const config = await readConfig(configPath);

  const client = new AnyApiClient({ fetchImpl: ctx.fetchImpl });
  const endpoints = await resolveOAuthEndpoints(client);
  const clientId = await resolveClientId(config, client, endpoints.registrationEndpoint, configPath, {
    includeTrialClient: true,
    commandName: 'anyapi connect',
  });
  const pkce = createPkce();
  const state = randomState();

  const { code, redirectUri } = await runLoopbackFlow(ctx, {
    authorizationEndpoint: endpoints.authorizationEndpoint,
    clientId,
    codeChallenge: pkce.challenge,
    state,
  });

  const token = await client.exchangeToken(endpoints.tokenEndpoint, {
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    code_verifier: pkce.verifier,
  });

  await mergeConfig(connectionConfigFromToken(token, new Date(), clientId), configPath);
  printConnected(ctx, token);
}

interface LoopbackParams {
  authorizationEndpoint: string;
  clientId: string;
  codeChallenge: string;
  state: string;
}

// runLoopbackFlow binds an ephemeral loopback port, prints the single consent
// URL, opens it best-effort, and resolves once the browser returns to /callback.
async function runLoopbackFlow(ctx: CommandContext, params: LoopbackParams): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let redirectUri = '';
    const server = createServer();
    const timer = setTimeout(() => {
      finish(() => reject(new CliError('Timed out after 5 minutes waiting for approval. Re-run anyapi connect.')));
    }, CONNECT_TIMEOUT_MS);

    function finish(action: () => void): void {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      server.close();
      action();
    }

    server.on('request', (req, res) => {
      handleCallback(req, res, params.state, {
        onCode: (code) => finish(() => resolve({ code, redirectUri })),
        onError: (message) => finish(() => reject(new CliError(message))),
      });
    });
    server.on('error', (error) => finish(() => reject(error)));

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`;
      const authorizeUrl = buildAuthorizeUrl({
        authorizationEndpoint: params.authorizationEndpoint,
        clientId: params.clientId,
        redirectUri,
        scope: OAUTH_SCOPE,
        state: params.state,
        codeChallenge: params.codeChallenge,
      });
      printConsentUrl(ctx, authorizeUrl);
      openBrowser(authorizeUrl);
    });
  });
}

interface CallbackHandlers {
  onCode: (code: string) => void;
  onError: (message: string) => void;
}

function handleCallback(req: IncomingMessage, res: ServerResponse, expectedState: string, handlers: CallbackHandlers): void {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== CALLBACK_PATH) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
    return;
  }
  const params = url.searchParams;
  if (params.get('state') !== expectedState) {
    respondHtml(res, 400, 'State mismatch. You can close this tab and re-run anyapi connect.');
    handlers.onError('OAuth state mismatch - the callback did not match this request. Re-run anyapi connect.');
    return;
  }
  const error = params.get('error');
  if (error) {
    respondHtml(res, 200, 'Authorization was declined. You can close this tab.');
    handlers.onError(error === 'access_denied' ? 'Authorization was declined by the human.' : `Authorization failed: ${error}.`);
    return;
  }
  const code = params.get('code');
  if (!code) {
    respondHtml(res, 400, 'Missing authorization code. You can close this tab.');
    handlers.onError('OAuth callback did not include an authorization code.');
    return;
  }
  respondHtml(res, 200, 'Connected. You can close this tab and return to your agent.');
  handlers.onCode(code);
}

function respondHtml(res: ServerResponse, status: number, message: string): void {
  const html = `<!doctype html><meta charset="utf-8"><title>AnyAPI</title><body style="font-family:system-ui;padding:2rem"><p>${message}</p></body>`;
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function printConsentUrl(ctx: CommandContext, url: string): void {
  writeLine(ctx.stdout, 'Hand this URL to your human to approve continued spend:');
  writeLine(ctx.stdout, url);
  writeLine(ctx.stdout, 'Waiting for approval (up to 5 minutes)...');
}

function printConnected(ctx: CommandContext, token: TokenResponse): void {
  writeLine(ctx.stdout, 'Connected. Your human approved continued spend.');
  writeLine(ctx.stdout, `Scope: ${token.scope}`);
  writeLine(ctx.stdout, 'Access token saved to ~/.anyapi/config.json. Keep working - there is no key to swap by hand.');
}
