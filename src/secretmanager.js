const aws = require('aws-sdk');
const fs = require('fs');
const AUTH_TYPE = 'INFRA';
const { AssumeRole } = require('./auth');
const yenv = require('yenv')

async function GetSecrets(secretName, region, assumeRole,app) {

    let confCredential = {
        apiVersion: '2017-10-17',
        region: region
    };

    let secretList = [];

    if (assumeRole) {
        cred = await AssumeRole(AUTH_TYPE, app);
        confCredential.accessKeyId = cred.accessKeyId;
        confCredential.secretAccessKey = cred.secretAccessKey;
        confCredential.sessionToken = cred.sessionToken;
    }


    aws.config.update(confCredential)

    const secret = await new aws.SecretsManager({apiVersion: '2017-10-17', region: region });

    const secretValuesText = await secret.getSecretValue({
        SecretId: secretName
    }).promise();

    const secretValuesJson = JSON.parse(secretValuesText.SecretString);

    for (var attributename in secretValuesJson) {
        secretList.push({ name: attributename, valueFrom: `${secretValuesText.ARN}:${attributename}::` });
    }

    return secretList;
}

async function CreateEnvFromSecrets(app, filepath, assumeRole, format) {
    const env = yenv('oni.yaml', process.env.NODE_ENV);
    const APP = env[app];
    
    let confCredential = {
        apiVersion: '2017-10-17',
        region: APP.APP_REGION
    };

    if (assumeRole) {
        cred = await AssumeRole(AUTH_TYPE, app);
        confCredential.accessKeyId = cred.accessKeyId;
        confCredential.secretAccessKey = cred.secretAccessKey;
        confCredential.sessionToken = cred.sessionToken;
    }

    aws.config.update(confCredential)

    const secret = await new aws.SecretsManager({apiVersion: '2017-10-17', region: APP.APP_REGION });

    const secretValuesText = await secret.getSecretValue({
        SecretId: APP.APP_SECRET_EXTRACT_ENV_FILE
    }).promise();

    if (!format) {
        fs.writeFileSync(filepath, secretValuesText.SecretString);
        return;
    }

    const secretValuesJson = JSON.parse(secretValuesText.SecretString);

    const secretValuesString = Object.entries(secretValuesJson)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    fs.writeFileSync(filepath, secretValuesString);

    return;
}


module.exports = {
    GetSecrets,
    CreateEnvFromSecrets
}