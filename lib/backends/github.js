var _ = require("lodash");
var Q = require("q");
var util = require("util");
var destroy = require("destroy");
var GitHub = require("octocat");
var request = require("request");
var Buffer = require("buffer").Buffer;
var githubWebhook = require("github-webhook-handler");

var Backend = require("./backend");

function GitHubBackend() {
  var that = this;
  Backend.apply(this, arguments);

  this.opts = _.defaults(this.opts || {}, {
    proxyAssets: true
  });

  if ((!this.opts.username || !this.opts.password) && !this.opts.token) {
    throw new Error('GitHub backend require "username" and "token" options');
  }

  this.client = new GitHub({
    token: this.opts.token,
    endpoint: this.opts.endpoint,
    username: this.opts.username,
    password: this.opts.password
  });

  this.ghrepo = this.client.repo(this.opts.repository);
  this.releases = this.memoize(this._releases);

  // GitHub webhook to refresh list of versions
  this.webhookHandler = githubWebhook({
    path: "/refresh",
    secret: this.opts.refreshSecret
  });

  // Webhook from GitHub
  this.webhookHandler.on("release", function(event) {
    that.onRelease();
  });
  this.nuts.router.use(this.webhookHandler);
}
util.inherits(GitHubBackend, Backend);

// List all releases for this repository
GitHubBackend.prototype._releases = function() {
  return this.ghrepo.releases().then(function(page) {
    return page.all();
  });
};

// Return stream for an asset
GitHubBackend.prototype.serveAsset = function(asset, req, res) {
  if (!this.opts.proxyAssets) {
    res.redirect(asset.raw.browser_download_url);
  } else {
    return Backend.prototype.serveAsset.apply(this, arguments);
  }
};

// Return stream for an asset
GitHubBackend.prototype.getAssetStream = function(asset) {
  return new Promise((resolve, reject) => {
    console.log("Reading assets", asset);
    var headers = {
      "User-Agent": "nuts",
      Accept: "application/octet-stream",
      "Content-Length": "5000000"
    };
    var httpAuth;

    if (this.opts.token) {
      headers["Authorization"] = "token " + this.opts.token;
    } else if (this.opts.username) {
      httpAuth = {
        user: this.opts.username,
        pass: this.opts.password,
        sendImmediately: true
      };
    }

    request(
      {
        uri: asset.raw.browser_download_url,
        method: "get",
        headers: headers,
        auth: httpAuth
      },
      (err, callback, body) => {
        resolve(body);
      }
    );
  });
};

module.exports = GitHubBackend;
