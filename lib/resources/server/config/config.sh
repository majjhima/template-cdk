#!/bin/bash -xe
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/etc/amazon-cloudwatch-agent.json
