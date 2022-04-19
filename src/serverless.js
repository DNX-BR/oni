const aws = require('aws-sdk');
const yenv = require('yenv');
const fs = require('fs');
const shell = require('shelljs');
const { AssumeRole } = require('./auth');
const AUTH_TYPE = 'INFRA';
const notifications = require('./notifications');
const util = require('./utils');

let FUNCTION_NAME;
let FUNCTION_VARIABLES;
let FUNCTION_S3;
let APP_REGION;

async function initEnvs(app,assumeRole) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    await util.ValidateLambdaOniRequirements(APP,assumeRole);
    FUNCTION_NAME = APP.FUNCTION_NAME;
    FUNCTION_VARIABLES = APP.APP_VARIABLES;
    FUNCTION_S3 = APP.FUNCTION_S3;
    APP_REGION  = APP.APP_REGION

}

async function UpdateLambdaEnvVariables(functionName, variables) {
    try {
        const lambda = await new aws.Lambda();
        let result;
        let configuration = {};
        for (var idx in variables) {
            var item = variables[idx];
            for (var key in item) {
                var value = item[key];
                configuration[key] = value.toString();
            }
        }
        if (variables) {
            result = await lambda.updateFunctionConfiguration({
                FunctionName: functionName,
                Environment: {
                    Variables: configuration
                }
            }).promise();
            if (result.$response.httpResponse.statusCode === 200) {
                console.log('\x1b[32m', 'Successfully updated lambda env variables');
            } else {
                console.log('\x1b[31m', `Erro updated lambda env variables. Http Status Code ${result.$response.httpResponse.statusCode}`);
            }


        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }





}

async function UploadCodeS3(zipFile, bucket) {
    try {
        const s3 = new aws.S3();
        const parts = zipFile.split('/');
        const fileName = parts[parts.length - 1];
        const contents = await fs.readFileSync(zipFile);

        await s3.upload({
            Bucket: bucket,
            Key: fileName,
            Body: contents,
            ContentType: 'application/zip'
        }).promise();
        console.log('\x1b[32m', 'Successfully upload to S3');
        return fileName;
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }


}

async function UpdateLambda(app, zipFile, channelNotification, assumeRole) {
    await initEnvs(app,assumeRole);
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

    const fileSizeZip = fs.statSync(zipFile).size / (1024 * 1024);
    const fileSizeUnzip = shell.exec(`unzip -l ${zipFile} | tail -1 | xargs | cut -d' ' -f1`, { silent: true }).stdout / (1024 * 1024);

    const lambda = await new aws.Lambda();

    if (fileSizeZip < 50.0) {
        console.log('\x1b[32m', 'Zip file smaller than 50Mb ');
        if (fileSizeUnzip < 250.0) {
            console.log('\x1b[32m', 'Uncompressed file smaller than 250Mb, starting direct upload');
            const contents = await fs.readFileSync(zipFile);
            const result = await lambda.updateFunctionCode({
                FunctionName: FUNCTION_NAME,
                ZipFile: contents,
            }).promise();
            if (result.$response.httpResponse.statusCode === 200) {
                console.log('\x1b[32m', 'Lambda updated successfully');
                if (channelNotification)
                    await notifications.SendMessage(app, FUNCTION_NAME, 'LAMBDA', 'OK', '', channelNotification);
            } else {
                console.log('\x1b[32m', `Erro updated lambda. Http Staus Code ${result.$response.httpResponse.statusCode}`)
                if (channelNotification)
                    await notifications.SendMessage(app, FUNCTION_NAME, 'LAMBDA', 'NOK', `Erro updated lambda. Http Staus Code ${result.$response.httpResponse.statusCode}`, channelNotification);
            }
            await UpdateLambdaEnvVariables(FUNCTION_NAME, FUNCTION_VARIABLES);

        }
    } else {
        console.log('\x1b[32m', 'Zip file larger than 50Mb. Checking upload to S3 is possible');
        if (fileSizeZip >= 250.0) {
            console.log('\x1b[31m', 'Zip file larger than 250Mb. Unable to upload');
            if (channelNotification)
                await notifications.SendMessage(app, FUNCTION_NAME, 'LAMBDA', 'NOK', `Zip file larger than 250Mb. Unable to upload`, channelNotification);
            process.exit(1);
        } else if (fileSizeUnzip < 250.0) {
            console.log('\x1b[32m', 'Upload code to S3');
            const fileName = await UploadCodeS3(zipFile, FUNCTION_S3);
            const result = await lambda.updateFunctionCode({
                FunctionName: FUNCTION_NAME,
                S3Bucket: FUNCTION_S3,
                S3Key: fileName,
            }).promise();

            if (result.$response.httpResponse.statusCode === 200) {
                console.log('\x1b[32m', 'Lambda updated successfully')
                if (channelNotification)
                    await notifications.SendMessage(app, FUNCTION_NAME, 'LAMBDA', 'OK', '', channelNotification);
            } else {
                console.log('\x1b[32m', `Erro updated lambda. Http Staus Code ${result.$response.httpResponse.statusCode}`)
                if (channelNotification)
                    await notifications.SendMessage(app, FUNCTION_NAME, 'LAMBDA', 'NOK', `Erro updated lambda. Http Staus Code ${result.$response.httpResponse.statusCode}`, channelNotification);
            }
            await UpdateLambdaEnvVariables(FUNCTION_NAME, FUNCTION_VARIABLES);

        } else {
            console.log('\x1b[31m', 'uncompressed file larger than 250Mb, Unable to upload S3');
            if (channelNotification)
                await notifications.SendMessage(app, FUNCTION_NAME, 'LAMBDA', 'NOK', `uncompressed file larger than 250Mb, Unable to upload S3`, channelNotification);
            process.exit(1);
        }



    }


}

module.exports = {
    UpdateLambda
}