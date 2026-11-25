#!/bin/sh
# For the leak gates only: what they say when the runtime does not keep every binding (REPORT.md, bug 1). Never shipped.
perl -0pi -e 's/l\.push\(e\);/void e;/' "$1/node_modules/@reactivescript/runtime/dist/web.js"
