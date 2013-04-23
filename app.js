
/**
 * Module dependencies.
 */

var express = require('express.io')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , Rdio = require("./rdio")
  , cred = require("./rdio_consumer_credentials")
  , twitterKeys = require("./twitter_consumer_credentials")
  , EventEmitter = require('events').EventEmitter
  , io = require('socket.io')
  , clc = require('cli-color')
  , yql = require('yql')
  , util = require('util')
  , OAuth = require('oauth').OAuth
  , sys = require('sys');


var app = express().http().io();


var tweeter = new OAuth(
  "https://api.twitter.com/oauth/request_token",
  "https://api.twitter.com/oauth/access_token",
  twitterKeys.consumerKey,
  twitterKeys.consumerSecret,
  "1.0",
  null,
  "HMAC-SHA1"
 );


var url = null;
if (process.env.OPENREDIS_URL)
    url   = require("url").parse(process.env.OPENREDIS_URL);
else 
    url = require("url").parse('http://localhost:6379');

var redis = require("redis").createClient(url.port, url.hostname);

if (url.auth) 
    redis.auth(url.auth.split(":")[1]);



app.io.configure(function () { 
  app.io.set("transports", ["xhr-polling"]); 
  app.io.set("polling duration", 10); 
  app.io.set('log level', 1);
});


app.configure(function() {
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon());
    app.use(express.logger('dev'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(express.cookieParser('seeeecreeeeet'));
    app.use(express.session({
        secret: 'seeeecreeeeet'
    }));
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')))
});




app.configure( 'development', function() {
    app.use(function(req,res,next) {
        res.send(404, 'Sorry, page not found');
    });
});


redis.on("error", function (err) {
    console.log("error event - " + redis.host + ":" + redis.port + " - " + err);
});
/*
levelup('db/rdio', function (err,db) {
    if (!err) {
        rdioDB = db;
        rdioDB.on('ready', function() {
            console.log('rdio db is ready');
        });
    } else {
        console.log(err);
    }
});*/

app.get("/dev", function(req,res) {
    res.render('mixtrip', { title: 'mixtrip'});
});


app.get("/", function (req, res) {
    var session = req.session;
    if (session.hasOwnProperty('at')  && session.hasOwnProperty('ats')) {
        var accessToken = session.at;
        var accessTokenSecret = session.ats;

        if (accessToken && accessTokenSecret) {
            var rdio = new Rdio([cred.RDIO_CONSUMER_KEY, cred.RDIO_CONSUMER_SECRET],
                                [accessToken, accessTokenSecret]);
            res.render('mixtrip', { title: 'mixtrip'});
        } else {
            console.log(clc.redBright('Failed to use sessions'));
        }
    } else {
        res.render('index', {title: 'mixtrip'});
    }
});

app.get("/login", function (req, res) {
    var session = req.session;

    // Begin the authentication process.
    var rdio = new Rdio([cred.RDIO_CONSUMER_KEY, cred.RDIO_CONSUMER_SECRET]);
    var callbackUrl =  process.env.RDIO_CALLBACK_URL;
    console.log(callbackUrl);
    rdio.beginAuthentication(callbackUrl, function (err, authUrl) {
        if (err) {
            console.log('Error Authenticating: ' + err);
            return;
        }
        console.log('authURL: ' + authUrl);
        // Save the request token/secret in the session.
        session.rt = rdio.token[0];
        session.rts = rdio.token[1];

        // Go to Rdio to authenticate the app.
        res.redirect(authUrl);
    });
});

app.get("/callback", function (req, res) {
    
    var requestToken = req.session.rt;
    var requestTokenSecret = req.session.rts;
    var params = req.query;
    var verifier = params.oauth_verifier;


    if (requestToken && requestTokenSecret && verifier) {
        // Exchange the verifier and token for an access token.
        var rdio = new Rdio([cred.RDIO_CONSUMER_KEY, cred.RDIO_CONSUMER_SECRET],
                            [requestToken, requestTokenSecret]);

        rdio.completeAuthentication(verifier, function (err,data) {
            if (err) {
              console.log('Error Completing Authentication' + err);
                return;
            }

            // Save the access token/secret in the session (and discard the
            // request token/secret).
            req.session.at = rdio.token[0];
            req.session.ats = rdio.token[1];
            req.session.rt = null;
            req.session.rts = null;
            req.session.rdio = rdio;
            // Go to the home page.
            res.redirect("/");
        });
    } else {
        // We're missing something important.
        res.redirect("/logout");
    }
});





var activeClients = 0;

app.io.route('connection', function (req) {
     activeClients++;
    app.io.broadcast('clientConnected', { clientCount: activeClients })
   
});

app.io.route('disconnect', function(req) { 
    activeClients--;
    app.io.broadcast('clientDisconnected', { clientCount: activeClients });
});

app.io.route('getPlaylistInfo', function(req) {
    var playlistURL = req.data;
    new yql.exec('select * from data.html.cssselect where url="' + playlistURL + '" and css="div.two-thirds"', function(response) {
            var header = response.query.results.results.div[0].div[0];
            var playlistName = header.h1;
            var player = response.query.results.results.div[0].div[1].ul.li;
            var trackList = new Array();
            console.log(player);
            player.forEach(function(track) {
                trackList.push(track.a[1].href.replace(/\/track\//,''));
            });
            req.io.emit('playlistRetrieved', { trackList: trackList, playlistName: playlistName});
            req.data = trackList;
            getTrackListInfo(req);
    });

});

app.io.route('getTrackListInfo', function(req) { 
    getTrackListInfo(req);
});


app.io.route('createPlaylist', function(req) {     
    var rdio = getSessionRdio(req);
    console.log('tracks: ' + req.data.tracklist.join())
    console.log('creating playlist: ' + req.data.name);
    var playlistName = req.data.name.replace(/[^a-zA-Z0-9_\- ]/g,'');
    rdio.call("createPlaylist", {name: playlistName, description: "Created by mixtrip", tracks: req.data.tracklist.join() } , function(err,rdioData) {
        console.log('playlist response');
        if (err) {
            console.log(clc.redBright('error creating playlist: ' + err));
            req.io.emit('rdioCreateError', { error: err});
        } else {
            if (rdioData.status == "ok") {
                console.log('emitting success');
                req.io.emit('rdioCreateSuccess', rdioData)
            }
        }
    }); 

});

function getTrackListInfo(req) {
    var currentTrack = -1;
    var keysToGet = new Array();
    var trackTimer = null;
    var localFiles = new Array();
    var getNextTrackInfo = function() {
        if (currentTrack++ < keysToGet.length - 1) {
            var track = keysToGet[currentTrack];
       
            var url='http://ws.spotify.com/lookup/1/.json?uri=spotify:track:' + track;

            var spotifyreq = http.get(url, function(res) {
                var data = "";
                res.on('data', function (chunk) {
                    data += chunk;
                });
                res.on('end', function() {
                    try { 
                        
                        var trackInfo = {
                            id: track
                            , spotify: JSON.parse(data)
                            , rdio: {}
                        };
                        req.io.emit('spotifyInfoReceived', trackInfo);
                        getRdioInfo(req,trackInfo);    
                    } catch (e) {
                        console.log(clc.redBright("error parsing json:  " + url + " : "  + e));
                        req.io.emit('generalTrackError', track);
                        console.log(clc.blueBright("JSON: " + data));
                    }
                });
            });

            spotifyreq.on('error', function(e) {
                console.log(clc.redBright('problem with request: ' + e.message));
            });
            
        } else {
            clearInterval(trackTimer);
        }
    };

    req.data.forEach(function(spotifyKey, index, array) {
        console.log(spotifyKey);
        redis.get(spotifyKey, function(err,value) {
            if (!err) {
                if (value == null) {
                    if (spotifyKey.toString().match(/-/)) {
                        console.log('found local file: ' + spotifyKey);
                        searchRdioForLocal(req, spotifyKey);
                    } else {
                        keysToGet.push(spotifyKey);
                    }
                } else {
                    req.io.emit('allDataAcquired',JSON.parse(value));
                }
            } else {
                console.log('error: ' + err);
            }

            if (index == array.length -1)
            {
                trackTimer = setInterval(getNextTrackInfo,1000);
            }
        });
    });
}

function getRdioInfo(req,data) { 
     
    var track = data;
    var spotify = track.spotify;
    var artists = spotify.track.artists;
    var trackID = data.id;
     var rdio = getSessionRdio(req);

    rdio.call("getTracksByISRC", {isrc: spotify.track['external-ids'][0]['id']} , function(err,rdioData) {
        if (err) {
            console.log(clc.redBright('error retreiving ISRC: ' + err));
            req.io.emit('rdioISRCError', {id: trackID});
            redis.del(trackID);
        } else {
            if (rdioData.status == "ok") {
                track.rdio = rdioData.result[0];
                try {
                    if (track.rdio != undefined) {
                        redis.set(trackID, JSON.stringify(track), function(err) {
                            if (err) {
                                console.log(clc.redBright("error re-inserting: " + err));
                            } else {
                                req.io.emit('rdioInfoReceived', track);
                            }
                        });
                    } else {
                        var artist = artists[0].name.replace(/[,\!\(\)]/g, "");
                        var name = spotify.track.name.replace(/[,\!\(\)]/g, "");
                        console.log(clc.redBright("NO MATCH FOUND: Searching ") + artist + " : " + name );
                         rdio.call("search", {query: artist + " " + name, types: "Track"} , function(err,rdioData) {
                            if (err) {
                                console.log(clc.redBright('error searching: ' + err));
                                req.io.emit('rdioSearchError', {id: trackID, error: err});
                                redis.del(trackID);
                            } else {
                                if (rdioData.status == "ok") {
                                    req.io.emit('replacementSuggestionsReceived', {spotify: data, searchData: rdioData.result})
                                }
                            }
                        });
                    }
                } catch(e) {
                    console.log(clc.redBright(e));
                    console.log(clc.blueBright(JSON.stringify(rdioData)));
                }
            } else {
               console.log(clc.redBright("Rdio Query Failed"));
               console.log(clc.bluebright(JSON.stringify(rdioData)));
            }
        }
    });

}

function searchRdioForLocal(req,data) {
    var rdio = getSessionRdio(req);
    var matches = data.split('___');
    var artist = matches[0].replace(/\-/g, ' ');
    var trackName = matches[2].replace(/\-/g, ' ');
    rdio.call("search", {query: artist + " " + trackName, types: "Track"} , function(err,rdioData) {
        if (err) {
            console.log(clc.redBright('error searching: ' + err));
            req.io.emit('rdioSearchError', {id: trackID});
            redis.del(trackID);
        } else {
            if (rdioData.status == "ok") {
                req.io.emit('searchSuggestionsReceived', {id: data, searchData:rdioData.result})
            }
        }
    });
}


function getSessionRdio(req) {
    var session = req.session;
     var rdio = null;
    if (session.hasOwnProperty('at')  && session.hasOwnProperty('ats')) {
        var accessToken = session.at;
        var accessTokenSecret = session.ats;

        if (accessToken && accessTokenSecret) {
            console.log('rdio is go');
             return new Rdio([cred.RDIO_CONSUMER_KEY, cred.RDIO_CONSUMER_SECRET],
                                [accessToken, accessTokenSecret]);
        }
    } 
    console.log('rdio is a bust');
    return null;
}

function sendTweet(status) {
    tweeter.post("http://api.twitter.com/1/statuses/update.json",
               twitterKeys.token, twitterKeys.secret, { status: 'Test Tweet from mixtrip' }, "application/json",
       function (error, data, response2) {
           if(error){
               console.log('Error: Something is wrong.\n'+JSON.stringify(error)+'\n');
           }else{
               console.log('Twitter status updated.\n');
               console.log(response2+'\n');
           }
    });
}



app.listen(app.get('port'), function(){
  console.log('Server listening on port ' + app.get('port'));
});


