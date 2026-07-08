#!/bin/bash
# Double-click this file to launch the passport photo generator.
# It serves the folder over http://localhost:8765 (so the WASM
# background-removal model can fetch its chunks — opening the
# .html directly via file:// breaks ONNX Runtime).

cd "$(dirname "$0")"
PORT=8765

# Open the page in the default browser once the server is up
( sleep 1; open "http://localhost:${PORT}/testvibe/passport_photo_generator.html" ) &

echo "Serving $(pwd) on http://localhost:${PORT}"
echo "Press Ctrl-C to stop."
exec python3 -m http.server "${PORT}"
