#!/usr/bin/env node
const fs = require('fs');
const { BuildImageBuildKit, PushImageCrane } = require('./src/docker');
const { DeployECS } = require('./src/ecs');
const { initSample, ScanImageTrivy } = require('./src/utils');
const { DeployS3 } = require('./src/s3');
const { UpdateLambda } = require('./src/serverless');
const { util } = require('s3-sync-client');

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
                    .option('channel-notification', {
                        alias: 'c',
                        choices: ['slack', 'google', 'teams'],
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
                .option('channel-notification', {
                    alias: 'c',
                    choices: ['slack', 'google', 'teams'],
                    type: 'string',
                    required: false,
                    description: 'Notification channel for send message after deploy app',
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
            }).option('push', {
                    alias: 'p',
                    type: 'string',
                    required: false,
                    description: 'Push app to registry',
                    default: 'false'
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
                    choices: ['slack', 'google', 'teams'],
                    type: 'string',
                    required: false,
                    description: 'Notification channel for send message after deploy app',
                })
                .example('oni lambda-deploy -a APP_DEFAULT -z /tmp/package.zip')
                .strictOptions()
        })
        .command('scan-image', 'scan image.tar generated in build-image step using trivy scan', function (yargs, helpOrVersionSetgs) {
            return yargs.option('output', {
                alias: 'o',
                choices: ['default', 'html', 'junit', 'gitlab', 'gitlab-codequality'],
                type: 'string',
                required: false,
                default: 'default',
                description: 'Output format type',
            })
                .example('oni scan-image')
                .strictOptions()
        })
        .command('init', 'create oni.yaml sample')
        .version('version', 'Show Version', `Version ${process.env.APP_VERSION}`)
        .alias('version', 'v')
        .demandCommand(1, 'You need at least one command')
        .help()
        .recommendCommands()
        .strictCommands()
        .argv;

    let command = argv["_"];

    if (await fs.existsSync('./oni.yaml') || command[0] === 'init') {
        switch (command[0]) {
            case 'deploy-static':
                await DeployS3(argv.name, argv.c, argv.a);
                break;
            case 'ecs-deploy':
                await DeployECS(argv.name, argv.tag, argv.w, argv.f, argv.c, argv.a)
                break;
            case 'build-image':
                await BuildImageBuildKit(argv.tag, argv.dockerfile, argv.name, argv.push);
                break;
            case 'push-image':
                await PushImageCrane(argv.name, argv.tag, argv.a);
                break;
            case 'lambda-deploy':
                await UpdateLambda(argv.name, argv.file, argv.c, argv.a);
                break;
            case 'scan-image':
                await ScanImageTrivy(argv.o);
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