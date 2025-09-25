#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor1' \
  -H 'Content-Type: application/json' \
  -d '{
  "datasetId": "V2mP7DVcFIK4pYNhz",
  "finishedAt": "2025-09-24T16:31:28.251Z",
  "runId": "vEeqQnIhPRHsnuq75",
  "startedAt": "2025-09-24T16:30:27.506Z",
  "status": "SUCCEEDED",
  "userJobId": "S57y9acE49p-R8ZcAWuwF"
}'