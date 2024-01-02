#!/usr/bin/env node
const fs = require('fs');
const { BuildImageBuildKit, PushImageCrane } = require('./src/docker');
const { CloneRepo, CommitPushChanges } = require('./src/git');
const { DeployECS } = require('./src/ecs');
const { initSample, ScanImageTrivy, UpdateImageTag, ScanFsTrivy, ScanSast,ScanNuclei } = require('./src/utils');
const { DeployS3, InvalidateCloudFrontOnly } = require('./src/s3');
const { UpdateLambda } = require('./src/serverless');
const { util } = require('s3-sync-client');
const { GetLatestImage } = require('./src/ecr');

async function init() {

    const argv = require('yargs/yargs')(process.argv.slice(2))
        .usage('Usage: oni <command>  [options]')
        .command('ecs-deploy [options]', 'command for deploy in ecs',
            function (yargs, helpOrVersionSetgs) {
                return yargs.option('name', {
                    alias: 'n',
                    type: 'string',
                    required: true,
                    description: 'Application name defined in oni.yml',
                    default: 'APP_DEFAULT'
                })
                    .option('without-loadbalance', {
                        alias: 'w',
                        type: 'boolean',
                        required: false,
                        description: 'Deploy ecs without loadbalance'
                    })
                    .option('tag', {
                        alias: 't',
                        type: 'string',
                        required: true,
                        description: 'Image tag',
                    })
                    .option('fargate', {
                        alias: 'f',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'ECS deploy type Fargate',
                    })
                    .option('assume-role', {
                        alias: 'a',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'Assume role defined in oni.yaml ',
                    })
                    .option('disable-deploy', {
                        alias: 'd',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'Create task only e not deploy in ecs',
                    })      
                    .option('xray', {
                        alias: 'x',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'Add XRay containers to task defintion',
                    })                                      
                    .option('channel-notification', {
                        alias: 'c',
                        choices: ['slack', 'google', 'teams','ntfy'],
                        type: 'string',
                        required: false,
                        description: 'Notification channel for send message after deploy app',
                    })
                    .example('oni ecs-deploy -n MY_APP -t 0.0.1')
                    .strictOptions()
            }

        )
        .command('deploy-static', 'command for deploy static content in S3', function (yargs, helpOrVersionSetgs) {
            return yargs.option('name', {
                alias: 'n',
                type: 'string',
                required: true,
                description: 'Application name defined in oni.yml',
                default: 'APP_DEFAULT'
            })
                .option('assume-role', {
                    alias: 'a',
                    type: 'boolean',
                    required: false,
                    default: false,
                    description: 'Assume role defined in oni.yaml ',
                })
                .option('disable-acl', {
                    alias: 'd',
                    type: 'boolean',
                    required: false,
                    default: false,
                    description: 'Disable create ACL read-public ',
                })
                .option('channel-notification', {
                    alias: 'c',
                    choices: ['slack', 'google', 'teams','ntfy'],
                    type: 'string',
                    required: false,
                    description: 'Notification channel for send message after deploy app',
                })
                .example('oni deploy-static -n MY_APP')
                .strictOptions()
        })


        .command('invalidate-cloudfront', 'Invalidate Cloudfront distribuition', function (yargs, helpOrVersionSetgs) {
            return yargs.option('name', {
                alias: 'n',
                type: 'string',
                required: true,
                description: 'Application name defined in oni.yml',
                default: 'APP_DEFAULT'
            })
                .option('assume-role', {
                    alias: 'a',
                    type: 'boolean',
                    required: false,
                    default: false,
                    description: 'Assume role defined in oni.yaml ',
                })
                .example('oni deploy-static -n MY_APP')
                .strictOptions()
        })

        .command('build-image', 'command for build with buildkit', function (yargs, helpOrVersionSetgs) {
            return yargs.option('dockerfile', {
                alias: 'd',
                type: 'string',
                required: false,
                description: 'Dockerfile path location',
                default: '.'
            }).option('tag', {
                alias: 't',
                type: 'string',
                required: true,
                description: 'Image tag',
            }).option('name', {
                alias: 'n',
                type: 'string',
                required: true,
                description: 'Application name in oni.yml',
            })
            .option('filename', {
                alias: 'f',
                type: 'string',
                required: false,
                default: './Dockerfile',
                description: 'dockerfile name',
            })
            .option('cache', {
                alias: 'c',
                type: 'boolean',
                required: false,
                default: false,
                description: 'Enable cache layer of build',
            }) 
            .option('platform-build', {
                alias: 'p',
                type: 'strng',
                required: false,
                default: "linux/amd64",
                description: 'Target plataform build',
            })                  
            .option('location-cache', {
                alias: 'l',
                type: 'string',
                required: false,
                default: 'cache_build',
                description: 'Directory for storage cache',
            }).option('assume-role', {
                alias: 'a',
                type: 'boolean',
                required: false,
                default: false,
                description: 'Assume role defined in oni.yaml ',
             }).option('build-args', {
                alias: 'b',
                type: 'string',
                required: false,
                description: 'Define build args to Docker build',
            })                                          
                .example('oni build-image -d "." -t 0.0.1 -a APP_DEFAULT')
                .strictOptions()
        })
        .command('push-image', 'command for push image to ecr', function (yargs, helpOrVersionSetgs) {
            return yargs.option('tag', {
                alias: 't',
                type: 'string',
                required: true,
                description: 'Image tag',
            }).option('name', {
                alias: 'n',
                type: 'string',
                required: true,
                description: 'Application name in oni.yml',
            }).option('assume-role', {
                    alias: 'a',
                    type: 'boolean',
                    required: false,
                    default: false,
                    description: 'Assume role defined in oni.yaml ',
             })
                .example('oni push-image -a APP_DEFAULT -t v1')
                .strictOptions()
        })
        .command('lambda-deploy', 'command for deploy lambda', function (yargs, helpOrVersionSetgs) {
            return yargs.option('name', {
                alias: 'n',
                type: 'string',
                required: true,
                description: 'Application name defined in oni.yml',
                default: 'APP_DEFAULT'
            }).
                option('file', {
                    alias: 'f',
                    type: 'string',
                    required: true,
                    description: 'zip file location',
                })
                .option('assume-role', {
                    alias: 'a',
                    type: 'boolean',
                    required: false,
                    default: false,
                    description: 'Assume role defined in oni.yaml ',
                })
                .option('channel-notification', {
                    alias: 'c',
                    choices: ['slack', 'google', 'teams','ntfy'],
                    type: 'string',
                    required: false,
                    description: 'Notification channel for send message after deploy app',
                })
                .example('oni lambda-deploy -a APP_DEFAULT -z /tmp/package.zip')
                .strictOptions()
        })
        .command('scan-image', 'scan image.tar  generated in build-image or docker builk step using trivy scan', function (yargs, helpOrVersionSetgs) {
            return yargs.option('output', {
                alias: 'o',
                choices: ['default', 'html', 'junit', 'gitlab', 'gitlab-codequality'],
                type: 'string',
                required: false,
                default: 'default',
                description: 'Output format type',
            }).
            option('image', {
                alias: 'i',
                type: 'string',
                required: false,
                description: 'image name',
                default: 'none'
            })            
                .example('oni scan-image')
                .strictOptions()
        })
        .command('scan-fs', 'scan filesystem using trivy scan', function (yargs, helpOrVersionSetgs) {
            return yargs.option('output', {
                alias: 'o',
                choices: ['default', 'html', 'junit', 'gitlab', 'gitlab-codequality'],
                type: 'string',
                required: false,
                default: 'default',
                description: 'Output format type',
            })          
            .example('oni scan-fs')
            .strictOptions()
        })        
        .command('scan-sast', 'run sast in code using semgrep', function (yargs, helpOrVersionSetgs) {
            return yargs.option('output', {
                alias: 'o',
                choices: ['text','emacs','json','gitlab-sast','gitlab-secrets','junit-xml','sarif','vim'],
                type: 'string',
                required: false,
                default: 'text',
                description: 'Output format type',
            })          
            .example('oni scan-sast')
            .strictOptions()
        }) 
        .command('scan-nuclei', 'run scan nuclei', function (yargs, helpOrVersionSetgs) {
            return yargs.option('types', {
                alias: 't',
                type: 'string',
                required: false,
                default: 'http/',
                description: 'Output format type',
            }).      
            option('url', {
                alias: 'u',
                type: 'string',
                required: true,
                description: 'Url for run scan',
            })                  
            .example('oni scan-nuclei -u localhost:8080 -t http/')
            .strictOptions()
        })         
        .command('update-image-tag-k8s', 'Update image tag in helm values or direct in deployment manifest', function (yargs, helpOrVersionSetgs) {
            return yargs.option('path-file', {
                alias: 'p',
                type: 'string',
                required: true,
                description: 'path to file values.yaml or deploment.yaml',
            })
            .option('tag', {
                alias: 't',
                type: 'string',
                required: true,
                description: 'Tag value for update image',
            })          
            .option('helm', {
                alias: 'h',
                type: 'boolean',
                required: false,
                default: false,
                description: 'Is tag in helm values',
            })
            .option('image-index', {
                alias: 'i',
                type: 'string',
                required: false,
                default: 0,
                description: 'Image index in container array of deployment',
            })                                       
                .example('oni update-image-tag-k8s -p /chart/values.yaml -t v1.23.1 -h')
                .strictOptions()
        })        
        .command('git-clone', 'Git clone command over http', function (yargs, helpOrVersionSetgs) {
            return yargs.option('token-http', {
                alias: 't',
                type: 'string',
                required: true,
                description: 'Token http for clone assistant repository',
            })
            .option('url', {
                alias: 'u',
                type: 'string',
                required: true,
                description: 'Repositoru url without "http(s)://"',
            })          
            .option('branch', {
                alias: 'b',
                type: 'string',
                required: true,
                description: 'Repository Branch',
            })                                       
                .example('oni git-clone -t xxxxxx -u repo/nginx.git -b master')
                .strictOptions()
        })
        .command('git-commit', 'Git commit command over https', function (yargs, helpOrVersionSetgs) {
            return yargs.option('message', {
                alias: 'm',
                type: 'string',
                required: true,
                description: 'git commit message',
            })                                  
                .example('oni git-commit -m "initial commit"')
                .strictOptions()
        })                  
        .command('get-latest-image [options]', 'command for get latest image to ecr',
            function (yargs, helpOrVersionSetgs) {
                return yargs.option('name', {
                    alias: 'n',
                    type: 'string',
                    required: true,
                    description: 'Application name defined in oni.yml',
                    default: 'APP_DEFAULT'
                })
                    .option('assume-role', {
                        alias: 'a',
                        type: 'boolean',
                        required: false,
                        default: false,
                        description: 'Assume role defined in oni.yaml ',
                    })                
                    .example('oni get-latest-image -n MY_APP')
                    .strictOptions()
            }

        )        
        .command('init', 'create oni.yaml sample')
        .version('version', 'Show Version', `Version ${process.env.APP_VERSION}`)
        .alias('version', 'v')
        .demandCommand(1, 'You need at least one command')
        .help()
        .recommendCommands()
        .strictCommands()
        .argv;

    let command = argv["_"];

    if (await fs.existsSync('./oni.yaml') || command[0] === 'init' || command[0] === 'git-clone' || command[0] === 'git-commit' || command[0] === 'update-image-tag-k8s') {
        switch (command[0]) {
            case 'deploy-static':
                await DeployS3(argv.name, argv.c, argv.a,argv.d);
                break;
            case 'ecs-deploy':
                await DeployECS(argv.name, argv.tag, argv.w, argv.f, argv.c, argv.a,argv.d, argv.x)
                break;
            case 'build-image':
                await BuildImageBuildKit(argv.tag, argv.dockerfile, argv.name, argv.p,argv.f,argv.c,argv.l,argv.a,argv.b);
                break;
            case 'push-image':
                await PushImageCrane(argv.name, argv.tag, argv.a);
                break;
            case 'lambda-deploy':
                await UpdateLambda(argv.name, argv.file, argv.c, argv.a);
                break;
            case 'scan-image':
                await ScanImageTrivy(argv.o,argv.i);
                break;
            case 'scan-fs':
                await ScanFsTrivy(argv.o);
                break;
            case 'scan-sast':
                await ScanSast(argv.o);
                break;     
            case 'scan-nuclei':
                await ScanNuclei(argv.u,argv.t)
                break;                                            
            case 'git-clone':
                await CloneRepo(argv.t, argv.u, argv.b);
                break;          
            case 'git-commit':
                await CommitPushChanges(argv.t);
                break;  
            case 'update-image-tag-k8s':
                await UpdateImageTag(argv.p,argv.t,argv.h,argv.i)
                break;       
            case 'get-latest-image':
                await GetLatestImage(argv.name, argv.a);
                break;       
            case 'invalidate-cloudfront':
                await InvalidateCloudFrontOnly(argv.name, argv.a);
                break;                     
            case 'init':
                await initSample();
                break;
            default:
                console.log('Invalid option!')
                break;
        }
    } else {
        console.error('\x1b[31m', 'Erro file oni.yaml not exist.')
        process.exit(1);
    }
}

init();