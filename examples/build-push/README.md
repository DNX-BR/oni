# Examples for Handling Images Using Oni

## File Structure for oni.yaml

```yml
development:
  ECR_AWS_REGION: us-east-1                     # Region of ECR repo
  ECR_AWS_ACCOUNT: '111111111111'               # Account Id of ECR repo
  ECR_AWS_ROLE: YOUR_DEPLOY_ROLE_NAME           # This role is used for ECR location in another account
  APP_DEFAULT:
    APP_IMAGE: 'YOUR_APPLICATION_IMAGE'     # Image name
```


## Build Image

The command build-image uses buildkit that creates docker-compatible image and caches the layers in order to speed up next builds. The name of the image must be specified in the file oni.yaml.

### Build Command

```bash
oni build-image -d "." -t 0.0.1 -n APP_DEFAULT
```
> Note: it is necessary to start the buildkit daemon before starting a build "**nohup buildkitd &**"

> Note: ensure that the .dockerignore file contains the **cache_build** folder

The parameter `-d` refers to the location of the Dockerfile, while the parameter `-t` refers to the image tag. The parameter `-n` indicates the name of the app in the file oni.yaml.


## Push Image

The command push-image sends the application image to the ECR repository.

### Push Command

```bash
oni push-image -t 0.0.1 -n APP_DEFAULT
```

The parameters `-t` and `-n` are the same as described for the build. 

Note: if your environment requires a role to be assumed, the flag `-a` needs to be set in the oni command as in some cases the ECR is in another account. It will assume the role defined one level above the application name in the file oni.yaml.

```bash
oni push-image -t 0.0.1 -n APP_DEFAULT -a
```


## Scan Image

It is possible to perform a scan of the image that has just been built, using the following command.

### Scan Command

```bash
oni scan-image
```
