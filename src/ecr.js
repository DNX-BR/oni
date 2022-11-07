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
    await util.ValidateECSMinimunRequirements(APP, assumeRole, {
        notification: null,
        withoutLoadBalance: false,
        isFargate: false
    });
    ECR_AWS_ACCOUNT = env.ECR_AWS_ACCOUNT.toString();
    ECR_AWS_REGION = env.ECR_AWS_REGION;
    REPOSITORY_NAME = APP.APP_IMAGE.substring(APP.APP_IMAGE.indexOf('/') + 1);
    AUTH_TYPE = 'CI';
}

async function GetLatestImage(app, assumeRole) {
    try {
        await initEnvs(app, assumeRole);

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

        let latestImage = null;
        for (const image of images.imageDetails) {
            if (image.imageScanStatus == null || image.imageScanStatus.status !== 'COMPLETE'
                || image.imageTags == null || image.imageTags.length == 0) {
                continue;
            }
            if (latestImage == null || image.imagePushedAt > latestImage.imagePushedAt) {
                latestImage = image;
            }
        }

        if (latestImage == null) {
            console.error('Image Not Found');
            process.exit(1);    
        }

        const tag = latestImage.imageTags.find(tag => tag !== 'latest');

        console.log(tag);
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

module.exports = {
    GetLatestImage
}