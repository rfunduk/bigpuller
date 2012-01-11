# BigPuller

## What?

[What?](https://github.com/rfunduk/bigpuller/blob/master/views/what.jade)

## How?

First set up the app dependencies and such:

    npm bundle
    cp sample.config.json config.json

Edit `config.json` with relevant bits. You'll need a
[GitHub Application](https://github.com/account/applications) and
[MongoDB](http://mongodb.org) running somewhere accessible.

The GitHub app will ask you for a url, this can be whatever your
local instance will be server at (and can be local only). It will
also ask for a callback url, this should be the same, but with this
path: `/auth/confirm`

Then:

    npm run dev

## And?

BigPuller is intended to be deployed on [duostack](http://www.duostack.com), so
the production config is lifted from it's environment variables and stuff. See
their [docs](http://docs.duostack.com/node/introduction) for more if you're curious.
