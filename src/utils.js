const fs = require('fs');
const shell = require('shelljs');
const yenv = require('yenv');
const validator = require('jsonschema').Validator;
const v = new validator();
const docker = require('./docker')
const oni = `
development:                          # Oni Workspace defined by variable NODE_ENV
  # In some cases, such as ECR, a different account can be used for image centering.
  # To perform the push to this account, oni assumes specific to it.  
  ECR_AWS_REGION: us-east-2
  ECR_AWS_ACCOUNT: '222222222222'
  ECr-AWS_ROLE: Role
  APP_DEFAULT:                        # Application deploy configuration section

    # Common configurations           #############################################################
    # These settings can be used for all kind of deployment available with Oni
    WEBHOOK_TEAMS: url                # Webhook if notification is enable
    WEBHOOK_GOOGLE: url               # Webhook if notification is enable
    WEBHOOK_SLACK: url                # Webhook if notification is enable
    APP_REGION: us-east-1             # App Region for deploy
    APP_ACCOUNT: '111111111111'       # App account for deploy
    APP_ROLE: Role                    # Role used for deploy if parameter "assume-role" is set

    # Configuration for ecs-deploy    #############################################################
    APP_IMAGE: app                    # Container image without tag. Used for build and push
    APP_NAME: app                     # Application name (ECS service)
    APP_MEMORY: 512                   # Container memory
    APP_CPU: 1                        # Container cpu
    APP_MEMORY_RESERVATION: 512       # Container memory reservation
    APP_PORTS:                        # Container ports to expose
      - 8080
    APP_VARIABLES:                    # Container variables
      - KEY: VALUE
    APP_SECRETS:                      # Container secret parameter ssm
      - VARIABLE_NAME: arn            # ARN secret parameter ssm
    APP_COMMAND:                      # Command for passing to container
      - /bin/bash
      - ls
    APP_ULIMITS:                      # Container soft and hard limits
      - SOFTLIMIT: 1
        HARDLIMIT: 1
        NAME: name
    CLUSTER_NAME: name                # Cluster ECS Name
    APP_MOUNTPOINTS:                  # Container mount points
      - host-path:container-path
    EFS_CONFIG:                       # EFS Config volumes
      - VOLUME_NAME: name
        FILESYSTEM_ID: xxxx
        ROOT_DIRECTORY: /
        ACCESS_POINT_ID: xxxxxxxxxx
        BIND_HOST: host-path
    TASK_ARN: xxxxxxxxxxxxxxxxx       # Container task arn
    EXECUTION_ROLE_ARN:               # Container execution role arn
    NETWORK_MODE: xxxxxxxxxxxxxx      # Network mode
    APP_CAPACITY_PROVIDERS:           # ECS Capacity Providers
      - NAME: name
        BASE: 1
        WEIGHT: 0

    # Configuration for static-deploy #############################################################
    APP_SRC: content                  # Source code
    APP_S3_BUCKET: bucket             # Destination S3
    CF_DISTRIBUTION_ID: xxxxxyyyyxxxx # Cloudfront distribuition ID
    APP_NAME: name                    # Application name

    # Configuration for lambda-deploy #############################################################
    FUNCTION_NAME: name               # Lambda name
    APP_VARIABLES:                    # Lambda environment variables
      - KEY: VALUE
    FUNCTION_S3: bucket               # Bucket for deploy lambda if size of package > 50Mb      
`;

async function initSample() {
  await fs.writeFileSync('oni.sample.yaml', oni);
  console.log('Please rename oni.sample.yaml to oni.yaml');
}

async function ValideOni(oni, schema, assumeRole, notification) {
  if (assumeRole) {
    schema.properties.APP_ROLE = { "type": "string" };
    schema.required.push('APP_ROLE');
    schema.properties.APP_ACCOUNT = {};
    schema.required.push('APP_ACCOUNT');
  }

  if (notification) {
    schema.properties[`WEBHOOK_${notification.toUpperCase()}`] = { "type": "string" };
    schema.required.push(`WEBHOOK_${notification.toUpperCase()}`);
  }

  if (!v.validate(oni, schema, { nestedErrors: true }).valid) {
    console.error('\x1b[31mRequired in oni.yaml');
    console.error('\x1b[31mErro: ', v.validate(oni, schema, { nestedErrors: true }).toString())
    process.exit(1);
  }




}

async function ValidateLambdaOniRequirements(oni, assumeRole, notification) {
  let schema = {
    "type": "object",
    "properties": {
      "FUNCTION_NAME": { "type": "string" },
      "FUNCTION_S3": { "type": "string" },
      "APP_REGION": { "type": "string" }
    },
    "required": ["FUNCTION_NAME", "FUNCTION_S3", "APP_REGION"]

  }
  await ValideOni(oni, schema, assumeRole, notification);
}

async function ValidateStaticOniRequirements(oni, assumeRole, notification) {
  let schema = {
    "type": "object",
    "properties": {
      "APP_SRC": { "type": "string" },
      "APP_S3_BUCKET": { "type": "string" },
      "APP_REGION": { "type": "string" },
      "APP_NAME": { "type": "string" },
      "CF_DISTRIBUTION_ID": { "type": "string" },
    },
    "required": ["APP_SRC", "APP_S3_BUCKET", "APP_REGION", "APP_NAME", "CF_DISTRIBUTION_ID"]

  }

  await ValideOni(oni, schema, assumeRole, notification);

}

async function ValidateECSMinimunRequirements(oni, assumeRole, {
  notification,
  withoutLoadBalance,
  isFargate }) {
  let schema = {
    "type": "object",
    "properties": {
      "APP_IMAGE": { "type": "string" },
      "APP_NAME": { "type": "string" },
      "APP_MEMORY": {},
      "APP_REGION": { "type": "string" },
      "CLUSTER_NAME": { "type": "string" },
      "APP_CAPACITY_PROVIDERS": { "type": "array" },
    },
    "required": ["APP_IMAGE",
      "APP_NAME",
      "APP_MEMORY",
      "APP_REGION",
      "CLUSTER_NAME",
      "APP_CAPACITY_PROVIDERS"]

  }

  if (!withoutLoadBalance) {
    schema.properties['APP_PORTS'] = { "type": "array" };
    schema.required.push(`APP_PORTS`);
  }

  if (isFargate) {
    schema.properties['APP_CPU'] = {};
    schema.required.push(`APP_CPU`);
  } else {
    schema.properties['APP_MEMORY_RESERVATION'] = {};
    schema.required.push(`APP_MEMORY_RESERVATION`);
  }


  await ValideOni(oni, schema, assumeRole, notification);

}

async function ScanImageTrivy(output = 'default') {
  let extension;
  switch (output) {
    case 'html':
      extension = 'html'
      break;
    case 'junit':
      extension = 'xml'
      break;
    case 'gitlab':
      extension = 'xml'
      break;
    case 'gitlab-codequality':
      extension = 'xml'
      break;
    default:
      extension = '';
      break;
  }

  if (output === 'default') {
    const result = await shell.exec(`trivy --quiet image --input image.tar`, { silent: false });
  } {
    const result = await shell.exec(`trivy --quiet image --format template "@/trivy/contrib/"${output}.tpl"  -o report-trity.${extension} --input image.tar`, { silent: false });
    console.log(`Generation file: report-trity.${extension}`);
  }

}

module.exports = {
  initSample,
  ValidateLambdaOniRequirements,
  ValidateStaticOniRequirements,
  ValidateECSMinimunRequirements,
  ScanImageTrivy
}