#!/bin/zsh
cd "$(dirname "$0")" || exit
if [ ! -d node_modules ]; then npm install; fi
npm run dev
