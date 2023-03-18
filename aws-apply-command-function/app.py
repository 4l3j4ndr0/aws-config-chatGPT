import json
import subprocess
import os
import requests


def sendSlackMessage(message):
    payload = {
        "channel": os.environ['SLACK_CHANNEL'],
        "text": message
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {os.environ['SLACK_BOT_TOKEN']}",
    }

    try:
        response = requests.post(
            "https://slack.com/api/chat.postMessage", json=payload, headers=headers)
        response.raise_for_status()
    except requests.exceptions.HTTPError as err:
        print(f"Error sending Slack message: {err}")


def lambda_handler(event, context):
    print("EVENT::::", event)
    for record in event["Records"]:
        body = json.loads(record['body'])
        print("BODY", body)
        process = subprocess.Popen(body, shell=True, stdout=subprocess.PIPE)
        return_code = process.wait()
        print("CODE:::", return_code)
        if return_code == 0:
            sendSlackMessage("The command was applied success: " + body)
        else:
            sendSlackMessage("Error trying to apply the command: " + body)
