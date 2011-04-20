# BigPuller

## What?

http://http://www.bigpuller.com/what

## How?

First set up the app dependencies and such:

    npm bundle
    cp sample.config.json config.json

Edit `config.json` with relevant bits. You'll need a
[GitHub Application](https://github.com/account/applications) and
[MongoDB](http://mongodb.org) running somewhere accessible.

Then:

    npm run dev

## And?

BigPuller is intended to be deployed on [duostack](http://www.duostack.com), so
the production config is lifted from it's environment variables and stuff. See
their [docs](http://docs.duostack.com/node/introduction) for more if you're curious.
