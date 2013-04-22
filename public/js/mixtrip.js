var trackList = null;
var trackTimer = null;
var currentTrack = -1;
var trackData = {};
var socket = io.connect(window.location.hostname);
var trackResponseCounter = 0;


$(document).ready(function() {

	var $window = $(window)
	var blankTrackTemplate = $('#placeholderTpl').html();
	var successTemplate = $('#successTpl').html();
	var searchTemplate = $('#searchTpl').html();
	var suggestionTemplate = $('#suggestionTpl').html();


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
						var newTrackName = track.replace('http://open.spotify.com/local/','').replace(/\//g,'___').replace(/[\+%]/g,'-');
						trackList.push(newTrackName);
					} else {
						trackList.push(track.match(/\w+$/));
					}
				});
				trackList.forEach(function(track) {
					console.log(track);
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

	

	$('#toggleErrors').click(function(e) {
		e.preventDefault();
		$('tr.success').toggleClass('hide');
	});

	socket.on('clientConnected', function (data) {
		$('#currentListeners').html(data.clientCount);
	});

	socket.on('rdioSearchError', function(data) {
		console.log('rdioSearchError: %o', data);
		setProgress();
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
		try { 
			var row = $('tr#'+data.id);
			$(row).html(Mustache.to_html(successTemplate,data));
			$(row).addClass('success');
			$(row).data('rdioKey',data.rdio.key);

		} catch(e) {
			console.error(e);
			console.log(data);
		}
		setProgress();
	});

	
	socket.on('allDataAcquired', function(data) {
		var row = $('tr#'+data.id);
		try { 
			var template = $('#successTpl').html();
			$(row).html(Mustache.to_html(template,data));
			$(row).addClass('success');
			$(row).data('rdioKey',data.rdio.key);
		} catch(e) {
			console.error(e);
			console.log(data);
		}
		setProgress();
	});

	socket.on('noMatchFound', function(data) { 
		console.log('no match found: %o' , data);
		var trackInfo = {
			artist: data.spotify.spotify.track.artists[0].name,
			name: data.spotify.spotify.track.name
		}
		$('tr#' + data.id).html(Mustache.to_html(trackTemplate,trackInfo));
		$('tr#' + data.id).addClass('error');
		setProgress();

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
		setProgress();
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
		setProgress();
	});

	$(document).on('click','.disableRow',function(e) {
		e.preventDefault();
		console.log($(this).closest('tr'));
		$(this).closest('tr').toggleClass('disabled');
	});


	$('#createPlaylist').click(function (e) {
		var rdioList = new Array();
		var trackList = $('#foundTracks tbody tr:not(.disabled)');
		console.log(trackList);
		for(var i = 0; i< trackList.length; i++) {
			var track = trackList[i];
			console.log(track);
			rdioList.push($(track).data('rdioKey'));
		}
		console.log(rdioList);
	});

	function setProgress() {
		trackResponseCounter++
		if( trackResponseCounter == trackList.length) {
			$('#createPlaylist').button('complete');
			$('.progress').removeClass('active');
			$('.progress .bar').attr('style','width:100%');
		} else {
			console.log(trackResponseCounter , trackList.length);
			var percent = (trackResponseCounter/trackList.length) * 100;
			$('.progress .bar').attr('style','width:' + percent + '%');
		}
		
	}

	$('#mixtripAffix').affix();
});



