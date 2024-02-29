const yenv = require('yenv')
const aws = require('aws-sdk');
const { AssumeRole } = require('./auth');
const util = require('./utils');

let ECR_AWS_ACCOUNT;
let ECR_AWS_REGION;
let REPOSITORY_NAME;
let AUTH_TYPE;

async function initEnvs(app, assumeRole, channelNotification, withoutLoadBalance, isFargate) {
    const env = yenv('oni.yaml', process.env.NODE_ENV);
    const APP = env[app];
    ECR_AWS_ACCOUNT = env.ECR_AWS_ACCOUNT.toString();
    ECR_AWS_REGION = env.ECR_AWS_REGION;
    REPOSITORY_NAME = APP.APP_IMAGE.substring(APP.APP_IMAGE.indexOf('/') + 1);
    AUTH_TYPE = 'CI';
}

async function GetLatestImage(app, assumeRole) {
    try {
        await initEnvs(app);

        let cred;
        let confCredential = {
            apiVersion: '2015-09-21',
            region: ECR_AWS_REGION
        };

        if (assumeRole) {
            cred = await AssumeRole(AUTH_TYPE, app);
            confCredential.accessKeyId = cred.accessKeyId;
            confCredential.secretAccessKey = cred.secretAccessKey;
            confCredential.sessionToken = cred.sessionToken;
        }

        aws.config.update(confCredential)

        const ecr = new aws.ECR();
        const images = await ecr.describeImages({
            registryId: ECR_AWS_ACCOUNT,
            repositoryName: REPOSITORY_NAME
        }).promise();

        listImagesTags = images.imageDetails;

        let nextToken = images.nextToken;

        while (nextToken !== undefined) {
            const nextImages = await ecr.describeImages({
                registryId: ECR_AWS_ACCOUNT,
                repositoryName: REPOSITORY_NAME,
                nextToken: nextToken
            }).promise();

            nextToken = nextImages.nextToken;
            listImagesTags = listImagesTags.concat(nextImages.imageDetails)
        }

        listImagesTags.sort((a, b) => b.imagePushedAt - a.imagePushedAt);

        console.log(listImagesTags[0].imageTags[0])

    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

module.exports = {
    GetLatestImage
}