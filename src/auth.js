const aws = require('aws-sdk');
const fs = require('fs') 
const yenv = require('yenv')

async function AssumeRole(type,app = 'APP_DEFAULT') {
    const env = yenv('oni.yaml', process.env.NODE_ENV)

    let AWS_ROLE;
    let AWS_ACCOUNT;
    let AWS_REGION;
    let datetime = Math.floor(new Date().getTime() / 1000);

    if (type === 'CI') {
        AWS_ROLE = env.ECR_AWS_ROLE;
        AWS_ACCOUNT = env.ECR_AWS_ACCOUNT;
        AWS_REGION = env.ECR_AWS_REGION
    } else {
        const APP = env[app];
        AWS_ROLE = APP.APP_ROLE;
        AWS_ACCOUNT = APP.APP_ACCOUNT;
        AWS_REGION = APP.APP_REGION;
    }
    

    try {
        aws.config.update({ region: AWS_REGION });
        const roleToAssume = {
            RoleArn: `arn:aws:iam::${AWS_ACCOUNT}:role/${AWS_ROLE}`,
            RoleSessionName: `Session-${datetime.toString()}`,
            DurationSeconds: 3600,
        }
        
         let sts = new aws.STS({apiVersion: '2016-11-15' });
         let assume = await sts.assumeRole(roleToAssume).promise();

        return {
            accessKeyId: assume.Credentials.AccessKeyId,
            secretAccessKey: assume.Credentials.SecretAccessKey,
            sessionToken: assume.Credentials.SessionToken,
            region: AWS_REGION,
            account: AWS_ACCOUNT
        }            
    } catch (error) {
        console.error(error);
        process.exit(1)
    }
}

module.exports = {
    AssumeRole
}