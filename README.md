# Playground to WordPress.com

A small WordPress plugin that adds **Move to WordPress.com** to the admin menu and toolbar. Download a Playground archive, then follow a guided handoff to the existing WordPress.com importer.

## Try it

[Open the plugin in a fresh Playground](https://playground.wordpress.net/?blueprint-url=https%3A%2F%2Fraw.githubusercontent.com%2Fjamiemarsland%2Fplayground-to-wordpress-com%2Fmain%2Fblueprint.json). This demo link is provided for manual testing and has not been browser-verified.

Download this repository using **Code → Download ZIP**, upload it in your Playground under **Plugins → Add New → Upload Plugin**, and activate it. Open **Move to WordPress.com** in the sidebar.

The Actions workflow also produces an installable plugin ZIP, excluding the development files.

## What version 0.1.0 does

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

This is an experimental export helper, not a certified migration tool. A real WordPress.com import has **not yet been tested**. Free-plan ZIP acceptance, media mapping, theme availability, templates, global styles and plugin-dependent content must be checked in an actual destination account. The plugin never claims the move is complete.

WordPress.com documents Playground ZIP imports, but that does not guarantee full-site restoration on a free plan. Its free content-only XML route does not bundle local media, and the importer cannot fetch files living only in your browser. XML is therefore not a reliable substitute for a complete Playground archive.

The archive layout follows Playground's wp-content ZIP format with `playground-export.json` (formatVersion 2), plus a consistent SQLite snapshot. Reserved legacy runtime files and Playground-managed database drop-ins are excluded in line with the official exporter; user-supplied must-use plugins and unmarked database drop-ins are retained. Non-standard database locations outside wp-content and multisite are deliberately unsupported.

No destination plugin, WordPress.com API credentials, analytics, automatic publishing or automatic upload is required. The only outbound navigation is initiated by the user's links.

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
