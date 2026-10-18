#!/usr/bin/env bash
# Stops Bagh Chal (API server and web app). Other pm2 apps are left alone.
pm2 stop bhagchal2 >/dev/null 2>&1
echo "bhagchal2 stopped"
