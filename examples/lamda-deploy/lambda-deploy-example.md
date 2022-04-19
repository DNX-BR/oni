# Example for Deployment of Lambda Function using Oni

## File Structure for oni.yaml

To perform deployment of Lambda function the file structure of `oni.yaml` must follow the example bellow.

```yml
development:                              # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                            # Application deploy configuration section
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
    FUNCTION_NAME: function-name          # Lambda function name
    APP_VARIABLES:                        # Lambda environment variables
      - KEY: VALUE
    FUNCTION_S3: bucket                   # Bucket for deploy lambda if size of package > 50M
```

Note that the example takes into consideration that notifications are enable only for Slack. If your environment uses Google or Teams notifications, change the `WEBHOOK_SLACK` variable name to `WEBHOOK_GOOGLE` or `WEBHOOK_TEAMS`.

You can configure multiple Lambda functions per workspace to be deployed with oni. The example bellow shows the file structure of `oni.yaml` to configure multiple Lambda functions in the same oni workspace.

```yml
development:                              # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT_1:                          # Application deploy configuration section
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
    FUNCTION_NAME: function-name-1        # Lambda function name
    APP_VARIABLES:                        # Lambda environment variables
      - KEY: VALUE
    FUNCTION_S3: bucket-1                 # Bucket for deploy lambda if size of package > 50M

  APP_DEFAULT_2:                          # Application deploy configuration section
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
    FUNCTION_NAME: function-name-2        # Lambda function name
    APP_VARIABLES:                        # Lambda environment variables
      - KEY: VALUE
    FUNCTION_S3: bucket-2                 # Bucket for deploy lambda if size of package > 50M
```

Also, it's possible to set more than one workspace for the `oni.yaml` file, if the same application has to be deployed to more than one environment. The file structure of `oni.yaml` for more than one workspace must follow the example bellow.

```yml
development:                              # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                            # Application deploy configuration section
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
    FUNCTION_NAME: function-name          # Lambda function name
    APP_VARIABLES:                        # Lambda environment variables
      - KEY: VALUE
    FUNCTION_S3: bucket                   # Bucket for deploy lambda if size of package > 50M

production:                       # Oni workspace name
  APP_DEFAULT:                            # Application deploy configuration section
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '222222222222'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
    FUNCTION_NAME: function-name          # Lambda function name
    APP_VARIABLES:                        # Lambda environment variables
      - KEY: VALUE
    FUNCTION_S3: bucket                   # Bucket for deploy lambda if size of package > 50M
```

## Deploy commands

To make a lambda deploy using oni, the `NODE_ENV` environment variable must be set to the name of the workspace set in the `oni.yaml` file. The commands to perform a basic lambda deploy are shown bellow.

```bash
export NODE_ENV=development
oni lambda-deploy -n "APP_DEFAULT" -f "ZIP_FILE_LOCATION"
```

For a workspace with more than one lambda function to be deployed, the commands to make the lambda deploy using oni are shown bellow.

```bash
export NODE_ENV=development
oni lambda-deploy -n "APP_DEFAULT_1" -f "ZIP_FILE_LOCATION_1"
oni lambda-deploy -n "APP_DEFAULT_2" -f "ZIP_FILE_LOCATION_2"
```

Note that if your environment requires that a Role needs to be assumed, the flag `-a` needs to be set in the oni command. Furthermore, if notifications are required, the flag `-c` also needs to be set in the oni command. The example command for a lambda deploy assuming the role specified in the `oni.yaml` file and using notifications is displayed bellow.

```bash
export NODE_ENV=production
oni lambda-deploy -n "APP_DEFAULT" -f "ZIP_FILE_LOCATION" -c "slack" -a
```
