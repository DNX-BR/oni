const yenv = require('yenv')
const aws = require('aws-sdk');
const { AssumeRole } = require('./auth');
const notifications = require('./notifications');
const util = require('./utils');

let APP;
let APP_IMAGE;
let APP_NAME;
let APP_MEMORY;
let APP_MEMORY_RESERVATION;
let TMP_PORTS;
let APP_REGION;
let APP_ACCOUNT;
let TPM_VARIABLES;
let TPM_SECRETS;
let APP_COMMAND;
let CLUSTER_NAME;
let TMP_MOUNTPOINTS;
let TMP_EFS_CONFIG;
let AUTH_TYPE;
let lastTask = '';
let lastIdMessage = '';
let NETWORK_MODE;
let APP_CPU;
let TMP_CONSTRAINTS;
let TASK_ARN;
let EXECUTION_ROLE_ARN;
let TMP_CAPACITY_PROVIDERS;

async function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function initEnvs(app, assumeRole, channelNotification, withoutLoadBalance, isFargate) {
    const env = yenv('oni.yaml', process.env.NODE_ENV);
    APP = env[app];
    await util.ValidateECSMinimunRequirements(APP, assumeRole, {
        notification: channelNotification,
        withoutLoadBalance: withoutLoadBalance,
        isFargate: isFargate
    });
    APP_IMAGE = APP.APP_IMAGE;
    APP_NAME = APP.APP_NAME;
    APP_MEMORY = APP.APP_MEMORY;
    APP_CPU = APP.APP_CPU || 0;
    APP_MEMORY_RESERVATION = APP.APP_MEMORY_RESERVATION;
    TMP_PORTS = APP.APP_PORTS;
    APP_REGION = APP.APP_REGION;
    APP_ACCOUNT = APP.APP_ACCOUNT;
    TPM_VARIABLES = APP.APP_VARIABLES;
    TPM_SECRETS = APP.APP_SECRETS;
    APP_COMMAND = APP.APP_COMMAND || [];
    TMP_ULIMITS = APP.APP_ULIMITS;
    CLUSTER_NAME = APP.CLUSTER_NAME;
    TMP_MOUNTPOINTS = APP.APP_MOUNTPOINTS;
    TMP_EFS_CONFIG = APP.EFS_CONFIG;
    TMP_CONSTRAINTS = APP.CONSTRAINTS;
    TASK_ARN = APP.TASK_ARN;
    EXECUTION_ROLE_ARN = APP.EXECUTION_ROLE_ARN;
    NETWORK_MODE = APP.NETWORK_MODE;
    AUTH_TYPE = 'INFRA';
    TMP_CAPACITY_PROVIDERS = APP.APP_CAPACITY_PROVIDERS;
    APP_DEPLOY_TIMEOUT = APP.APP_DEPLOY_TIMEOUT || 600;
    TPM_EXTRA_CONFIG = APP.EXTRA_CONFIG || {};

}

async function GetLogFailedContainerDeploy(task) {


    const cloudwatch = new aws.CloudWatchLogs();
    try {
        const logs = await cloudwatch.getLogEvents({
            logGroupName: `/ecs/${CLUSTER_NAME}/${APP_NAME}`,
            logStreamName: `${APP_NAME}/${APP_NAME}/${task}`,
            startFromHead: false,
            limit: 200
        }).promise();
    
        console.log('Log from stopped container');
        for (const log of logs.$response.data.events) {
            console.log(log.message);
        }
    } catch (error) {
        console.error('\x1b[31mNo additional info found in cloudwatch.');
    }

}

async function DataAgentConfig(datadogConfig,isFargate) {
    let containerDefinitions = [];

    const containerDefinitionAgent = {
        essential: true,
        name: 'datadog-agent',
        image: 'public.ecr.aws/datadog/agent:latest',
        ...(!isFargate && {memoryReservation: datadogConfig.APP_MEMORY_RESERVATION} ),
        ...(!isFargate && { memory: datadogConfig.APP_MEMORY} ),
        environment: [
            {
                "name": "ECS_FARGATE",
                "value": datadogConfig.ECS_FARGATE.toString()
            },
            {
                "name": "DD_SITE",
                "value": datadogConfig.SITE.toString()
            },
            {
                "name": "DD_LOGS_ENABLED",
                "value": datadogConfig.LOGS_ENABLED.toString()
            }            


            
        ],
        secrets: [
            {
                "name": "DD_API_KEY",
                "valueFrom": datadogConfig.DD_API_KEY
            }
        ]
    }  
    console.log('ContainerDefinition DataDogAgent: ', containerDefinitionAgent);
    containerDefinitions.push(containerDefinitionAgent)

    return containerDefinitions;
}

async function XRayAgentConfig(isFargate) {
    let containerDefinitions = [];

    const containerDefinitionXRayDaemon = {
        essential: true,
        name: 'xray-daemon',
        image: 'public.ecr.aws/xray/aws-xray-daemon:latest',
        // ...(!isFargate && {memoryReservation: datadogConfig.APP_MEMORY_RESERVATION} ),
        // ...(!isFargate && { memory: datadogConfig.APP_MEMORY} ),
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": `/ecs/ecs-cwagent-fargate`,
                "awslogs-region": `${APP_REGION}`,
                "awslogs-stream-prefix": `${APP_NAME}`
            }
        }       
        
    }  
    console.log('ContainerDefinition XRayDaemon: ', containerDefinitionXRayDaemon);

    containerDefinitions.push(containerDefinitionXRayDaemon)


    const containerDefinitionCloudWatchAgent = {
        essential: true,
        name: 'cloudwatch-agent',
        image: 'public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest',
        // ...(!isFargate && {memoryReservation: datadogConfig.APP_MEMORY_RESERVATION} ),
        // ...(!isFargate && { memory: datadogConfig.APP_MEMORY} ),
        secrets: [
            {
                "name": "CW_CONFIG_CONTENT",
                "valueFrom": `arn:aws:ssm:${APP_REGION}:${APP_ACCOUNT}:parameter/ecs-cwagent`
            }
        ],        
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": `/ecs/ecs-cwagent-fargate`,
                "awslogs-region": `${APP_REGION}`,
                "awslogs-stream-prefix": `${APP_NAME}`
            }
        }               
        
    }  
    console.log('ContainerDefinition CloudWatchAgent: ', containerDefinitionCloudWatchAgent);

    containerDefinitions.push(containerDefinitionCloudWatchAgent)    

    return containerDefinitions;

}

async function DeployECS(app, tag, withoutLoadBalance, isFargate, channelNotification, assumeRole, disableDeploy, addXRayDaemon) {
    try {
        await initEnvs(app, assumeRole, channelNotification, withoutLoadBalance, isFargate);

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


        aws.config.update(confCredential)

        let APP_VARIABLES = [];
        let APP_SECRETS = [];
        let APP_PORTS = [];
        let APP_MOUNTPOINTS = [];
        let APP_VOLUMES = [];
        let APP_CONSTRAINTS = [];
        let APP_CMDS = [];
        let APP_ULIMITS = [];

        for (var idx in TPM_VARIABLES) {
            var item = TPM_VARIABLES[idx];
            for (var key in item) {
                var value = item[key];
                APP_VARIABLES.push({ name: key, value: value.toString() })
            }
        }

        for (var idx in TPM_SECRETS) {
            var item = TPM_SECRETS[idx];
            for (var key in item) {
                var value = item[key];
                APP_SECRETS.push({ name: key, valueFrom: value }) // Now on the value need inform the complete arn of secrets manager or ssm
            }
        }

        if (TMP_PORTS)
            for (const port of TMP_PORTS) {
                APP_PORTS.push({ containerPort: port })

            }

        if (TMP_MOUNTPOINTS)
            for (const point of TMP_MOUNTPOINTS) {
                APP_MOUNTPOINTS.push({ sourceVolume: point.split(':')[0], containerPath: point.split(':')[1] });
            }

        if (TMP_EFS_CONFIG)
            for (const EFS of TMP_EFS_CONFIG) {
                let APP_VOLUME_CONF
                if (EFS.BIND_HOST)
                    APP_VOLUME_CONF = {
                        name: EFS.VOLUME_NAME,
                        host: {
                            sourcePath: EFS.BIND_HOST
                        }
                    }
                else
                    APP_VOLUME_CONF = {
                        name: EFS.VOLUME_NAME,
                        efsVolumeConfiguration: {
                            transitEncryption: 'ENABLED',
                            fileSystemId: EFS.FILESYSTEM_ID,
                            rootDirectory: EFS.ROOT_DIRECTORY ? EFS.ROOT_DIRECTORY : '/',
                            authorizationConfig: {
                                accessPointId: EFS.ACCESS_POINT_ID
                            }
                        }
                    }
                APP_VOLUMES.push(APP_VOLUME_CONF);
            }


        if (TMP_CONSTRAINTS)
            for (const CONST of TMP_CONSTRAINTS) {
                APP_CONSTRAINTS.push({ expression: CONST[0], type: CONST[1] });
            }

        if (APP_COMMAND)
            for (const cmd of APP_COMMAND) {
                APP_CMDS.push(cmd.toString());
            }

        if (TMP_ULIMITS)
            for (const u of TMP_ULIMITS) {
                APP_ULIMITS.push({ hardLimit: u.SOFTLIMIT, softLimit: u.HARDLIMIT, name: u.NAME });
            }

        let containerDefinitions = []

        let containerDefinition = {
            essential: true,
            image: `${APP_IMAGE}:${tag}`,
            ...(!isFargate && {memoryReservation: APP_MEMORY_RESERVATION}),
            ...(!isFargate && {memory: APP_MEMORY}),
            ...((APP_CPU > 0 && !isFargate)  && {cpu: APP_CPU}),
            name: APP_NAME,
            command: APP_CMDS,
            environment: APP_VARIABLES,
            secrets: APP_SECRETS,
            portMappings: APP_PORTS,
            mountPoints: APP_MOUNTPOINTS,
            ulimits: APP_ULIMITS,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": `/ecs/${CLUSTER_NAME}/${APP_NAME}`, //CUSTOMIZADO
                    "awslogs-region": `${APP_REGION}`,
                    "awslogs-stream-prefix": `${APP_NAME}`
                }
            },
        }

        console.log('ContainerDefinition: ', containerDefinition);

        containerDefinitions.push(containerDefinition);

        if (TPM_EXTRA_CONFIG.DATADOG_AGENT) {
            const datadogAgent = await DataAgentConfig(TPM_EXTRA_CONFIG.DATADOG_AGENT,isFargate);
            containerDefinitions = containerDefinitions.concat(datadogAgent);
        }

        if (addXRayDaemon) {
            const xRay = await XRayAgentConfig(isFargate);
            containerDefinitions = containerDefinitions.concat(xRay);
        }
        

        const ecs = new aws.ECS();
        const task = await ecs.registerTaskDefinition({
            containerDefinitions: containerDefinitions,
            family: `${CLUSTER_NAME}-${APP_NAME}`,
            executionRoleArn: EXECUTION_ROLE_ARN ? EXECUTION_ROLE_ARN : `arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}`,
            placementConstraints: APP_CONSTRAINTS,
            volumes: APP_VOLUMES,
            networkMode: NETWORK_MODE,
            memory: isFargate ? APP_MEMORY : null,
            cpu: isFargate ? APP_CPU : null,
            taskRoleArn: TASK_ARN ? TASK_ARN : `arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}`,
            requiresCompatibilities: isFargate ? ['FARGATE'] : []
        }).promise();

        const taskARN = task.taskDefinition.taskDefinitionArn;
        console.log('\x1b[36mTask Defnition: ', taskARN);

        if (!disableDeploy) {
            if (withoutLoadBalance) {
                await UpdateService(taskARN, app, channelNotification)
            } else {
                await CodeDeploy(taskARN, app, TMP_PORTS[0], cred, isFargate, channelNotification)
            }
        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

async function UpdateService(taskARN, app = 'APP_DEFAULT', channelNotification) {
    try {

        const ecs = new aws.ECS();

        console.log('\x1b[36m', `Init deploy app ${APP_NAME} without loadbalance`);
        const service = await ecs.updateService({ service: APP_NAME, cluster: CLUSTER_NAME, taskDefinition: taskARN }).promise();
        if (service.service.status === 'ACTIVE') {
            console.log('\x1b[32m', 'Finished deploy');
            if (channelNotification)
                await notifications.SendMessage(app, APP_NAME, 'ECS', 'OK', '', channelNotification);
        } else {
            console.erro('\x1b[31mErro deploy', service);
            await notifications.SendMessage(app, APP_NAME, 'ECS', 'NOK', 'Failed deploy. Check pipeline logs', channelNotification);
            process.exit(1);
        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }

}

async function stopDeployment(deploymentId) {

    try {
        const codeDeploy = new aws.CodeDeploy();
        console.log('\x1b[31m', 'Stopping Deployment by Timeout')
        await codeDeploy.stopDeployment({ deploymentId: deploymentId, autoRollbackEnabled: true }).promise();
        console.error('\x1b[31m', 'Deployment Stopped');

        const ecs = new aws.ECS();
        await sleep(10000);
        const taskDetails = await ecs.describeTasks({ cluster: CLUSTER_NAME, tasks: [`arn:aws:ecs:${APP_REGION}:${APP_ACCOUNT}:task/${CLUSTER_NAME}/${lastTask}`] }).promise();
        if (taskDetails.$response.data.tasks[0].containers)
            console.log('Stopped Reason: ', taskDetails.$response.data.tasks[0].containers[0].reason)

        await GetLogFailedContainerDeploy( lastTask);

        process.exit(1);

    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

async function CodeDeploy(taskARN, appName = 'APP_DEFAULT', appPort = 8080, credencias, isFargate, channelNotification) {

    let APP_CAPACITY_PROVIDERS = [];

    try {
        if (TMP_CAPACITY_PROVIDERS)
            for (const c of TMP_CAPACITY_PROVIDERS) {
                APP_CAPACITY_PROVIDERS.push({ CapacityProvider: c.NAME, Base: c.BASE, Weight: c.WEIGHT });
            }

        let contentDefinition = {
            version: 1,
            Resources: [
                {
                    TargetService: {
                        Type: 'AWS::ECS::Service',
                        Properties: {
                            TaskDefinition: taskARN,
                            LoadBalancerInfo: {
                                ContainerName: APP_NAME,
                                ContainerPort: appPort
                            },
                            CapacityProviderStrategy: APP_CAPACITY_PROVIDERS
                        }
                    }
                }
            ]
        }


        const codeDeploy = new aws.CodeDeploy();

        console.log('\x1b[36m', `Init deploy app ${APP_NAME} `)
        console.log('AppSecp: ', JSON.stringify(contentDefinition));

        const deploy = await codeDeploy.createDeployment({
            applicationName: `${CLUSTER_NAME}-${APP_NAME}`,
            deploymentConfigName: 'CodeDeployDefault.ECSAllAtOnce',
            deploymentGroupName: `${CLUSTER_NAME}-${APP_NAME}`,
            description: 'Deployment',
            revision: {
                revisionType: 'AppSpecContent',
                appSpecContent: { content: JSON.stringify(contentDefinition) }
            },
            autoRollbackConfiguration: {
                enabled: true,
                events: ['DEPLOYMENT_FAILURE']
            }

        }).promise();

        console.log('\x1b[32m ', 'Deployment created!');
        console.log('\x1b[36m', `For more info: https://${APP_REGION}.console.aws.amazon.com/codesuite/codedeploy/deployments/${deploy.deploymentId}`);

        let statusDeploy;
        let timeOut = 0;
        statusDeploy = await codeDeploy.getDeployment({ deploymentId: deploy.deploymentId }).promise();
        while (statusDeploy.deploymentInfo.status === 'InProgress' || statusDeploy.deploymentInfo.status === 'Created') {
            await sleep(5000);
            timeOut = timeOut + 5;
            await PrintEventsECS();
            statusDeploy = await codeDeploy.getDeployment({ deploymentId: deploy.deploymentId }).promise();


            if (timeOut > APP_DEPLOY_TIMEOUT && (statusDeploy.deploymentInfo.status === 'InProgress' || statusDeploy.deploymentInfo.status === 'Created')) {
                await stopDeployment(deploy.deploymentId);
                if (channelNotification)
                    await notifications.SendMessage(appName, APP_NAME, 'ECS', 'NOK', 'Timeout in deployment. Stop current deployment', channelNotification);
            }


        }
        if (statusDeploy.deploymentInfo.status === 'Succeeded') {
            console.log('\x1b[32m', 'Finished deploy');
            if (channelNotification)
                await notifications.SendMessage(appName, APP_NAME, 'ECS', 'OK', '', channelNotification);
        } else {
            console.error('\x1b[31mErro: ', { Message: 'Deployment Failed', Status: statusDeploy.deploymentInfo.status });
            if (channelNotification)
                await notifications.SendMessage(appName, APP_NAME, 'ECS', 'NOK', statusDeploy.deploymentInfo, channelNotification);
            console.error(statusDeploy.deploymentInfo)
            process.exit(1);
        }
    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

function GetSortOrder(prop) {
    return function (a, b) {
        if (new Date(a[prop]) > new Date(b[prop])) {
            return 1;
        } else if (new Date(a[prop]) < new Date(b[prop])) {
            return -1;
        }
        return 0;
    }
}

async function GetLastEvent(events) {
    let count = 0;
    for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].message.includes('has started 1 tasks: (task') && count === 0) {
            count = 1;
        } else if (events[i].message.includes('has started 1 tasks: (task') && count === 1) {
            lastTask = events[i].message.split('(')[2].replace('task ', '').replace(').', '');
            break;
        }
    }
}

async function PrintEventsECS() {
    try {

        const ecs = new aws.ECS();

        const service = await ecs.describeServices({ cluster: CLUSTER_NAME, services: [APP_NAME] }).promise();
        let events = service.$response.data.services[0].events;
        events.sort(GetSortOrder('createdAt'));
        const eventsSize = events.length - 1;


        if (eventsSize <= 0) {

            if (lastIdMessage != events[0].id)
                console.log('\x1b[35m', `${events[0].createdAt} => ${events[0].message}`)

            await GetLastEvent(events);

            lastIdMessage = events[0].id;
        } {

            if (lastIdMessage != events[eventsSize].id)
                console.log('\x1b[35m', `${events[eventsSize].createdAt} => ${events[eventsSize].message}`)
            await GetLastEvent(events);

            lastIdMessage = events[eventsSize].id;
        }

    } catch (error) {
        console.error('\x1b[31m', error);
        process.exit(1);
    }
}

module.exports = {
    DeployECS, CodeDeploy, UpdateService
}