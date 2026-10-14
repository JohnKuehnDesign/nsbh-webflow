#!/usr/bin/env bash
# Rebuilds src/map/regions.geojson: the five Beef Country region shapes.
#
# Input:  MassGIS "Municipalities" shapefile (TOWNSSURVEY_POLYM_GENCOAST.shp, the
#         generalized-coast version, so shapes stop at the shoreline).
#         https://www.mass.gov/info-details/massgis-data-municipalities
# Map:    tools/regions/town_region.csv (town -> region slug, from the Towns CMS
#         collection; Boston and East Boston are left out on purpose; Brookline and
#         Lincoln are not CMS towns and are added to Greater Boston so it has no hole).
# Needs:  mapshaper (npm i -g mapshaper, or npx mapshaper)
#
# Usage:  tools/regions/build-regions.sh path/to/TOWNSSURVEY_POLYM_GENCOAST.shp
set -euo pipefail
SHP="${1:?path to TOWNSSURVEY_POLYM_GENCOAST.shp}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$HERE/../../src/map/regions.geojson"
MAPSHAPER="${MAPSHAPER:-mapshaper}"

"$MAPSHAPER" "$SHP" \
  -join "$HERE/town_region.csv" keys=TOWN,TOWN string-fields=TOWN \
  -filter '!!region' \
  -dissolve region \
  -proj wgs84 \
  -simplify 5% keep-shapes \
  -o "$OUT" precision=0.0001 format=geojson
