#!/bin/bash
cd "$(dirname "$0")"
IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
echo "=================================================="
echo "  Slovak & English Studio v3 (Four Strands PWA)"
echo "  Mac:    http://localhost:8080"
echo "  iPhone: http://$IP:8080  (Safari -> На экран Домой)"
echo "=================================================="
(sleep 1 && open "http://localhost:8080") &
python3 -m http.server 8080
