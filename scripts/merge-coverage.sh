#!/bin/bash
set -e

echo "Merging coverage reports..."

# Clean up previous runs
rm -rf .nyc_output
rm -rf coverage
mkdir -p .nyc_output

# Copy coverage files with unique names
i=0
find packages -path '*/coverage/coverage-final.json' | while read -r file; do
  cp "$file" ".nyc_output/coverage-$i.json"
  i=$((i+1))
done

# Merge and report
echo "Merging with nyc..."
bun nyc merge .nyc_output .nyc_output/coverage.json
echo "Generating report..."
bun nyc report --reporter=html --temp-dir=./.nyc_output --report-dir=./coverage

echo "Coverage report generated in ./coverage/index.html"

open ./coverage/index.html

