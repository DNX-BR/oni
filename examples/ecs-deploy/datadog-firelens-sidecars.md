# ECS Fargate with Datadog Agent + FireLens (Fluent Bit)

Example `oni.yaml` fragment for shipping app logs to Datadog via FireLens while running the Datadog Agent for APM.

```yml
gestora-staging:
  APP_DEFAULT:
    APP_IMAGE: "124871951013.dkr.ecr.us-east-1.amazonaws.com/hs-bulk-receiver"
    APP_NAME: hs-bulk-receiver
    CLUSTER_NAME: ecs-hs-bulk-receiver-us-east-1
    # ... other required ECS fields ...

    # Main app: logs via FireLens → Datadog
    APP_LOG_CONFIGURATION:
      DRIVER: awsfirelens
      OPTIONS:
        - Name: datadog
        - Host: http-intake.logs.datadoghq.com
        - TLS: "on"
        - provider: ecs
        - dd_service: hs-bulk-receiver
        - dd_source: python
        - dd_tags: env:development
      SECRET_OPTIONS:
        - apikey: /production/datadogapikey

    EXTRA_CONTAINERS:
      - APP_NAME: datadog-agent
        APP_IMAGE: public.ecr.aws/datadog/agent:7.63.3
        USE_STATIC_IMAGE: true
        ESSENTIAL: false
        IS_FARGATE: true
        APP_PORTS:
          - 8126
          - 8125
        APP_VARIABLES:
          - DD_APM_ENABLED: "true"
          - DD_APM_NON_LOCAL_TRAFFIC: "true"
          - ECS_FARGATE: "true"
          - DD_SITE: datadoghq.com
        APP_SECRETS:
          - DD_API_KEY: /production/datadogapikey
        LOG_CONFIGURATION:
          DRIVER: awslogs
          OPTIONS:
            - awslogs-group: /ecs/ecs-hs-bulk-receiver-us-east-1/datadog-agent
            - awslogs-region: us-east-1
            - awslogs-stream-prefix: datadog-agent

      - APP_NAME: log-router
        APP_IMAGE: amazon/aws-for-fluent-bit:stable
        USE_STATIC_IMAGE: true
        ESSENTIAL: true
        FIRELENS_CONFIGURATION:
          TYPE: fluentbit
          OPTIONS:
            - enable-ecs-log-metadata: "true"
        LOG_CONFIGURATION:
          DRIVER: awslogs
          OPTIONS:
            - awslogs-group: /ecs/ecs-hs-bulk-receiver-us-east-1/fluentbit
            - awslogs-region: us-east-1
            - awslogs-stream-prefix: fluentbit
```

## Notes

- `USE_STATIC_IMAGE: true` keeps public images (Datadog, Fluent Bit) without appending the deploy tag.
- `APP_LOG_CONFIGURATION.DRIVER` accepts any ECS log driver (`awslogs`, `awsfirelens`, etc.).
- `OPTIONS` and `SECRET_OPTIONS` use the same list format as `APP_VARIABLES`.
- The execution role must allow `ssm:GetParameters` (or Secrets Manager) for `SECRET_OPTIONS` paths.
- Increase task CPU/memory to account for sidecars on Fargate.
