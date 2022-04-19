# ONI

Oni is a javascript based tool that can be used to help the deployment of applications to AWS Services. The AWS services that Oni supports are `AWS ECS`, `AWS Lambda` and `AWS S3+CloudFront`. The Oni tool uses a `oni.yaml` file for workspace definition and application configuration.

In this documentation, you will get to know the following:

- [ONI](#oni)
  - [Basic Usage](#basic-usage)
  - [File Structure for oni.yaml](#file-structure-for-oniyaml)
  - [Oni Commands](#oni-commands)
    - [oni ecs-deploy](#oni-ecs-deploy)
    - [oni deploy-static](#oni-deploy-static)
    - [oni lambda-deploy](#oni-lambda-deploy)
    - [oni build-image](#oni-build-image)
    - [oni push-image](#oni-push-image)
    - [oni scan-image](#oni-scan-image)
  - [Examples](#examples)
  - [License](#license)

## Basic Usage

The basic usage for the Oni tool is the following:

```bash
Usage: oni <command>  [options]

Commands:
  oni ecs-deploy [options]  Command to deploy in ECS
  oni deploy-static         Command to deploy static content in S3
  oni build-image           Command to build with buildkit
  oni push-image            Command to push image to ECR
  oni lambda-deploy         Command to deploy Lambda
  oni scan-image            Scan image.tar generated in build-image step using trivy scan
  oni init                  create oni.yaml sample

options:
  -v, --version  Show Version                                         [bool]
      --help     Show help                                            [bool]
```

Note that the Oni tool can be used to build Docker compatible images, scan them for vulnerabilities and push them to an `AWS ECR` repository.

## File Structure for oni.yaml

The following yaml strucuture represents the `oni.yaml` file structure. It shows there are some common configurations that can be used with any kind of supported deployment by Oni and there are specific configurations to be set for each kind of deployment.

```yml
development:                              # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                            # Application deploy configuration section

    # Common configurations               #############################################################
    # These settings can be used for all kind of deployment available with Oni
    WEBHOOK_TEAMS: url                    # Webhook if notification is enable
    WEBHOOK_GOOGLE: url                   # Webhook if notification is enable
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set

    # Configuration for ecs-deploy        #############################################################
    APP_IMAGE: your-app-image-aws-link    # Container image without tag. Used for build and push
    APP_NAME: your-app-name               # Application name (ECS service)
    APP_MEMORY: 512                       # Container memory
    APP_CPU: 1                            # Container cpu
    APP_MEMORY_RESERVATION: 512           # Container memory reservation
    APP_PORTS:                            # Container ports to expose
      - 8080    
    APP_VARIABLES:                        # Container variables
      - KEY: VALUE    
    APP_SECRETS:                          # Container secret parameter from ssm
      - VARIABLE_NAME: secret-name-from-ssm
    APP_COMMAND:                          # Command for passing to container
      - /bin/bash
      - ls
    APP_ULIMITS:                          # Container soft and hard limits
      - SOFTLIMIT: 1    
        HARDLIMIT: 1    
        NAME: name    
    CLUSTER_NAME: name                    # Cluster ECS Name
    APP_MOUNTPOINTS:                      # Container mount points
      - host-path:container-path    
    EFS_CONFIG:                           # EFS Config volumes
      - VOLUME_NAME: name
        FILESYSTEM_ID: fs-id
        ROOT_DIRECTORY: /
        ACCESS_POINT_ID: fsap-id
        BIND_HOST: host-path
    TASK_ARN: arn:aws:iam::<account>:role/<role-name>            # Container task arn
    EXECUTION_ROLE_ARN: arn:aws:iam::<account>:role/<role-name>  # Container execution role arn
    NETWORK_MODE: network-mode            # Network mode
    APP_CAPACITY_PROVIDERS:               # ECS Capacity Providers
      - NAME: name    
        BASE: 1    
        WEIGHT: 0

    # Configuration for static-deploy     #############################################################
    APP_SRC: /path/to/content             # Source code
    APP_S3_BUCKET: s3://bucket-name       # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO19    # Cloudfront distribuition ID
    APP_NAME: your-app-name               # Application name
    
    # Configuration for lambda-deploy     #############################################################
    FUNCTION_NAME: function-name          # Lambda name
    APP_VARIABLES:                        # Lambda environment variables
      - KEY: VALUE    
    FUNCTION_S3: bucket                   # Bucket for deploy lambda if size of package > 50Mb
    
  # In some cases, such as ECR, a different account can be used for image centering.
  # To perform the push to this account, oni assumes specific to it.  
  AWS_REGION: us-east-2
  AWS_ACCOUNT: '333333333333'
  AWS_ROLE: your-deploy-role
```

## Oni Commands

In this section it's possible to check all Oni commands available, their basic usage and their options.

### oni ecs-deploy

```bash
oni ecs-deploy [options]

Command to deploy in ECS

Options:
  -v, --version               Show version                            [bool]
      --help                  Show help                               [bool]
  -n, --name                  Application name defined in oni.yaml    [string] [mandatory] [default: "APP_DEFAULT"]
  -w, --without-loadbalance   Deploy ECS without load balancer        [bool]
  -t, --tag                   Image tag                               [string] [mandatory]
  -f, --fargate               ECS deploy type Fargate                 [bool] [default: false]
  -a, --assume-role           Assume role defined in oni.yaml         [bool] [default: false]
  -c, --channel-notification  Notification channel to send message after deploy app  [string] [options: "slack", "google", "teams"]
```

### oni deploy-static

```bash
oni deploy-static [options]

Command to deploy static content in S3

Options:
  -v, --version               Show version                            [bool]
      --help                  Show help                               [bool]
  -n, --name                  Application name defined in oni.yaml    [string] [mandatory] [default: "APP_DEFAULT"]
  -a, --assume-role           Assume role defined in oni.yaml         [bool] [default: false]
  -c, --channel-notification  Notification channel to send message after deploy app  [string] [options: "slack", "google", "teams"]
```

### oni lambda-deploy

```bash
oni lambda-deploy

Command to deploy lambda

Options:
  -v, --version               Show version                            [bool]
      --help                  Show help                               [bool]
  -n, --name                  Application name defined in oni.yaml    [string] [mandatory] [default: "APP_DEFAULT"]
  -f, --file                  zip file location                       [string] [mandatory]
  -a, --assume-role           Assume role defined in oni.yaml         [bool] [default: false]
  -c, --channel-notification  Notification channel to send message after deploy app  [string] [options: "slack", "google", "teams"]
```

### oni build-image

```bash
oni build-image

Command to build with buildkit

Options:
  -v, --version         Show version                       [bool]
      --help            Show help                          [bool]
  -d, --dockerfile      Dockerfile path location           [string] [default: "."]
  -t, --tag             Image tag                          [string] [mandatory]
  -n, --name            Application name in oni.yaml       [string] [mandatory]
```

### oni push-image

```bash
oni push-image

Command to push image to ECR

Options:
  -v, --version         Show version                       [bool]
      --help            Show help                          [bool]
  -t, --tag             Image tag                          [string] [mandatory]
  -n, --name            Application name in oni.yaml       [string] [mandatory]
  -a, --assume-role     Assume role defined in oni.yaml    [bool] [default: false]
```

### oni scan-image

```bash
oni scan-image

Command to scan image.tar generated in the build-image step using trivy scan

Options:
  -v, --version         Show version                       [bool]
      --help            Show help                          [bool]
  -o, --output          Output format type                 [string] [options: "default", "html", "junit", "gitlab", "gitlab-codequality"] [default: "default"]
```

## Examples

Check the [examples](./examples/) folder for more detailed usage examples and instructions.

## License

MIT.
