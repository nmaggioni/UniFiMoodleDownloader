#!/bin/bash

echo "Non eseguire questo script direttamente, usarlo solo come referenza e controllare i passaggi manualmente."
echo "L'organizzazione dei file su Moodle non e' stabile e potrebbe portare alla cancellazione di dati non recuperabili (risorse cancellate)."
exit 1

DUMP_ALL_PATHS=true DEBUG_LEVEL=silly npm start
# shellcheck disable=SC2227
find "$(pwd)/downloads/" -type f >! paths_on_disk.txt
comm -3 <(sort paths_on_disk.txt) <(sort paths.txt) > extraneous_paths.txt
less extraneous_paths.txt
while read -r f; do rm "$f"; done < extraneous_paths.txt
rm paths.txt paths_on_disk.txt extraneous_paths.txt
