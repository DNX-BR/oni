# Example for Deployment of Application on ECS with EC2 using Oni

## File Structure for oni.yaml

To perform deployment of a Application on ECS with EC2 the file structure of `oni.yaml` must follow the example bellow.

>Note: The following example is a code block common to all types of deploy.

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

The example bellow shows the file structure of `oni.yaml` to configure ECS deploy in the same oni workspace utilizing theses resources:

- EC2
- Environment variables
- EFS mount
- Hard and Soft limits
- Capacity Providers
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
    APP_MEMORY: 1024                                             # Container memory
    APP_MEMORY_RESERVATION: 1024                                 # Container memory reservation
    APP_CPU: 0                                                   # Container cpu
    APP_PORTS:                                                   # Container ports to expose
      - 80
    APP_REGION: us-east-1                                        # App Region for deploy
    APP_ACCOUNT: '111111111111'                                  # App account for deploy
    APP_ROLE: YOUR_DEPLOY_ROLE                                   # Role used for deploy if parameter "assume-role" is set
    CLUSTER_NAME: NAME_OF_YOUR_CLUSTER                           # Cluster ECS Name
    NETWORK_MODE: awsvpc                                         # Network mode
    TASK_ARN: arn:aws:iam::<account>:role/<role-name>            # Container task arn
    APP_CAPACITY_PROVIDERS:                                      # ECS Capacity Providers
      - NAME: CAPACITY_NAME
        BASE: 0
        WEIGHT: 1
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
    APP_SECRETS:                                                 # Secrets
      - WORDPRESS_DB_HOST: wp/dev-wordpress/WP_DB_ENDPOINT
      - WORDPRESS_DB_USER: wp/dev-wordpress/WP_DB_USER
      - WORDPRESS_DB_PASSWORD: wp/dev-wordpress/WP_DB_PASSWORD
      - WORDPRESS_DB_NAME: wp/dev-wordpress/WP_DB_NAME
    APP_MOUNTPOINTS:                                             # Container mount points
      - wp_www:/var/www/html
      - wp_php:/usr/local/etc/php
      - wp_apache:/etc/apache2
    EFS_CONFIG:                                                  # EFS Config volumes
      - FILESYSTEM_ID: fs-b12345cd
        ACCESS_POINT_ID: fsap-09e12345fb03935fb
        VOLUME_NAME: wp_www
      - FILESYSTEM_ID: fs-b12345cd
        ACCESS_POINT_ID: fsap-0fd12345d58f7f813
        VOLUME_NAME: wp_php
      - FILESYSTEM_ID: fs-b12345cd
        ACCESS_POINT_ID: fsap-06c123454f2ceda8c
        VOLUME_NAME: wp_apache

```

> Note: In the sections, such as: APP_NAME. You don't have to put exactly like the example. You can use small case letters, just remember to put the exactly same name to avoid errors in the creation of the pipeline.


## Deploy commands

To make deployment of an application in ECS Cluster with EC2 using oni, the `NODE_ENV` environment variable must be set to the name of the workspace set in the `oni.yaml` file. The commands are shown bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT_1" -t 0.0.1
```

Note that if your environment requires that a Role needs to be assumed, the flag `-a` needs to be set in the oni command. Furthermore, if notifications are required, the flag `-c` also needs to be set in the oni command. The example command for a ECS with EC2 deploy assuming the role specified in the `oni.yaml` file and using notifications is displayed bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT_1" -t 0.0.1 -c "slack" -a 
```
