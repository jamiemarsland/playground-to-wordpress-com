<?php
// Run with PHP 8+, pdo_sqlite and zip. No WordPress installation required.
define('ABSPATH', __DIR__);
require dirname(__DIR__) . '/includes-export.php';
function check($condition, $message) { if (!$condition) { throw new RuntimeException($message); } }
$base = sys_get_temp_dir() . '/pgwpc-test-' . bin2hex(random_bytes(6));
mkdir($base . '/wp-content/database', 0700, true);
mkdir($base . '/wp-content/uploads', 0700, true);
mkdir($base . '/wp-content/cache', 0700, true);
mkdir($base . '/wp-content/mu-plugins', 0700, true);
file_put_contents($base . '/wp-content/mu-plugins/0-playground.php', '<?php // runtime');
file_put_contents($base . '/wp-content/mu-plugins/custom.php', '<?php // user code');
file_put_contents($base . '/wp-content/db.php', '<?php // @playground-managed');
$db = $base . '/wp-content/database/.ht.sqlite';
$pdo = new PDO('sqlite:' . $db);
$pdo->exec('PRAGMA journal_mode=WAL');
$pdo->exec('CREATE TABLE posts (title TEXT)');
$pdo->exec("INSERT INTO posts VALUES ('A page saved in the WAL')");
file_put_contents($base . '/wp-config.php', '<?php // fixture');
file_put_contents($base . '/wp-content/uploads/photo.jpg', 'image-fixture');
file_put_contents($base . '/wp-content/cache/secret', 'excluded');
file_put_contents($base . '/outside', 'must not export');
symlink($base . '/outside', $base . '/wp-content/uploads/link');
$archive = null;
try {
    $archive = PlaygroundToWordPressCom\build_archive($base . '/wp-content', $db, $base . '/wp-config.php', 'https://playground.wordpress.net/scope:test/');
    $zip = new ZipArchive();
    check($zip->open($archive) === true, 'ZIP opens');
    check($zip->locateName('wp-content/db.php') === false, 'Managed database drop-in excluded');
    check($zip->locateName('wp-content/mu-plugins/0-playground.php') === false, 'Legacy runtime excluded');
    check($zip->locateName('wp-content/mu-plugins/custom.php') !== false, 'User code retained');
    check($zip->getFromName('wp-content/uploads/photo.jpg') === 'image-fixture', 'Media preserved');
    check($zip->locateName('wp-content/uploads/link') === false, 'Symlink excluded');
    check($zip->locateName('wp-content/cache/secret') === false, 'Cache excluded');
    check($zip->locateName('wp-content/database/.ht.sqlite-wal') === false, 'WAL not copied');
    $manifest = json_decode($zip->getFromName('playground-export.json'), true);
    check($manifest['formatVersion'] === 2, 'Manifest version');
    check($manifest['siteUrl'] === 'https://playground.wordpress.net/scope:test/', 'Scoped URL preserved');
    file_put_contents($base . '/snapshot.sqlite', $zip->getFromName('wp-content/database/.ht.sqlite'));
    $snapshot = new PDO('sqlite:' . $base . '/snapshot.sqlite');
    check($snapshot->query('SELECT title FROM posts')->fetchColumn() === 'A page saved in the WAL', 'Committed WAL data preserved');
    check($pdo->query('SELECT COUNT(*) FROM posts')->fetchColumn() == 1, 'Original database unchanged');
    $zip->close();
    $rejected = false;
    try { PlaygroundToWordPressCom\build_archive($base . '/wp-content/uploads', $db, $base . '/wp-config.php', 'https://example.com'); }
    catch (RuntimeException $e) { $rejected = true; }
    check($rejected, 'Outside database rejected');
    echo "PASS: ZIP, media, scoped manifest, WAL snapshot, source preservation, symlink and layout checks\n";
} finally {
    $pdo = null; $snapshot = null;
    if ($archive && is_file($archive)) { unlink($archive); }
    $files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST);
    foreach ($files as $file) { $file->isDir() && !$file->isLink() ? rmdir($file->getPathname()) : unlink($file->getPathname()); }
    rmdir($base);
}
