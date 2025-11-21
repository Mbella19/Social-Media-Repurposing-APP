#!/bin/bash
echo "==================== MONITORING GEMINI VIDEO ANALYSIS LOGS ===================="
echo "Watching app.log for errors, warnings, and Gemini API calls..."
echo "Press Ctrl+C to stop"
echo ""
echo "================================================================================"
echo ""

tail -f app.log | grep --line-buffered -E "(STEP|ERROR|WARNING|Gemini|fallback|file_uri|analyze_video|📹|✓|✗|Description)" --color=always
