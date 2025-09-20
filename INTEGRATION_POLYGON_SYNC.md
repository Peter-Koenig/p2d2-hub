# Polygon Sync Plugin for AstroJS

## Overview

A fully automated AstroJS Integration Plugin that provides real-time polygon synchronization with WFS-T services. The plugin watches markdown files in the kommunen directory and automatically triggers WFS-T synchronization when files are added or modified.

## Features

- ✅ **True AstroJS Integration**: Runs as native Astro integration in both development and production
- ✅ **Symlink Support**: Full support for symlinked directories with proper file detection
- ✅ **Background Service**: Continuous operation with graceful shutdown and error recovery
- ✅ **Debounced Processing**: Prevents multiple rapid syncs with configurable debounce timing
- ✅ **Production Ready**: Works in both development server and production build environments
- ✅ **Extensive Logging**: Debug logging for development and troubleshooting

## Installation

The plugin is already integrated into the project. No additional installation required.

## Configuration

The plugin is configured in `astro.config.mjs`:

```javascript
import { polygonSyncPlugin } from './src/integrations/polygon-sync-plugin';

export default defineConfig({
  integrations: [
    polygonSyncPlugin({
      watchDir: 'src/content/kommunen',    // Directory to watch
      autoSync: true,                     // Enable automatic synchronization
      followSymlinks: true,               // Follow symlinks (important for server environments)
      debounceMs: 2000,                   // Debounce time in milliseconds
      debug: process.env.DEBUG === 'true' // Enable debug logging
    })
  ]
});
```

## Usage

### Automatic Operation

The plugin starts automatically when the Astro development server starts (`astro dev`) and runs in the background. It will:

1. Watch for new markdown files in `src/content/kommunen/*.md`
2. Watch for changes to existing markdown files
3. Extract the slug from the filename (e.g., `berlin.md` → `berlin`)
4. Trigger `syncKommunePolygons(slug)` with proper debouncing
5. Log results and handle errors automatically

### Manual Triggering

You can manually trigger synchronization using the watcher service:

```typescript
import { PolygonWatcherService } from './src/services/polygon-watcher-service';

const watcher = new PolygonWatcherService({
  watchDir: 'src/content/kommunen',
  followSymlinks: true,
  debounceMs: 2000,
  debug: true
});

// Trigger sync for specific kommune
await watcher.triggerManualSync('berlin');
```

### Environment Variables

- `DEBUG=true`: Enable detailed debug logging
- `NODE_ENV=development`: Development mode with enhanced logging

## File Structure

```
src/
├── integrations/
│   └── polygon-sync-plugin.ts     # Main Astro integration
├── services/
│   └── polygon-watcher-service.ts # Background watcher service
├── utils/
│   ├── logger.ts                  # Logging utility
│   └── polygon-wfst-sync.ts       # Existing sync functionality
```

## Technical Details

### Chokidar Configuration

The plugin uses `chokidar` with optimal configuration for server environments:

```typescript
{
  persistent: true,
  followSymlinks: true,           // Critical for symlink support
  usePolling: process.platform === 'linux', // Required for server environments
  awaitWriteFinish: {             // Ensures file stability
    stabilityThreshold: 500,
    pollInterval: 100
  },
  ignoreInitial: true,
  depth: 1,
  atomic: true
}
```

### Error Handling

- Automatic restart on file watching errors
- Retry logic with exponential backoff
- Comprehensive error logging
- Graceful shutdown handling

### Performance Considerations

- Minimal overhead in development mode
- Debouncing prevents excessive WFS-T calls
- Polling only enabled on Linux servers
- Memory-efficient file watching

## Development

### Testing

Run the test script to verify functionality:

```bash
npm run test-polygon-sync
```

### Debugging

Enable debug mode to see detailed logs:

```bash
DEBUG=true astro dev
```

### Adding New Features

1. Extend the `PolygonSyncPluginOptions` interface
2. Update the watcher service implementation
3. Add corresponding configuration in `astro.config.mjs`
4. Update this documentation

## Troubleshooting

### Common Issues

1. **Files not being detected**: Check symlink configuration and file permissions
2. **Sync not triggering**: Verify the markdown file is in the correct directory
3. **Performance issues**: Adjust debounce timing or disable polling if not on Linux

### Log Analysis

Check the Astro server logs for:
- File detection events
- Sync initiation and completion
- Error messages and stack traces

## Dependencies

- `chokidar`: File watching with symlink support
- Built-in Astro integration system
- Existing `polygon-wfst-sync.ts` functionality

## License

Part of the P2D2 project. See main project documentation for licensing details.