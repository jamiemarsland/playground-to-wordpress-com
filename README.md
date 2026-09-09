# Playground to WordPress.com

A small WordPress plugin that adds **Move to WordPress.com** to the admin menu and toolbar. Download a Playground archive, then follow a guided handoff to the existing WordPress.com importer.

## Try it

[Open the plugin in a fresh Playground](https://playground.wordpress.net/?blueprint-url=https%3A%2F%2Fraw.githubusercontent.com%2Fjamiemarsland%2Fplayground-to-wordpress-com%2Fmain%2Fblueprint.json). This demo link is provided for manual testing and has not been browser-verified.

Download this repository using **Code → Download ZIP**, upload it in your Playground under **Plugins → Add New → Upload Plugin**, and activate it. Open **Move to WordPress.com** in the sidebar.

The Actions workflow also produces an installable plugin ZIP, excluding the development files.

## Automatic transfer (0.2.0)

Open **Move to WordPress.com → Connect and move my site** in the official Playground. Sign in, check the destination in the connection window, and click **Move my site here**. Keep both windows open. The plugin exports in the browser and sends the archive to the connection window using origin-checked messages; no manual file handling is required.

Archives up to 100 MB are uploaded in 2 MB chunks to encrypted temporary Netlify storage, then submitted to WordPress.com. Each transfer is tied to the authenticated destination. Conditional writes prevent duplicate submission, and uncertain requests are never automatically repeated. Chunks are deleted after submission attempts; abandoned transfers are scheduled for hourly cleanup after one hour.

The importer is checked before upload. Known free plans are rejected for ZIP transfer. This implementation does not bypass plan restrictions or offer automatic content-only migration to free sites. The destination may have its content or settings replaced, so test on a disposable site.

The connection service is hosted at https://playground-wpcom-connect.netlify.app. It holds OAuth credentials on the server and never sends WordPress.com tokens to Playground. See `connect/` for the service and its tests.

## Export features

- Flags regular active plugins and explains the limits of free hosting.
- Checks SQLite, ZIP and single-site prerequisites before offering export.
- Downloads wp-content, wp-config.php and a Playground export manifest.
- Snapshots SQLite with `VACUUM INTO` so committed WAL data is included.
- Preserves the database's relative path and records the scoped site URL.
- Excludes database sidecars, cache, debug logs and symbolic links.
- Opens WordPress.com's existing migration signup in a separate tab.
- Provides an after-import review checklist.

The ZIP is a full site backup and can contain private content and credentials. Only administrators with export permission can download it, via a nonce-protected POST. Temporary files are removed after successful downloads or caught errors. Browser termination can prevent cleanup; this prototype is intended for disposable Playground environments.

## What is not yet verified

This is an experimental export helper, not a certified migration tool. Live OAuth sign-in has been verified by the user. A real WordPress.com archive import through the third-party OAuth app has **not yet been tested**; API access may still be rejected by WordPress.com. Free-plan ZIP acceptance, media mapping, theme availability, templates, global styles and plugin-dependent content must be checked in an actual destination account. The plugin never claims the move is complete.

WordPress.com documents Playground ZIP imports, but that does not guarantee full-site restoration on a free plan. Its free content-only XML route does not bundle local media, and the importer cannot fetch files living only in your browser. XML is therefore not a reliable substitute for a complete Playground archive.

The archive layout follows Playground's wp-content ZIP format with `playground-export.json` (formatVersion 2), plus a consistent SQLite snapshot. Reserved legacy runtime files and Playground-managed database drop-ins are excluded in line with the official exporter; user-supplied must-use plugins and unmarked database drop-ins are retained. Non-standard database locations outside wp-content and multisite are deliberately unsupported.

No destination plugin or analytics is added. The manual fallback needs no credentials. Automatic transfer uses the separately hosted OAuth service and begins only after the user selects the transfer action in that window.

## Validation

CI lints PHP and runs an isolated archive integration test covering media, scoped manifest URLs, committed WAL contents, source preservation, symlink exclusion and unsupported database layouts. Run locally with PHP 8+, ZIP and PDO SQLite:

```sh
php tests/export.php
```

Manual acceptance test: create a Playground with a page, an uploaded image, a navigation menu and edited global styles. Export through the plugin, import the ZIP into a new WordPress.com site, record the plan offered, and compare each item. Keep the source and backup until that passes. Also test non-admin access, invalid nonces and missing export prerequisites inside WordPress.

## References

- https://wordpress.com/support/import/
- https://wordpress.com/setup/migration-signup
- https://wordpress.com/support/plan-features/
- https://github.com/WordPress/wordpress-playground/blob/trunk/packages/playground/blueprints/src/lib/steps/zip-wp-content.ts

GPL-2.0-or-later.


### Choosing a destination

Existing-site transfers use single-site authorisation and an explicit transfer button.

The experimental new-site flow requests account-wide OAuth access, records the complete existing site ID list before signup, and polls for new IDs. Suggested names are optional hints to WordPress.com; assigned wpcomstaging.com addresses and different names do not block detection.

Candidates must be newly created since this setup began, absent from the baseline, hosted on WordPress.com, and administrable by the signed-in user. With one candidate and a paid plan, the existing import checks and automatic transfer begin. Multiple candidates require an explicit choice, validated on the server. Free plans wait for paid hosting. The baseline is encrypted in server-side storage with session ownership and expiry checks. Cookies hold only a small random reference. Incomplete lists stop rather than guess. Expired baselines are removed by scheduled cleanup.

Keep Playground and the connection window open and create only one destination during this session. This detection cannot prove that an unrelated new site was created by the signup tab, so avoid creating sites elsewhere concurrently. A one-use browser intent binds automatic export to the original Playground channel and destination. Refreshing does not automatically repeat the transfer.

Older in-progress sessions must restart because they lack the ID baseline. Sites created before restarting can be moved using the existing-site option. Live checkout-to-import verification remains pending.
