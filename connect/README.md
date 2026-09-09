# WordPress.com connection service

Netlify project: `playground-wpcom-connect`.

Redirect URL: `https://playground-wpcom-connect.netlify.app/oauth/wordpress/callback`

This small service implements the authorisation-code sign-in callback. It is the prerequisite for automatic transfers, not the transfer implementation itself. No content is uploaded or published by this service yet.

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

## Next implementation

Connect the Playground plugin to this service, verify import permissions and plan compatibility, then implement an explicit transfer request with progress. Do not claim migration success from OAuth success.
