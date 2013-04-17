var trackList = null;
var trackTimer = null;
var currentTrack = -1;
var trackData = {};
var socket = io.connect(window.location.hostname);

var blankTrackTemplate = '<tr id="{{.}}"><td class="spotifyInfo"></td><td class="rdioInfo"></td></tr>';
var spotifyTrackTemplate = '{{artist}} - {{name}}'
var rdioTrackTemplate = '{{artist}} - {{name}}';

$(document).ready(function() {
	
	

	socket.on('clientConnected', function (data) {
		$('#currentListeners').html(data.clientCount);
	});

	socket.on('rdioSearchError', function(data) {
		console.log('rdioSearchError: %o', data);
	});


	socket.on('spotifyInfoReceived', function(data) {
		var spotify = {
			artist: data.spotify.track.artists[0].name
			, name: data.spotify.track.name
		};
		var container = $('tr#' + data.id + " td.spotifyInfo");
		console.log('container for ' + data.spotify.track.name + ': %o',  container);
		$(container).html(Mustache.to_html(spotifyTrackTemplate,spotify));
	});

	socket.on('rdioInfoReceived', function(data) {
		console.log("rdioInfoReceived %o", data);
		console.log(data.id);

		$('tr#' + data.id + " td.rdioInfo").html(Mustache.to_html(rdioTrackTemplate,data.rdio));

	});

	
	socket.on('allDataAcquired', function(data) {
		console.log("allDataAcquired %o", data);
		var spotify = {
			artist: data.spotify.track.artists[0].name
			, name: data.spotify.track.name
		};

		$('tr#' + data.id + " td.spotifyInfo").html(Mustache.to_html(spotifyTrackTemplate,spotify));
		$('tr#' + data.id + " td.rdioInfo").html(Mustache.to_html(rdioTrackTemplate,data.rdio));
	});

	socket.on('noMatchFound', function(data) { 
		console.log("no match found: %o", data);
	});

	$('#submit').click(function() {
		var tracks = $('#playlist').val()+'\n';
		trackList = tracks.match(/\w+(?=\n)/gm);
		console.log(trackList);
		socket.emit('getTrackListInfo',trackList);
		trackList.forEach(function(track) {
			$('#foundTracks tbody').append(Mustache.to_html(blankTrackTemplate,track))
		});
		$(this).attr('disabled','disabled');;
	});

});



