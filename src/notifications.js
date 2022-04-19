const axios = require('axios').default;
const yenv = require('yenv');
const colorOK = '#66bb6a';
const colorNOK = '#ef5350';
const icons = {
    ECS: 'https://github.com/awslabs/aws-icons-for-plantuml/raw/main/dist/Containers/ElasticContainerService.png?raw=true',
    LAMBDA: 'https://github.com/awslabs/aws-icons-for-plantuml/raw/main/dist/Compute/Lambda.png?raw=true',
    CLOUDFRONT: 'https://github.com/awslabs/aws-icons-for-plantuml/raw/main/dist/NetworkingContentDelivery/CloudFront.png?raw=true'
}

async function SendMessageTeams(app, appName, type, status, message) {

    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const WEBHOOK_TEAMS = APP.WEBHOOK_TEAMS;
    const account = APP.APP_ACCOUNT;

    const card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": `${status === 'OK' ? colorOK : colorNOK}`,
        "summary": "Pipeline Notification",
        "sections": [
            {
                "activityTitle": 'Pipeline Notification',
                "activitySubtitle": status === 'OK' ? '<strong style="color:green;">Successfully</strong>' : '<strong style="color:red;">Failed</strong>',
                "activityImage": icons[type],
                "facts": [
                    {
                        name: 'Account',
                        value: account
                    },                    
                {
                    name: 'Application',
                    value: appName
                },
                {
                    name: 'Aditional inforamtion',
                    value: status === 'OK' ? `successfully deployed in ${type}` : message
                }
                ],
                "markdown": true
            }
        ]
    };

    try {
        const response = await axios.post(WEBHOOK_TEAMS, card, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Erro:', error)
    }
}

async function SendMessageGoogle(app, appName, type, status, message) {

    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const WEBHOOK_GOOGLE = APP.WEBHOOK_GOOGLE;
    const account = APP.APP_ACCOUNT;

    const card = {
        "cards": [
            {
                header: {
                    title: 'Pipeline Notification',
                    imageUrl: icons[type]
                  },   
                  sections: [
                    {
                      widgets: [
                          {
                            keyValue: {
                                content: status === 'OK' ? 'Successfully' : 'Failed',
                                iconUrl: status === 'OK' ? 'https://github.githubassets.com/images/icons/emoji/unicode/1f49a.png': 'https://github.githubassets.com/images/icons/emoji/unicode/1f494.png',
                            }
                          },
                      {
                        textParagraph: {
                            text: `<font color="#9aa0a6">Account</font><br>${account}<br><font color="#9aa0a6">Application</font><br>${appName}<br><font color="#9aa0a6">Aditional inforamtion</font><br>${status === 'OK' ? `successfully deployed in ${type}` : message}`
                          }
                      }
                      ]
                    }
                  ]                               
            }
        ]
      };

      try {
        const response = await axios.post(WEBHOOK_GOOGLE, card, {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        console.error('Erro:', error)
      }

}

async function SendMessageSlack(app, appName, type, status, message) {
    const env = yenv('oni.yaml', process.env.NODE_ENV)
    const APP = env[app];
    const WEBHOOK_SLACK = APP.WEBHOOK_SLACK;
    const account = APP.APP_ACCOUNT;

    const card = {
        mrkdwn_in: ["text","pretext"],
        text: '*Pipeline Notificaion*',
        attachments: [
          {
            pretext: status === 'OK' ? ':green_heart: Successfully' : ':broken_heart: Failed',
            thumb_url: icons[type],
            color: status === 'OK' ? colorOK : colorNOK,
            fields: [
              { title: 'Account', value: account, short: true },
              { title: 'Application', value: appName, short: false },
              {
                title: 'Aditional inforamtion',
                value: status === 'OK' ? `successfully deployed in ${type}` : message,
                short: false
              }
            ]
          }
        ]
      }

      try {
        const response = await axios.post(WEBHOOK_SLACK, card, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Erro:', error)
    }


}

async function SendMessage(app, appName, type, status, message, channel) {
  switch (channel) {
      case 'google':
        await SendMessageGoogle(app, appName, type, status, message);
      break;
      case 'teams':
        await SendMessageTeams(app, appName, type, status, message);
      break;
      case 'slack':
        await SendMessageSlack(app, appName, type, status, message);
      break;      
  }
}

module.exports = {
    SendMessage
}

