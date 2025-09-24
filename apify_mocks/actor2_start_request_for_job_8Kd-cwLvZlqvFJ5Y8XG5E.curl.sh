#!/bin/bash
# Make sure to set the APIFY_TOKEN environment variable
# export APIFY_TOKEN="YourTokenHere"

curl -X POST "https://api.apify.com/v2/acts/axesso_data~amazon-seller-scraper/runs" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $APIFY_TOKEN" \
  -d '{"input":[{"sellerId":"A2AGRXPN4RKYKO","domainCode":"com"}]}'