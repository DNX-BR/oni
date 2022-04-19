# Example for Deployment of Application on ECS with Fargate using Oni

## File Structure for oni.yaml

To perform deployment of Application on ECS with Fargate the file structure of `oni.yaml` must follow the example bellow.

>Note: The following example is a code block common to all types of deploy

```yml
development:                              # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                            # Application deploy configuration section
    # Common configurations               #############################################################
    # These settings can be used for all kind of deployment available with Oni
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
```

Note that the example takes into consideration that notifications are enable only for Slack. If your environment uses Google or Teams notifications, change the `WEBHOOK_SLACK` variable name to `WEBHOOK_GOOGLE` or `WEBHOOK_TEAMS`.

The example bellow shows the file structure of `oni.yaml` to configure ECS deploy with Fargate in the same oni workspace utilizing these resources:

- Fargate
- Environment variables
- EFS mount
- Hard and Soft limits
- Capacity Providers (Fargate)
- Role to execute a task
- Notifications to slack


```yml
development:
  ECR_AWS_REGION: us-east-1         # This region is used for ECR location in another account
  ECR_AWS_ACCOUNT: '333333333333'   # Another account where ECR is
  ECR_AWS_ROLE: YOUR_DEPLOY_ROLE    # If the flag -a is used then this is the role assume for ECR

  APP_DEFAULT:
    WEBHOOK_SLACK: slack_webhook_endpoint                        # Webhook if notification is enable
    APP_IMAGE: 'YOUR_APPLICATION_IMAGE_AWS_LINK'                 # Container image without tag. Used for build and push
    APP_NAME: YOUR_APP_NAME                                      # Application name (ECS service)
    APP_MEMORY: 1.0 GB                                           # Container memory
    APP_CPU: 0.5 vCPU                                            # Container cpu
    APP_PORTS:                                                   # Container ports to expose
      - 80        
    APP_REGION: us-east-1                                        # App Region for deploy
    APP_ACCOUNT: '111111111111'                                  # App account for deploy
    APP_ROLE: YOUR_DEPLOY_ROLE                                   # Role used for deploy if parameter "assume-role" is set
    CLUSTER_NAME: NAME_OF_YOUR_CLUSTER                           # Cluster ECS Name
    NETWORK_MODE: awsvpc                                         # Network mode
    TASK_ARN: arn:aws:iam::<account>:role/<role-name>            # Container task arn
    APP_CAPACITY_PROVIDERS:                                      # ECS Capacity Providers
      - NAME: FARGATE
        BASE: 1
        WEIGHT: 1
      - NAME: FARGATE_SPOT
        BASE: 0
        WEIGHT: 10
    EXECUTION_ROLE_ARN: arn:aws:iam::<account>:role/<role-name>  # Container execution role arn
    APP_ULIMITS:                                                 # Container soft and hard limits
      - NAME: nproc
        SOFTLIMIT: 65536
        HARDLIMIT: 65536
      - NAME: nofile
        SOFTLIMIT: 65536
        HARDLIMIT: 65536
    APP_VARIABLES:                                               # Environment variables
      - ENVIRONMENT: environment-name
      - MYSQL_HOST: mysql.example.com
      - MYSQL_USER: user_mysql
      - MYSQL_PASSWORD: password_of_mysql
    APP_MOUNTPOINTS:                                             # Container mount points
      - app_volume_html:/var/www/html
    EFS_CONFIG:                                                  # EFS Config volumes
      - FILESYSTEM_ID: fs-b12345cd
        ACCESS_POINT_ID: fsap-09e12345fb03935fb
        VOLUME_NAME: app_volume_html
```

> Note: In the sections, such as: APP_NAME. You don't have to put exactly like the example. You can use small case letters, just remember to put the exactly same name to avoid errors in the creation of the pipeline.


## Deploy commands

To make deployment of a basic application in ECS Cluster with Fargate using oni, the `NODE_ENV` environment variable must be set to the name of the workspace set in the `oni.yaml` file. The commands are shown bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT" -t 0.0.1 -f
```

The parameter `-f` means that the ECS Cluster will use Fargate resources.

Note that if your environment requires that a Role needs to be assumed, the flag `-a` needs to be set in the oni command. Furthermore, if notifications are required, the flag `-c` also needs to be set in the oni command. The example command for a ECS with Fargate deploy assuming the role specified in the `oni.yaml` file and using notifications is displayed bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT" -t 0.0.1 -f -c "slack" -a 
```
