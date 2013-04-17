var trackList = null;
var trackTimer = null;
var currentTrack = -1;
var trackData = {};
var socket = io.connect(window.location.hostname + ":8000");

var foundTrackTemplate = '<tr id="{{id}}" data-spotifyid="{{id}}" data-artist="{{artist}}" data-track="{{trackName}}"><td>{{id}}</td><td>{{artist}}</td><td>{{trackName}}</td></tr>';

$(document).ready(function() {
	
	

	socket.on('clientConnected', function (data) {
		$('#currentListeners').html(data.clientCount);
	});

	socket.on('rdioKeyAcquired', function(data) {
		console.log('KEY ACQUIRED');
		$('#foundTracks tbody').append(Mustache.to_html(foundTrackTemplate,data));

	});
	
	socket.on('allDataAcquired', function(data) {
		console.log(data);
	});


	$('#submit').click(function() {
		var tracks = $('#playlist').val()+'\n';
		trackList = tracks.match(/\w+(?=\n)/gm);
		socket.emit('getTrackListInfo',trackList);
	});

});



