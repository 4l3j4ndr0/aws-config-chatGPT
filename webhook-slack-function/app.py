import urllib.parse
import json
import subprocess
import boto3
import os


def lambda_handler(event, context):
    print("EVENT::::", event)
    body = event["body"].replace("payload=", "")
    body = urllib.parse.unquote(body)
    body = json.loads(body)
    print("BODY:::", body)
    action = body["actions"][0]["name"]
    textResponse = "The command was queued to apply, I'll send you a message with the status."
    statusCode = 200
    if action == "apply_aws_command":
        command = body["actions"][0]["value"].replace("+", " ")
        print("COMMAND:::", command)
        cmd = '/opt/awscli/' + command.strip()
        try:
            sqs = boto3.client('sqs')
            queue_url = os.environ.get('QUEUE_URL')
            response = sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=json.dumps(cmd)
            )
            print("RESPONSE", response)
        except Exception as e:
            print("An error occurred:", e)
    elif action == "ignore":
        textResponse = "The alert was ignored, I'll continue monitoring."

    return {
        'statusCode': statusCode,
        'body': textResponse
    }
