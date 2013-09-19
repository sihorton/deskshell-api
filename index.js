/**
* @author: sihorton
* Implementation of a deskshell api.
*
var shellApp = deskShell.startApp({
	htdocs:'/content'
	,port:2222
});
*/
var Q = require("q");
var freeport = require("freeport");
var rDebug = require('chrome-rdebug').rDebug;
var request = require("request");

var shellApi = {
	v:0.1
	,getFreePort:function(app, port) {
		var getting = Q.defer();
		if (!port) {
			freeport(function(er, port) {
				if (er) getting.reject({error:er,app:app});
				getting.resolve({app:app,port:port});
			});
		} else {
			getting.resolve({app:app,port:port});
		}
		return getting.promise;		
	},startApp:function(params) {
		var starting = Q.defer();
		var myApp = {
			params:params
		}
			shellApi.getFreePort(myApp,myApp.params['port'])
			.then(function(dat) {
				var app = dat.app;
				app.port = dat.port;
				if (app.params['htdocs']) {
					var fs = require('fs');
					app.server = require('http').createServer(myApp.params['serverHandler'] || function handler (req, res) {
						if (req.url =='/')req.url = '/index.htm';
					  fs.readFile("content/" + req.url,function (err, data) {
						if (err) {
						  res.writeHead(500);
						  return res.end('Error loading '+req.url);
						}
						res.writeHead(200);
						res.end(data);
					  });
					});
					app.server.listen(app.port);
					console.log("serving application on port:",app.port);
				}
				return app;
			}).then(function(app) {
				if (app.params['openSocket']) {
					var io = require("socket.io").listen(app.server);
					io.set('log level',1);
					app.socketio = io
				}
				return app;
			}).then(function(app) {
				//launch chrome
				var launching = Q.defer();
				if (app.params['launchChromium']) {
					shellApi.getFreePort(app,app.params['port'])
					.then(function(dat) {
						var app = dat.app;
						app.cport = dat.port;
				
						//launch chrome
						if (!app.params['chromiumPath']) app.params['chromiumPath'] ="../../bin/win/GoogleChromePortable/GoogleChromePortable.exe";
						//chromePath = "../../bin/win/GoogleChromePortable/App/Chrome-bin/chrome.exe";
						//http://peter.sh/experiments/chromium-command-line-switches/
						
						//currently these extra switches are not working, more investigation required.
						if (!app.params['chromiumCmd']) app.params['chromiumCmd'] =  [
							'--remote-debugging-port='+app.cport
							,'--user-data-dir=..\chrome-profile'
							,'--app-window-size=300,300'
							,'--app'
							,'--apps-use-native-frame'
							,'http://localhost:'+myApp.port
						];
						app.chromium = require('child_process').spawn(app.params.chromiumPath,app.params.chromiumCmd);
						console.log("chrome debug port:",app.cport);
						request("http://localhost:"+app.cport+"/json", function(error, response, body) {
							var chromeDebugOptions = JSON.parse(body);
							var chromeDebugUrl = chromeDebugOptions[0].webSocketDebuggerUrl;
						
							//bugfix for wierd portable chrome on windows.
							if (chromeDebugUrl.indexOf('ws:///') > -1) {
								chromeDebugUrl = chromeDebugUrl.replace('ws:///','ws://localhost:'+myApp.cport+'/');
							}
							console.log("websocket url",chromeDebugUrl);
							app.chromiumDebugUrl = chromeDebugUrl;
							app.rDebugApi = rDebug.openSocket(chromeDebugUrl);
							app.rDebugApi.on('*',function(event) {
								console.log("Event:",event);
							});
							launching.resolve(app);
						});
					});
				} else {
					launching.resolve(app);
				}
				return launching.promise;
			}).then(function(app) {
				starting.resolve(app);
			}).fail(function(error) {
				console.log("error starting app",error);
				starting.reject(error);
			});
		return starting.promise;
	}
}

exports.api = shellApi;