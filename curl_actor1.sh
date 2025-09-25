#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor1' \
  -H 'Content-Type: application/json' \
  -d '{
  "runId": 'hg7ubE4a9bI1jVKzp',
  "datasetId": 'JfipxuJf608VqwfSs',
  "status": 'SUCCEEDED',
  "startedAt": '2025-09-25T11:32:15.803Z',
  "finishedAt": '2025-09-25T11:32:49.350Z'
}'


