(function() {
  var GitHub, HELPERS, Seq, User, UserSchema, app, config, connect, express, fs, getUser, github, log, mongoose, oauth, pullRequestsLookup, render, repoLookup, sessions, sys, _, _fmt;
  var __slice = Array.prototype.slice;
  sys = require('sys');
  fs = require('fs');
  _ = require('underscore')._;
  express = require('express');
  sessions = require('cookie-sessions');
  mongoose = require('mongoose');
  github = require('github');
  connect = require('connect');
  oauth = require('oauth');
  Seq = require('seq');
  require('colors');
  require(process.env.PWD + '/lib/core_ext');
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  config = (function() {
    try {
      return JSON.parse(fs.readFileSync('./config.json'));
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.log("Must have config.json for dev mode");
        throw e;
      }
    }
  })();
  if (!config) {
    config = {
      PORT: 3001,
      DB: process.env.DUOSTACK_DB_MONGODB,
      SESSION_SECRET: process.env.SESSION_SECRET,
      ANALYTICS_ID: process.env.ANALYTICS_ID,
      KEYS: {
        client: process.env.GITHUB_CLIENT,
        secret: process.env.GITHUB_SECRET
      }
    };
  }
  mongoose.connect(config.DB);
  UserSchema = new mongoose.Schema({
    github_id: Number,
    login: String,
    email: String,
    name: String,
    token: String,
    gravatar: String,
    repos: {
      owned: Array,
      watched: Array
    },
    timestamp: {
      type: Date,
      "default": Date.now
    }
  });
  mongoose.model('User', UserSchema);
  User = mongoose.model('User');
  GitHub = {
    Api: new github.GitHubApi,
    CLIENT: config.KEYS.client,
    SECRET: config.KEYS.secret
  };
  GitHub.OAuth = new oauth.OAuth2(GitHub.CLIENT, GitHub.SECRET, 'https://github.com', '/login/oauth/authorize', '/login/oauth/access_token');
  repoLookup = function(user, repo, cb) {
    return Seq().seq(function() {
      return GitHub.Api.getRepoApi().show(user, repo, this);
    }).par(function(repo) {
      return this(null, repo);
    }).par(function(repo) {
      return GitHub.Api.getRepoApi().getRepoContributors(repo.owner, repo.name, true, this);
    }).par(function(repo) {
      var that;
      that = this;
      return GitHub.Api.getRepoApi().getRepoBranches(repo.owner, repo.name, function(e1, b) {
        if (e1) {
          that(e1, b);
          return;
        }
        return GitHub.Api.getObjectApi().listBlobs(repo.owner, repo.name, b.master, function(e2, files) {
          var readme;
          if (e2) {
            that(e2, files);
            return;
          }
          readme = _(files).chain().keys().detect(function(k) {
            return k.match(/CONTRIBUTE/);
          }).value();
          if (readme) {
            return GitHub.Api.getObjectApi().showBlob(repo.owner, repo.name, b.master, readme, that);
          } else {
            return that(null, null);
          }
        });
      });
    }).seq(cb);
  };
  pullRequestsLookup = function(user, repo, cb) {
    return GitHub.Api.getPullApi().getList(user, repo, function(err, open) {
      if (err) {
        return cb(err, null);
      }
      return GitHub.Api.getPullApi().getList(user, repo, 'closed', function(err, closed) {
        var today;
        if (err) {
          return cb(err, null);
        }
        today = new Date();
        return cb(err, _(open.concat(closed)).map(function(pull) {
          if (pull.created_at) {
            pull.created_at = new Date(pull.created_at);
          }
          if (pull.updated_at) {
            pull.updated_at = new Date(pull.updated_at);
          }
          if (pull.closed_at) {
            pull.closed_at = new Date(pull.closed_at);
          }
          if (pull.merged_at) {
            pull.merged_at = new Date(pull.merged_at);
          }
          if (pull.created_at) {
            pull.delay = pull.created_at.dayDiff(pull.merged_at || pull.closed_at || today);
          }
          return pull;
        }));
      });
    });
  };
  getUser = function(opts, cb) {
    return User.findOne(opts, cb);
  };
  _fmt = function() {
    var colors, i, kind, rest;
    kind = arguments[0], rest = 2 <= arguments.length ? __slice.call(arguments, 1) : [];
    colors = {
      DEBUG: 'grey',
      INFO: 'blue',
      ERROR: 'red',
      WARN: 'yellow'
    };
    kind = kind.toUpperCase();
    return "[" + kind[colors[kind]].toString() + ((function() {
      var _i, _len, _ref, _results;
      _ref = new Array(5 - kind.length);
      _results = [];
      for (_i = 0, _len = _ref.length; _i < _len; _i++) {
        i = _ref[_i];
        _results.push(' ');
      }
      return _results;
    })()).join('') + "] ";
  };
  HELPERS = {
    _: _,
    config: config,
    log: {
      debug: function() {
        return console.log.apply(console, [_fmt('debug')].concat(__slice.call(arguments)));
      },
      info: function() {
        return console.log.apply(console, [_fmt('info')].concat(__slice.call(arguments)));
      },
      error: function() {
        return console.log.apply(console, [_fmt('error')].concat(__slice.call(arguments)));
      },
      warn: function() {
        return console.log.apply(console, [_fmt('warn')].concat(__slice.call(arguments)));
      }
    },
    formatPrDays: function(days) {
      if (isNaN(days)) {
        return "n/a";
      }
      return days.toFixed(1);
    },
    formatDate: function(date) {
      var months;
      if (typeof date === 'string') {
        date = new Date(date);
      }
      months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return [months[date.getMonth()], date.getDate(), date.getFullYear()].join(' ');
    }
  };
  log = HELPERS.log;
  render = function(req, res, view, opts) {
    opts = opts || {};
    opts.user = req.user;
    if (!opts.home) {
      opts.home = false;
    }
    opts.h = HELPERS;
    opts.config = config;
    throw 'wut';
    return res.render(view, opts);
  };
  app = express.createServer(connect.logger({
    format: _fmt('info') + " :method :url :status"
  }), connect.compiler({
    src: 'src/client',
    dest: 'public',
    enable: ['less', 'coffeescript']
  }), connect.static('public'), connect.cookieParser(), connect.bodyParser(), connect.favicon(__dirname + '/public/favicon.ico'), sessions({
    secret: config.SESSION_SECRET,
    session_key: '_bp'
  }), function(req, res, next) {
    if (req.originalUrl.match(/^\/auth/)) {
      log.debug("SKIP GET USER");
      next();
      return;
    }
    log.debug("GET USER");
    if (!req.session) {
      req.session = {};
    }
    if (req.session.user_id) {
      return getUser({
        _id: req.session.user_id
      }, function(err, doc) {
        log.debug("LOGGED IN AS " + doc.id);
        req.user = doc;
        return next();
      });
    } else {
      log.debug("NO USER");
      return next();
    }
  });
  app.set('view engine', 'jade');
  app.get('/', function(req, res) {
    return render(req, res, 'index', {
      home: true
    });
  });
  app.get('/what', function(req, res) {
    return render(req, res, 'what');
  });
  app.get('/me', function(req, res) {
    return render(req, res, 'user', {
      layout: false
    });
  });
  app.get('/repo/search', function(req, res) {
    return GitHub.Api.getRepoApi().search(req.query.query, function(err, results) {
      return render(req, res, 'search', {
        query: req.query.query,
        results: results
      });
    });
  });
  app.get('/repo/show', function(req, res) {
    return res.redirect('/repo/' + req.query.user + '/' + req.query.repo);
  });
  app.get('/repo/:user/:repository', function(req, res) {
    this.params = req.params;
    return repoLookup(this.params.user, this.params.repository, function(repo, contributors, documentation) {
      return render(req, res, 'repo', {
        repo: repo,
        contributors: contributors,
        documentation: documentation
      });
    });
  });
  app.get('/repo/:user/:repository/pull_requests', function(req, res) {
    this.params = req.params;
    return pullRequestsLookup(this.params.user, this.params.repository, function(err, prs) {
      var active_pulls, all_pulls, open_pulls;
      prs = prs || [];
      all_pulls = _(prs).chain();
      open_pulls = all_pulls.reject(function(pr) {
        return pr.state === 'open';
      });
      active_pulls = open_pulls.reject(function(pr) {
        return pr.delay > 30;
      });
      return render(req, res, 'pull_requests', {
        prs: prs,
        average: {
          all: Math.average(all_pulls.pluck('delay').value()),
          active: Math.average(active_pulls.pluck('delay').value()),
          completed: Math.average(open_pulls.pluck('delay').value())
        },
        layout: false
      });
    });
  });
  app.get('/auth/logout', function(req, res) {
    req.session.user_id = null;
    return res.redirect('/');
  });
  app.get('/auth/login', function(req, res) {
    return res.redirect(GitHub.OAuth.getAuthorizeUrl({
      redirect_uri: "http://" + req.headers.host + '/auth/confirm'
    }));
  });
  app.get('/auth/confirm', function(req, res) {
    return GitHub.OAuth.getOAuthAccessToken(req.query.code, null, function(oAuthError, access_token, r) {
      if (oAuthError) {
        render(req, res, 'error', {
          error: oAuthError
        });
        return;
      }
      GitHub.Api.authenticateOAuth(access_token);
      return GitHub.Api.getUserApi().show(function(userError, userData) {
        var done;
        log.info("USER:", userData);
        if (userError) {
          render(req, res, 'error', {
            error: userError
          });
          return;
        }
        done = function(user) {
          req.session.user_id = user.id;
          return GitHub.Api.getRepoApi().getUserRepos(user.login, function(err, udocs) {
            user.repos.owned = _(!err && udocs || []).chain().map(function(doc) {
              return doc.owner + '/' + doc.name;
            }).value();
            return GitHub.Api.getUserApi().getWatchedRepos(user.login, function(err, wdocs) {
              var _ref;
              log.info('owned repos is already:', user.repos.owned);
              user.repos.watched = (_ref = _(!err && wdocs || []).chain().map(function(doc) {
                return doc.owner + '/' + doc.name;
              })).without.apply(_ref, user.repos.owned).value();
              log.info('and heres watched:', user.repos.watched, 'and now _([1,2,3,4]).without( [3,4]... ):', (function() {
                var x, _ref;
                x = [3, 4];
                return (_ref = _([1, 2, 3, 4])).without.apply(_ref, x);
              })());
              return user.save(function(err) {
                log.info("logged in", user, "err:", err);
                return res.redirect('/');
              });
            });
          });
        };
        return getUser({
          login: userData.login
        }, function(docErr, doc) {
          var user;
          log.info("USER:", doc);
          if (doc) {
            log.info("User " + doc.id + " already exists.");
            return done(doc);
          } else {
            log.info("No such user - " + userData.login + "... creating...");
            user = new User();
            user.github_id = userData.id;
            user.name = userData.name;
            user.gravatar = userData.gravatar_id;
            user.login = userData.login;
            user.email = userData.email;
            user.token = access_token;
            return user.save(function(docError) {
              if (docError) {
                log.error("ERROR:", docError);
                render(req, res, 'error', {
                  error: docError
                });
                return;
              }
              return done(user);
            });
          }
        });
      });
    });
  });
  app.listen(config.PORT);
  app.error(function(err, req, res) {
    log.error(err);
    return render(req, res, 'error', {
      error: err
    });
  });
}).call(this);
