const aws = require('aws-sdk');

async function CreateAutosacelECSService(scaleConfig,cluster,app) {
    const autoscale = await new aws.ApplicationAutoScaling();

    let targetAutoscale;

    if(!scaleConfig.PolicyType)
        scaleConfig.PolicyType = 'TargetTrackingScaling';

    if (!scaleConfig.metricSpecification)
        metricSpecification = 'predefinedMetricSpecification'

   const existsScables = await autoscale.describeScalableTargets({
        ResourceId: '',
        ServiceNamespace: '',
        ScalableDimension: 'ecs:service:DesiredCount',
    }).promise();

    if(existsScables.ScalableTargets.length === 0) {
        targetAutoscale = autoscale.registerScalableTarget({
            ResourceId: '',
            ServiceNamespace: '',
            ScalableDimension: 'ecs:service:DesiredCount',
            MinCapacity: 1,
            MaxCapacity: 1
        });
    } else {
        targetAutoscale =  existsScables.ScalableTargets[0];
    }

    const scaleType = await autoscale.putScalingPolicy({
        PolicyName: '',
        PolicyType: '',
        ResourceId: targetAutoscale.ResourceId,
        ScalableDimension: targetAutoscale.ScalableDimension,
        ServiceNamespace: targetAutoscale.ServiceNamespace,
        ...((scaleConfig.PolicyType === 'TargetTrackingScaling') && {
            TargetTrackingScalingPolicyConfiguration: {
                TargetValue: '',
                DisableScaleIn: false,
                ScaleInCooldown: 300,
                ScaleOutCooldown: 300,
                ...((scaleConfig.metricSpecification === 'predefinedMetricSpecification') && {
                    PredefinedMetricSpecification: {
                        PredefinedMetricType: scaleConfig.predefinedMetricType
                    }
                })
            }
        }) 
        
    });


}