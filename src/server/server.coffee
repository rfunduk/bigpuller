sys = require 'sys'
fs = require 'fs'
_ = require('underscore')._
express = require 'express'
sessions = require 'cookie-sessions'
mongoose = require 'mongoose'
github = require 'github'
connect = require 'connect'
oauth = require 'oauth'
Seq = require 'seq'

require 'colors'

require process.env.PWD + '/lib/core_ext'

process.env.NODE_ENV = process.env.NODE_ENV || 'development'

config = try
  JSON.parse( fs.readFileSync( './config.json' ) )
catch e
  if process.env.NODE_ENV == 'development'
    console.log "Must have config.json for dev mode"
    throw e

unless config
  config =
    PORT: 3001
    DB: process.env.DUOSTACK_DB_MONGODB
    SESSION_SECRET: process.env.SESSION_SECRET,
    ANALYTICS_ID: process.env.ANALYTICS_ID
    KEYS:
      client: process.env.GITHUB_CLIENT
      secret: process.env.GITHUB_SECRET

# MONGODB
mongoose.connect( config.DB )

UserSchema = new mongoose.Schema
  github_id: Number
  login: String
  email: String
  name: String
  token: String
  gravatar: String
  repos:
    owned: Array
    watched: Array
  timestamp:
    type: Date
    default: Date.now
mongoose.model 'User', UserSchema
User = mongoose.model 'User'

# GITHUB
GitHub =
  Api: new github.GitHubApi#(true)#debug
  CLIENT: config.KEYS.client
  SECRET: config.KEYS.secret
GitHub.OAuth = new oauth.OAuth2(
  GitHub.CLIENT, GitHub.SECRET,
  'https://github.com',
  '/login/oauth/authorize',
  '/login/oauth/access_token'
)

repoLookup = ( user, repo, cb ) ->
  Seq()
    .seq( ->
      GitHub.Api.getRepoApi().show( user, repo, this )
    )
    .par( ( repo ) -> this( null, repo ) )
    .par( ( repo ) ->
      GitHub.Api.getRepoApi().getRepoContributors( repo.owner, repo.name, true, this )
    )
    .par( ( repo ) ->
      that = this;
      GitHub.Api.getRepoApi().getRepoBranches( repo.owner, repo.name, ( e1, b ) ->
        if e1
          that( e1, b )
          return

        GitHub.Api.getObjectApi().listBlobs( repo.owner, repo.name, b.master, ( e2, files ) ->
          if e2
            that( e2, files )
            return

          readme = _(files).chain().keys().detect( ( k ) -> return k.match( /CONTRIBUTE/ ) ).value()
          if readme
            GitHub.Api.getObjectApi().showBlob( repo.owner, repo.name, b.master, readme, that )
          else
            that( null, null )
        )
      )
    )
    .seq( cb )

pullRequestsLookup = ( user, repo, cb ) ->
  GitHub.Api.getPullApi().getList user, repo, ( err, open ) ->
    return cb( err, null ) if err
    GitHub.Api.getPullApi().getList user, repo, 'closed', ( err, closed ) ->
      return cb( err, null ) if err
      today = new Date()
      cb( err, _(open.concat( closed )).map( ( pull ) ->
        pull.created_at = new Date( pull.created_at ) if pull.created_at
        pull.updated_at = new Date( pull.updated_at ) if pull.updated_at
        pull.closed_at = new Date( pull.closed_at ) if pull.closed_at
        pull.merged_at = new Date( pull.merged_at ) if pull.merged_at
        if pull.created_at
          pull.delay = pull.created_at.dayDiff( pull.merged_at || pull.closed_at || today )
        return pull
      ) )

getUser = ( opts, cb ) ->
  User.findOne opts, cb

_fmt = ( kind, rest... ) ->
  colors =
    DEBUG: 'grey'
    INFO: 'blue'
    ERROR: 'red'
    WARN: 'yellow'
  kind = kind.toUpperCase()
  "[" + kind[colors[kind]].toString() + (' ' for i in new Array(5 - kind.length)).join('') + "] "

HELPERS =
  _: _
  config: config,
  log:
    debug: () -> console.log( _fmt( 'debug' ), arguments... )
    info: () -> console.log( _fmt( 'info' ), arguments... )
    error: () -> console.log( _fmt( 'error' ), arguments... )
    warn: () -> console.log( _fmt( 'warn' ), arguments... )
  formatPrDays: ( days ) ->
    return "n/a" if isNaN(days)
    days.toFixed(1)
  formatDate: ( date ) ->
    if typeof date == 'string'
      date = new Date( date )
    months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
               'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ]
    [ months[date.getMonth()], date.getDate(), date.getFullYear() ].join(' ')

log = HELPERS.log # for convenience

render = ( req, res, view, opts ) ->
  opts = opts || {}
  opts.user = req.user
  opts.home = false unless opts.home
  opts.h = HELPERS
  opts.config = config
  res.render view, opts

app = express.createServer(
  connect.logger(
    format: _fmt( 'info' ) + " :method :url :status"
  ),
  connect.compiler(
    src: 'src/client'
    dest: 'public'
    enable: [ 'less', 'coffeescript' ]
  ),
  connect.static('public'),
  connect.cookieParser(),
  connect.bodyParser(),
  connect.favicon( __dirname + '/public/favicon.ico' ),
  sessions(
    secret: config.SESSION_SECRET
    session_key: '_bp'
  ),
  ( req, res, next ) ->
    if req.originalUrl.match /^\/auth/
      log.debug "SKIP GET USER"
      next()
      return
    log.debug "GET USER"

    req.session = {} unless req.session
    if req.session.user_id
      getUser _id: req.session.user_id, ( err, doc ) ->
        log.debug "LOGGED IN AS #{doc.id}"
        req.user = doc
        next()
    else
      log.debug "NO USER"
      next()
)
app.set 'view engine', 'jade'


app.get '/', (req, res) ->
  render req, res, 'index', home: true

app.get '/what', (req, res) ->
  render req, res, 'what'

app.get '/me', (req, res) ->
  render req, res, 'user', layout: false


app.get '/repo/search', (req, res) ->
  GitHub.Api.getRepoApi().search req.query.query, ( err, results ) ->
    render req, res, 'search', query: req.query.query, results: results

app.get '/repo/show', (req, res) ->
  res.redirect '/repo/' + req.query.user + '/' + req.query.repo

app.get '/repo/:user/:repository', (req, res) ->
  this.params = req.params
  repoLookup @params.user, @params.repository, ( repo, contributors, documentation ) ->
    render req, res, 'repo',
      repo: repo
      contributors: contributors,
      documentation: documentation

app.get '/repo/:user/:repository/pull_requests', (req, res) ->
  this.params = req.params
  pullRequestsLookup @params.user, @params.repository, ( err, prs ) ->
    prs = prs || []
    all_pulls = _(prs).chain()
    open_pulls = all_pulls.reject( (pr) -> return pr.state == 'open' )
    active_pulls = open_pulls.reject( (pr) -> return pr.delay > 30 )
    render req, res, 'pull_requests',
      prs: prs
      average:
        all: Math.average( all_pulls.pluck('delay').value() )
        active: Math.average( active_pulls.pluck('delay').value() )
        completed: Math.average( open_pulls.pluck('delay').value() )
      layout: false


############################
## AUTH
############################

app.get '/auth/logout', (req, res) ->
  req.session.user_id = null
  res.redirect '/'

app.get '/auth/login', (req, res) ->
  res.redirect( GitHub.OAuth.getAuthorizeUrl( redirect_uri: "http://" + req.headers.host + '/auth/confirm' ) )

app.get '/auth/confirm', (req, res) ->
  GitHub.OAuth.getOAuthAccessToken( req.query.code, null, ( oAuthError, access_token, r ) ->
    if oAuthError
      render req, res, 'error', error: oAuthError
      return

    GitHub.Api.authenticateOAuth( access_token )

    GitHub.Api.getUserApi().show ( userError, userData ) ->
      log.info( "USER:", userData )
      if userError
        render req, res, 'error', error: userError
        return

      done = ( user ) ->
        req.session.user_id = user.id
        # lookup the users repos and watched repos
        GitHub.Api.getRepoApi().getUserRepos user.login, ( err, udocs ) ->
          user.repos.owned = _(!err && udocs || []).chain()
            .map( ( doc ) -> doc.owner + '/' + doc.name )
            .value()

          GitHub.Api.getUserApi().getWatchedRepos user.login, ( err, wdocs ) ->
            log.info( 'owned repos is already:', user.repos.owned )
            user.repos.watched = _(!err && wdocs || []).chain()
              .map( ( doc ) -> doc.owner + '/' + doc.name )
              .without( user.repos.owned... )
              .value()
            log.info( 'and heres watched:', user.repos.watched, 'and now _([1,2,3,4]).without( [3,4]... ):', (() -> x = [3,4];_([1,2,3,4]).without( x... ))() )

            user.save ( err ) ->
              log.info( "logged in", user, "err:", err )
              res.redirect '/'

      getUser login: userData.login, ( docErr, doc ) ->
        log.info( "USER:", doc )
        if doc
          log.info("User #{doc.id} already exists.")
          done( doc )
        else
          log.info("No such user - #{userData.login}... creating...")
          user = new User()
          user.github_id = userData.id
          user.name = userData.name
          user.gravatar = userData.gravatar_id
          user.login = userData.login
          user.email = userData.email
          user.token = access_token
          user.save ( docError ) ->
            if docError
              log.error( "ERROR:", docError )
              render req, res, 'error', error: docError
              return
            done( user )
  )

app.listen config.PORT

app.error (err) ->
  log.error( err )