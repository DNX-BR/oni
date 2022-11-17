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

       images.imageDetails.sort((a,b) =>{
            const dataA = a.imagePushedAt;
            const dataB = b.imagePushedAt;
            if (dataA > dataB) {
                return -1;
              }
              if (dataA < dataB) {
                return 1;
              }            
              return 0;            
        });

        console.log(images.imageDetails[0].imageTags[0])

    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

module.exports = {
    GetLatestImage
}