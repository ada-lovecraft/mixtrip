var trackList = null;
var trackTimer = null;
var currentTrack = -1;
var trackData = {};
var socket = io.connect(window.location.hostname);


var blankTrackTemplate = '<tr id="{{.}}"></tr>';
var trackTemplate = '<td><i class="icon-music"><!-- --></i> {{rdio.name}}</td><td>{{rdio.artist}}</td><td><!-- --></td>';
var searchTemplate = '<td><i class="icon-file"><!-- --></i> {{searchData.trackName}}</td><td>{{searchData.artist}}</td><td>Best Suggestions<br/><select data-style="btn-error" data-row="{{id}}">{{#searchData.results}}<option value="{{key}}">{{artist}} - {{name}}</option>{{/searchData.results}}</select></td>';
var suggestionTemplate = '<td><i class="icon-warning-sign"><!-- --></i> {{trackName}}</td><td>{{artist}}</td><td>Best Suggestions<br/><select data-style="btn-warning" data-row="{{id}}">{{#searchData.results}}<option value="{{key}}">{{artist}} - {{name}}</option>{{/searchData.results}}</select></td>';

$(document).ready(function() {

	var $window = $(window)

	$("#playlistTarget")
	    .bind("dragover", false)
	    .bind("dragenter", function(e) {
	    	$(this).addClass('activeDrag');
	    })
	    .bind("drop", function(e) {
	    	e.preventDefault();
	        var playlist = e.originalEvent.dataTransfer.getData("text") ||
	            e.originalEvent.dataTransfer.getData("text/plain");
	        $(this).addClass('dragComplete').fadeOut(function() {
	        	$('#playlistDisplay').fadeIn();
	        	$('#sidebar').fadeIn();
			});
	        if (playlist != '') {
	        	console.log(playlist);
	        	var trackLines = playlist.split('\n');
				trackList = new Array();				
				trackLines.forEach(function(track) {
					// \w+$ 
					// \/local\/
					if (track.match(/\/local\//)) {
						console.log(track);
						var newTrackName = track.replace('http://open.spotify.com/local/','').replace(/\//g,'___').replace(/\+/g,'-');
						trackList.push(newTrackName);
					} else {
						trackList.push(track.match(/\w+$/));
					}
				});
				trackList.forEach(function(track) {
					$('#foundTracks tbody').append(Mustache.to_html(blankTrackTemplate,track))
				});
				socket.emit('getTrackListInfo',trackList);
				$(this).attr('disabled','disabled');

			} else {
				console.log('nothing to parse');
			}

	    return false;
	});

	$('#playlistName').keyup(function(evt) {
		if ($(this).val() != '') {
			$('#submitName').removeAttr('disabled');
		} else {
			$('#submitName').attr('disabled','disabled');
		}
	});

	$('#submitName').click(function(evt) {
		evt.preventDefault();
		$('#playlistNameForm').fadeOut(function() {
			$('#mixtrip').fadeIn();
		});
	});

	$('#hideSuccess').click(function(e) {
		e.preventDefault();
		$('tr.success').slideUp();
		$(this).slideUp();
		$('#showSuccess').slideDown();
	});

	$('#showSuccess').click(function(e) {
		e.preventDefault();
		$('tr.success').slideDown();
		$(this).slideUp();
		$('#hideSuccess').slideDown();
	});

	socket.on('clientConnected', function (data) {
		$('#currentListeners').html(data.clientCount);
	});

	socket.on('rdioSearchError', function(data) {
		console.log('rdioSearchError: %o', data);
	});


	socket.on('spotifyInfoReceived', function(data) {
		/*
		var spotify = {
			artist: data.spotify.track.artists[0].name
			, name: data.spotify.track.name
		};
		var container = $('tr#' + data.id + " td.spotifyInfo");
		$(container).html(Mustache.to_html(spotifyTrackTemplate,spotify));
		*/
	});

	socket.on('rdioInfoReceived', function(data) {
		console.log(data.id);
		try { 
			var row = $('tr#'+data.id);
			$(row).html(Mustache.to_html(trackTemplate,data.rdio));
			$(row).addClass('success');
			$(row).data('rdioKey',data.rdio.key);

		} catch(e) {
			console.error(e);
			console.log(data);
		}
	});

	
	socket.on('allDataAcquired', function(data) {
		var row = $('tr#'+data.id);
		try { 
			$(row).html(Mustache.to_html(trackTemplate,data));
			$(row).addClass('success');
			$(row).data('rdioKey',data.rdio.key);
		} catch(e) {
			console.error(e);
			console.log(data);
		}
	});

	socket.on('noMatchFound', function(data) { 
		console.log('no match found: %o' , data);
		var trackInfo = {
			artist: data.spotify.spotify.track.artists[0].name,
			name: data.spotify.spotify.track.name
		}
		$('tr#' + data.id).html(Mustache.to_html(trackTemplate,trackInfo));
		$('tr#' + data.id).addClass('error');


	});

	socket.on('searchSuggestionsReceived', function(data) { 
		console.log('searchSuggestionReceived: %o' , data);
		var row = $('tr#'+data.id);
		var splits = data.id.split('___');
		
		data.searchData.artist = splits[0].replace(/\-/g, ' ');
		data.searchData.trackName = splits[2].replace(/\-/g, ' ');
		$(row).html(Mustache.to_html(searchTemplate,data));
		$(row).addClass('warning');
		$(row).data('rdioKey',data.searchData.results[0].key);
		$(row).find('select').selectpicker();
		$(row).find('select').change(function(evt) {
			var row = $('tr#'+$(this).data('row'));
			$(row).data('rdioKey',$(this).find(':selected').val());
		});
	});

	socket.on('replacementSuggestionsReceived', function(data) { 
		console.log('replacementSuggestionReceived: %o' , data);
		var row = $('tr#'+data.spotify.id[0]);
		
		data.artist = data.spotify.spotify.track.artists[0].name;
		data.trackName = data.spotify.spotify.track.name;
		$(row).html(Mustache.to_html(suggestionTemplate,data));
		$(row).addClass('error');
		$(row).data('rdioKey',data.searchData.results[0].key);
		$(row).find('select').selectpicker();
		$(row).find('select').change(function(evt) {
			var row = $('tr#'+$(this).data('row'));
			$(row).data('rdioKey',$(this).find(':selected').val());
		});
	});


	$('#mixtripAffix').affix();
});



