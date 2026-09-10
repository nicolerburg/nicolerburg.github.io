#!/bin/bash
cd "$(dirname "$0")" || exit 1

printf '\n♡ Soft Toy Collection Importer ♡\n\n'
python3 tools/import_toys.py

printf '\nPress any key to close this window…'
read -n 1 -s -r
printf '\n'
