#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor1' \
  -H 'Content-Type: application/json' \
  -d '{
    "runId": "R2S6W19GKH6nDiLm1",
    "datasetId": "AVfxt7R7w88WfX9vI",
    "status": "SUCCEEDED",
    "startedAt": "2025-09-24T21:37:43.323Z",
    "finishedAt": "2025-09-24T21:37:59.948Z",
    "userJobId": "S57y9acE49p-R8ZcAWuwF"
  }'


