// Read the Readwise database password from the user's macOS Keychain.
// The secret stays inside this process and is never written to stdout or disk.
const { execFileSync } = require('node:child_process');
const os = require('node:os');

const SERVICES = [
  'readwise-supabase-db-importer',
  'readwise-supabase-db',
];

function readKeychainPassword() {
  const accounts = [...new Set([
    process.env.USER,
    process.env.LOGNAME,
    os.userInfo().username,
  ].filter(Boolean))];
  for (const account of accounts) {
    for (const service of SERVICES) {
      try {
        const value = execFileSync('/usr/bin/security', [
          'find-generic-password', '-a', account, '-s', service, '-w',
        ], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
          timeout: 5000,
          maxBuffer: 4096,
        });
        const password = value.replace(/\r?\n$/, '');
        if (password) return password;
      } catch {
        // Try the next known service/account without displaying any secret.
      }
    }
  }
  return null;
}

module.exports = { readKeychainPassword, SERVICES };
