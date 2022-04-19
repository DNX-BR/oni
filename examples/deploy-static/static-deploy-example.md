# Example for Deployment of S3 Static Content using Oni

## File Structure for oni.yaml

To perform a deployment of Static Content in S3 bucket the file structure of `oni.yaml` must follow the example bellow.

```yml
development:                              # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                            # Application deploy configuration section
    WEBHOOK_SLACK: url                    # Webhook if notification is enable
    APP_REGION: us-east-1                 # App Region for deploy
    APP_ACCOUNT: '111111111111'           # App account for deploy
    APP_ROLE: your-deploy-role            # Role used for deploy if parameter "assume-role" is set
    APP_SRC: /path/to/content             # Source code
    APP_S3_BUCKET: s3://bucket-name       # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO19    # Cloudfront distribuition ID
    APP_NAME: your-app-name               # Application name
```

Note that the example takes into consideration that notifications are enable only for Slack. If your environment uses Google or Teams notifications, change the `WEBHOOK_SLACK` variable name to `WEBHOOK_GOOGLE` or `WEBHOOK_TEAMS`.


You can configure multiple S3 static content apps per workspace to be deployed with oni. The example bellow shows the file structure of `oni.yaml` to configure multiple S3 static content apps in the same oni workspace.

```yml
development:                                # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT_1:                            # Application deploy configuration section
    WEBHOOK_SLACK: url                      # Webhook if notification is enable
    APP_REGION: us-east-1                   # App Region for deploy
    APP_ACCOUNT: '111111111111'             # App account for deploy
    APP_ROLE: your-deploy-role              # Role used for deploy if parameter "assume-role" is set
    APP_SRC: /path/to/content-1             # Source code
    APP_S3_BUCKET: s3://bucket-name-1       # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO11      # Cloudfront distribuition ID
    APP_NAME: your-app-name-1               # Application name

  APP_DEFAULT_2:                            # Oni app configuration name 
    WEBHOOK_SLACK: url                      # Webhook if notification is enable
    APP_REGION: us-east-1                   # App Region for deploy
    APP_ACCOUNT: '111111111111'             # App account for deploy
    APP_ROLE: your-deploy-role              # Role used for deploy if parameter "assume-role" is set
    APP_SRC: /path/to/content-2             # Source code
    APP_S3_BUCKET: s3://bucket-name-2       # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO22      # Cloudfront distribuition ID
    APP_NAME: your-app-name-2               # Application name
```


Also, it's possible to set more than one workspace for the `oni.yaml` file, if the same application has to be deployed to more than one environment. The file structure of `oni.yaml` for more than one workspace must follow the example bellow.

```yml
development:                                # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                              # Oni app configuration name 
    WEBHOOK_SLACK: url                      # Webhook if notification is enable
    APP_REGION: us-east-1                   # App Region for deploy
    APP_ACCOUNT: '111111111111'             # App account for deploy
    APP_ROLE: your-deploy-role              # Role used for deploy if parameter "assume-role" is set
    APP_SRC: /path/to/content               # Source code
    APP_S3_BUCKET: s3://dev-bucket-name     # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO33      # Cloudfront distribuition ID
    APP_NAME: your-app-name                 # Application name

production:                                 # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                              # Oni app configuration name 
    WEBHOOK_SLACK: url                      # Webhook if notification is enable
    APP_REGION: us-east-1                   # App Region for deploy
    APP_ACCOUNT: '222222222222'             # App account for deploy
    APP_ROLE: your-deploy-role              # Role used for deploy if parameter "assume-role" is set
    APP_SRC: /path/to/content               # Source code
    APP_S3_BUCKET: s3://prod-bucket-name    # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO44      # Cloudfront distribuition ID
    APP_NAME: your-app-name                 # Name of your application
```


If you need exclude/include files from sync, use the following parameters in `oni.yaml`:

```yml
development:                                # Oni Workspace defined by variable NODE_ENV
  APP_DEFAULT:                              # Oni app configuration name 
    WEBHOOK_SLACK: url                      # Webhook if notification is enable
    APP_REGION: us-east-1                   # App Region for deploy
    APP_ACCOUNT: '111111111111'             # App account for deploy
    APP_ROLE: your-deploy-role              # Role used for deploy if parameter "assume-role" is set
    APP_SRC: /path/to/content               # Source code
    APP_S3_BUCKET: s3://dev-bucket-name     # Destination S3
    CF_DISTRIBUTION_ID: E3R4T5Y6XPTO33      # Cloudfront distribuition ID
    APP_NAME: your-app-name                 # Application name
    FILTERS:
       EXCLUDE:                             # List of files to exclude
          - ENDSWITH: .json
    #         STARTSWITH: .json
    #    INCLUDE:                           # List of files to include
    #       - ENDSWITH: .json
    #         STARTSWITH: .json     
```    


## Deploy commands

To make deployment of Static Content to a bucket using oni, the `NODE_ENV` environment variable must be set to the name of the workspace set in the `oni.yaml` file. The commands are shown bellow.

```bash
export NODE_ENV=development
oni deploy-static -n "APP_DEFAULT"
```

For a workspace with Multiple S3 Static Content apps to be deployed, the commands are the following.

```bash
export NODE_ENV=development
oni deploy-static -n "APP_DEFAULT_1"
oni deploy-static -n "APP_DEFAULT_2"
```

Note that if your environment requires that a Role needs to be assumed, the flag `-a` needs to be set in the oni command. Furthermore, if notifications are required, the flag `-c` also needs to be set in the oni command. The example command for a static deploy assuming the role specified in the `oni.yaml` file and using notifications is displayed bellow.

```bash
export NODE_ENV=production
oni deploy-static -n "APP_DEFAULT" -c "slack" -a
```
