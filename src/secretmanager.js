const aws = require('aws-sdk');
const AUTH_TYPE = 'INFRA';
const { AssumeRole } = require('./auth');

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
        secretList.push({ name: attributename, valueFrom: `${secretName}:${attributename}::` });
    }

    return secretList;
}


module.exports = {
    GetSecrets
}