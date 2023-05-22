#!/bin/bash

zip -r archive.zip ./bin
zip -r archive.zip ./lib
zip -r archive.zip ./test
zip -r archive.zip ./.git
zip -r archive.zip ./README.md
zip -r archive.zip ./cdk.context.json
zip -r archive.zip ./cdk.json
zip -r archive.zip ./gen_archive.sh
zip -r archive.zip ./jest.config.js
zip -r archive.zip ./package.json
zip -r archive.zip ./package-lock.json
zip -r archive.zip ./tsconfig.json
zip -r archive.zip ./.gitignore
zip -r archive.zip ./.npmignore
