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
    - [oni scan-fs](#oni-scan-fs)
    - [oni scan-sast](#oni-scan-sast)
    - [oni get-latest-image](#oni-get-latest-image)
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
  oni scan-fs               Scan filesystem using trivy scan
  oni scan-sast             Scan code using semgrep
  oni get-latest-image      Command for get latest image to ecr 
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
    APP_SECRET_EXTRACT: secret-arn        # Extract all secrets key from secret manager and set in task definition
    APP_VARIABLES:                        # Container variables
      - KEY: VALUE    
    APP_SECRETS:                          # Container secret parameter from ssm or secrets manager
      - VARIABLE_NAME: full-arn-from-ssm-or-secrets-manager
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
    APP_LINKS:                            # To connect to another container in EXTRA_CONTAINERs. 
      - "CONTAINER_NAME:ALIAS"            # The sintaxe is: the CONTAINER_NAME is a name value of variable APP_NAME in the block EXTRA_CONTAINERS.
    EXTRA_CONTAINERS:                     # Add this block to add another container um same task definition.
      - APP_NAME: XXXXXXXXXXX
        APP_IMAGE: XXXXXXXXXXXXXXXX
        IS_FARGATE: false
        APP_VARIABLES: [] 
        APP_SECRETS: []
        APP_MEMORY: 1024
        APP_MEMORY_RESERVATION: 1024
        APP_CPU: 1024
    
  # In some cases, such as ECR, a different account can be used for image centering.
  # To perform the push to this account, oni assumes specific to it.  
  ECR_AWS_REGION: us-east-2
  ECR_AWS_ACCOUNT: '333333333333'
  ECR_AWS_ROLE: your-deploy-role
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
  -d, --disable-deploy        Only create task definition, dont deploy in ecs [bool]
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
  -v, --version         Show Version                                  [bool]
      --help            Exibe ajuda                                   [bool]
  -d, --dockerfile      Dockerfile path location                      [string] [default: "."]
  -t, --tag             Image tag                                     [string] [mandatory]
  -n, --name            Application name in oni.yml                   [string] [mandatory]
  -f, --filename        dockerfile name                               [string] [default: "./Dockerfile"]
  -c, --cache           Enable cache layer of build                   [bool] [default: false]
  -p, --platform-build  Target plataform build                        [default: "linux/amd64"]
  -l, --location-cache  Directory for storage cache                   [string] [default: "cache_build"]
  -a, --assume-role     Assume role defined in oni.yaml               [bool] [default: false]

Exemplos:
  oni build-image -d "." -t 0.0.1 -a APP_DEFAULT
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
  -i, --image    image name                                [string] [default: "none"]
```


### oni scan-fs

```bash
oni scan-fs

Command to scan filesysetm using trivy scan

Options:
  -v, --version         Show version                       [bool]
      --help            Show help                          [bool]
  -o, --output          Output format type                 [string] [options: "default", "html", "junit", "gitlab", "gitlab-codequality"] [default: "default"]
```

### oni scan-sast

```bash
oni scan-sast

Command to scan filesysetm using trivy scan

Options:
  -v, --version         Show version                       [bool]
      --help            Show help                          [bool]
  -o, --output          Output format type                 [string] [options:"text", "emacs", "json", "gitlab-sast", "gitlab-secrets","junit-xml", "sarif", "vim"] [default: "text"]
```


### oni get-latest-image

```bash
oni get-latest-image [options]

Command for get latest image to ecr for specific repo

Options:
  -v, --version               Show version                            [bool]
      --help                  Show help                               [bool]
  -n, --name                  Application name defined in oni.yaml    [string] [mandatory] [default: "APP_DEFAULT"]
  -a, --assume-role           Assume role defined in oni.yaml         [bool] [default: false]
```

### oni update-image-tag-k8s

```bash
oni update-image-tag-k8s [options]

Command for update kubernetes manifest image tag

Options:
  -v, --version      Show Version                                     [bool]
      --help         Exibe ajuda                                      [bool]
  -p, --path-file    path to file values.yaml or deploment.yaml       [string] [mandatory]
  -t, --tag          Tag value for update image                       [string] [mandatory]
  -h, --helm         Is tag in helm values                            [bool] [default: false]
  -i, --image-index  Image index in container array of deployment     [string] [default: 0]
```

### oni git-clone

```bash
oni git-clone [options]

Command for clone kubernetes manifest repository

Options:
  -v, --version      Show Version                                     [bool]
      --help         Exibe ajuda                                      [bool]
  -p, --path-file    path to file values.yaml or deploment.yaml       [string] [mandatory]
  -t, --tag          Tag value for update image                       [string] [mandatory]
  -h, --helm         Is tag in helm values                            [bool] [default: false]
  -i, --image-index  Image index in container array of deployment     [string] [default: 0]
```

### oni git-commit

```bash
oni git-commit [options]

Command for commit git repository kubernetes manifest

Options:
  -v, --version  Show Version                                         [bool]
      --help     Exibe ajuda                                          [bool]
  -m, --message  git commit message                                   [string] [mandatory]
```


## Examples

Check the [examples](./examples/) folder for more detailed usage examples and instructions.

## License

MIT.
