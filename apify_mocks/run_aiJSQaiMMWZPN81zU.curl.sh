#!/bin/bash
# Make sure to set the APIFY_TOKEN environment variable
# export APIFY_TOKEN="YourTokenHere"

curl "https://api.apify.com/v2/actor-runs/aiJSQaiMMWZPN81zU" \
  -H "Authorization: Bearer $APIFY_TOKEN"