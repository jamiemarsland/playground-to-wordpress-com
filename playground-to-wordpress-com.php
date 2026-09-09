<?php
/**
 * Plugin Name: Playground to WordPress.com
 * Description: Export your Playground site and follow a guided handoff to WordPress.com.
 * Version: 0.1.0
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
        wp_enqueue_style('pgwpc', plugins_url('assets/admin.css', __FILE__), array(), '0.1.0');
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
        $issues[] = 'This exporter needs a Playground site with a local SQLite database. On other sites, use Tools → Export.';
    }
    if (!class_exists('ZipArchive') || !class_exists('PDO') || !in_array('sqlite', \PDO::getAvailableDrivers(), true)) {
        $issues[] = 'This PHP environment is missing ZIP or PDO SQLite support. Use Playground’s built-in Export → Download as .zip instead.';
    }
    if (is_multisite()) {
        $issues[] = 'Multisite exports are not supported in this first version.';
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
        <div class="pgwpc-hero"><span class="pgwpc-eyebrow">FROM EXPERIMENT TO WEBSITE</span>
        <h1>Give your Playground a home.</h1>
        <p>Download your site, then take it to WordPress.com.<br>Keep this tab open while you finish the move.</p>
        <span class="pgwpc-badge">Guided transfer · Preview version</span></div>
        <section class="pgwpc-card"><h2><span class="pgwpc-number">1</span> Check your site</h2>
        <p><strong><?php echo esc_html(get_bloginfo('name')); ?></strong> · Theme: <?php echo esc_html($theme->get('Name')); ?></p>
        <p>Free hosting can be a good starting point for pages and posts. It cannot run installed plugins. Your theme, layouts and images need checking after import; this tool cannot certify free-plan compatibility.</p>
        <?php if ($active) : ?><div class="pgwpc-note"><strong>These active plugins need a closer look</strong><ul>
        <?php foreach ($active as $plugin) : ?><li><?php echo esc_html($plugins[$plugin]['Name'] ?? $plugin); ?></li><?php endforeach; ?>
        </ul><p>Features or blocks supplied by these plugins may need a paid plan. They are included in the download, but exporting them does not make them available on a free site.</p></div>
        <?php else : ?><p class="pgwpc-note">No regular active plugins found apart from this helper. Custom code, must-use plugins and theme availability still need checking.</p><?php endif; ?>
        <p><a href="https://wordpress.com/support/plan-features/" target="_blank" rel="noopener noreferrer">Compare WordPress.com plans ↗</a></p>
        </section>
        <section class="pgwpc-card"><h2><span class="pgwpc-number">2</span> Download your site</h2>
        <p>The ZIP contains your database, uploads, themes, plugins and configuration. Keep it private: it can contain drafts, account details and plugin settings.</p>
        <?php foreach ($issues as $issue) : ?><p class="pgwpc-note" role="alert"><?php echo esc_html($issue); ?></p><?php endforeach; ?>
        <?php if (!$issues) : ?><form action="<?php echo esc_url(admin_url('admin-post.php')); ?>" method="post">
        <input type="hidden" name="action" value="pgwpc_export"><?php wp_nonce_field('pgwpc_export'); ?>
        <button class="button button-primary button-hero" type="submit">Download my site (.zip)</button>
        </form><?php endif; ?>
        <p class="pgwpc-small">Wait for the download to finish before continuing. If it fails, use Playground’s built-in Export → Download as .zip. Large sites may exceed browser memory.</p></section>
        <section class="pgwpc-card"><h2><span class="pgwpc-number">3</span> Move into WordPress.com</h2>
        <ol><li>Open WordPress.com below and sign in or create an account.</li><li>Follow the import setup and upload the ZIP you downloaded.</li><li>Choose a free address and plan if offered for your import. If a paid plan is required, pause and check the import guide before proceeding.</li></ol>
        <a class="button button-primary button-hero" href="https://wordpress.com/setup/migration-signup" target="_blank" rel="noopener noreferrer">Continue to WordPress.com ↗</a>
        <p class="pgwpc-small">Opens a new tab. No file is uploaded until you select it on WordPress.com.</p>
        <details><summary>Need the free content-only route?</summary><p>WordPress.com supports content-only imports on free sites. Tools → Export can produce an XML file, but that file does not contain your image files or theme. Images stored only in Playground are not publicly reachable by the importer, so an XML-only move may require uploading and reconnecting them manually.</p><a href="https://wordpress.com/support/import/" target="_blank" rel="noopener noreferrer">Read the import guide ↗</a></details></section>
        <section class="pgwpc-card"><h2>Before you call it home</h2><p>Compare the imported site with your Playground. Check:</p>
        <?php foreach (array('Pages and posts, including drafts', 'Images and galleries', 'Homepage, navigation and links', 'Theme, colours, fonts and layouts', 'Forms, shop features and other plugin blocks') as $label) : ?><label class="pgwpc-check"><input type="checkbox"> <?php echo esc_html($label); ?></label><?php endforeach; ?>
        <p class="pgwpc-small">These are your review notes, not automatic checks. Keep your original Playground and ZIP until everything looks right.</p></section>
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
        header('Content-Disposition: attachment; filename="wordpress-playground.zip"');
        header('Content-Length: ' . filesize($archive));
        readfile($archive);
    } catch (\Throwable $error) {
        if ($archive && is_file($archive)) { unlink($archive); }
        wp_die('The download could not be prepared. Your site has not been changed. Try Playground’s built-in Export → Download as .zip.', 'Export did not finish', array('back_link' => true));
    } finally {
        if ($archive && is_file($archive)) { unlink($archive); }
    }
    exit;
});
