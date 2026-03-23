/**
 * Agent: comment-scanner
 *
 * Scans TypeScript, Kotlin, and Swift source files for @flag annotations
 * and returns structured flag definitions.
 *
 * Annotation syntax (works in TypeScript, Kotlin, Swift, JavaScript):
 *
 *   // @flag key=<flag-key> [prereq=<prereq-key>] [when=<true|false>] [group=<group>] [platforms=<csv>]
 *   // @flag-intent: <human-readable description>
 *
 * Example:
 *
 *   // @flag key=new-checkout-flow prereq=legacy-checkout when=false group=checkout platforms=web,android
 *   // @flag-intent: Skip new checkout block until legacy checkout is disabled
 */

const fs = require('fs');
const path = require('path');

const PLATFORM_BY_EXT = {
  '.ts': 'web',
  '.tsx': 'web',
  '.js': 'web',
  '.jsx': 'web',
  '.kt': 'android',
  '.swift': 'ios',
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'Pods']);

const FLAG_LINE_RE = /\/\/\s*@flag\s+(.+)/;
const INTENT_LINE_RE = /\/\/\s*@flag-intent:\s*(.+)/;
const ATTR_RE = /(\w[\w-]*)=([\w,.\-_/]+)/g;

function parseAttrs(str) {
  const attrs = {};
  // Reset lastIndex since ATTR_RE is module-level
  ATTR_RE.lastIndex = 0;
  let m;
  while ((m = ATTR_RE.exec(str)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function walkDir(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...walkDir(path.join(dir, entry.name)));
      }
    } else if (PLATFORM_BY_EXT[path.extname(entry.name).toLowerCase()]) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

class CommentScanner {
  /**
   * Scan an entire directory tree for @flag annotations.
   * Merges duplicate keys (same flag annotated in multiple files).
   * @param {string} rootDir
   * @returns {Array} parsed annotation objects
   */
  scan(rootDir) {
    const files = walkDir(rootDir);
    const results = [];

    for (const filePath of files) {
      results.push(...this.scanFile(filePath));
    }

    // Merge duplicate keys — same flag annotated across multiple files
    const byKey = new Map();
    for (const ann of results) {
      if (byKey.has(ann.key)) {
        const existing = byKey.get(ann.key);
        for (const p of ann.platforms) {
          if (!existing.platforms.includes(p)) existing.platforms.push(p);
        }
        existing.additionalSources = existing.additionalSources || [];
        existing.additionalSources.push({ file: ann.sourceFile, line: ann.sourceLine });
      } else {
        byKey.set(ann.key, ann);
      }
    }

    return Array.from(byKey.values());
  }

  /**
   * Scan a single file for @flag annotations.
   * @param {string} filePath
   * @returns {Array} parsed annotation objects
   */
  scanFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const results = [];
    const inferredPlatform = PLATFORM_BY_EXT[path.extname(filePath).toLowerCase()] || 'unknown';

    for (let i = 0; i < lines.length; i++) {
      const match = FLAG_LINE_RE.exec(lines[i]);
      if (!match) continue;

      const attrs = parseAttrs(match[1]);
      if (!attrs.key) continue; // key is required

      // Look ahead up to 3 lines for @flag-intent
      let intent = null;
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const intentMatch = INTENT_LINE_RE.exec(lines[j]);
        if (intentMatch) {
          intent = intentMatch[1].trim();
          break;
        }
        // Stop if we hit non-comment, non-empty content
        if (lines[j].trim() !== '' && !lines[j].trim().startsWith('//')) break;
      }

      const platforms = attrs.platforms
        ? attrs.platforms.split(',').map(p => p.trim())
        : [inferredPlatform];

      results.push({
        key: attrs.key,
        prereq: attrs.prereq || null,
        when: attrs.when !== undefined ? attrs.when : 'false',
        group: attrs.group || null,
        platforms,
        intent: intent || `Feature flag: ${attrs.key}`,
        sourceFile: filePath,
        sourceLine: i + 1,
      });
    }

    return results;
  }
}

module.exports = CommentScanner;
