import { PolygonWatcherService } from '../services/polygon-watcher-service';

// Test script to verify polygon sync functionality
async function testPolygonSync() {
  console.log('Starting polygon sync test...');

  // Test with different configurations
  const testConfigs = [
    {
      name: 'Default config',
      options: {
        watchDir: 'src/content/kommunen',
        followSymlinks: true,
        debounceMs: 1000,
        debug: true
      }
    },
    {
      name: 'No symlinks',
      options: {
        watchDir: 'src/content/kommunen',
        followSymlinks: false,
        debounceMs: 1500,
        debug: true
      }
    }
  ];

  for (const config of testConfigs) {
    console.log(`\n=== Testing: ${config.name} ===`);

    const watcher = new PolygonWatcherService(config.options);

    try {
      // Test manual sync with a known slug
      console.log('Testing manual sync...');
      await watcher.triggerManualSync('test-kommune');

      console.log('Manual sync test completed');

    } catch (error) {
      console.error('Test failed:', error.message);
    }
  }

  console.log('\n=== All tests completed ===');
}

// Test slug extraction
function testSlugExtraction() {
  console.log('\nTesting slug extraction...');

  const testPaths = [
    'src/content/kommunen/berlin.md',
    '/symlinked/content/kommunen/muenchen.md',
    'kommunen/hamburg.md',
    'invalid-path.txt'
  ];

  const watcher = new PolygonWatcherService({
    watchDir: 'src/content/kommunen',
    followSymlinks: true,
    debounceMs: 1000,
    debug: true
  });

  testPaths.forEach(path => {
    // @ts-ignore - accessing private method for testing
    const slug = watcher.extractSlugFromPath(path);
    console.log(`Path: ${path} -> Slug: ${slug}`);
  });
}

// Run tests
async function main() {
  try {
    await testPolygonSync();
    testSlugExtraction();
  } catch (error) {
    console.error('Test execution failed:', error);
    process.exit(1);
  }
}

// Only run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
