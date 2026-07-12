import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

/**
 * Manifest V3 definition for Palette.
 *
 * Permissions are intentionally minimal:
 * - `tabs`    : read tab metadata (title, url, favIconUrl) and activate tabs.
 * - `storage` : persist the Most-Recently-Used (MRU) tab history.
 *
 * Window focusing uses `chrome.windows.update`, which does not require an extra
 * permission. No host permissions are requested beyond the content-script match
 * needed to render the palette overlay on the active page.
 */
export default defineManifest({
  manifest_version: 3,
  name: 'Palette',
  version: pkg.version,
  description: pkg.description,
  icons: {
    16: 'public/icons/16.png',
    32: 'public/icons/32.png',
    48: 'public/icons/48.png',
    128: 'public/icons/128.png',
  },
  permissions: ['tabs', 'storage'],
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  action: {
    default_title: 'Palette settings',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.tsx'],
      run_at: 'document_idle',
      all_frames: false,
    },
  ],
  commands: {
    'toggle-palette': {
      suggested_key: {
        // Ctrl+J collides with Chrome's Downloads on Win/Linux; the
        // content-script interceptor opens the palette on normal pages anyway.
        // Rebindable at chrome://extensions/shortcuts.
        default: 'Ctrl+J',
        mac: 'Command+J',
      },
      description: 'Open or close the Palette command bar',
    },
    'previous-tab': {
      suggested_key: {
        // Cmd+, / Ctrl+,. On macOS Chrome reserves Cmd+, for Settings, so this
        // may register unbound — rebind at chrome://extensions/shortcuts.
        default: 'Ctrl+Comma',
        mac: 'Command+Comma',
      },
      description: 'Go back to the previously used tab',
    },
    'next-tab': {
      suggested_key: {
        // Cmd+. / Ctrl+.
        default: 'Ctrl+Period',
        mac: 'Command+Period',
      },
      description: 'Go forward to the next tab in history',
    },
  },
});
