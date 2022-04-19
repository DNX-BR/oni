# Example for Deployment of Simple Application on ECS with EC2 using Oni

## File Structure for oni.yaml

To perform deployment of a Simple Application on ECS with EC2 the file structure of `oni.yaml` must follow the example bellow.

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

The example bellow shows the file structure of `oni.yaml` to configure Simple ECS deploy in the same oni workspace utilizing theses resources:

- EC2
- Role to execute a task

```yml
development:
  ECR_AWS_REGION: us-east-1         # This region is used for ECR location in another account
  ECR_AWS_ACCOUNT: '333333333333'   # Another account where ECR is
  ECR_AWS_ROLE: YOUR_DEPLOY_ROLE    # If the flag -a is used then this is the role assume for ECR
  APP_DEFAULT:
    WEBHOOK_SLACK: slack_webhook_endpoint                        # Webhook if notification is enable
    APP_IMAGE: 'YOUR_APPLICATION_IMAGE_AWS_LINK'                 # Container image without tag. Used for build and push
    APP_NAME: YOUR_APP_NAME                                      # Application name (ECS service)
    APP_MEMORY: 512                                              # Container memory
    APP_MEMORY_RESERVATION: 512                                  # Container memory reservation
    APP_PORTS:                                                   # Container ports to expose
      - 80
    APP_REGION: us-east-1                                        # App Region for deploy
    APP_ACCOUNT: '111111111111'                                  # App account for deploy
    APP_ROLE: YOUR_DEPLOY_ROLE                                   # Role used for deploy if parameter "assume-role" is set
    CLUSTER_NAME: NAME_OF_YOUR_CLUSTER                           # Cluster ECS Name
    TASK_ARN: arn:aws:iam::<account>:role/<role-name>            # Container task arn
    EXECUTION_ROLE_ARN: arn:aws:iam::<account>:role/<role-name>  # Container execution role arn
```

> Note: In the sections, such as: APP_NAME. You don't have to put exactly like the example. You can use small case letters, just remember to put the exactly same name to avoid errors in the creation of the pipeline.


# Multiples images to deploy

It's possible to set more than one container to be deployed in the `one.yaml` file. Here is an example of two different applications being deployed

```yml

development:
  ECR_AWS_REGION: us-east-1         # This region is used for ECR location in another account
  ECR_AWS_ACCOUNT: '333333333333'   # Another account where ECR is
  ECR_AWS_ROLE: YOUR_DEPLOY_ROLE    # If the flag -a is used then this is the role assume for ECR

  APP_DEFAULT_1:
    APP_IMAGE: 'YOUR_APPLICATION_IMAGE_AWS_LINK_1'               # Container image without tag. Used for build and push
    APP_NAME: YOUR_APP_NAME_1                                    # Application name (ECS service)
    APP_MEMORY: 512                                              # Container memory
    APP_MEMORY_RESERVATION: 512                                  # Container memory reservation
    APP_PORTS:                                                   # Container ports to expose
      - 80
    APP_REGION: us-east-1                                        # App Region for deploy
    APP_ACCOUNT: '111111111111'                                  # App account for deploy
    APP_ROLE: YOUR_DEPLOY_ROLE                                   # Role used for deploy if parameter "assume-role" is set
    CLUSTER_NAME: NAME_OF_YOUR_CLUSTER                           # Cluster ECS Name
    TASK_ARN: arn:aws:iam::<account>:role/<role-name>            # Container task arn
    EXECUTION_ROLE_ARN: arn:aws:iam::<account>:role/<role-name>  # Container execution role arn

  APP_DEFAULT_2:
    APP_IMAGE: 'YOUR_APPLICATION_IMAGE_AWS_LINK_2'               # Container image without tag. Used for build and push
    APP_NAME: YOUR_APP_NAME_2                                    # Application name (ECS service)
    APP_MEMORY: 1024                                             # Container memory
    APP_MEMORY_RESERVATION: 1024                                 # Container memory reservation
    APP_PORTS:                                                   # Container ports to expose
      - 8080
      - 8081
    APP_REGION: us-east-1                                        # App Region for deploy
    APP_ACCOUNT: '111111111111'                                  # App account for deploy
    APP_ROLE: YOUR_DEPLOY_ROLE                                   # Role used for deploy if parameter "assume-role" is set
    CLUSTER_NAME: NAME_OF_YOUR_CLUSTER                           # Cluster ECS Name
    TASK_ARN: arn:aws:iam::<account>:role/<role-name>            # Container task arn
    EXECUTION_ROLE_ARN: arn:aws:iam::<account>:role/<role-name>  # Container execution role arn
```


## Deploy commands

To make deployment of a simple application in ECS Cluster with EC2 using oni, the `NODE_ENV` environment variable must be set to the name of the workspace set in the `oni.yaml` file. The commands are shown bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT" -t 0.0.1 -w
```

> The parameter `-w` indicates deploy without using the blue-green load balance deploy strategy.

For a workspace with multiple containers to be deployed, the commands to make these deploy are shown bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT_1" -t 0.0.1 -w
oni ecs-deploy -n "APP_DEFAULT_2" -t 0.0.1 -w
```

Note that if your environment requires that a Role needs to be assumed, the flag `-a` needs to be set in the oni command. Furthermore, if notifications are required, the flag `-c` also needs to be set in the oni command. The example command for a ECS with EC2 deploy assuming the role specified in the `oni.yaml` file and using notifications is displayed bellow.

```bash
export NODE_ENV=development
oni ecs-deploy -n "APP_DEFAULT" -t 0.0.1 -w -c "slack" -a 
```
