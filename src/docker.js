const aws = require('aws-sdk');
const shell = require('shelljs');
const yenv = require('yenv');
const { AssumeRole } = require('./auth')
const AUTH_TYPE = 'CI';

async function BuildImageBuildKit(tag, dockerFile = '.', app = 'APP_DEFAULT', push = 'false') {

    try {
        const env = yenv('oni.yaml', process.env.NODE_ENV)
        const APP = env[app];
        const APP_IMAGE = APP.APP_IMAGE;

        const result = await shell.exec(`buildctl build     \
        --frontend=dockerfile.v0 \
        --local context=.    \
        --local dockerfile=${dockerFile} \
        --output type=docker,name=${APP_IMAGE}:${tag},push=${push} \
        --export-cache type=local,dest=cache_build \
        --import-cache type=local,src=cache_build > image.tar`)

        if (result.code != 0)
            process.exit(1);

    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

async function PushImageCrane(app, tag, assumeRole) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const APP_IMAGE = APP.APP_IMAGE;
    const APP_REGION = APP.APP_REGION;

    const authEcr = await DockerLoginECR(assumeRole,APP_REGION,app);

    await shell.exec(`crane auth login ${APP_IMAGE.split('/')[0]} -u AWS -p ${authEcr.password}`,{ silent: true });
    const result = await shell.exec(`crane push image.tar ${APP_IMAGE}:${tag}`);

    if (result.code != 0)
        process.exit(1);
}

async function LoginEcr(app) {
    console.log('Login in ECR')
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const APP_IMAGE = APP.APP_IMAGE;

    const authEcr = await DockerLoginECR();

    await shell.exec(`crane auth login ${APP_IMAGE.split('/')[0]} -u AWS -p ${authEcr.password}`,{ silent: true });
}

async function DockerLoginECR(assumeRole,appRegion, app) {
    try {

        let confCredential = {
            apiVersion: '2016-11-15',
            region: appRegion
        };

        if (assumeRole) {
            cred = await AssumeRole(AUTH_TYPE, app);
            confCredential.accessKeyId = cred.accessKeyId;
            confCredential.secretAccessKey = cred.secretAccessKey;
            confCredential.sessionToken = cred.sessionToken;
        }


        aws.config.update(confCredential);

        let ecr = new aws.ECR();
        let authResponse = await ecr.getAuthorizationToken().promise();
        let [user, pass] = Buffer.from(authResponse.authorizationData[0].authorizationToken, 'base64').toString().split(':');

        return {
            username: user,
            password: pass,
            serveraddress: authResponse.authorizationData[0].proxyEndpoint
        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

module.exports = {
    BuildImageBuildKit, PushImageCrane, LoginEcr
}
