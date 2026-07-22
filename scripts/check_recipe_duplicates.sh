#!/usr/bin/env bash
set -euo pipefail

RECIPES_DIR="${1:-supabase/seed/recipes}"

if [ ! -d "$RECIPES_DIR" ]; then
  echo "Directory not found: $RECIPES_DIR" >&2
  exit 1
fi

python3 - "$RECIPES_DIR" << 'PYEOF'
import sys, json, glob, os
from collections import defaultdict

recipes_dir = sys.argv[1]
files = sorted(glob.glob(os.path.join(recipes_dir, "*.json")))

if not files:
    print(f"No .json files found in {recipes_dir}")
    sys.exit(1)

name_to_files = defaultdict(list)
within_file_dupes = []
total_recipes = 0

for fpath in files:
    fname = os.path.basename(fpath)
    try:
        with open(fpath) as f:
            data = json.load(f)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"WARNING: could not parse {fname}: {e}")
        continue

    if not isinstance(data, list):
        print(f"WARNING: {fname} does not contain a JSON array - skipping")
        continue

    names_in_file = []
    for rec in data:
        name = rec.get("name", "<missing name>")
        names_in_file.append(name)
        total_recipes += 1

    seen_in_file = {}
    for name in names_in_file:
        seen_in_file[name] = seen_in_file.get(name, 0) + 1
    for name, count in seen_in_file.items():
        if count > 1:
            within_file_dupes.append((fname, name, count))
        name_to_files[name].append(fname)

print(f"Scanned {len(files)} files, {total_recipes} total recipes.\n")

print("=== Duplicate names within a single file ===")
if within_file_dupes:
    for fname, name, count in within_file_dupes:
        print(f"  {fname}: \"{name}\" appears {count} times")
else:
    print("  none found")

print()
print("=== Same recipe name used across multiple files ===")
cross_file_dupes = {name: fs for name, fs in name_to_files.items() if len(set(fs)) > 1}
if cross_file_dupes:
    for name, fs in sorted(cross_file_dupes.items()):
        print(f"  \"{name}\" appears in: {', '.join(sorted(set(fs)))}")
else:
    print("  none found")

print()
if within_file_dupes or cross_file_dupes:
    print(f"RESULT: found {len(within_file_dupes)} within-file duplicate(s) and {len(cross_file_dupes)} cross-file duplicate name(s).")
    sys.exit(1)
else:
    print("RESULT: no duplicates found.")
    sys.exit(0)
PYEOF
