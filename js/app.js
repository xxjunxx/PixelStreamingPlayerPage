// Copyright 1998-2018 Epic Games, Inc. All Rights Reserved.

var webRtcPlayerObj = null;
var print_stats = false;
var print_inputs = false;
var connect_on_load = false;

var is_reconnection = false;
var socket;

var qualityControlOwnershipCheckBox;
var matchViewportResolution;
// TODO: Remove this - workaround because of bug causing UE to crash when switching resolutions too quickly
var lastTimeResized = new Date().getTime();
var resizeTimeout;

var responseEventListeners = new Map();

var t0 = Date.now();
function log(str) {
    console.log(`${Math.floor(Date.now() - t0)}: ` + str);
}

var currentTimeText;
var buttonClickText;

function setupHtmlEvents(){
	//Window events
	window.addEventListener('resize', resizePlayerStyle, true);
	window.addEventListener('orientationchange', onOrientationChange);

	//HTML elements controls
	let resizeCheckBox = document.getElementById('enlarge-display-to-fill-window-tgl');
    if (resizeCheckBox != null) {
		resizeCheckBox.onchange = function(event){
			resizePlayerStyle();
		}
	}

	qualityControlOwnershipCheckBox = document.getElementById('quality-control-ownership-tgl');
	if (qualityControlOwnershipCheckBox != null) {
		qualityControlOwnershipCheckBox.onchange = function (event) {
			requestQualityControl();
		}
	}

	let prioritiseQualityCheckbox = document.getElementById('prioritise-quality-tgl');
	let qualityParamsSubmit = document.getElementById('quality-params-submit');

	if (prioritiseQualityCheckbox != null) {
	    prioritiseQualityCheckbox.onchange = function (event) {	        
	        if (prioritiseQualityCheckbox.checked) {
                // TODO: This state should be read from the UE Application rather than from the initial values in the HTML
	            let lowBitrate = document.getElementById('low-bitrate-text').value;
	            let highBitrate = document.getElementById('high-bitrate-text').value;
	            let minFPS = document.getElementById('min-fps-text').value;

	            let initialDescriptor = {
	                PrioritiseQuality: 1,
	                LowBitrate: lowBitrate,
	                HighBitrate: highBitrate,
	                MinFPS: minFPS
	            }
	            // TODO: The descriptor should be sent as is to a generic handler on the UE side
                // but for now we're just sending it as separate console commands
	            //emitUIInteraction(initialDescriptor); 
	            sendQualityConsoleCommands(initialDescriptor);
	            console.log(initialDescriptor);

	            qualityParamsSubmit.onclick = function (event) {
	                let lowBitrate = document.getElementById('low-bitrate-text').value;
	                let highBitrate = document.getElementById('high-bitrate-text').value;
	                let minFPS = document.getElementById('min-fps-text').value;
	                let descriptor = {
	                    PrioritiseQuality: 1,
	                    LowBitrate: lowBitrate,
	                    HighBitrate: highBitrate,
                        MinFPS: minFPS
	                }
	                //emitUIInteraction(descriptor);
	                sendQualityConsoleCommands(descriptor);
	                console.log(descriptor);
	            }
	        } else { // Prioritise Quality unchecked
	            let initialDescriptor = {
	                PrioritiseQuality: 0
	            }
	            //emitUIInteraction(initialDescriptor);
	            sendQualityConsoleCommands(initialDescriptor);
	            console.log(initialDescriptor);

	            qualityParamsSubmit.onclick = null;
	        }
	    }
	}

	let showFPSCheckBox = document.getElementById('show-fps-tgl');
	if (showFPSCheckBox != null) {
	    showFPSCheckBox.onchange = function (event) {
	        let consoleDescriptor = {
	            Console: 'stat fps'
	        }
	        emitUIInteraction(consoleDescriptor);
	    }
	}

	let matchViewportResolutionCheckBox = document.getElementById('match-viewport-res-tgl');
	if (matchViewportResolutionCheckBox != null) {
	    matchViewportResolutionCheckBox.onchange = function (event) {
	        matchViewportResolution = matchViewportResolutionCheckBox.checked;
	    }
	}

    let statsCheckBox = document.getElementById('show-stats-tgl');
	if (statsCheckBox != null) {
		statsCheckBox.onchange = function(event){
			let stats = document.getElementById('statsContainer');
			stats.style.display = (event.target.checked) ? "block" : "none";
		}
	}

	var kickButton = document.getElementById('kick-other-players-button');
	if(kickButton) {
		kickButton.onclick = function(event){
			socket.emit('kick', {});
		}
	}

	let moveBoxButton = document.getElementById('move-box-button');
	if (moveBoxButton != null) {
		moveBoxButton.onclick = function(event) {
			let consoleDescriptor =  {
				msgToPrint: 'hello world'
			}
			emitUIInteraction(consoleDescriptor);
		}
	}

	let textToPrint = document.getElementById('text-input');
	let printTextButton = document.getElementById('print-text-button');
	if (printTextButton != null) {
		printTextButton.onclick = function(event) {
			if (textToPrint != null) {
				let consoleDescriptor =  {
					msgToPrint: textToPrint.value
				}
				emitUIInteraction(consoleDescriptor);
			}
		}

	}

	currentTimeText = document.getElementById("current-time-text");
	buttonClickText = document.getElementById("button-click-text");
	addResponseEventListener("handle_responses", myHandleResponseFunction);
}


function myHandleResponseFunction(data) {
	//console.log(data);
	json = JSON.parse(data);
	switch (json.msg) {
        case "currentTime":
			if (currentTimeText != null) {
				currentTimeText.innerHTML = "Current Time:" + json.time;
			}
			break;
		case "clickButton":
			if (buttonClickText != null) {
				buttonClickText.innerHTML = "Button:" + json.button;
			}
			break;
	}
}

function sendQualityConsoleCommands(descriptor) {
    if (descriptor.PrioritiseQuality != null) {
        var command = 'Streamer.PrioritiseQuality ' + descriptor.PrioritiseQuality;
        let consoleDescriptor = {
            Console: command
        }
        emitUIInteraction(consoleDescriptor);
    }

    if (descriptor.LowBitrate != null) {
        var command = 'Streamer.LowBitrate ' + descriptor.LowBitrate;
        let consoleDescriptor = {
            Console: command
        }
        emitUIInteraction(consoleDescriptor);
    }

    if (descriptor.HighBitrate != null) {
        var command = 'Streamer.HighBitrate ' + descriptor.HighBitrate;
        let consoleDescriptor = {
            Console: command
        }
        emitUIInteraction(consoleDescriptor);
    }

    if (descriptor.MinFPS != null) {
        var command = 'Streamer.MinFPS ' + descriptor.MinFPS;
        let consoleDescriptor = {
            Console: command
        }
        emitUIInteraction(consoleDescriptor);
    }
}

function setOverlay(htmlClass, htmlElement, onClickFunction){
	var videoPlayOverlay = document.getElementById('videoPlayOverlay');
	if(!videoPlayOverlay){
		var playerDiv = document.getElementById('player');
		videoPlayOverlay = document.createElement('div');
		videoPlayOverlay.id = 'videoPlayOverlay';
		playerDiv.appendChild(videoPlayOverlay);
	}

	// Remove existing html child elements so we can add the new one
	while (videoPlayOverlay.lastChild) {
  		videoPlayOverlay.removeChild(videoPlayOverlay.lastChild);
	}

	if(htmlElement)
		videoPlayOverlay.appendChild(htmlElement);

	if(onClickFunction){
		videoPlayOverlay.addEventListener('click', function onOverlayClick(event){
			onClickFunction(event);
			videoPlayOverlay.removeEventListener('click', onOverlayClick);
		});
	}

	// Remove existing html classes so we can set the new one
	var cl = videoPlayOverlay.classList;
	for( var i = cl.length-1; i >= 0; i-- ) {
	    cl.remove( cl[i] );
	}

	videoPlayOverlay.classList.add(htmlClass);
}

function showConnectOverlay(){
	var startText = document.createElement('div');
	startText.id = 'playButton';
	startText.innerHTML = 'Click to start';

	setOverlay('clickableState', startText, event => {
		connect();
	});
}

function showTextOverlay(text){
	var textOverlay = document.createElement('div');
	textOverlay.id = 'messageOverlay';
	textOverlay.innerHTML = text ? text : '';
	setOverlay('textDisplayState', textOverlay);
}

function showPlayOverlay(){
	var img = document.createElement('img');
	img.id = 'playButton';
	img.src = '/images/Play.png';
	img.alt = 'Start Streaming';
	setOverlay('clickableState', img, event => {
		if(webRtcPlayerObj)
			webRtcPlayerObj.video.play();

		requestQualityControl();

		hideOverlay();
	});
}

function hideOverlay(){
	setOverlay('hiddenState');
}

function createWebRtcOffer(){
	if(webRtcPlayerObj){
		console.log('Creating offer');
		showTextOverlay('Starting connection to server, please wait');
	    webRtcPlayerObj.createOffer();
	} else {
		console.log('WebRTC player not setup, cannot create offer');
		showTextOverlay('Unable to setup video');
	}
}

function sendInputData(data){
	if(webRtcPlayerObj)
		webRtcPlayerObj.send(data);
    }

function addResponseEventListener(name, listener) {
	responseEventListeners.set(name, listener);
}

function removeResponseEventListener(name) {
	responseEventListeners.remove(name);
}

// Must be kept in sync with PixelStreamingProtocol::EToClientMsg C++ enum.
const ToClientMessageType = {
	QualityControlOwnership: 0,
	Response: 1
};

function setupWebRtcPlayer(htmlElement, clientConfig){
    webRtcPlayerObj = new webRtcPlayer({peerConnectionOptions: clientConfig.peerConnectionOptions});
    htmlElement.appendChild(webRtcPlayerObj.video);

    webRtcPlayerObj.onWebRtcOffer = function (offer) {
   		socket.emit("webrtc-offer", offer);
    };

    webRtcPlayerObj.onWebRtcCandidate = function(candidate) {
		socket.emit('webrtc-ice', candidate);
    };

    webRtcPlayerObj.onVideoInitialised = function(){
    	showPlayOverlay();
    	resizePlayerStyle();
    }

    webRtcPlayerObj.onDataChannelConnected = function(){
    	showTextOverlay('WebRTC connected, waiting for video');
    }

	webRtcPlayerObj.onDataChannelMessage = function (data) {
		var view = new Uint8Array(data);
		if (view[0] == ToClientMessageType.QualityControlOwnership)
		{
			let ownership = view[1] == 0 ? false : true;
			// If we own the quality control, we can't relenquish it. We only loose
			// quality control when another peer asks for it
			if (qualityControlOwnershipCheckBox != null) {
				qualityControlOwnershipCheckBox.disabled = ownership;
				qualityControlOwnershipCheckBox.checked = ownership;
			}
		} else if (view[0] == ToClientMessageType.Response) {
			let response = new TextDecoder("utf-16").decode(data.slice(1));
			for (let listener of responseEventListeners.values()) {
				listener(response);
			}
		}
	}

    socket.on('webrtc-answer', function(webRTCData) {
  		webRtcPlayerObj.receiveAnswer(webRTCData);
        let printInterval =  5 * 60 * 1000; /*Print every 5 minutes*/
        let nextPrintDuration = printInterval;
        
  		webRtcPlayerObj.onAggregatedStats = (aggregatedStats) => {
  			let numberFormat = new Intl.NumberFormat(window.navigator.language, { maximumFractionDigits: 0 });
  			let timeFormat = new Intl.NumberFormat(window.navigator.language, { maximumFractionDigits: 0, minimumIntegerDigits: 2 });
  			let statsText = '';

  			// Calculate duration of run
  			let runTime = (aggregatedStats.timestamp - aggregatedStats.timestampStart) / 1000;
  			let timeValues = [];
  			let timeDurations = [60, 60]
  			for(let timeIndex = 0; timeIndex < timeDurations.length; timeIndex ++)
  			{
  				timeValues.push(runTime % timeDurations[timeIndex]);
  				runTime = runTime / timeDurations[timeIndex];
  			}
  			timeValues.push(runTime);

  			let runTimeSeconds = timeValues[0];
  			let runTimeMinutes = Math.floor(timeValues[1]);
  			let runTimeHours = Math.floor([timeValues[2]]);

  			receivedBytesMeasurement = 'B'
  			receivedBytes = aggregatedStats.hasOwnProperty('bytesReceived') ? aggregatedStats.bytesReceived : 0;
  			let dataMeasurements = ['kB', 'MB', 'GB'];
  			for(let index = 0; index < dataMeasurements.length; index++){
  				if(receivedBytes < 100 * 1000)
  					break;
  				receivedBytes = receivedBytes / 1000;
  				receivedBytesMeasurement = dataMeasurements[index];
  			};

			statsText += `Duration: ${timeFormat.format((runTimeHours))}:${timeFormat.format((runTimeMinutes))}:${timeFormat.format((runTimeSeconds))}</br>`;
			statsText += `Video Resolution: ${
				aggregatedStats.hasOwnProperty('frameWidth') && aggregatedStats.frameWidth && aggregatedStats.hasOwnProperty('frameHeight')  && aggregatedStats.frameHeight? 
					aggregatedStats.frameWidth + 'x' + aggregatedStats.frameHeight : 'N/A'
				}</br>`;
			statsText += `Received (${receivedBytesMeasurement}): ${numberFormat.format((receivedBytes))}</br>`;
			statsText += `Frames Decoded: ${aggregatedStats.hasOwnProperty('framesDecoded') ? numberFormat.format(aggregatedStats.framesDecoded) : 'N/A'}</br>`;
  			statsText += `Packets Lost: ${aggregatedStats.hasOwnProperty('packetsLost') ? numberFormat.format(aggregatedStats.packetsLost) : 'N/A'}</br>`;
  			statsText += `Bitrate (kbps): ${aggregatedStats.hasOwnProperty('bitrate') ? numberFormat.format(aggregatedStats.bitrate) : 'N/A'}</br>`;
  			statsText += `Framerate: ${aggregatedStats.hasOwnProperty('framerate') ? numberFormat.format(aggregatedStats.framerate) : 'N/A'}</br>`;
  			statsText += `Frames dropped: ${aggregatedStats.hasOwnProperty('framesDropped') ? numberFormat.format(aggregatedStats.framesDropped) : 'N/A'}</br>`;
  			statsText += `Latency (ms): ${aggregatedStats.hasOwnProperty('currentRoundTripTime') ? numberFormat.format(aggregatedStats.currentRoundTripTime * 1000) : 'N/A'}</br>`;

  			let statsDiv = document.getElementById("stats");
  			if(statsDiv){
  				statsDiv.innerHTML = statsText;
  			}

  			if(print_stats){
	  			if(aggregatedStats.timestampStart){
                    if((aggregatedStats.timestamp - aggregatedStats.timestampStart) > nextPrintDuration ){
                        console.log(JSON.stringify(aggregatedStats));
                        if(socket.connected)
							socket.emit('webrtc-stats', aggregatedStats);
                        nextPrintDuration += printInterval;
                    }
                }
            }
  		}

   		webRtcPlayerObj.aggregateStats(1 * 1000 /*Check every 1 second*/);

   		//let displayStats = () => { webRtcPlayerObj.getStats( (s) => { s.forEach(stat => { console.log(JSON.stringify(stat)); }); } ); }
   		//var displayStatsIntervalId = setInterval(displayStats, 30 * 1000);
    });

	socket.on('webrtc-ice', function(iceCandidate) {
		if(webRtcPlayerObj)
			webRtcPlayerObj.handleCandidateFromServer(iceCandidate);
	});

    registerInputs(webRtcPlayerObj.video);

    createWebRtcOffer();

    return webRtcPlayerObj.video;
}

var styleWidth;
var styleHeight;
var styleTop;
var styleLeft;
var styleCursor = 'default';
var styleAdditional;

const ControlSchemeType = {
	// A mouse can lock inside the WebRTC player so the user can simply move the
	// mouse to control the orientation of the camera. The user presses the
	// Escape key to unlock the mouse.
	LockedMouse : 0,
	
	// A mouse can hover over the WebRTC player so the user needs to click and
	// drag to control the orientation of the camera.
	HoveringMouse : 1
};

var inputOptions = {
	// The control scheme controls the behaviour of the mouse when it interacts
	// with the WebRTC player.
	controlScheme: ControlSchemeType.LockedMouse,

	// Browser keys are those which are typically used by the browser UI. We
	// usually want to suppress these to allow, for example, UE4 to show shader
	// complexity with the F5 key without the web page refreshing.
	suppressBrowserKeys: true,

	// UE4 has a faketouches option which fakes a single finger touch when the
	// user drags with their mouse. We may perform the reverse; a single finger
	// touch may be converted into a mouse drag UE4 side. This allows a
	// non-touch application to be controlled partially via a touch device.
	fakeMouseWithTouches: false
};

function resizePlayerStyleToFillWindow(playerElement) {
    let videoElement = playerElement.getElementsByTagName("VIDEO");
	
    // Fill the player display in window, keeping picture's aspect ratio.
    let windowAspectRatio = window.innerHeight / window.innerWidth;
    let playerAspectRatio = playerElement.clientHeight / playerElement.clientWidth;
    // We want to keep the video ratio correct for the video stream
    let videoAspectRatio = videoElement.videoHeight / videoElement.videoWidth;
    if(isNaN(videoAspectRatio)){
    	//Video is not initialised yet so set playerElement to size of window
    	styleWidth = window.innerWidth;
    	styleHeight = window.innerHeight;
    	styleTop = 0;
    	styleLeft = 0;
    	playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    } else if (windowAspectRatio < playerAspectRatio) {
    	// Window height is the constraining factor so to keep aspect ratio change width appropriately
        styleWidth = Math.floor(window.innerHeight / videoAspectRatio);
        styleHeight = window.innerHeight;
        styleTop = 0;
        styleLeft = Math.floor((window.innerWidth - styleWidth) * 0.5);
        //Video is now 100% of the playerElement, so set the playerElement style
        playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    } else {
    	// Window width is the constraining factor so to keep aspect ratio change height appropriately
        styleWidth = window.innerWidth;
        styleHeight = Math.floor(window.innerWidth * videoAspectRatio);
        styleTop = Math.floor((window.innerHeight - styleHeight) * 0.5);
        styleLeft = 0;
        //Video is now 100% of the playerElement, so set the playerElement style
        playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
    }
}

function resizePlayerStyleToActualSize(playerElement) {
    let videoElement = playerElement.getElementsByTagName("VIDEO");

    // Display image in its actual size
    styleWidth = videoElement.videoWidth;
    styleHeight = videoElement.videoHeight;
    styleTop = Math.floor((window.innerHeight - styleHeight) * 0.5);
    styleLeft = Math.floor((window.innerWidth - styleWidth) * 0.5);
    //Video is now 100% of the playerElement, so set the playerElement style
    playerElement.style = "top: " + styleTop + "px; left: " + styleLeft + "px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
}

function resizePlayerStyleToArbitrarySize(playerElement) {
    let videoElement = playerElement.getElementsByTagName("VIDEO");
    //Video is now 100% of the playerElement, so set the playerElement style
    playerElement.style = "top: 0px; left: 0px; width: " + styleWidth + "px; height: " + styleHeight + "px; cursor: " + styleCursor + "; " + styleAdditional;
}

function resizePlayerStyle(event) {
	var playerElement = document.getElementById('player');
	
	if(!playerElement)
		return;

	updateVideoStreamSize();

	// Calculating and normalizing positions depends on the width and height of
	// the player.
	playerElementClientRect = playerElement.getBoundingClientRect();
	setupNormalizeAndQuantize();

	if (playerElement.classList.contains('fixed-size'))
		return;

    let checkBox = document.getElementById('enlarge-display-to-fill-window-tgl');
    let windowSmallerThanPlayer = window.innerWidth < playerElement.videoWidth || window.innerHeight < playerElement.videoHeight;
    if (checkBox != null) {
		if (checkBox.checked || windowSmallerThanPlayer) {
			resizePlayerStyleToFillWindow(playerElement);
		} else {
			resizePlayerStyleToActualSize(playerElement);
		}
	} else {
		resizePlayerStyleToArbitrarySize(playerElement);
	}
}

function updateVideoStreamSize() {
    if (!matchViewportResolution) {
        return;
    }

    var now = new Date().getTime();
    if (now - lastTimeResized > 1000) {
        var playerElement = document.getElementById('player');
        if (!playerElement)
            return;

        let descriptor = {
            Console: 'setres ' + playerElement.clientWidth + 'x' + playerElement.clientHeight
        };
        emitUIInteraction(descriptor);
        console.log(descriptor);
        lastTimeResized = new Date().getTime();
    }
    else {
        console.log('Resizing too often - skipping');
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateVideoStreamSize, 1000);
    }
}

// Fix for bug in iOS where windowsize is not correct at instance or orientation change
// https://github.com/dimsemenov/PhotoSwipe/issues/1315
var _orientationChangeTimeout;
function onOrientationChange(event){
	clearTimeout(_orientationChangeTimeout);
	_orientationChangeTimeout = setTimeout(function() {
		resizePlayerStyle();
	}, 500);
}

// Must be kept in sync with PixelStreamingProtocol::EToUE4Msg C++ enum.
const MessageType = {

	/**********************************************************************/

	/*
	 * Control Messages. Range = 0..49.
	 */
	IFrameRequest : 0,
	RequestQualityControl: 1,
    MaxFpsRequest: 2,
    AverageBitrateRequest: 3,
	StartStreaming: 4,
	StopStreaming: 5,

	/**********************************************************************/

	/*
	 * Input Messages. Range = 50..89.
	 */

	// Generic Input Messages. Range = 50..59.
	UIInteraction: 50,
	Command: 51,

	// Keyboard Input Message. Range = 60..69.
	KeyDown: 60,
	KeyUp: 61,
	KeyPress: 62,

	// Mouse Input Messages. Range = 70..79.
	MouseEnter: 70,
	MouseLeave: 71,
	MouseDown: 72,
	MouseUp: 73,
	MouseMove: 74,
	MouseWheel: 75,

	// Touch Input Messages. Range = 80..89.
	TouchStart: 80,
	TouchEnd: 81,
	TouchMove: 82,

	/**************************************************************************/
};

// A generic message has a type and a descriptor.
function emitDescriptor(messageType, descriptor) {
	// Convert the dscriptor object into a JSON string.
	let descriptorAsString = JSON.stringify(descriptor);

	// Add the UTF-16 JSON string to the array byte buffer, going two bytes at
	// a time.
	let data = new DataView(new ArrayBuffer(1 + 2 + 2 * descriptorAsString.length));
	let byteIdx = 0;
	data.setUint8(byteIdx, messageType);
	byteIdx++;
	data.setUint16(byteIdx, descriptorAsString.length, true);
	byteIdx += 2;
	for (i = 0; i < descriptorAsString.length; i++) {
		data.setUint16(byteIdx, descriptorAsString.charCodeAt(i), true);
		byteIdx += 2;
	}
	sendInputData(data.buffer);
}

// A UI interation will occur when the user presses a button powered by
// JavaScript as opposed to pressing a button which is part of the pixel
// streamed UI from the UE4 client.
function emitUIInteraction(descriptor) {
	emitDescriptor(MessageType.UIInteraction, descriptor);
}

// A build-in command can be sent to UE4 client. The commands are defined by a
// JSON descriptor and will be executed automatically.
// The currently supported commands are:
//
// 1. A command to run any console command:
//    "{ ConsoleCommand: <string> }"
//
// 2. A command to change the resolution to the given width and height.
//    "{ Resolution: { Width: <value>, Height: <value> } }"
//
// 3. A command to change the encoder settings by reducing the bitrate by the
//    given percentage.
//    "{ Encoder: { BitrateReduction: <value> } }"
function emitCommand(descriptor) {
	emitDescriptor(MessageType.Command, descriptor);
}

function requestQualityControl() {
	sendInputData(new Uint8Array([MessageType.RequestQualityControl]).buffer);
}

var playerElementClientRect = undefined;
var normalizeAndQuantizeUnsigned = undefined;
var normalizeAndQuantizeSigned = undefined;

function setupNormalizeAndQuantize() {
	let playerElement = document.getElementById('player');
	let videoElement = playerElement.getElementsByTagName("video");
	
	if (playerElement && videoElement.length > 0) {
		let playerAspectRatio = playerElement.clientHeight / playerElement.clientWidth;
		let videoAspectRatio = videoElement[0].videoHeight / videoElement[0].videoWidth;

		// Unsigned XY positions are the ratio (0.0..1.0) along a viewport axis,
		// quantized into an uint16 (0..65536).
		// Signed XY deltas are the ratio (-1.0..1.0) along a viewport axis,
		// quantized into an int16 (-32767..32767).
		// This allows the browser viewport and client viewport to have a different
		// size.
		// Hack: Currently we set an out-of-range position to an extreme (65535)
		// as we can't yet accurately detect mouse enter and leave events
		// precisely inside a video with an aspect ratio which causes mattes.
		if (playerAspectRatio > videoAspectRatio) {
			if (print_inputs) {
				console.log('Setup Normalize and Quantize for playerAspectRatio > videoAspectRatio');
			}
			let ratio = playerAspectRatio / videoAspectRatio;
			// Unsigned.
			normalizeAndQuantizeUnsigned = (x, y) => {
				let normalizedX = x / playerElement.clientWidth;
				let normalizedY = ratio * (y / playerElement.clientHeight - 0.5) + 0.5;
				if (normalizedX < 0.0 || normalizedX > 1.0 || normalizedY < 0.0 || normalizedY > 1.0) {
					return {
						inRange: false,
						x: 65535,
						y: 65535
					};
				} else {
					return {
						inRange: true,
						x: normalizedX * 65536,
						y: normalizedY * 65536
					};
				}
			}
			// Signed.
			normalizeAndQuantizeSigned = (x, y) => {
				let normalizedX = x / (0.5 * playerElement.clientWidth);
				let normalizedY = (ratio * y) / (0.5 * playerElement.clientHeight);
				return {
					x: normalizedX * 32767,
					y: normalizedY * 32767
				};
			}
		} else {
			if (print_inputs) {
				console.log('Setup Normalize and Quantize for playerAspectRatio <= videoAspectRatio');
			}
			let ratio = videoAspectRatio / playerAspectRatio;
			normalizeAndQuantizeUnsigned = (x, y) => {
				// Unsigned.
				let normalizedX = ratio * (x / playerElement.clientWidth - 0.5) + 0.5;
				let normalizedY = y / playerElement.clientHeight;
				if (normalizedX < 0.0 || normalizedX > 1.0 || normalizedY < 0.0 || normalizedY > 1.0) {
					return {
						inRange: false,
						x: 65535,
						y: 65535
					};
				} else {
					return {
						inRange: true,
						x: normalizedX * 65536,
						y: normalizedY * 65536
					};
				}
			}
			normalizeAndQuantizeSigned = (x, y) => {
				// Signed.
				let normalizedX = (ratio * x) / (0.5 * playerElement.clientWidth);
				let normalizedY = y / (0.5 * playerElement.clientHeight);
				return {
					x: normalizedX * 32767,
					y: normalizedY * 32767
				};
			}
		}
	}
}

function emitMouseMove(x, y, deltaX, deltaY) {
	if (print_inputs) {
		console.log(`x: ${x}, y:${y}, dX: ${deltaX}, dY: ${deltaY}`);
	}
	let coord = normalizeAndQuantizeUnsigned(x, y);
	let delta = normalizeAndQuantizeSigned(deltaX, deltaY);
	var Data = new DataView(new ArrayBuffer(9));
	Data.setUint8(0, MessageType.MouseMove);
	Data.setUint16(1, coord.x, true);
	Data.setUint16(3, coord.y, true);
	Data.setInt16(5, delta.x, true);
	Data.setInt16(7, delta.y, true);
	sendInputData(Data.buffer);
}

function emitMouseDown(button, x, y) {
	if (print_inputs) {
		console.log(`mouse button ${button} down at (${x}, ${y})`);
	}
	let coord = normalizeAndQuantizeUnsigned(x, y);
	var Data = new DataView(new ArrayBuffer(6));
	Data.setUint8(0, MessageType.MouseDown);
	Data.setUint8(1, button);
	Data.setUint16(2, coord.x, true);
	Data.setUint16(4, coord.y, true);
	sendInputData(Data.buffer);
}

function emitMouseUp(button, x, y) {
	if (print_inputs) {
		console.log(`mouse button ${button} up at (${x}, ${y})`);
	}
	let coord = normalizeAndQuantizeUnsigned(x, y);
	var Data = new DataView(new ArrayBuffer(6));
	Data.setUint8(0, MessageType.MouseUp);
	Data.setUint8(1, button);
	Data.setUint16(2, coord.x, true);
	Data.setUint16(4, coord.y, true);
	sendInputData(Data.buffer);
}

function emitMouseWheel(delta, x, y) {
	if (print_inputs) {
		console.log(`mouse wheel with delta ${delta} at (${x}, ${y})`);
	}
	let coord = normalizeAndQuantizeUnsigned(x, y);
	var Data = new DataView(new ArrayBuffer(7));
	Data.setUint8(0, MessageType.MouseWheel);
	Data.setInt16(1, delta, true);
	Data.setUint16(3, coord.x, true);
	Data.setUint16(5, coord.y, true);
	sendInputData(Data.buffer);
}

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
const MouseButton = {
	MainButton: 0,			// Left button.
	AuxiliaryButton: 1,		// Wheel button.
	SecondaryButton: 2		// Right button.
};

// https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/buttons
const MouseButtonsMask = {
	PrimaryButton: 1,		// Left button.
	SecondaryButton: 2,		// Right button.
	AuxiliaryButton: 4		// Wheel button.
};

// If the user has any mouse buttons pressed then release them.
function releaseMouseButtons(buttons, x, y) {
	if (buttons & MouseButtonsMask.PrimaryButton) {
		emitMouseUp(MouseButton.MainButton, x, y);
	}
	if (buttons & MouseButtonsMask.SecondaryButton) {
		emitMouseUp(MouseButton.SecondaryButton, x, y);
	}
	if (buttons & MouseButtonsMask.AuxiliaryButton) {
		emitMouseUp(MouseButton.AuxiliaryButton, x, y);
	}
}

// If the user has any mouse buttons pressed then press them again.
function pressMouseButtons(buttons, x, y) {
	if (buttons & MouseButtonsMask.PrimaryButton) {
		emitMouseDown(MouseButton.MainButton, x, y);
	}
	if (buttons & MouseButtonsMask.SecondaryButton) {
		emitMouseDown(MouseButton.SecondaryButton, x, y);
	}
	if (buttons & MouseButtonsMask.AuxiliaryButton) {
		emitMouseDown(MouseButton.AuxiliaryButton, x, y);
	}
}

function registerInputs(playerElement){
	if(!playerElement)
		return;

	registerMouseEnterAndLeaveEvents(playerElement);
	registerTouchEvents(playerElement);
}

function registerMouseEnterAndLeaveEvents(playerElement) {
	playerElement.onmouseenter = function (e) {
		if (print_inputs) {
			console.log('mouse enter');
		}
		var Data = new DataView(new ArrayBuffer(1));
		Data.setUint8(0, MessageType.MouseEnter);
		sendInputData(Data.buffer);
		playerElement.pressMouseButtons(e);
	}

	playerElement.onmouseleave = function (e) {
		if (print_inputs) {
			console.log('mouse leave');
		}
		var Data = new DataView(new ArrayBuffer(1));
		Data.setUint8(0, MessageType.MouseLeave);
		sendInputData(Data.buffer);
		playerElement.releaseMouseButtons(e);
	}
}

// A locked mouse works by the user clicking in the browser player and the
// cursor disappears and is locked. The user moves the cursor and the camera
// moves, for example. The user presses escape to free the mouse.
function registerLockedMouseEvents(playerElement) {
    var x = playerElement.width / 2;
    var y = playerElement.height / 2;

    playerElement.requestPointerLock = playerElement.requestPointerLock || playerElement.mozRequestPointerLock;
    document.exitPointerLock = document.exitPointerLock || document.mozExitPointerLock;

    playerElement.onclick = function () {
        playerElement.requestPointerLock();
    };

    // Respond to lock state change events
    document.addEventListener('pointerlockchange', lockStateChange, false);
    document.addEventListener('mozpointerlockchange', lockStateChange, false);

    function lockStateChange() {
        if (document.pointerLockElement === playerElement ||
            document.mozPointerLockElement === playerElement) {
            console.log('Pointer locked');
            document.addEventListener("mousemove", updatePosition, false);
        } else {
            console.log('The pointer lock status is now unlocked');
            document.removeEventListener("mousemove", updatePosition, false);
        }
    }

    function updatePosition(e) {
        x += e.movementX;
        y += e.movementY;
        if (x > styleWidth) {
        	x -= styleWidth;
        }
        if (y > styleHeight) {
        	y -= styleHeight;
        }
        if (x < 0) {
        	x = styleWidth + x;
        }
        if (y < 0) {
        	y = styleHeight - y;
        }
        emitMouseMove(x, y, e.movementX, e.movementY);
    }

	playerElement.onmousedown = function (e) {
		emitMouseDown(e.button, x, y);
	};

	playerElement.onmouseup = function (e) {
		emitMouseUp(e.button, x, y);
	};
	
	playerElement.onmousewheel = function (e) {
		emitMouseWheel(e.wheelDelta, x, y);
	}

	playerElement.pressMouseButtons = function (e) {
		pressMouseButtons(e.buttons, x, y);
	}

	playerElement.releaseMouseButtons = function (e) {
		releaseMouseButtons(e.buttons, x, y);
	}
}

// A hovering mouse works by the user clicking the mouse button when they want
// the cursor to have an effect over the video. Otherwise the cursor just
// passes over the browser.
function registerHoveringMouseEvents(playerElement) {
	styleCursor = 'none';   // We will rely on UE4 client's software cursor.

	playerElement.onmousemove = function (e) {
		emitMouseMove(e.offsetX, e.offsetY, e.movementX, e.movementY);
		e.preventDefault();
	}

	playerElement.onmousedown = function (e) {
		emitMouseDown(e.button, e.offsetX, e.offsetY);
		e.preventDefault();
	};

	playerElement.onmouseup = function (e) {
		emitMouseUp(e.button, e.offsetX, e.offsetY);
		e.preventDefault();
	};
	
	// When the context menu is shown then it is safest to release the button
	// which was pressed when the event happened. This will guarantee we will
	// get at least one mouse up corresponding to a mouse down event. Otherwise
	// the mouse can get stuck.
	// https://github.com/facebook/react/issues/5531
	playerElement.oncontextmenu = function (e) {
		emitMouseUp(e.button, e.offsetX, e.offsetY);
	}
	
	if ('onmousewheel' in playerElement) {
		playerElement.onmousewheel = function (e) {
			emitMouseWheel(e.wheelDelta, e.offsetX, e.offsetY);
			e.preventDefault();
		}
	} else {
		playerElement.addEventListener('DOMMouseScroll', function (e) {
			emitMouseWheel(e.detail * -120, e.offsetX, e.offsetY);
			e.preventDefault();
		}, false)
	}

	playerElement.pressMouseButtons = function (e) {
		pressMouseButtons(e.buttons, e.offsetX, e.offsetY);
	}

	playerElement.releaseMouseButtons = function (e) {
		releaseMouseButtons(e.buttons, e.offsetX, e.offsetY);
	}
}
	
function registerTouchEvents(playerElement) {

	// We need to assign a unique identifier to each finger.
	// We do this by mapping each Touch object to the identifier.
	var fingers = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
	var fingerIds = {};

	function rememberTouch(touch) {
		let finger = fingers.pop();
		if (finger === undefined) {
			console.log('exhausted touch indentifiers');
		}
		fingerIds[touch.identifier] = finger;
	}

	function forgetTouch(touch) {
		fingers.push(fingerIds[touch.identifier]);
		delete fingerIds[touch.identifier];
	}

	function emitTouchData(type, touches) {
		let data = new DataView(new ArrayBuffer(2 + 6 * touches.length));
		data.setUint8(0, type);
		data.setUint8(1, touches.length);
		let byte = 2;
		for (let t = 0; t < touches.length; t++) {
			let touch = touches[t];
			let x = touch.clientX - playerElement.offsetLeft;
			let y = touch.clientY - playerElement.offsetTop;
			if (print_inputs) {
				console.log(`F${fingerIds[touch.identifier]}=(${x}, ${y})`);
			}
			let coord = normalizeAndQuantizeUnsigned(x, y);
			data.setUint16(byte, coord.x, true);
			byte += 2;
			data.setUint16(byte, coord.y, true);
			byte += 2;
			data.setUint8(byte, fingerIds[touch.identifier], true);
			byte += 1;
			data.setUint8(byte, 255 * touch.force, true);   // force is between 0.0 and 1.0 so quantize into byte.
			byte += 1;
		}
		sendInputData(data.buffer);
	}

	if (inputOptions.fakeMouseWithTouches) {

		var finger = undefined;

		playerElement.ontouchstart = function (e) {
			if (finger === undefined) {
				let firstTouch = e.changedTouches[0];
				finger = {
					id: firstTouch.identifier,
					x: firstTouch.clientX - playerElementClientRect.left,
					y: firstTouch.clientY - playerElementClientRect.top
				};
				// Hack: Mouse events require an enter and leave so we just
				// enter and leave manually with each touch as this event
				// is not fired with a touch device.
				playerElement.onmouseenter(e);
				emitMouseDown(MouseButton.MainButton, finger.x, finger.y);
			}
			e.preventDefault();
		}

		playerElement.ontouchend = function (e) {
			for (let t = 0; t < e.changedTouches.length; t++) {
				let touch = e.changedTouches[t];
				if (touch.identifier === finger.id) {
					let x = touch.clientX - playerElementClientRect.left;
					let y = touch.clientY - playerElementClientRect.top;
					emitMouseUp(MouseButton.MainButton, x, y);
					// Hack: Manual mouse leave event.
					playerElement.onmouseleave(e);
					finger = undefined;
					break;
				}
			}
			e.preventDefault();
		}

		playerElement.ontouchmove = function (e) {
			for (let t = 0; t < e.touches.length; t++) {
				let touch = e.touches[t];
				if (touch.identifier === finger.id) {
					let x = touch.clientX - playerElementClientRect.left;
					let y = touch.clientY - playerElementClientRect.top;
					emitMouseMove(x, y, x - finger.x, y - finger.y);
					finger.x = x;
					finger.y = y;
					break;
				}
			}
			e.preventDefault();
		}
	} else {
		playerElement.ontouchstart = function (e) {
			// Assign a unique identifier to each touch.
			for (let t = 0; t < e.changedTouches.length; t++) {
				rememberTouch(e.changedTouches[t]);
			}

			if (print_inputs) {
				console.log('touch start');
			}
			emitTouchData(MessageType.TouchStart, e.changedTouches);
			e.preventDefault();
		}

		playerElement.ontouchend = function (e) {
			if (print_inputs) {
				console.log('touch end');
			}
			emitTouchData(MessageType.TouchEnd, e.changedTouches);

			// Re-cycle unique identifiers previously assigned to each touch.
			for (let t = 0; t < e.changedTouches.length; t++) {
				forgetTouch(e.changedTouches[t]);
			}
			e.preventDefault();
		}

		playerElement.ontouchmove = function (e) {
			if (print_inputs) {
				console.log('touch move');
			}
			emitTouchData(MessageType.TouchMove, e.touches);
			e.preventDefault();
		}
	}
}

// Browser keys do not have a charCode so we only need to test keyCode.
function isKeyCodeBrowserKey(keyCode) {
	// Function keys or tab key.
	return keyCode >= 112 && keyCode <= 123 || keyCode == 9;
}

function registerKeyboardEvents() {
    document.onkeydown = function (e) {
        if (print_inputs) {
			console.log(`key down ${e.keyCode}, repeat = ${e.repeat}`);
		}
		sendInputData(new Uint8Array([MessageType.KeyDown, e.keyCode, e.repeat]).buffer);
		if (inputOptions.suppressBrowserKeys && isKeyCodeBrowserKey(e.keyCode)) {
			e.preventDefault();
		}
    };

    document.onkeyup = function (e) {
        if (print_inputs) {
			console.log(`key up ${e.keyCode}`);
		}
        sendInputData(new Uint8Array([MessageType.KeyUp, e.keyCode]).buffer);
		if (inputOptions.suppressBrowserKeys && isKeyCodeBrowserKey(e.keyCode)) {
			e.preventDefault();
		}
    };

	document.onkeypress = function (e) {
		if (print_inputs) {
			console.log(`key press ${e.charCode}`);
		}
		let data = new DataView(new ArrayBuffer(3));
		data.setUint8(0, MessageType.KeyPress);
		data.setUint16(1, e.charCode, true);
		sendInputData(data.buffer);
	}
}

function onExpandOverlay_Click() {
	let subElement = document.getElementById('overlaySettings');
	if (subElement.style.display === "none" || subElement.style.display === "") {
		subElement.style.display = "block";
	} else {
		subElement.style.display = "none";
	}
}

function start() {
	let statsDiv = document.getElementById("stats");
	if(statsDiv){
		statsDiv.innerHTML = 'Not connected';
	}
				
	if (!connect_on_load || is_reconnection){
		showConnectOverlay();
		resizePlayerStyle();
	} else {
		connect();
	}
}

function connect() {
	socket = io();

	socket.on('clientConfig', function (clientConfig) {
		onClientConfig(clientConfig);
	});

	socket.on('message', function (data) {
		console.log(`unrecognised message ${data.byteLength}: ${data.slice(0, 50).toString("hex")}`);
	});

	socket.on('clientCount', function (data) {
		var kickButton = document.getElementById('kick-other-players-button');
		if (kickButton)
			kickButton.value = `Kick (${data.count})`;
	});

	socket.on('connect', () => {
		log("connected");
		sendUserConfig();
	});

	socket.on('error', (error) => {
		console.log(`WS error ${error}`);
	});

	socket.on('disconnect', (reason) => {
		console.log(`Connection is closed: ${reason}`);
		socket.close();
		socket = undefined;
		is_reconnection = true;

		// destroy `webRtcPlayerObj` if any
		let playerDiv = document.getElementById('player');
		if (webRtcPlayerObj) {
			playerDiv.removeChild(webRtcPlayerObj.video);
			webRtcPlayerObj.close();
			webRtcPlayerObj = undefined;
		}

		start();
	});
}

/**
 * Config data to sent to the Cirrus web server.
 */
function sendUserConfig() {
	userConfig = {
		emitData: 'ArrayBuffer'
	};
	userConfigString = JSON.stringify(userConfig);
	log(`userConfig = ${userConfigString}`);
	socket.emit('userConfig', userConfigString);
}

/**
 * Config data received from WebRTC sender via the Cirrus web server
 */
function onClientConfig(clientConfig) {
	log(`clientConfig = ${JSON.stringify(clientConfig)}`);

	let playerDiv = document.getElementById('player');
	let playerElement = setupWebRtcPlayer(playerDiv, clientConfig)
	resizePlayerStyle();

	switch (inputOptions.controlScheme) {
		case ControlSchemeType.HoveringMouse:
			registerHoveringMouseEvents(playerElement);
			break;
		case ControlSchemeType.LockedMouse:
			registerLockedMouseEvents(playerElement);
			break;
		default:
			console.log(`ERROR: Unknown control scheme ${inputOptions.controlScheme}`);
			registerLockedMouseEvents(playerElement);
			break;
	}
}

function load() {
	setupHtmlEvents();
    registerKeyboardEvents();
    start();
}
