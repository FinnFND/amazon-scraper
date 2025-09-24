#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor2' \
-H 'Content-Type: application/json' \
-d '{
  "data": {
    "id": "Ktwm7jHtBcSoLVM3B",
    "actId": "rG6JHpXEAYEtUsTXq",
    "userId": "1KRYYp0DWutnMbGH0",
    "startedAt": "2025-09-24T11:52:10.887Z",
    "finishedAt": "2025-09-24T11:52:15.134Z",
    "status": "SUCCEEDED",
    "meta": {
      "origin": "API",
      "userAgent": "node"
    },
    "stats": {
      "inputBodyLen": 60,
      "migrationCount": 0,
      "rebootCount": 0,
      "restartCount": 0,
      "durationMillis": 4128,
      "resurrectCount": 0,
      "runTimeSecs": 4.128,
      "metamorph": 0,
      "computeUnits": 0.0002866666666666667,
      "memAvgBytes": 47812593.57480219,
      "memMaxBytes": 71868416,
      "memCurrentBytes": 0,
      "cpuAvgUsage": 12.70946470411751,
      "cpuMaxUsage": 70.18263585259213,
      "cpuCurrentUsage": 0,
      "netRxBytes": 10492,
      "netTxBytes": 4524
    },
    "options": {
      "build": "latest",
      "memoryMbytes": 256,
      "timeoutSecs": 3600,
      "maxItems": 25338,
      "diskMbytes": 2048
    },
    "createdByOrganizationMemberUserId": "mZ9y9nByKFfIuseca",
    "buildId": "NBCWIQPOd2heb2mrG",
    "exitCode": 0,
    "defaultKeyValueStoreId": "fsSZ4j4dBb73Uppyl",
    "defaultDatasetId": "qmbF2k4pkQBPklwg3",
    "defaultRequestQueueId": "OU101D4dYjUwhCnKa",
    "pricingInfo": {
      "pricingModel": "PRICE_PER_DATASET_ITEM",
      "reasonForChange": null,
      "pricePerUnitUsd": 0.0015,
      "unitName": "Seller",
      "createdAt": "2025-02-09T17:38:42.154Z",
      "startedAt": "2025-02-09T17:38:42.154Z",
      "apifyMarginPercentage": 0.2,
      "notifiedAboutChangeAt": "2025-02-09T21:09:18.969Z"
    },
    "platformUsageBillingModel": "DEVELOPER",
    "generalAccess": "FOLLOW_USER_SETTING",
    "buildNumber": "1.0.5",
    "containerUrl": "https://qzyn2lsxg83a.runs.apify.net",
    "consoleUrl": "https://console.apify.com/view/runs/Ktwm7jHtBcSoLVM3B"
  }
}'