<?php
/**
 * Plugin Name: Playground to WordPress.com
 * Description: Export your Playground site and follow a guided handoff to WordPress.com.
 * Version: 0.2.0
 * Requires at least: 6.5
 * Requires PHP: 8.0
 * Author: Jamie Marsland
 * License: GPL-2.0-or-later
 * Text Domain: playground-to-wordpress-com
 */

namespace PlaygroundToWordPressCom;

defined('ABSPATH') || exit;
require_once __DIR__ . '/includes-export.php';

add_action('admin_menu', function () {
    add_menu_page('Move to WordPress.com', 'Move to WordPress.com', 'manage_options', 'playground-to-wordpress-com', __NAMESPACE__ . '\\render', 'dashicons-migrate', 81);
});
add_action('admin_enqueue_scripts', function ($hook) {
    if ($hook === 'toplevel_page_playground-to-wordpress-com') {
        wp_enqueue_script('pgwpc-transfer', plugins_url('assets/transfer.js', __FILE__), array(), '0.2.0', true);
        wp_enqueue_style('pgwpc', plugins_url('assets/admin.css', __FILE__), array(), '0.2.0');
    }
});
add_action('admin_bar_menu', function ($bar) {
    if (current_user_can('manage_options')) {
        $bar->add_node(array('id' => 'pgwpc', 'title' => 'Move to WordPress.com', 'href' => admin_url('admin.php?page=playground-to-wordpress-com')));
    }
}, 100);

function readiness() {
    $issues = array();
    if (!defined('FQDB') || !is_file(FQDB)) {
        $issues[] = 'This only works on a site running in the browser. On a normal WordPress site, use Tools → Export.';
    }
    if (!class_exists('ZipArchive') || !class_exists('PDO') || !in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
        $issues[] = 'This browser cannot package the site up. Use the Export option in the toolbar below instead.';
    }
    if (is_multisite()) {
        $issues[] = 'A network of sites cannot be sent yet.';
    }
    return $issues;
}

function render() {
    if (!current_user_can('manage_options')) { return; }
    require_once ABSPATH . 'wp-admin/includes/plugin.php';
    $plugins = get_plugins();
    $active = array_diff((array) get_option('active_plugins', array()), array(plugin_basename(__FILE__)));
    $issues = readiness();
    $theme = wp_get_theme();
    ?>
    <div class="wrap pgwpc">
        <div class="pgwpc-hero"><span class="pgwpc-eyebrow">PUT YOUR SITE ONLINE</span>
        <h1>Get your site live on WordPress.com.</h1>
        <p>Your site lives in this browser tab at the moment. Send it to WordPress.com and it gets a real address anyone can visit.<br>Leave this tab open while it goes.</p>
        <span class="pgwpc-badge">Guided · Early version</span></div>
        <section class="pgwpc-card"><h2>Send it over</h2>
        <p>Sign in to WordPress.com, check where it is going, and send. Nothing to download, nothing to upload by hand.</p>
        <?php if (!$issues) : ?><button id="pgwpc-connect" class="button button-primary button-hero" data-title="<?php echo esc_attr(get_bloginfo('name')); ?>" data-export-url="<?php echo esc_url(admin_url('admin-post.php')); ?>" data-nonce="<?php echo esc_attr(wp_create_nonce('pgwpc_export')); ?>">Connect and send my site</button><?php endif; ?>
        <p id="pgwpc-transfer-status" role="status" aria-live="polite">Send it to a new or spare site. Whatever is already there can be replaced. Some plans may require a paid WordPress.com plan.</p>
        <p class="pgwpc-small">Keep the WordPress.com window open until it finishes.</p></section>
        <section class="pgwpc-card"><h2><span class="pgwpc-number">1</span> What you are sending</h2>
        <p><strong><?php echo esc_html(get_bloginfo('name')); ?></strong> · Theme: <?php echo esc_html($theme->get('Name')); ?></p>
        <p>A free site is a fine place for pages and posts, but it cannot run plugins. Your design, layouts and pictures are worth a look once it lands; this tool cannot certify free-plan compatibility.</p>
        <?php if ($active) : ?><div class="pgwpc-note"><strong>These add-ons are worth a second look</strong><ul>
        <?php foreach ($active as $plugin) : ?><li><?php echo esc_html($plugins[$plugin]['Name'] ?? $plugin); ?></li><?php endforeach; ?>
        </ul><p>Anything these add-ons provide may need a paid plan. They travel with your site, but sending them does not make them work on a free site.</p></div>
        <?php else : ?><p class="pgwpc-note">Nothing unusual installed. Your design and any custom bits are still worth checking once it lands.</p><?php endif; ?>
        <p><a href="https://wordpress.com/support/plan-features/" target="_blank" rel="noopener noreferrer">Compare WordPress.com plans ↗</a></p>
        </section>
        <details class="pgwpc-card"><summary>Rather do it by hand?</summary><h2>Download your site</h2>
        <p>This file is your whole site. Keep it to yourself: it holds your drafts, your settings and anything else you have made.</p>
        <?php foreach ($issues as $issue) : ?><p class="pgwpc-note" role="alert"><?php echo esc_html($issue); ?></p><?php endforeach; ?>
        <?php if (!$issues) : ?><form action="<?php echo esc_url(admin_url('admin-post.php')); ?>" method="post">
        <input type="hidden" name="action" value="pgwpc_export"><?php wp_nonce_field('pgwpc_export'); ?>
        <button class="button button-primary button-hero" type="submit">Download my site (.zip)</button>
        </form><?php endif; ?>
        <p class="pgwpc-small">Let the download finish before you carry on. A very large site may be too big for the browser memory.</p>
        <section><h2>Take it to WordPress.com</h2>
        <ol><li>Open WordPress.com below and sign in, or make an account.</li><li>Follow the steps and choose the file you just downloaded.</li><li>Choose a free address and plan if offered for your import. If a paid plan is required, pause and check the import guide before proceeding.</li></ol>
        <a class="button button-primary button-hero" href="https://wordpress.com/setup/migration-signup" target="_blank" rel="noopener noreferrer">Continue to WordPress.com ↗</a>
        <p class="pgwpc-small">Opens a new tab. Nothing is sent until you choose the file yourself.</p>
        <details><summary>Need the free content-only route?</summary><p>WordPress.com supports content-only imports on free sites. Tools → Export can produce an XML file, but that file does not contain your image files or theme. Images stored only in Playground are not publicly reachable by the importer, so an XML-only move may require uploading and reconnecting them manually.</p><a href="https://wordpress.com/support/import/" target="_blank" rel="noopener noreferrer">Read the import guide ↗</a></details></section></details>
        <section class="pgwpc-card"><h2>Once it has landed</h2><p>Open the new site beside this one and check:</p>
        <?php foreach (array('Pages and posts, including drafts', 'Images and galleries', 'Homepage, navigation and links', 'Theme, colours, fonts and layouts', 'Forms, shop features and other plugin blocks') as $label) : ?><label class="pgwpc-check"><input type="checkbox"> <?php echo esc_html($label); ?></label><?php endforeach; ?>
        <p class="pgwpc-small">Nobody checks these but you. Keep this tab and your download until you are happy with the new site.</p></section>
    </div><?php
}

add_action('admin_post_pgwpc_export', function () {
    if (!current_user_can('manage_options') || !current_user_can('export')) {
        wp_die('You do not have permission to export this site.', '', array('response' => 403));
    }
    check_admin_referer('pgwpc_export');
    $issues = readiness();
    if ($issues) { wp_die(esc_html(implode(' ', $issues))); }
    $archive = null;
    try {
        $archive = build_archive(WP_CONTENT_DIR, FQDB, ABSPATH . 'wp-config.php', site_url('/'));
        while (ob_get_level()) { ob_end_clean(); }
        nocache_headers();
        header('Content-Type: application/zip');
        $name = sanitize_title(get_bloginfo('name'));
    header('Content-Disposition: attachment; filename="' . ($name ? $name : 'my-website') . '.zip"');
        header('Content-Length: ' . filesize($archive));
        readfile($archive);
    } catch (\Throwable $error) {
        if ($archive && is_file($archive)) { unlink($archive); }
        wp_die('The file could not be made. Your site is untouched. Try the Export option in the toolbar below.', 'Export did not finish', array('back_link' => true));
    } finally {
        if ($archive && is_file($archive)) { unlink($archive); }
    }
    exit;
});
