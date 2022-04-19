const aws = require('aws-sdk');
const path = require('path');
const yenv = require('yenv')
const mime = require('mime-types');
const fs = require('fs');
const S3Client = require('@aws-sdk/client-s3');
const S3SyncClient = require('s3-sync-client');

const { AssumeRole } = require('./auth');
const notifications = require('./notifications');
const util = require('./utils');


let APP_SRC;
let APP_S3_BUCKET;
let CF_DISTRIBUTION_ID;
let APP_REGION;
let AUTH_TYPE;
let CACHE_CONTROL;
let TMP_FILTERS = [];
let FILTERS = [];



async function initEnvs(app, assumeRole) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    APP = env[app];
    await util.ValidateStaticOniRequirements(APP, assumeRole);
    APP_SRC = APP.APP_SRC;
    APP_S3_BUCKET = APP.APP_S3_BUCKET;
    APP_NAME = APP.APP_NAME
    APP_REGION = APP.APP_REGION;
    CF_DISTRIBUTION_ID = APP.CF_DISTRIBUTION_ID;
    CACHE_CONTROL = APP.CACHE_CONTROL;
    TMP_FILTERS = APP.FILTERS || [];
    AUTH_TYPE = 'INFRA';
}

async function UploadS3(app, assumeRole) {
    let cred;
    let confCredential;
    if (assumeRole) {
        console.log('Assume Role')
        cred = await AssumeRole(AUTH_TYPE, app);
        confCredential = {
            accessKeyId: cred.accessKeyId,
            secretAccessKey: cred.secretAccessKey,
            sessionToken: cred.sessionToken
        }

    }
    const s3Client = await new S3Client.S3Client({ region: APP_REGION, credentials: confCredential });
    const syncClient = await new S3SyncClient({ client: s3Client });

    let commandInputConfig = {
        ACL: 'public-read', ContentType: (syncCommandInput) => (
            mime.lookup(syncCommandInput.Key) || 'text/html'
        )
    };

    if (CACHE_CONTROL)
        commandInputConfig.CacheControl = CACHE_CONTROL;

    if (TMP_FILTERS.EXCLUDE)
        for (const filter of TMP_FILTERS.EXCLUDE) {
            if (filter.ENDSWITH)
                FILTERS.push({ exclude: (key) => key.endsWith(filter.ENDSWITH) });
            if (filter.STARTSWITH)
                FILTERS.push({ exclude: (key) => key.endsWith(filter.STARTSWITH) });
        }

    if (TMP_FILTERS.INCLUDE)
        for (const filter of TMP_FILTERS.INCLUDE) {
            if (filter.ENDSWITH)
                FILTERS.push({ include: (key) => key.endsWith(filter.ENDSWITH) });
            if (filter.STARTSWITH)
                FILTERS.push({ include: (key) => key.endsWith(filter.STARTSWITH) });
        }

    await syncClient.sync(APP_SRC, APP_S3_BUCKET, {
        dryRun: false,
        filters: FILTERS,
        del: true, commandInput: commandInputConfig
    });

}

async function InvalidateCloudFront(app, assumeRole) {
    let cred;
    let confCredential = {
        apiVersion: '2016-11-15',
        region: APP_REGION
    };
    if (assumeRole) {
        cred = await AssumeRole(AUTH_TYPE, app);
        confCredential.accessKeyId = cred.accessKeyId;
        confCredential.secretAccessKey = cred.secretAccessKey;
        confCredential.sessionToken = cred.sessionToken;
    }

    aws.config.update(confCredential);

    const cl = await new aws.CloudFront();

    const caller = Math.floor(+new Date() / 1000);

    const invalidation = await cl.createInvalidation({
        DistributionId: CF_DISTRIBUTION_ID,
        InvalidationBatch: {
            CallerReference: `${caller}`,
            Paths: {
                Quantity: 1,
                Items: ['/*']
            }
        }
    }).promise();
}

async function DeployS3(app, channelNotification, assumeRole) {
    try {
        await initEnvs(app, assumeRole);
        await UploadS3(app, assumeRole);
        await InvalidateCloudFront(app, assumeRole);

        if (channelNotification)
            await notifications.SendMessage(app, APP_NAME, 'CLOUDFRONT', 'OK', '', channelNotification);

    } catch (error) {
        if (channelNotification)
            await notifications.SendMessage(app, APP_NAME, 'CLOUDFRONT', 'NOK', 'Failed deploy. Check pipeline logs', channelNotification);
        console.error('Error:', error)
    }

}

module.exports = {
    DeployS3
}