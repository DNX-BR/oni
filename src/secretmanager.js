const aws = require('aws-sdk');
const AUTH_TYPE = 'INFRA';

async function GetSecret(secretName, region, assumeRole) {

    let confCredential = {
        //apiVersion: '2016-11-15',
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

    const secret = await new aws.SecretsManager();

    const secretValuesText = await secret.getSecretValue({
        SecretId: secretName
    }).promise();

    const secretValuesJson = JSON.parse(secretValuesText.SecretString);

    for (var attributename in secretValuesJson) {
        secretList.push({ name: attributename, valueFrom: `${secretName}:${attributename}::` });
    }

    return secretList;
}

async function run() {
    await GetSecret('arn:aws:secretsmanager:us-east-1:021667863185:secret:/ecs/app/backend-BszGr4', 'us-east-1', false);
}

run();