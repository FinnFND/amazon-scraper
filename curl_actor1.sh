#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor1' \
-H 'Content-Type: application/json' \
-d '{
  "data": {
    "id": "bccRaKMvaauTrW0LZ",
    "actId": "yoFyGfllOo00TGKLl",
    "userId": "1KRYYp0DWutnMbGH0",
    "startedAt": "2025-09-24T15:21:10.481Z",
    "finishedAt": "2025-09-24T15:21:58.552Z",
    "status": "SUCCEEDED",
    "statusMessage": "Crawled 1/19 pages, 0 failed requests, desired concurrency 3.",
    "isStatusMessageTerminal": null,
    "meta": {
      "origin": "API",
      "userAgent": "node"
    },
    "stats": {
      "inputBodyLen": 4603,
      "migrationCount": 0,
      "rebootCount": 0,
      "restartCount": 0,
      "durationMillis": 47820,
      "resurrectCount": 0,
      "runTimeSecs": 47.82,
      "metamorph": 0,
      "computeUnits": 0.05313333333333333,
      "memAvgBytes": 223466468.12210825,
      "memMaxBytes": 496513024,
      "memCurrentBytes": 0,
      "cpuAvgUsage": 25.77009120127351,
      "cpuMaxUsage": 132.6610240592227,
      "cpuCurrentUsage": 0,
      "netRxBytes": 4710922,
      "netTxBytes": 328225
    },
    "options": {
      "build": "latest",
      "timeoutSecs": 0,
      "memoryMbytes": 4096,
      "diskMbytes": 8192
    },
    "createdByOrganizationMemberUserId": "mZ9y9nByKFfIuseca",
    "buildId": "3SvsUYe8YOWthSdG9",
    "exitCode": 0,
    "defaultKeyValueStoreId": "BQ7OmNqRAr1ADdsgu",
    "defaultDatasetId": "I3fBpzQilXhJMjCYB",
    "defaultRequestQueueId": "8afsY0Ru3JgEEfkMZ",
    "pricingInfo": {
      "pricingModel": "FLAT_PRICE_PER_MONTH",
      "reasonForChange": null,
      "pricePerUnitUsd": 40,
      "trialMinutes": 4320,
      "createdAt": "2024-01-15T12:31:58.592Z",
      "startedAt": "2024-01-15T12:31:58.592Z",
      "apifyMarginPercentage": 0.2,
      "notifiedAboutChangeAt": "2024-01-15T13:06:21.263Z"
    },
    "platformUsageBillingModel": "USER",
    "generalAccess": "FOLLOW_USER_SETTING",
    "buildNumber": "0.0.483",
    "containerUrl": "https://qsktpbfogkda.runs.apify.net",
    "usage": {
      "ACTOR_COMPUTE_UNITS": 0.05313333333333333,
      "DATASET_READS": 0,
      "DATASET_WRITES": 1,
      "KEY_VALUE_STORE_READS": 1,
      "KEY_VALUE_STORE_WRITES": 3,
      "KEY_VALUE_STORE_LISTS": 0,
      "REQUEST_QUEUE_READS": 12,
      "REQUEST_QUEUE_WRITES": 64,
      "DATA_TRANSFER_INTERNAL_GBYTES": 0.0043668365105986595,
      "DATA_TRANSFER_EXTERNAL_GBYTES": 0.00024806149303913116,
      "PROXY_RESIDENTIAL_TRANSFER_GBYTES": 0,
      "PROXY_SERPS": 0
    },
    "usageTotalUsd": 0.017695954124137762,
    "usageUsd": {
      "ACTOR_COMPUTE_UNITS": 0.01594,
      "DATASET_READS": 0,
      "DATASET_WRITES": 0.000005,
      "KEY_VALUE_STORE_READS": 0.000005,
      "KEY_VALUE_STORE_WRITES": 0.00015000000000000001,
      "KEY_VALUE_STORE_LISTS": 0,
      "REQUEST_QUEUE_READS": 0.000048,
      "REQUEST_QUEUE_WRITES": 0.00128,
      "DATA_TRANSFER_INTERNAL_GBYTES": 0.00021834182552993298,
      "DATA_TRANSFER_EXTERNAL_GBYTES": 0.000049612298607826236,
      "PROXY_RESIDENTIAL_TRANSFER_GBYTES": 0,
      "PROXY_SERPS": 0
    },
    "consoleUrl": "https://console.apify.com/view/runs/bccRaKMvaauTrW0LZ"
  }
}'