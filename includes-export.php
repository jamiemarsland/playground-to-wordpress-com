<?php
namespace PlaygroundToWordPressCom;
defined('ABSPATH') || exit;

/** Create a portable wp-content ZIP using a consistent SQLite snapshot. */
function build_archive($content_dir, $database, $config, $site_url) {
    $root = realpath($content_dir);
    $db = realpath($database);
    if (!$root || !$db || strpos($db, $root . DIRECTORY_SEPARATOR) !== 0 || !is_readable($config)) {
        throw new \RuntimeException('Unsupported site layout.');
    }
    $archive = tempnam(sys_get_temp_dir(), 'pgwpc-zip-');
    $snapshot = tempnam(sys_get_temp_dir(), 'pgwpc-db-');
    if (!$archive || !$snapshot) {
        if ($archive) { unlink($archive); }
        if ($snapshot) { unlink($snapshot); }
        throw new \RuntimeException('No temporary storage.');
    }
    $zip = new \ZipArchive();
    $opened = false;
    try {
        // VACUUM INTO includes committed WAL data without changing the source.
        $pdo = new \PDO('sqlite:' . $db, null, null, array(\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION));
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('VACUUM INTO ' . $pdo->quote($snapshot));
        $pdo = null;
        if ($zip->open($archive, \ZipArchive::OVERWRITE) !== true) { throw new \RuntimeException('Cannot open ZIP.'); }
        $opened = true;
        $files = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($files as $file) {
            if ($file->isLink() || !$file->isFile()) { continue; }
            $path = $file->getPathname();
            $relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($path, strlen($root) + 1));
            if ($path === $db || in_array($path, array($db . '-wal', $db . '-shm', $db . '-journal'), true)) { continue; }
            if (preg_match('#^(cache/|upgrade/|debug\.log$)#', $relative)) { continue; }
            // Match the official exporter's reserved legacy runtime paths.
            if (preg_match('#^mu-plugins/(sqlite-database-integration(/|$)|playground-includes(/|$)|0-playground\.php$|0-sqlite\.php$)#', $relative)) { continue; }
            if ($relative === 'db.php' && strpos(file_get_contents($path), '@playground-managed') !== false) { continue; }
            if (!$zip->addFile($path, 'wp-content/' . $relative)) { throw new \RuntimeException('Cannot add file.'); }
        }
        $db_relative = str_replace(DIRECTORY_SEPARATOR, '/', substr($db, strlen($root) + 1));
        if (!$zip->addFile($snapshot, 'wp-content/' . $db_relative)
            || !$zip->addFile($config, 'wp-config.php')
            || !$zip->addFromString('playground-export.json', json_encode(array('formatVersion' => 2, 'siteUrl' => $site_url), JSON_THROW_ON_ERROR))) {
            throw new \RuntimeException('Cannot complete ZIP.');
        }
        if (!$zip->close()) { throw new \RuntimeException('Cannot save ZIP.'); }
        $opened = false;
        return $archive;
    } catch (\Throwable $error) {
        if ($opened) { $zip->close(); }
        if (is_file($archive)) { unlink($archive); }
        throw $error;
    } finally {
        if (is_file($snapshot)) { unlink($snapshot); }
    }
}
