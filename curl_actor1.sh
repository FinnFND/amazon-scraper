#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor1' \
-H 'Content-Type: application/json' \
-d '{
  "data": {
    "id": "hvE0YCOJ0WbE27pVljaKa",
    "actId": "yoFyGfllOo00TGKLl",
    "userId": "1KRYYp0DWutnMbGH0",
    "startedAt": "2025-09-24T11:51:48.358Z",
    "finishedAt": "2025-09-24T11:52:04.332Z",
    "status": "SUCCEEDED",
    "statusMessage": "Crawled 1/19 pages, 0 failed requests, desired concurrency 2.",
    "isStatusMessageTerminal": null,
    "meta": {
      "origin": "API",
      "userAgent": "node"
    },
    "stats": {
      "inputBodyLen": 4349,
      "migrationCount": 0,
      "rebootCount": 0,
      "restartCount": 0,
      "durationMillis": 15737,
      "resurrectCount": 0,
      "runTimeSecs": 15.737,
      "metamorph": 0,
      "computeUnits": 0.017485555555555556,
      "memAvgBytes": 365696978.2362235,
      "memMaxBytes": 508538880,
      "memCurrentBytes": 0,
      "cpuAvgUsage": 33.938043459297496,
      "cpuMaxUsage": 89.90655043586551,
      "cpuCurrentUsage": 0,
      "netRxBytes": 1793025,
      "netTxBytes": 110342
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
    "defaultKeyValueStoreId": "NOLseMTPYHDeafGCK",
    "defaultDatasetId": "3p7xDelzpk6fitAc7",
    "defaultRequestQueueId": "eH8ZdiaSdDHVFgtC2",
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
    "containerUrl": "https://pdivetoh4aw5.runs.apify.net",
    "usage": {
      "ACTOR_COMPUTE_UNITS": 0.017485555555555556,
      "DATASET_READS": 0,
      "DATASET_WRITES": 0,
      "KEY_VALUE_STORE_READS": 1,
      "KEY_VALUE_STORE_WRITES": 1,
      "KEY_VALUE_STORE_LISTS": 0,
      "REQUEST_QUEUE_READS": 4,
      "REQUEST_QUEUE_WRITES": 43,
      "DATA_TRANSFER_INTERNAL_GBYTES": 0.00007013604044914246,
      "DATA_TRANSFER_EXTERNAL_GBYTES": 0.00008814875036478043,
      "PROXY_RESIDENTIAL_TRANSFER_GBYTES": 0,
      "PROXY_SERPS": 0
    },
    "usageTotalUsd": 0.0061978032187620805,
    "usageUsd": {
      "ACTOR_COMPUTE_UNITS": 0.005245666666666667,
      "DATASET_READS": 0,
      "DATASET_WRITES": 0,
      "KEY_VALUE_STORE_READS": 0.000005,
      "KEY_VALUE_STORE_WRITES": 0.00005,
      "KEY_VALUE_STORE_LISTS": 0,
      "REQUEST_QUEUE_READS": 0.000016,
      "REQUEST_QUEUE_WRITES": 0.0008600000000000001,
      "DATA_TRANSFER_INTERNAL_GBYTES": 0.000003506802022457123,
      "DATA_TRANSFER_EXTERNAL_GBYTES": 0.000017629750072956085,
      "PROXY_RESIDENTIAL_TRANSFER_GBYTES": 0,
      "PROXY_SERPS": 0
    },
    "consoleUrl": "https://console.apify.com/view/runs/aiJSQaiMMWZPN81zU"
  }
}'