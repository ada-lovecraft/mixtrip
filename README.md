MixTrip
--
###Convert your Old-and-Busted Spotify playlists to The New Hotness: Rdio

Working example: <http://mixtrip.herokuapp.com>

####To install:

1. Clone the repo
		
		$ git clone https://github.com/codevinsky/mixtrip.git
	

2. Copy the config files

		$ cp rdio_consumer_credentials.example rdio_consumer_credentials.js
		$ cp twitter_consumer_credentials.example twitter_consumer_credentials.js

3. Install dependencies

		$ npm install

4. Edit your $PATH to include your redis url with the variable name: **OPENREDIS_URL**
	 

5. Run it

		$ node app.js
		
