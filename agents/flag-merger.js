/**
 * Agent: flag-merger
 *
 * Reads state/flags.yml, upserts parsed @flag annotations into it,
 * and writes the manifest back to disk.
 *
 * Merge rules:
 *  - New flags are inserted with state: "off" (flags are off by default)
 *  - Existing flags preserve their current state — never overwritten by annotation
 *  - intent/description, platforms, prereq, when, and source location are always
 *    refreshed from the annotation so the YAML stays in sync with code comments
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const FLAGS_YML = path.join(__dirname, '../state/flags.yml');

class FlagMerger {
  load() {
    if (!fs.existsSync(FLAGS_YML)) {
      return { flags: [] };
    }
    const raw = fs.readFileSync(FLAGS_YML, 'utf8');
    return yaml.load(raw) || { flags: [] };
  }

  save(manifest) {
    fs.writeFileSync(FLAGS_YML, yaml.dump(manifest, { lineWidth: -1, noRefs: true }), 'utf8');
  }

  /**
   * Upsert an array of parsed annotations into flags.yml.
   * @param {Array} annotations - output from CommentScanner.scan()
   * @returns {{ manifest, added: string[], updated: string[] }}
   */
  merge(annotations) {
    const manifest = this.load();
    manifest.flags = manifest.flags || [];

    const added = [];
    const updated = [];

    for (const ann of annotations) {
      const idx = manifest.flags.findIndex(f => f.id === ann.key);

      const entry = {
        id: ann.key,
        description: ann.intent,
        intent: ann.intent,
        group: ann.group || undefined,
        platforms: ann.platforms,
        prereq: ann.prereq || undefined,
        when: ann.prereq ? ann.when : undefined,
        sourceFile: ann.sourceFile,
        sourceLine: ann.sourceLine,
        // Translate prereq into the existing dependencies field for LD compatibility
        ...(ann.prereq ? { dependencies: [ann.prereq] } : {}),
      };

      // Remove undefined keys to keep YAML clean
      for (const k of Object.keys(entry)) {
        if (entry[k] === undefined) delete entry[k];
      }

      if (idx === -1) {
        entry.state = 'off';
        manifest.flags.push(entry);
        added.push(ann.key);
      } else {
        // Preserve developer-controlled state; refresh annotation-sourced fields
        const currentState = manifest.flags[idx].state;
        manifest.flags[idx] = { ...entry, state: currentState };
        updated.push(ann.key);
      }
    }

    this.save(manifest);
    return { manifest, added, updated };
  }
}

module.exports = FlagMerger;
