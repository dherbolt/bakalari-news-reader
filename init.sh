#!/bin/bash
nodeVer = node-v7.8.0-linux-armv7l;
tar -xf $nodeVer.tar.gz
mv $nodeVer nodejs
chmod 755 ./nodejs/bin/node
chmod 755 ./nodejs/bin/npm

./nodejs/bin/npm install