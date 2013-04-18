
/**
 * Module dependencies.
 */

var express = require('express')
  , routes = require('./routes')
  , user = require('./routes/user')
  , http = require('http')
  , path = require('path')
  , Rdio = require("./rdio")
  , cred = require("./rdio_consumer_credentials")
  , EventEmitter = require('events').EventEmitter
  , io = require('socket.io')
  , clc = require('cli-color');


var rdio = new Rdio(["8cqh2xzc5m32u8awqahbkt2p", "7nXS37CH2Y"]);

var app = express()
    , server = http.createServer(app)
    , io = io.listen(server);


var url = null;
if (process.env.OPENREDIS_URL)
    url   = require("url").parse(process.env.OPENREDIS_URL);
else 
    url = require("url").parse('http://localhost:6379');

var redis = require("redis").createClient(url.port, url.hostname);

if (url.auth) 
    redis.auth(url.auth.split(":")[1]);



io.configure(function () { 
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 10); 
  io.set('log level', 1);
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
    app.use(express.static(path.join(__dirname, 'public')));

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
    var callbackUrl =  "http:?/mixtrip.herokuapp.com/callback";

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
            // Go to the home page.
            res.redirect("/");
        });
    } else {
        // We're missing something important.
        res.redirect("/logout");
    }
});

var activeClients = 0;

io.sockets.on('connection', function (socket) {

    clientConnect(socket);
    socket.on('disconnect', function() { clientDisconnect(socket); });
    socket.on('getRdioKeys', function(data) { getRdioKeys(socket,data); });
    socket.on('getTrackListInfo', function(data) { getTrackListInfo(socket,data); });

});



function clientConnect(socket) {
    activeClients++;
    socket.broadcast.emit('clientConnected', { clientCount: activeClients })
    socket.emit('clientConnected', { clientCount: activeClients });

}

function clientDisconnect(socket) {
    activeClients--;
    socket.broadcast.emit('clientDisconnected', { clientCount: activeClients });
}

function getRdioInfo(socket,data) {
    var track = data;
    var spotify = track.spotify;
    var artists = spotify.track.artists;
    var trackID = data.id;

    rdio.call("getTracksByISRC", {isrc: spotify.track['external-ids'][0]['id']} , function(err,rdioData) {
        if (err) {
            console.log(clc.redBright('error searching: ' + err));
            socket.emit('rdioISRCError', {id: trackID});
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
                                socket.emit('rdioInfoReceived', track);
                            }
                        });
                    } else {
                        console.log(clc.redBright("NO MATCH FOUND: ") + artists[0].name + " : " + spotify.track.name );
                         rdio.call("search", {query: artists[0].name + " " + spotify.track.name, types: "Track"} , function(err,rdioData) {
                            if (err) {
                                console.log(clc.redBright('error searching: ' + err));
                                socket.emit('rdioSearchError', {id: trackID});
                                redis.del(trackID);
                            } else {
                                if (rdioData.status == "ok") {
                                    socket.emit('replacementSuggestionsReceived', {spotify: data, searchData: rdioData.result})
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


function searchRdioForLocal(socket,data) {
    console.log('searching for: ' + data);
    var matches = data.split('___');
    console.log(clc.blueBright('searching for: ' +  matches));
    var artist = matches[0].replace(/\-/g, ' ');
    var trackName = matches[2].replace(/\-/g, ' ');
    rdio.call("search", {query: artist + " " + trackName, types: "Track"} , function(err,rdioData) {
        if (err) {
            console.log(clc.redBright('error searching: ' + err));
            socket.emit('rdioSearchError', {id: trackID});
            redis.del(trackID);
        } else {
            if (rdioData.status == "ok") {
                socket.emit('searchSuggestionsReceived', {id: data, searchData:rdioData.result})
            }
        }
    });
}


function getTrackListInfo(socket,data) {
    console.log(clc.greenBright(JSON.stringify(data)));
    var currentTrack = -1;
    var keysToGet = new Array();
    var trackTimer = null;
    var localFiles = new Array();
    var getNextTrackInfo = function() {
        if (currentTrack++ < keysToGet.length - 1) {
            var track = keysToGet[currentTrack];
            console.log(track);
       
            var url='http://ws.spotify.com/lookup/1/.json?uri=spotify:track:' + track;

            var req = http.get(url, function(res) {
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
                        socket.emit('spotifyInfoReceived', trackInfo);
                        getRdioInfo(socket,trackInfo);    
                    } catch (e) {
                        console.log(clc.redBright("error parsing json:  " + url + " : "  + e));
                        console.log(clc.blueBright("JSON: " + data));
                    }
                });
            });

            req.on('error', function(e) {
                console.log(clc.redBright('problem with request: ' + e.message));
            });
            
        } else {
            clearInterval(trackTimer);
        }
    };

    data.forEach(function(spotifyKey, index, array) {
        redis.get(spotifyKey, function(err,value) {
            if (!err) {
                if (value == null) {
                    if (spotifyKey.toString().match(/-/)) {
                        console.log('found local file: ' + spotifyKey);
                        searchRdioForLocal(socket, spotifyKey);
                    } else {
                        keysToGet.push(spotifyKey);
                    }
                } else {
                    socket.emit('allDataAcquired',JSON.parse(value));
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


server.listen(app.get('port'), function(){
  console.log('Server listening on port ' + app.get('port'));
});
