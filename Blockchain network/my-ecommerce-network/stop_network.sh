#!/bin/bash
echo "Đang dừng hệ thống..."
docker-compose -f compose/compose-test-net.yaml -f compose/compose-couch.yaml -f compose/compose-ca.yaml -f compose/compose-support.yaml stop
