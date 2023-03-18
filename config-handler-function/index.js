const AWS = require("aws-sdk");
const { Configuration, OpenAIApi } = require("openai");
const cloudTrail = new AWS.CloudTrail();
const axios = require("axios");
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_CHANNEL = process.env.SLACK_CHANNEL;
let slackMessage = "";
let initialMessage = "";
let slackCallback = {};
exports.handler = async (event) => {
  console.log("EVENT:::::", JSON.stringify(event));

  for (let i = 0; i < event.Records.length; i++) {
    const record = event.Records[i];
    const body = JSON.parse(record.Sns.Message);
    const complianceType = body.newEvaluationResult
      ? body.newEvaluationResult.complianceType
      : null;

    if (complianceType == "NON_COMPLIANT") {
      const resourceType =
        body.newEvaluationResult.evaluationResultIdentifier
          .evaluationResultQualifier.resourceType;
      const resourceName =
        body.newEvaluationResult.evaluationResultIdentifier
          .evaluationResultQualifier.resourceId;

      initialMessage += `AWS Config has detected NOT COMPLIANT Rule at ${body.newEvaluationResult.resultRecordedTime}\nRULE NAME: ${body.configRuleName}\nRESOURCE: ${resourceType} - ${resourceName}\n`;
      slackCallback["AwsConfig"] = body;
      const params = {
        LookupAttributes: [
          {
            AttributeKey: "ResourceType",
            AttributeValue: resourceType,
          },
          {
            AttributeKey: "ResourceName",
            AttributeValue: resourceName,
          },
        ],
        StartTime: new Date(Date.now() - 5 * 60 * 1000),
        EndTime: new Date(),
      };
      try {
        let events = await cloudTrail.lookupEvents(params).promise();
        await proccessCloudTrailEvents(events.Events);
      } catch (err) {
        console.error(err);
      }
    }
  }

  return {
    statusCode: 200,
    body: "Success.",
  };
};

function getChatGptText(event) {
  return `Explain the following not compliant AWS Config Rule with the following cloudtrail event issue: "${event}" and get me the suggested AWS CLI command to solve it: 
    Get me answer in the following format: CloudTrail Event: "Here A good explain of the issue"
    and in the last line get me only the Suggested command: "Here the AWS CLI command"`;
}

async function proccessCloudTrailEvents(events) {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    slackMessage = "";
    slackMessage = initialMessage;
    // slackMessage += `REAL EVENT: ${event.CloudTrailEvent}\n`;
    slackCallback["CloudTrailEvent"] = event;
    const response = await chatGptRequest(
      getChatGptText(event.CloudTrailEvent),
    );
    slackCallback["ChatGpt"] = response;
    await sendSlackMessage(response);
  }
}

async function chatGptRequest(text) {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: text,
    temperature: 0.7,
    max_tokens: 1022,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
  });

  return response.data.choices[0].text;
}

function getAwsCommand(text) {
  let command = text.split("nd:");
  return command[1].endsWith(".") ? command[1].slice(0, -1) : command[1];
}

async function sendSlackMessage(message) {
  const awsCommand = getAwsCommand(slackCallback.ChatGpt);
  const payload = {
    channel: SLACK_CHANNEL,
    text: (slackMessage += message),
    attachments: [
      {
        fallback: "Button not supported",
        callback_id: "button_callback",
        actions: [
          {
            type: "button",
            text: "Apply suggested solution",
            name: "apply_aws_command",
            value: awsCommand.trim(),
          },
          {
            type: "button",
            text: "Ignore it",
            name: "ignore",
            value: null,
          },
        ],
      },
    ],
    response_url: `${process.env.WEBHOOK_SLACK}/webhook`,
  };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
  };

  try {
    await axios.post(`https://slack.com/api/chat.postMessage`, payload, {
      headers,
    });
  } catch (error) {
    console.error(`Error sending Slack message: ${error.message}`);
  }
}
