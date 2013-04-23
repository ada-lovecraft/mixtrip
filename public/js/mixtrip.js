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
	var createdTemplate = $('#createdTpl').html();

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
	        	//console.log(playlist);
	        	if (playlist.match(/\/playlist\//)){
	        		socket.emit('getPlaylistInfo',playlist)
	        	} else {
	        		parsePlaylist(playlist);
	        		socket.emit('getTrackListInfo', tracklist);
				}

			} else {
				//console.log('nothing to parse');
			}

	    return false;
	}).on('click', function(e) {
		$(this).addClass('pasteReady');
		$(this).find('h1').html('Ok. Paste your playlist');
		$(this).find('p#info').html('or drag a playlist with less than 30 tracks here.');
		$('#pasteData').focus();
	});

	$('#pasteData').on('paste', function(e) {
		var self = this;
		setTimeout(function() {
			var playlist = $(self).val();
			console.log(playlist);
			if (parsePlaylist(playlist)) {
				console.log('playlist is good');
				$('#playlistTarget').addClass('pasteComplete');
				$('#playlistTarget').addClass('dragComplete').fadeOut(function() {
		        	$('#playlistDisplay').fadeIn();
		        	$('#sidebar').fadeIn();
				});
				socket.emit('getTrackListInfo', trackList);
			}
			else {
				cleanPlaylistTarget();
				$('#playlistTarget').addClass('parseError');
				$('#playlistTarget h1').html('Something went wrong');
				$('#playlistTarget p#info').html("You pasted something that wasn't a playlist");
				$('#playlistTarget h2#statusText').html("Try again");

			}
		}, 100);

	}).on('blur', function(e) {
		cleanPlaylistTarget();
		$('#playlistTarget h1').html('Drag your play list here');
		$('#playlistTarget p#info').html("or, if you have more than 30 tracks in your playlist, highlight all the tracks, hit the copy key combo, then click here and paste it.");
		$('#playlistTarget h2#statusText').html("");
	});

	$('#toggleErrors').click(function(e) {
		e.preventDefault();
		$('tr.success').toggleClass('hide');
	});

	socket.on('clientConnected', function (data) {
		$('#currentListeners').html(data.clientCount);
	});

	socket.on('playlistRetrieved', function(data) {
		trackList = data.trackList;
		$('#playlistName').val(data.playlistName);
		trackList.forEach(function(track) {
			//console.log(track);
			$('#foundTracks tbody').append(Mustache.to_html(blankTrackTemplate,track))
		});
	});

	socket.on('rdioSearchError', function(data) {
		//console.log('rdioSearchError: %o', data);
		setProgress();
	});

	socket.on('rdioInfoReceived', function(data) {
		try { 
			var row = $('tr#'+data.id);
			$(row).html(Mustache.to_html(successTemplate,data));
			$(row).addClass('success');
			$(row).data('rdioKey',data.rdio.key);

		} catch(e) {
			console.error(e);
			//console.log(data);
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
			//console.log(data);
		}
		setProgress();
	});

	socket.on('noMatchFound', function(data) { 
		//console.log('no match found: %o' , data);
		var trackInfo = {
			artist: data.spotify.spotify.track.artists[0].name,
			name: data.spotify.spotify.track.name
		}
		$('tr#' + data.id).html(Mustache.to_html(trackTemplate,trackInfo));
		$('tr#' + data.id).addClass('error');
		setProgress();

	});

	socket.on('searchSuggestionsReceived', function(data) { 

		//console.log('searchSuggestionReceived: %o' , data);
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
		//console.log('replacementSuggestionReceived: %o' , data);
		var row = $('tr#'+data.spotify.id);
		
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

	socket.on('rdioCreateSuccess', function(data) {
		var successData = data.result;
		successData.encodedURL = encodeURIComponent(successData.url);
		successData.encodedText = encodeURIComponent(successData.name + " : " + successData.shortUrl + " :: Converted my old #Spotify playlist to @Rdio with @mixtripapp http://mixtrip.herokuapp.com");
		$('#success #successNote').html(Mustache.to_html(createdTemplate,data.result));
		$('#creating').fadeOut();
		$('#success').fadeIn();
	});

	socket.on('rdioCreateError', function(data) {
		$('#error #successNote').html(Mustache.to_html(successTemplate,data.result));
		$('#creating').fadeOut();
		$('#success').fadeIn();
	});


	socket.on('generalTrackError', function(data) {
		var row = $('tr#'+data);
		try { 
			var template = $('#errorTpl').html();
			$(row).html(Mustache.to_html(template,data));
			$(row).addClass('error').addClass('disabled');
		} catch(e) {
			console.error(e);
			//console.log(data);
		}
		//console.log('generalTrackError: %o' , data);
		setProgress();
	});

	$(document).on('click','.disableRow',function(e) {
		e.preventDefault();
		//console.log($(this).closest('tr'));
		$(this).closest('tr').toggleClass('disabled');
	});


	$('#createPlaylist').click(function (e) {
		var rdioList = new Array();
		var trackList = $('#foundTracks tbody tr:not(.disabled)');
		for(var i = 0; i< trackList.length; i++) {
			var track = trackList[i];
			rdioList.push($(track).data('rdioKey'));
		}
		//console.log(rdioList);
		var playlistName = $('#playlistName').val();
		
		if (!playlistName) {
			playlistName = 'Mixtrip Playlist';
		}
		//console.log(playlistName);

		socket.emit('createPlaylist', { name: playlistName, tracklist: rdioList})
		$('#sidebar').fadeOut();
		$('#playlistDisplay').fadeOut();
		$('#creating').fadeOut();
		
	});

	$('#tryagain').click(function(e) {
		$('#creatPlaylist').click();
	});


	function parsePlaylist(playlist) {
		var trackLines = playlist.replace(/ /g,'\n').split('\n');
		trackList = new Array();				
		trackLines.forEach(function(track) {
			if (track.match(/http:\/\/open.spotify.com\//)) {
				if (track.match(/\/local\//)) {
					//console.log(track);
					var newTrackName = track.replace('http://open.spotify.com/local/','').replace(/\//g,'___').replace(/[\+%\.]/g,'-');
					trackList.push(newTrackName);
				} else {
					trackList.push(track.match(/\w+$/));
				}
			} else {
				console.log('track not correct: ' + track);
			}
		});
		console.log('trackLength : ' + trackList.length);
		if (trackList.length > 0) {
			trackList.forEach(function(track) {
				$('#foundTracks tbody').append(Mustache.to_html(blankTrackTemplate,track))
			});
			return true;
		} else {
			return false;
		}
		
	}

	function setProgress() {
		trackResponseCounter++
		if( trackResponseCounter == trackList.length) {
			$('#createPlaylist').button('complete');
			$('.progress').removeClass('active');
			$('.progress .bar').attr('style','width:100%');
		} else {
			var percent = (trackResponseCounter/trackList.length) * 100;
			$('.progress .bar').attr('style','width:' + percent + '%');
		}
		
	}

	function cleanPlaylistTarget() {
		$('#playlistTarget').attr('class', 'span10 hero-unit');
	};


	$('#toggleTwitter').button('toggle');
	$('#toggleTwitter').data('canTweet', true);

	$('#mixtripAffix').affix();



});




