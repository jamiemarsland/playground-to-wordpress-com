# WordPress.com connection service

Netlify project: `playground-wpcom-connect`.

Redirect URL: `https://playground-wpcom-connect.netlify.app/oauth/wordpress/callback`

This small service implements the authorisation-code sign-in callback. It supports automatic Playground archive transfers via an authenticated popup. Transfers require an explicit destination confirmation in that popup.

## Configuration

In Netlify's environment variables, set `WPCOM_CLIENT_ID` and secret `WPCOM_CLIENT_SECRET`, with Functions scope and Production context, then redeploy. `SESSION_SECRET` is a separate random secret used for encrypted short-lived cookies and has been configured on the project. Do not put any of these secrets in the plugin or repository.

The app's registered Redirect URL must match exactly. The default OAuth scope requests access to the site selected by the user. Whether that authorisation permits Playground imports still needs a live API test.

The connection endpoints use expiring encrypted state cookies, state comparison, server-side code exchange and encrypted HttpOnly session cookies. Responses are non-cacheable, do not expose tokens to browser JavaScript, and never print the token exchange response or credentials. Token sessions expire after 30 minutes. Disconnect clears the browser session; it does not revoke the app in WordPress.com account settings.

## Routes

- `/`: setup instructions until configured, then the connect button or connection status.
- `/oauth/wordpress/start`: begins WordPress.com authorisation.
- `/oauth/wordpress/callback`: verifies the browser's state and exchanges the code.
- `/disconnect`: same-origin POST to clear the session.
- `/health`: service and configuration status, no secrets.

## Transfer behaviour

The updated plugin exports a ZIP through its nonce-protected endpoint and passes it to this window via postMessage, pinned to the service origin and popup window. Only messages from the official Playground origin and opener are accepted.

`/api/connection` checks site and importer access. `/api/transfer` requires a valid encrypted session, same-origin POST and session-bound CSRF value. It handles prepare, immutable encrypted chunk uploads, a conditionally locked single submission, status and import advancement. Job ownership derives from the site-bound OAuth token. API tokens never reach Playground or browser JavaScript.

WordPress.com requests mirror Calypso’s import actions (`rest/v1.1/sites/{siteId}/imports/new`, `/imports/`, `/imports/{importId}`). Third-party OAuth permission for these endpoints still needs a real user-run transfer test. Known free plans are blocked. Unsupported archive classification and uncertain network outcomes stop for review; success is shown only for the matching remote `importSuccess` state.

Netlify Blobs uses strong consistency and conditional writes provided by the pinned SDK. Chunks are removed after submission attempts. An hourly scheduled function removes abandoned jobs and chunks older than one hour. Cleanup can be delayed by hosting outages. Preview deployments use separate deploy-scoped storage.

Run `npm ci && npm test` using Node 24 for mocked API and safety tests. The service build runs on Netlify’s Node 22 environment.
