#!/bin/bash

curl -X POST 'http://localhost:3000/api/webhooks/actor1' \
-H 'Content-Type: application/json' \
-d '{
  "data": {
    "id": "jXEmGzEvOiYS3c9Lc",
    "actId": "yoFyGfllOo00TGKLl",
    "userId": "1KRYYp0DWutnMbGH0",
    "startedAt": "2025-09-24T20:46:43.385Z",
    "finishedAt": "2025-09-24T20:47:00.737Z",
    "status": "SUCCEEDED",
    "statusMessage": "Crawled 1/19 pages, 0 failed requests, desired concurrency 2.",
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
      "durationMillis": 17194,
      "resurrectCount": 0,
      "runTimeSecs": 17.194,
      "metamorph": 0,
      "computeUnits": 0.019104444444444445,
      "memAvgBytes": 576510796.493187,
      "memMaxBytes": 877355008,
      "memCurrentBytes": 0,
      "cpuAvgUsage": 36.02913555793253,
      "cpuMaxUsage": 91.08957888120679,
      "cpuCurrentUsage": 0,
      "netRxBytes": 1658118,
      "netTxBytes": 104437
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
    "defaultKeyValueStoreId": "aHEZiRFRe7Zf4ndZu",
    "defaultDatasetId": "bpUzauqlaxnkgyuGP",
    "defaultRequestQueueId": "I5gCgeh1wA0FTPfYB",
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
    "containerUrl": "https://ezivdpd5s7lk.runs.apify.net",
    "usage": {
      "ACTOR_COMPUTE_UNITS": 0.019104444444444445,
      "DATASET_READS": 0,
      "DATASET_WRITES": 1,
      "KEY_VALUE_STORE_READS": 1,
      "KEY_VALUE_STORE_WRITES": 3,
      "KEY_VALUE_STORE_LISTS": 0,
      "REQUEST_QUEUE_READS": 5,
      "REQUEST_QUEUE_WRITES": 45,
      "DATA_TRANSFER_INTERNAL_GBYTES": 0.0015083523467183113,
      "DATA_TRANSFER_EXTERNAL_GBYTES": 0.00007337331771850586,
      "PROXY_RESIDENTIAL_TRANSFER_GBYTES": 0,
      "PROXY_SERPS": 0
    },
    "usageTotalUsd": 0.006901425614212949,
    "usageUsd": {
      "ACTOR_COMPUTE_UNITS": 0.005731333333333333,
      "DATASET_READS": 0,
      "DATASET_WRITES": 0.000005,
      "KEY_VALUE_STORE_READS": 0.000005,
      "KEY_VALUE_STORE_WRITES": 0.00015000000000000001,
      "KEY_VALUE_STORE_LISTS": 0,
      "REQUEST_QUEUE_READS": 0.000019999999999999998,
      "REQUEST_QUEUE_WRITES": 0.0009000000000000001,
      "DATA_TRANSFER_INTERNAL_GBYTES": 0.00007541761733591557,
      "DATA_TRANSFER_EXTERNAL_GBYTES": 0.000014674663543701173,
      "PROXY_RESIDENTIAL_TRANSFER_GBYTES": 0,
      "PROXY_SERPS": 0
    },
    "consoleUrl": "https://console.apify.com/view/runs/jXEmGzEvOiYS3c9Lc"
  }
}'