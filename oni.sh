#!/usr/bin/env bash

#########################################################################
# BOBCTL - ECS Deployment CLI
# A shell script + AWS CLI implementation for ECS deployments
# Supports: CodeDeploy, Load Balancer, and Worker (no LB) deployments
#########################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Global variables
CONFIG_FILE="oni.yaml"
APP_NAME=""
TAG=""
ENVIRONMENT="development"
DEPLOY_TYPE="codedeploy" # codedeploy, loadbalancer, worker
ASSUME_ROLE=false
FARGATE=false
DRY_RUN=false
DISABLE_DEPLOY=false
TIMEOUT=600
ADD_XRAY_DAEMON=false
LAST_EVENT_ID=""
LAST_TASK_ID=""
ENABLE_SCAN=false
SCAN_SEVERITY="CRITICAL,HIGH"
SCAN_FAIL_ON="CRITICAL"
SCAN_EXIT_CODE=0
SCAN_FORMAT="table"

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" >&2
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" >&2
}

log_event() {
    echo -e "${PURPLE}[EVENT]${NC} $1" >&2
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: bobctl.sh [COMMAND] [OPTIONS]

COMMANDS:
    deploy          Deploy application to ECS
    register-task   Only register task definition (no deployment)
    scan            Scan Docker image for vulnerabilities
    help            Show this help message

DEPLOY OPTIONS:
    -n, --name NAME             Application name from oni.yaml (required)
    -t, --tag TAG               Docker image tag (required)
    -e, --env ENV               Environment (default: development)
    -d, --deploy-type TYPE      Deploy type: codedeploy|loadbalancer|worker (default: codedeploy)
    -f, --fargate               Use Fargate launch type
    -a, --assume-role           Assume IAM role for deployment
    --dry-run                   Show what would be done without executing
    --disable-deploy            Only register task definition
    --timeout SECONDS           Deployment timeout in seconds (default: 600)
    --add-xray                  Add X-Ray daemon and CloudWatch agent containers
    -h, --help                  Show this help

SECURITY SCAN OPTIONS:
    --scan                      Enable vulnerability scan before deployment
    --scan-severity LEVELS      Severity levels to report (default: CRITICAL,HIGH)
                                Options: CRITICAL,HIGH,MEDIUM,LOW,UNKNOWN
    --scan-fail-on LEVEL        Fail deployment if vulnerabilities found (default: CRITICAL)
                                Options: CRITICAL,HIGH,MEDIUM,LOW,NONE
    --scan-format FORMAT        Output format (default: table)
                                Options: table, json, sarif, cyclonedx, spdx

DEPLOY TYPES:
    codedeploy      - Deploy with AWS CodeDeploy (Blue/Green deployment)
    loadbalancer    - Deploy with Load Balancer (direct service update)
    worker          - Deploy without Load Balancer (worker/batch processes)

EXAMPLES:
    # Deploy with CodeDeploy
    bobctl.sh deploy -n api -t 1.0.0 -d codedeploy -f

    # Deploy with vulnerability scan
    bobctl.sh deploy -n api -t 1.0.0 -d codedeploy -f --scan

    # Deploy with custom scan severity
    bobctl.sh deploy -n api -t 1.0.0 --scan --scan-severity "CRITICAL,HIGH,MEDIUM"

    # Scan image only (no deployment)
    bobctl.sh scan -n api -t 1.0.0

    # Scan with JSON output
    bobctl.sh scan -n api -t 1.0.0 --scan-format json

    # Deploy worker without load balancer
    bobctl.sh deploy -n worker-reports -t 1.0.0 -d worker -f

    # Deploy with load balancer
    bobctl.sh deploy -n backend -t 2.3.1 -d loadbalancer

    # Only register task definition
    bobctl.sh register-task -n api -t 1.0.0 -f

    # Dry run to see what would happen
    bobctl.sh deploy -n api -t 1.0.0 --dry-run

EOF
}

# Function to install yq
install_yq() {
    log_info "Installing yq..."
    local tmp_file="/tmp/yq_linux_amd64"
    
    if curl -L "https://github.com/mikefarah/yq/releases/download/v4.48.1/yq_linux_amd64" -o "$tmp_file" 2>&1; then
        chmod +x "$tmp_file"
        if sudo mv "$tmp_file" /usr/local/bin/yq 2>/dev/null; then
            log_success "yq installed successfully to /usr/local/bin/yq"
            return 0
        else
            log_warning "Could not install to /usr/local/bin, trying ~/.local/bin"
            mkdir -p ~/.local/bin
            mv "$tmp_file" ~/.local/bin/yq
            export PATH="$HOME/.local/bin:$PATH"
            log_success "yq installed successfully to ~/.local/bin/yq"
            log_info "Please add ~/.local/bin to your PATH permanently"
            return 0
        fi
    else
        log_error "Failed to download yq"
        return 1
    fi
}

# Function to install jq
install_jq() {
    log_info "Installing jq..."
    local tmp_file="/tmp/jq_linux_amd64"
    
    if curl -L "https://github.com/jqlang/jq/releases/download/jq-1.8.1/jq-linux-amd64" -o "$tmp_file" 2>&1; then
        chmod +x "$tmp_file"
        if sudo mv "$tmp_file" /usr/local/bin/jq 2>/dev/null; then
            log_success "jq installed successfully to /usr/local/bin/jq"
            return 0
        else
            log_warning "Could not install to /usr/local/bin, trying ~/.local/bin"
            mkdir -p ~/.local/bin
            mv "$tmp_file" ~/.local/bin/jq
            export PATH="$HOME/.local/bin:$PATH"
            log_success "jq installed successfully to ~/.local/bin/jq"
            log_info "Please add ~/.local/bin to your PATH permanently"
            return 0
        fi
    else
        log_error "Failed to download jq"
        return 1
    fi
}

# Function to install AWS CLI
install_aws_cli() {
    log_info "Installing AWS CLI..."
    local tmp_dir="/tmp/awscli-install-$$"
    
    mkdir -p "$tmp_dir"
    cd "$tmp_dir" || return 1
    
    if curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" 2>&1; then
        if command -v unzip &> /dev/null; then
            unzip -q awscliv2.zip
            if sudo ./aws/install 2>&1; then
                log_success "AWS CLI installed successfully"
                cd - > /dev/null
                rm -rf "$tmp_dir"
                return 0
            else
                log_error "Failed to install AWS CLI"
                cd - > /dev/null
                rm -rf "$tmp_dir"
                return 1
            fi
        else
            log_error "unzip command not found. Please install unzip first."
            cd - > /dev/null
            rm -rf "$tmp_dir"
            return 1
        fi
    else
        log_error "Failed to download AWS CLI"
        cd - > /dev/null
        rm -rf "$tmp_dir"
        return 1
    fi
}

# Function to install Trivy
install_trivy() {
    log_info "Installing Trivy..."
    local tmp_file="/tmp/trivy.tar.gz"
    local trivy_version="0.58.1"
    
    if curl -L "https://github.com/aquasecurity/trivy/releases/download/v${trivy_version}/trivy_${trivy_version}_Linux-64bit.tar.gz" -o "$tmp_file" 2>&1; then
        local tmp_dir="/tmp/trivy-install-$$"
        mkdir -p "$tmp_dir"
        
        if tar -xzf "$tmp_file" -C "$tmp_dir" 2>&1; then
            if sudo mv "$tmp_dir/trivy" /usr/local/bin/trivy 2>/dev/null; then
                log_success "Trivy installed successfully to /usr/local/bin/trivy"
                rm -rf "$tmp_dir" "$tmp_file"
                return 0
            else
                log_warning "Could not install to /usr/local/bin, trying ~/.local/bin"
                mkdir -p ~/.local/bin
                mv "$tmp_dir/trivy" ~/.local/bin/trivy
                export PATH="$HOME/.local/bin:$PATH"
                log_success "Trivy installed successfully to ~/.local/bin/trivy"
                log_info "Please add ~/.local/bin to your PATH permanently"
                rm -rf "$tmp_dir" "$tmp_file"
                return 0
            fi
        else
            log_error "Failed to extract Trivy"
            rm -rf "$tmp_dir" "$tmp_file"
            return 1
        fi
    else
        log_error "Failed to download Trivy"
        return 1
    fi
}

# Function to check dependencies
check_dependencies() {
    local missing_deps=()
    local install_failed=false
    
    # Check and install AWS CLI
    if ! command -v aws &> /dev/null; then
        log_warning "aws-cli not found. Attempting to install..."
        if ! install_aws_cli; then
            missing_deps+=("aws-cli")
            install_failed=true
        fi
    fi
    
    # Check and install jq
    if ! command -v jq &> /dev/null; then
        log_warning "jq not found. Attempting to install..."
        if ! install_jq; then
            missing_deps+=("jq")
            install_failed=true
        fi
    fi
    
    # Check and install yq
    if ! command -v yq &> /dev/null; then
        log_warning "yq not found. Attempting to install..."
        if ! install_yq; then
            log_warning "yq installation failed. Will attempt to parse YAML manually."
        fi
    fi
    
    # Check and install Trivy if scan is enabled
    if [ "$ENABLE_SCAN" = true ]; then
        if ! command -v trivy &> /dev/null; then
            log_warning "Trivy not found. Attempting to install..."
            if ! install_trivy; then
                missing_deps+=("trivy")
                install_failed=true
            fi
        fi
    fi
    
    # If any required dependency failed to install, exit
    if [ "$install_failed" = true ]; then
        log_error "Failed to install required dependencies: ${missing_deps[*]}"
        log_error "Please install missing dependencies manually and try again."
        exit 1
    fi
    
    log_success "All dependencies are available"
}

# Function to parse YAML (fallback if yq is not available)
parse_yaml() {
    local yaml_file=$1
    local env=$2
    local app=$3
    local key=$4
    
    if command -v yq &> /dev/null;
    then
        yq eval ".${env}.${app}.${key}" "$yaml_file" 2>/dev/null || echo ""
    else
        # Fallback: simple grep-based parsing
        grep -A 200 "^${env}:" "$yaml_file" | grep -A 100 "  ${app}:" | grep "    ${key}:" | cut -d':' -f2- | sed 's/^ *//' | sed 's/"//g'
    fi
}

# Function to get array values from YAML
parse_yaml_array() {
    local yaml_file=$1
    local env=$2
    local app=$3
    local key=$4
    
    if command -v yq &> /dev/null; then
        yq eval ".${env}.${app}.${key}[]" "$yaml_file" 2>/dev/null | tr '\n' ' '
    else
        # Fallback: return empty
        echo ""
    fi
}

# Function to get nested array from YAML
parse_yaml_nested() {
    local yaml_file=$1
    local path=$2
    
    if command -v yq &> /dev/null; then
        yq eval "$path" "$yaml_file" 2>/dev/null
    else
        echo ""
    fi
}

# Function to load configuration from oni.yaml
load_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "Configuration file $CONFIG_FILE not found!"
        exit 1
    fi
    
    log_info "Loading configuration for $APP_NAME from $CONFIG_FILE..."
    
    # Load basic configuration
    APP_IMAGE=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_IMAGE")
    APP_SERVICE_NAME=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_NAME")
    APP_MEMORY=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_MEMORY")
    APP_CPU=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_CPU")
    APP_MEMORY_RESERVATION=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_MEMORY_RESERVATION")
    APP_REGION=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_REGION")
    APP_ACCOUNT=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_ACCOUNT")
    CLUSTER_NAME=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "CLUSTER_NAME")
    NETWORK_MODE=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "NETWORK_MODE")
    TASK_ARN=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "TASK_ARN")
    EXECUTION_ROLE_ARN=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "EXECUTION_ROLE_ARN")
    APP_ROLE=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_ROLE")
    APP_SECRET_EXTRACT=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_SECRET_EXTRACT")
    
    # Set defaults if not specified
    [ -z "$APP_CPU" ] && APP_CPU="0"
    [ -z "$NETWORK_MODE" ] && NETWORK_MODE="awsvpc"
    [ -z "$TASK_ARN" ] && TASK_ARN="arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}"
    [ -z "$EXECUTION_ROLE_ARN" ] && EXECUTION_ROLE_ARN="arn:aws:iam::${APP_ACCOUNT}:role/ecs-task-${CLUSTER_NAME}-${APP_REGION}"
    
    # Validate required fields
    if [ -z "$APP_IMAGE" ] || [ -z "$APP_SERVICE_NAME" ] || [ -z "$CLUSTER_NAME" ]; then
        log_error "Missing required configuration fields!"
        log_error "APP_IMAGE: $APP_IMAGE"
        log_error "APP_NAME: $APP_SERVICE_NAME"
        log_error "CLUSTER_NAME: $CLUSTER_NAME"
        exit 1
    fi
    
    log_success "Configuration loaded successfully"
    log_info "Service: $APP_SERVICE_NAME"
    log_info "Cluster: $CLUSTER_NAME"
    log_info "Region: $APP_REGION"
    log_info "Image: $APP_IMAGE:$TAG"
}

# Function to assume IAM role
assume_iam_role() {
    if [ "$ASSUME_ROLE" = false ]; then
        return 0
    fi
    
    log_info "Assuming IAM role: $APP_ROLE"
    
    local role_arn="arn:aws:iam::${APP_ACCOUNT}:role/${APP_ROLE}"
    local session_name="bobctl-$(date +%s)"
    
    local credentials=$(aws sts assume-role \
        --role-arn "$role_arn" \
        --role-session-name "$session_name" \
        --output json)
    
    export AWS_ACCESS_KEY_ID=$(echo "$credentials" | jq -r '.Credentials.AccessKeyId')
    export AWS_SECRET_ACCESS_KEY=$(echo "$credentials" | jq -r '.Credentials.SecretAccessKey')
    export AWS_SESSION_TOKEN=$(echo "$credentials" | jq -r '.Credentials.SessionToken')
    
    log_success "Successfully assumed role: $APP_ROLE"
}

# Function to scan Docker image for vulnerabilities
scan_image() {
    local image="${APP_IMAGE}:${TAG}"
    
    log_info "=========================================="
    log_info "Starting vulnerability scan with Trivy"
    log_info "=========================================="
    log_info "Image: $image"
    log_info "Severity: $SCAN_SEVERITY"
    log_info "Fail on: $SCAN_FAIL_ON"
    log_info "Format: $SCAN_FORMAT"
    echo ""
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would scan image: $image"
        return 0
    fi
    
    # Check if image exists locally or needs to be pulled from ECR
    local needs_ecr_auth=false
    if [[ "$image" == *".dkr.ecr."*".amazonaws.com"* ]]; then
        needs_ecr_auth=true
        log_info "Detected ECR image, authenticating..."
        
        # Get ECR login password and authenticate Docker
        local ecr_password=$(aws ecr get-login-password --region "$APP_REGION" 2>&1)
        if [ $? -ne 0 ]; then
            log_error "Failed to get ECR credentials"
            return 1
        fi
        
        local registry=$(echo "$image" | cut -d'/' -f1)
        echo "$ecr_password" | docker login --username AWS --password-stdin "$registry" > /dev/null 2>&1
        
        if [ $? -ne 0 ]; then
            log_warning "Docker login failed, continuing with Trivy ECR scan..."
        else
            log_success "Docker authenticated with ECR"
        fi
    fi
    
    # Prepare Trivy command
    local trivy_cmd="trivy image"
    trivy_cmd="$trivy_cmd --severity $SCAN_SEVERITY"
    trivy_cmd="$trivy_cmd --format $SCAN_FORMAT"
    
    # Add exit code based on fail-on severity
    if [ "$SCAN_FAIL_ON" != "NONE" ]; then
        trivy_cmd="$trivy_cmd --exit-code 1"
        trivy_cmd="$trivy_cmd --severity $SCAN_FAIL_ON"
    fi
    
    # For table format, use color output
    if [ "$SCAN_FORMAT" = "table" ]; then
        trivy_cmd="$trivy_cmd --no-progress"
    fi
    
    # Add image to scan
    trivy_cmd="$trivy_cmd $image"
    
    log_info "Running: $trivy_cmd"
    echo ""
    
    # Run Trivy scan
    eval "$trivy_cmd" 2>&1
    SCAN_EXIT_CODE=$?
    
    echo ""
    log_info "=========================================="
    
    if [ $SCAN_EXIT_CODE -eq 0 ]; then
        log_success "Security scan passed! No critical vulnerabilities found."
        return 0
    else
        log_error "Security scan failed! Found vulnerabilities with severity: $SCAN_FAIL_ON or higher"
        
        if [ "$SCAN_FAIL_ON" != "NONE" ]; then
            log_error "Deployment blocked due to security vulnerabilities"
            return 1
        else
            log_warning "Continuing deployment despite vulnerabilities (fail-on: NONE)"
            return 0
        fi
    fi
}

# Function to extract secrets from AWS Secrets Manager
extract_secrets() {
    if [ -z "$APP_SECRET_EXTRACT" ]; then
        echo "[]"
        return 0
    fi


    
    log_info "Extracting secrets from: $APP_SECRET_EXTRACT"
    
    local secret_value=$(aws secretsmanager get-secret-value \
        --region "$APP_REGION" \
        --secret-id "$APP_SECRET_EXTRACT" \
        --query 'SecretString' \
        --output text 2>/dev/null || echo "{}")
    
    if [ "$secret_value" = "{}" ] || [ -z "$secret_value" ] || [ "$secret_value" = "null" ]; then
        log_warning "No secrets found at $APP_SECRET_EXTRACT"
        echo "[]"
        return 0
    fi
    
    # Convert secrets to ECS format
    local secrets_array=$(echo "$secret_value" | jq -r 'to_entries | map({name: .key, valueFrom: "'"$APP_SECRET_EXTRACT"':\(.key)::"}) | @json')
    
    echo "$secrets_array"
}

# Function to build environment variables JSON
build_environment_variables() {
    local env_vars="[]"
    
    if command -v yq &> /dev/null; then
        local vars_yaml=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_VARIABLES[]" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null || echo "[]")
        
        if [ "$vars_yaml" != "[]" ] && [ -n "$vars_yaml" ] && [ "$vars_yaml" != "null" ]; then
            # Convert YAML variables to ECS environment format
            env_vars=$(echo "$vars_yaml" | jq -s 'map(to_entries | map({name: .key, value: .value | tostring})) | add // []')
        fi
    fi
    
    echo "$env_vars"
}

# Function to build secrets JSON
build_secrets() {
    local secrets="[]"
    
    # Extract secrets from Secrets Manager
    local extracted_secrets=$(extract_secrets)
    
    if command -v yq &> /dev/null; then
        local secrets_yaml=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_SECRETS[]" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null || echo "[]")
        
        if [ "$secrets_yaml" != "[]" ] && [ -n "$secrets_yaml" ] && [ "$secrets_yaml" != "null" ]; then
            local config_secrets=$(echo "$secrets_yaml" | jq -s 'map(to_entries | map({name: .key, valueFrom: .value})) | add // []')
            secrets=$(echo "$extracted_secrets $config_secrets" | jq -s 'add | unique_by(.name)')
        else
            secrets="$extracted_secrets"
        fi
    else
        secrets="$extracted_secrets"
    fi
    
    echo "$secrets"
}

# Function to build port mappings JSON
build_port_mappings() {
    local ports="[]"
    
    if command -v yq &> /dev/null; then
        local ports_array=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_PORTS[]" "$CONFIG_FILE" 2>/dev/null)
        
        if [ -n "$ports_array" ] && [ "$ports_array" != "null" ]; then
            ports=$(echo "$ports_array" | jq -R -s 'split("\n") | map(select(length > 0) | tonumber) | map({containerPort: .})')
        fi
    fi
    
    echo "$ports"
}

# Function to build command array
build_command() {
    local commands="[]"
    
    if command -v yq &> /dev/null; then
        local cmd_array=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_COMMAND[]" "$CONFIG_FILE" 2>/dev/null)
        
        if [ -n "$cmd_array" ] && [ "$cmd_array" != "null" ]; then
            commands=$(echo "$cmd_array" | jq -R -s 'split("\n") | map(select(length > 0))')
        fi
    fi
    
    echo "$commands"
}

# Function to build capacity provider strategy (RAW JSON)
# CORREÇÃO: Esta função agora apenas extrai o JSON cru (NAME, BASE, WEIGHT)
build_capacity_providers_raw() {
    local providers_json="[]"
    
    if command -v yq &> /dev/null; then
        providers_json=$(yq eval -o=json ".${ENVIRONMENT}.${APP_NAME}.APP_CAPACITY_PROVIDERS" "$CONFIG_FILE" 2>/dev/null || echo "[]")
    fi

    if [ "$providers_json" = "null" ]; then
        providers_json="[]"
    fi
    
    echo "$providers_json"
}

# Function to build ulimits
build_ulimits() {
    local ulimits="[]"
    
    if command -v yq &> /dev/null; then
        ulimits=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_ULIMITS | map({
            hardLimit: .HARDLIMIT,
            softLimit: .SOFTLIMIT,
            name: .NAME
        })" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null || echo "[]")
    fi
    
    echo "$ulimits"
}

# Function to build mount points
build_mount_points() {
    local mount_points="[]"
    
    if command -v yq &> /dev/null; then
        local mounts=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_MOUNTPOINTS[]" "$CONFIG_FILE" 2>/dev/null)
        
        if [ -n "$mounts" ] && [ "$mounts" != "null" ]; then
            mount_points=$(echo "$mounts" | awk -F: '{print "{\"sourceVolume\":\""$1"\",\"containerPath\":\""$2"\"}"}' | jq -s '.')
        fi
    fi
    
    echo "$mount_points"
}

# Function to build volumes
build_volumes() {
    local volumes="[]"
    
    if command -v yq &> /dev/null; then
        local efs_configs=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.EFS_CONFIG[]" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null)
        
        if [ -n "$efs_configs" ] && [ "$efs_configs" != "null" ] && [ "$efs_configs" != "[]" ]; then
            volumes=$(echo "$efs_configs" | jq -s 'map(
                if .BIND_HOST then
                    {
                        name: .VOLUME_NAME,
                        host: {
                            sourcePath: .BIND_HOST
                        }
                    }
                else
                    {
                        name: .VOLUME_NAME,
                        efsVolumeConfiguration: {
                            transitEncryption: "ENABLED",
                            fileSystemId: .FILESYSTEM_ID,
                            rootDirectory: (if .ROOT_DIRECTORY then .ROOT_DIRECTORY else "/" end),
                            authorizationConfig: {
                                accessPointId: .ACCESS_POINT_ID
                            }
                        }
                    }
                end
            ) | add // []')
        fi
    fi
    
    echo "$volumes"
}

# Function to build placement constraints
build_constraints() {
    local constraints="[]"
    
    if command -v yq &> /dev/null; then
        constraints=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.CONSTRAINTS | map({
            expression: .EXPRESSION,
            type: .TYPE
        })" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null || echo "[]")
    fi
    
    echo "$constraints"
}

# Function to build task tags
build_task_tags() {
    local tags="[]"
    
    if command -v yq &> /dev/null; then
        local tags_yaml=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_TAGS" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null)
        
        if [ -n "$tags_yaml" ] && [ "$tags_yaml" != "null" ] && [ "$tags_yaml" != "{}" ]; then
            tags=$(echo "$tags_yaml" | jq 'to_entries | map({key: .key, value: .value})')
        fi
    fi
    
    echo "$tags"
}

# Function to build DataDog agent container
build_datadog_agent() {
    local datadog_config=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.EXTRA_CONFIG.DATADOG_AGENT" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null)
    
    if [ -z "$datadog_config" ] || [ "$datadog_config" = "null" ]; then
        echo "[]"
        return 0
    fi
    
    local container=$(jq -n \
        --argjson config $datadog_config \
        --arg isFargate "$FARGATE" \
        '{
            name: "datadog-agent",
            image: "public.ecr.aws/datadog/agent:latest",
            essential: true,
            environment: [
                {
                    name: "ECS_FARGATE",
                    value: ($config.ECS_FARGATE | tostring)
                },
                {
                    name: "DD_SITE",
                    value: ($config.SITE | tostring)
                },
                {
                    name: "DD_LOGS_ENABLED",
                    value: ($config.LOGS_ENABLED | tostring)
                }
            ],
            secrets: [
                {
                    name: "DD_API_KEY",
                    valueFrom: $config.DD_API_KEY
                }
            ]
        }' | jq 'if $isFargate == "false" then . + {memoryReservation: ($config.APP_MEMORY_RESERVATION // 256), memory: ($config.APP_MEMORY // 512)} else . end' --argjson config $datadog_config)
    
    echo "[$container]"
}

# Function to build X-Ray daemon and CloudWatch agent containers
build_xray_containers() {
    if [ "$ADD_XRAY_DAEMON" = false ]; then
        echo "[]"
        return 0
    fi
    
    local xray_daemon=$(jq -n \
        --arg region "$APP_REGION" \
        --arg appName "$APP_SERVICE_NAME" \
        '{
            name: "xray-daemon",
            image: "public.ecr.aws/xray/aws-xray-daemon:latest",
            essential: true,
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": "/ecs/ecs-cwagent-fargate",
                    "awslogs-region": $region,
                    "awslogs-stream-prefix": $appName
                }
            }
        }')
    
    local cw_agent=$(jq -n \
        --arg region "$APP_REGION" \
        --arg account "$APP_ACCOUNT" \
        --arg appName "$APP_SERVICE_NAME" \
        '{
            name: "cloudwatch-agent",
            image: "public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest",
            essential: true,
            secrets: [
                {
                    name: "CW_CONFIG_CONTENT",
                    valueFrom: ("arn:aws:ssm:" + $region + ":" + $account + ":parameter/ecs-cwagent")
                }
            ],
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": "/ecs/ecs-cwagent-fargate",
                    "awslogs-region": $region,
                    "awslogs-stream-prefix": $appName
                }
            }
        }')
    
    echo "[$xray_daemon, $cw_agent]"
}

# Function to build extra containers (sidecars)
build_extra_containers() {
    local extra_containers="[]"
    
    if ! command -v yq &> /dev/null; then
        echo "[]"
        return 0
    fi
    
    local extras=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.EXTRA_CONTAINERS[]" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null)
    
    if [ -z "$extras" ] || [ "$extras" = "null" ]; then
        echo "[]"
        return 0
    fi
    
    extra_containers=$(echo "$extras" | jq -s --arg tag "$TAG" 'map({
        name: .APP_NAME,
        image: (.APP_IMAGE + ":" + $tag),
        essential: true,
        environment: (.APP_VARIABLES // [] | map(to_entries | map({name: .key, value: (.value | tostring)}) | add)),
        secrets: (.APP_SECRETS // [] | map(to_entries | map({name: .key, valueFrom: .value}) | add)),
        logConfiguration: {
            logDriver: "awslogs",
            options: {
                "awslogs-group": ("/ecs/" + .CLUSTER_NAME + "/" + .APP_NAME),
                "awslogs-region": "'$APP_REGION'",
                "awslogs-stream-prefix": .APP_NAME
            }
        }
    } + (if .IS_FARGATE == false then {
        memoryReservation: .APP_MEMORY_RESERVATION,
        memory: .APP_MEMORY,
        cpu: .APP_CPU
    } else {} end) + (if .APP_LINKS then {links: .APP_LINKS} else {} end))')
    
    echo "$extra_containers"
}

# Function to get CloudWatch logs for failed containers
get_failed_container_logs() {
    local task_id=$1
    
    if [ -z "$task_id" ]; then
        return 0
    fi
    
    log_info "Fetching logs from failed container..."
    
    local log_stream="${APP_SERVICE_NAME}/${APP_SERVICE_NAME}/${task_id}"
    local log_group="/ecs/${CLUSTER_NAME}/${APP_SERVICE_NAME}"
    
    local logs=$(aws logs get-log-events \
        --region "$APP_REGION" \
        --log-group-name "$log_group" \
        --log-stream-name "$log_stream" \
        --limit 200 \
        --output json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        log_info "Last 200 log entries from stopped container:"
        # Envia os logs para stderr para não poluir stdout
        echo "$logs" | jq -r '.events[].message' >&2
    else
        log_warning "No additional info found in CloudWatch Logs"
    fi
}

# Function to register task definition
register_task_definition() {
    log_info "Registering task definition for ${APP_SERVICE_NAME}..."
    
    # Build container definition components
    local environment_vars=$(build_environment_variables)
    local secrets=$(build_secrets)
    local port_mappings=$(build_port_mappings)
    local command=$(build_command)
    local ulimits=$(build_ulimits)
    local mount_points=$(build_mount_points)
    local volumes=$(build_volumes)
    local constraints=$(build_constraints)
    local task_tags=$(build_task_tags)
    
    # Load additional configurations
    local app_stop_timeout=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_STOP_TIMEOUT")
    local app_links=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "APP_LINKS")
    local repo_credentials=$(parse_yaml "$CONFIG_FILE" "$ENVIRONMENT" "$APP_NAME" "REPOSITORY_CREDENTIALS")
    
    # Set defaults
    if [ -z "$app_stop_timeout" ] || [ "$app_stop_timeout" = "null" ]; then
        app_stop_timeout="30"
    fi
    
    # Build main container definition
    # Only convert values for Fargate, for EC2 use the values as is
    local mem_mb
    local cpu_units
    if [ "$FARGATE" = true ]; then
        mem_mb=$(echo "$APP_MEMORY" | sed 's/ GB/ * 1024/g' | sed 's/ MB//g' | bc -l | awk '{print int($1)}')
        cpu_units=$(echo "$APP_CPU" | sed 's/ vCPU//g' | awk '{print int($1 * 1024)}')
    else
        mem_mb="$APP_MEMORY"
        cpu_units="$APP_CPU"
    fi

    local container_def=$(jq -n \
        --arg name "$APP_SERVICE_NAME" \
        --arg cluster "$CLUSTER_NAME" \
        --arg image "${APP_IMAGE}:${TAG}" \
        --argjson memory $mem_mb \
        --argjson cpu $cpu_units \
        --argjson environment "$environment_vars" \
        --argjson secrets "$secrets" \
        --argjson portMappings "$port_mappings" \
        --argjson command "$command" \
        --argjson ulimits "$ulimits" \
        --argjson mountPoints "$mount_points" \
        --arg stopTimeout "$app_stop_timeout" \
        '{
            name: $name,
            image: $image,
            essential: true,
            environment: $environment,
            secrets: $secrets,
            portMappings: $portMappings,
            stopTimeout: ($stopTimeout | tonumber),
            logConfiguration: {
                logDriver: "awslogs",
                options: {
                    "awslogs-group": ("/ecs/" + $cluster + "/" + $name),
                    "awslogs-region": "'$APP_REGION'",
                    "awslogs-stream-prefix": $name
                }
            }
        } + (if ($command | length) > 0 then {command: $command} else {} end)
          + (if ($ulimits | length) > 0 then {ulimits: $ulimits} else {} end)
          + (if ($mountPoints | length) > 0 then {mountPoints: $mountPoints} else {} end)
    ')

    
    # Add repository credentials if configured
    if [ -n "$repo_credentials" ] && [ "$repo_credentials" != "null" ]; then
        container_def=$(echo "$container_def" | jq --arg creds "$repo_credentials" '. + {repositoryCredentials: {credentialsParameter: $creds}}')
    fi
    
    # Add app links if configured
    if [ -n "$app_links" ] && [ "$app_links" != "null" ]; then
        local links_array=$(echo "$app_links" | jq -R -s 'split(",") | map(select(length > 0))')
        container_def=$(echo "$container_def" | jq --argjson links "$links_array" '. + {links: $links}')
    fi
    
    # Add memory/cpu based on Fargate vs EC2
    if [ "$FARGATE" = true ]; then
        # Para Fargate, a memória é no nível da task, não do container
        # O container_def *não* deve ter memory/cpu, apenas o task_def
        container_def=$(echo "$container_def" | jq 'del(.memory) | del(.cpu)')
    else
        # Para EC2
        if [ -n "$APP_MEMORY_RESERVATION" ]; then
            local mem_res_mb=$(echo "$APP_MEMORY_RESERVATION" | sed 's/ GB/ * 1024/g' | sed 's/ MB//g' | bc -l | awk '{print int($1)}')
            container_def=$(echo "$container_def" | jq \
                --argjson memory $mem_mb \
                --argjson memoryReservation $mem_res_mb \
                '. + {memory: $memory, memoryReservation: $memoryReservation}')
        fi
        
        if [ "$APP_CPU" != "0" ]; then
            container_def=$(echo "$container_def" | jq --argjson cpu "$cpu_units" '. + {cpu: $cpu}')
        fi
    fi
    
    # Collect all container definitions
    local all_containers="[$container_def]"
    
    # Add DataDog agent if configured
    local datadog_containers=$(build_datadog_agent)
    if [ "$datadog_containers" != "[]" ]; then
        log_info "Adding DataDog agent container"
        all_containers=$(echo "$all_containers $datadog_containers" | jq -s 'add')
    fi
    
    # Add X-Ray daemon and CloudWatch agent if requested
    local xray_containers=$(build_xray_containers)
    if [ "$xray_containers" != "[]" ]; then
        log_info "Adding X-Ray daemon and CloudWatch agent containers"
        all_containers=$(echo "$all_containers $xray_containers" | jq -s 'add')
    fi
    
    # Add extra containers (sidecars)
    local extra_containers=$(build_extra_containers)
    if [ "$extra_containers" != "[]" ]; then
        log_info "Adding extra sidecar containers"
        all_containers=$(echo "$all_containers $extra_containers" | jq -s 'add')
    fi
    
    # Build task definition
    local task_def=$(jq -n \
        --arg family "${CLUSTER_NAME}-${APP_SERVICE_NAME}" \
        --arg networkMode "$NETWORK_MODE" \
        --arg taskRoleArn "$TASK_ARN" \
        --arg executionRoleArn "$EXECUTION_ROLE_ARN" \
        --argjson containerDefinitions "$all_containers" \
        --argjson volumes "$volumes" \
        --argjson constraints "$constraints" \
        '{
            family: $family,
            networkMode: $networkMode,
            taskRoleArn: $taskRoleArn,
            executionRoleArn: $executionRoleArn,
            containerDefinitions: $containerDefinitions
        } + (if ($volumes | length) > 0 then {volumes: $volumes} else {} end)
          + (if ($constraints | length) > 0 then {placementConstraints: $constraints} else {} end)
    ')
    
    # Add task tags if configured
    if [ "$task_tags" != "[]" ] && [ "$task_tags" != "null" ]; then
        task_def=$(echo "$task_def" | jq --argjson tags "$task_tags" '. + {tags: $tags}')
    fi
    
    # Add Fargate-specific settings
    if [ "$FARGATE" = true ]; then
        local memory_value=$(echo "$APP_MEMORY" | sed 's/ GB/ * 1024/g' | sed 's/ MB//g' | bc -l | awk '{print int($1)}')
        cpu_clean=$(echo "$APP_CPU" | sed 's/ vCPU//')

        case "$cpu_clean" in
        "0.25")
            cpu_value=256
            ;;
        "0.5")
            cpu_value=512
            ;;
        *)
            # Para 1, 2, 4... vCPUs
            cpu_value=$((cpu_clean * 1024))
            ;;
        esac        
        
        task_def=$(echo "$task_def" | jq \
            --arg memory "$memory_value" \
            --arg cpu "$cpu_value" \
            '. + {
                requiresCompatibilities: ["FARGATE"],
                memory: $memory,
                cpu: $cpu
            }')
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would register task definition:"
        echo "$task_def" | jq '.' >&2
        echo "arn:aws:ecs:sa-east-1:123456789012:task-definition/DRY-RUN-${CLUSTER_NAME}-${APP_SERVICE_NAME}:1"
        return 0
    fi
    
    echo $task_def > output.json

    # Register task definition
    local result=$(aws ecs register-task-definition \
        --region "$APP_REGION" \
        --cli-input-json "$task_def" \
        --output json 2>&1)

    
    
    if [ $? -ne 0 ]; then
        log_error "Failed to register task definition:"
        log_error "Input JSON: $task_def"
        log_error "AWS Error: $result"
        exit 1
    fi
    
    TASK_DEFINITION_ARN=$(echo "$result" | jq -r '.taskDefinition.taskDefinitionArn')
    
    log_success "Task definition registered: $TASK_DEFINITION_ARN"
    echo "$TASK_DEFINITION_ARN"
}

# Function to update ECS service (worker deployment)
# CORREÇÃO: Lógica de Capacity Provider movida para cá
deploy_worker() {
    local task_arn=$1
    
    log_info "Deploying worker service (no load balancer): ${APP_SERVICE_NAME}"
    
    local raw_providers=$(build_capacity_providers_raw)
    local capacity_providers_json="[]"
    local capacity_strategy_flag=""
    
    if [ "$raw_providers" != "[]" ] && [ "$raw_providers" != "null" ]; then
        # Converte de NAME/BASE/WEIGHT para camelCase (capacityProvider, base, weight)
        capacity_providers_json=$(echo "$raw_providers" | jq 'map({
            capacityProvider: .NAME,
            base: .BASE,
            weight: .WEIGHT
        })')
        
        local escaped_json=$(echo "$capacity_providers_json" | jq -c '.')
        capacity_strategy_flag="--capacity-provider-strategy $escaped_json"
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would update service:"
        log_info "  Service: $APP_SERVICE_NAME"
        log_info "  Cluster: $CLUSTER_NAME"
        log_info "  Task Definition: $task_arn"
        [ -n "$capacity_strategy_flag" ] && log_info "  Capacity Providers (camelCase): $capacity_providers_json"
        return 0
    fi
    
    local cmd="aws ecs update-service \
        --region $APP_REGION \
        --cluster $CLUSTER_NAME \
        --service $APP_SERVICE_NAME \
        --task-definition $task_arn"

    if [ -n "$capacity_strategy_flag" ]; then
        cmd="$cmd $capacity_strategy_flag"
    fi

    cmd="$cmd --output json"

    local result=$(eval "$cmd" 2>&1)
    
    if [ $? -ne 0 ]; then
        log_error "Failed to update service:"
        echo "$result" >&2
        exit 1
    fi
    
    local service_status=$(echo "$result" | jq -r '.service.status')
    
    if [ "$service_status" = "ACTIVE" ]; then
        log_success "Service updated successfully"
        log_success "Deployment completed for $APP_SERVICE_NAME"
    else
        log_error "Service status: $service_status"
        exit 1
    fi
}

# Function to deploy with load balancer (direct update)
# CORREÇÃO: Lógica de Capacity Provider movida para cá
deploy_with_loadbalancer() {
    local task_arn=$1
    
    log_info "Deploying with load balancer: ${APP_SERVICE_NAME}"
    
    local raw_providers=$(build_capacity_providers_raw)
    local capacity_providers_json="[]"
    local capacity_strategy_flag=""
    
    if [ "$raw_providers" != "[]" ] && [ "$raw_providers" != "null" ]; then
        # Converte de NAME/BASE/WEIGHT para camelCase (capacityProvider, base, weight)
        capacity_providers_json=$(echo "$raw_providers" | jq 'map({
            capacityProvider: .NAME,
            base: .BASE,
            weight: .WEIGHT
        })')
        
        local escaped_json=$(echo "$capacity_providers_json" | jq -c '.')
        capacity_strategy_flag="--capacity-provider-strategy $escaped_json"
    fi
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would update service with load balancer:"
        log_info "  Service: $APP_SERVICE_NAME"
        log_info "  Cluster: $CLUSTER_NAME"
        log_info "  Task Definition: $task_arn"
        [ -n "$capacity_strategy_flag" ] && log_info "  Capacity Providers (camelCase): $capacity_providers_json"
        return 0
    fi
    
    local cmd="aws ecs update-service \
        --region $APP_REGION \
        --cluster $CLUSTER_NAME \
        --service $APP_SERVICE_NAME \
        --task-definition $task_arn"
    
    if [ -n "$capacity_strategy_flag" ]; then
        cmd="$cmd $capacity_strategy_flag"
    fi
    
    cmd="$cmd --output json"
    
    local result=$(eval "$cmd" 2>&1)
    
    if [ $? -ne 0 ]; then
        log_error "Failed to update service:"
        echo "$result" >&2
        exit 1
    fi
    
    local service_status=$(echo "$result" | jq -r '.service.status')
    
    if [ "$service_status" = "ACTIVE" ]; then
        log_success "Service updated successfully"
        monitor_deployment
    else
        log_error "Service status: $service_status"
        exit 1
    fi
}

# Function to deploy with CodeDeploy
# CORREÇÃO: Lógica de Capacity Provider movida para cá
deploy_with_codedeploy() {
    local task_arn=$1
    
    log_info "Deploying with CodeDeploy: ${APP_SERVICE_NAME}"
    
    local app_port=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_PORTS[0]" "$CONFIG_FILE" 2>/dev/null)
    if [ -z "$app_port" ] || [ "$app_port" = "null" ]; then
        app_port="80" # Default
    fi
    
    # Build capacity provider strategy
    local raw_providers=$(build_capacity_providers_raw)
    local capacity_provider_json="[]" # Esta será a versão em PascalCase
    
    if [ "$raw_providers" != "[]" ] && [ "$raw_providers" != "null" ]; then
        # Converte de NAME/BASE/WEIGHT para PascalCase (CapacityProvider, Base, Weight)
        capacity_provider_json=$(echo "$raw_providers" | jq 'map({
            CapacityProvider: .NAME,
            Base: .BASE,
            Weight: .WEIGHT
        })')
    fi
    
    # Get hooks if configured
    local app_hooks="[]"
    if command -v yq &> /dev/null; then
        app_hooks=$(yq eval ".${ENVIRONMENT}.${APP_NAME}.APP_HOOKS" "$CONFIG_FILE" 2>/dev/null | yq -o=json '.' 2>/dev/null || echo "[]")
        if [ "$app_hooks" = "null" ]; then
            app_hooks="[]"
        fi
    fi
    
    # Build AppSpec content
    local appspec=$(jq -n \
        --arg taskDef "$task_arn" \
        --arg containerName "$APP_SERVICE_NAME" \
        --argjson containerPort $app_port \
        --argjson capacityProviders "$capacity_provider_json" \
        --argjson hooks "$app_hooks" \
        '{
            version: 1,
            Resources: [{
                TargetService: {
                    Type: "AWS::ECS::Service",
                    Properties: {
                        TaskDefinition: $taskDef,
                        LoadBalancerInfo: {
                            ContainerName: $containerName,
                            ContainerPort: $containerPort
                        },
                        CapacityProviderStrategy: $capacityProviders
                    }
                }
            }]
        } + (if ($hooks | length) > 0 then {Hooks: $hooks} else {} end)')
    
    if [ "$DRY_RUN" = true ]; then
        log_info "DRY RUN: Would create CodeDeploy deployment:"
        log_info "  Application: ${CLUSTER_NAME}-${APP_SERVICE_NAME}"
        log_info "  Deployment Group: ${CLUSTER_NAME}-${APP_SERVICE_NAME}"
        log_info "  AppSpec:"
        echo "$appspec" | jq '.'
        return 0
    fi
    
    log_info "Creating CodeDeploy deployment..."
    log_info "AppSpec: $(echo "$appspec" | jq -c '.')"
    
    local deployment=$(aws deploy create-deployment \
        --region "$APP_REGION" \
        --application-name "${CLUSTER_NAME}-${APP_SERVICE_NAME}" \
        --deployment-config-name "CodeDeployDefault.ECSAllAtOnce" \
        --deployment-group-name "${CLUSTER_NAME}-${APP_SERVICE_NAME}" \
        --description "Deployment via bobctl" \
        --revision "{\"revisionType\":\"AppSpecContent\",\"appSpecContent\":{\"content\":$(echo "$appspec" | jq -c '@json')}}" \
        --auto-rollback-configuration "enabled=true,events=DEPLOYMENT_FAILURE" \
        --output json 2>&1)
    
    if [ $? -ne 0 ]; then
        log_error "Failed to create CodeDeploy deployment:"
        echo "$deployment" >&2
        exit 1
    fi
    
    local deployment_id=$(echo "$deployment" | jq -r '.deploymentId')
    
    log_success "Deployment created: $deployment_id"
    log_info "Console: https://${APP_REGION}.console.aws.amazon.com/codesuite/codedeploy/deployments/${deployment_id}"
    
    # Monitor deployment
    monitor_codedeploy_deployment "$deployment_id"
}

# Function to monitor CodeDeploy deployment
monitor_codedeploy_deployment() {
    local deployment_id=$1
    local elapsed=0
    
    log_info "Monitoring deployment progress..."
    
    while true; do
        local deployment_info=$(aws deploy get-deployment \
            --region "$APP_REGION" \
            --deployment-id "$deployment_id" \
            --output json)
        
        local status=$(echo "$deployment_info" | jq -r '.deploymentInfo.status')
        
        case "$status" in
            "Succeeded")
                log_success "Deployment succeeded!"
                return 0
                ;;
            "Failed"|"Stopped")
                log_error "Deployment failed with status: $status"
                echo "$deployment_info" | jq '.deploymentInfo' >&2
                
                # Try to get logs from failed container
                if [ -n "$LAST_TASK_ID" ]; then
                    get_failed_container_logs "$LAST_TASK_ID"
                fi
                exit 1
                ;;
            "InProgress"|"Created"|"Ready")
                print_ecs_events
                ;;
        esac
        
        elapsed=$((elapsed + 5))
        
        if [ $elapsed -gt $TIMEOUT ]; then
            stop_deployment_with_logs "$deployment_id"
        fi
        
        sleep 5
    done
}

# Function to monitor regular ECS deployment
monitor_deployment() {
    log_info "Monitoring service deployment..."
    
    local elapsed=0
    
    while [ $elapsed -lt $TIMEOUT ]; do
        print_ecs_events
        
        local service_info=$(aws ecs describe-services \
            --region "$APP_REGION" \
            --cluster "$CLUSTER_NAME" \
            --services "$APP_SERVICE_NAME" \
            --output json)
        
        local running_count=$(echo "$service_info" | jq -r '.services[0].runningCount')
        local desired_count=$(echo "$service_info" | jq -r '.services[0].desiredCount')
        local deployments=$(echo "$service_info" | jq -r '.services[0].deployments | length')
        
        if [ "$running_count" = "$desired_count" ] && [ "$deployments" = "1" ]; then
            log_success "Deployment completed successfully!"
            return 0
        fi
        
        elapsed=$((elapsed + 5))
        sleep 5
    done
    
    log_error "Deployment timeout after ${TIMEOUT} seconds"
    exit 1
}

# Function to extract task ID from service events
extract_task_id_from_events() {
    local service_info=$(aws ecs describe-services \
        --region "$APP_REGION" \
        --cluster "$CLUSTER_NAME" \
        --services "$APP_SERVICE_NAME" \
        --output json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        # Look for "has started 1 tasks" messages
        local task_messages=$(echo "$service_info" | jq -r '.services[0].events[] | select(.message | contains("has started 1 tasks")) | .message' 2>/dev/null | head -2)
        
        if [ -n "$task_messages" ]; then
            # Extract task ID from the second occurrence (most recent started task)
            local task_id=$(echo "$task_messages" | grep -oP 'task \K[a-f0-9-]+' | head -1)
            if [ -n "$task_id" ]; then
                LAST_TASK_ID="$task_id"
            fi
        fi
    fi
}

# Function to print ECS service events
print_ecs_events() {
    local service_info=$(aws ecs describe-services \
        --region "$APP_REGION" \
        --cluster "$CLUSTER_NAME" \
        --services "$APP_SERVICE_NAME" \
        --output json 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        local latest_event=$(echo "$service_info" | jq -r '.services[0].events[0] | "\(.createdAt) => \(.message)"' 2>/dev/null)
        local event_id=$(echo "$service_info" | jq -r '.services[0].events[0].id' 2>/dev/null)
        
        if [ -n "$latest_event" ] && [ "$latest_event" != "null" ] && [ "$event_id" != "$LAST_EVENT_ID" ]; then
            log_event "$latest_event"
            LAST_EVENT_ID="$event_id"
            extract_task_id_from_events
        fi
    fi
}

# Function to stop deployment and get logs
stop_deployment_with_logs() {
    local deployment_id=$1
    
    log_error "Stopping deployment due to timeout..."
    
    aws deploy stop-deployment \
        --region "$APP_REGION" \
        --deployment-id "$deployment_id" \
        --auto-rollback-enabled \
        >/dev/null 2>&1
    
    log_error "Deployment stopped"
    
    # Wait a bit for task to be updated
    sleep 10
    
    # Try to get task details and reason for failure
    if [ -n "$LAST_TASK_ID" ]; then
        local task_arn="arn:aws:ecs:${APP_REGION}:${APP_ACCOUNT}:task/${CLUSTER_NAME}/${LAST_TASK_ID}"
        local task_details=$(aws ecs describe-tasks \
            --region "$APP_REGION" \
            --cluster "$CLUSTER_NAME" \
            --tasks "$task_arn" \
            --output json 2>/dev/null)
        
        if [ $? -eq 0 ]; then
            local stopped_reason=$(echo "$task_details" | jq -r '.tasks[0].containers[0].reason // "No reason available"' 2>/dev/null)
            log_error "Stopped Reason: $stopped_reason"
        fi
        
        # Get CloudWatch logs
        get_failed_container_logs "$LAST_TASK_ID"
    fi
    
    exit 1
}

# Main deployment function
deploy() {
    log_info "Starting deployment..."
    log_info "Deploy type: $DEPLOY_TYPE"
    
    # Run security scan if enabled
    if [ "$ENABLE_SCAN" = true ]; then
        log_info "Security scan enabled, scanning image before deployment..."
        if ! scan_image; then
            log_error "Security scan failed. Aborting deployment."
            exit 1
        fi
        echo ""
    fi
    
    # Register task definition
    local task_arn=$(register_task_definition)
    
    if [ "$DISABLE_DEPLOY" = true ]; then
        log_info "Deployment disabled. Task definition registered only."
        return 0
    fi
    
    # Deploy based on type
    case "$DEPLOY_TYPE" in
        "worker")
            deploy_worker "$task_arn"
            ;;
        "loadbalancer")
            deploy_with_loadbalancer "$task_arn"
            ;;
        "codedeploy")
            deploy_with_codedeploy "$task_arn"
            ;;
        *)
            log_error "Unknown deploy type: $DEPLOY_TYPE"
            exit 1
            ;;
    esac
    
    log_success "Deployment process completed!"
}

# Parse command line arguments
parse_args() {
    if [ $# -eq 0 ]; then
        show_usage
        exit 0
    fi
    
    local command=$1
    shift
    
    case "$command" in
        "deploy")
            ;;
        "register-task")
            DISABLE_DEPLOY=true
            ;;
        "scan")
            ENABLE_SCAN=true
            DISABLE_DEPLOY=true
            ;;
        "help"|"-h"|"--help")
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown command: $command"
            show_usage
            exit 1
            ;;
    esac
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            -n|--name)
                APP_NAME="$2"
                shift 2
                ;;
            -t|--tag)
                TAG="$2"
                shift 2
                ;;
            -e|--env)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -d|--deploy-type)
                DEPLOY_TYPE="$2"
                shift 2
                ;;
            -f|--fargate)
                FARGATE=true
                shift
                ;;
            -a|--assume-role)
                ASSUME_ROLE=true
                shift
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --disable-deploy)
                DISABLE_DEPLOY=true
                shift
                ;;
            --timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            --add-xray)
                ADD_XRAY_DAEMON=true
                shift
                ;;
            --scan)
                ENABLE_SCAN=true
                shift
                ;;
            --scan-severity)
                SCAN_SEVERITY="$2"
                shift 2
                ;;
            --scan-fail-on)
                SCAN_FAIL_ON="$2"
                shift 2
                ;;
            --scan-format)
                SCAN_FORMAT="$2"
                shift 2
                ;;
            -h|--help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Validate required arguments
    if [ -z "$APP_NAME" ]; then
        log_error "Application name is required (-n|--name)"
        exit 1
    fi
    
    if [ -z "$TAG" ]; then
        log_error "Image tag is required (-t|--tag)"
        exit 1
    fi
    
    # Validate deploy type (skip if scan-only mode)
    if ! ([ "$ENABLE_SCAN" = true ] && [ "$DISABLE_DEPLOY" = true ]); then
        case "$DEPLOY_TYPE" in
            "codedeploy"|"loadbalancer"|"worker")
                ;;
            *)
                log_error "Invalid deploy type: $DEPLOY_TYPE"
                log_error "Valid options: codedeploy, loadbalancer, worker"
                exit 1
                ;;
        esac
    fi
    
    # Validate scan severity
    if [ "$ENABLE_SCAN" = true ]; then
        case "$SCAN_FAIL_ON" in
            "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"NONE")
                ;;
            *)
                log_error "Invalid scan fail-on level: $SCAN_FAIL_ON"
                log_error "Valid options: CRITICAL, HIGH, MEDIUM, LOW, NONE"
                exit 1
                ;;
        esac
    fi
}

# Main function
main() {
    log_info "BOBCTL - ECS Deployment CLI"
    log_info "=============================="
    
    parse_args "$@"
    check_dependencies
    load_config
    
    if [ "$ASSUME_ROLE" = true ]; then
        assume_iam_role
    fi
    
    # If scan-only mode (command was "scan")
    if [ "$ENABLE_SCAN" = true ] && [ "$DISABLE_DEPLOY" = true ]; then
        scan_image
        if [ $? -eq 0 ]; then
            log_success "All operations completed successfully!"
            exit 0
        else
            exit 1
        fi
    fi
    
    # Regular deploy flow
    deploy
    
    log_success "All operations completed successfully!"
}

# Run main function
main "$@"
