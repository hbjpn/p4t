var context;

var dogBarkingBuffer = null;
// Fix up prefixing

var globalintv = null;

var cursource = null;
var curstate = false;
var prevstarttime = null;
var prevstartbuftime = null;
var curbuftime = 0;
var inputSelIdx = null;

window.addEventListener('load', init, false);

var midishortcut = {
	pause: [0x90, 0x26, function(v){ return v>0; }],
	rewind: [0x90, 0x24, function(v){ return v>0; }],
	forward: [0x90, 0x28, function(v){ return v>0; }]
}

var rewindv = 3;
var forwardv = 3;

function init() {
  try {
    // Fix up for prefixing
    window.AudioContext = window.AudioContext||window.webkitAudioContext;
    context = new AudioContext();
  }
  catch(e) {
    alert('Web Audio API is not supported in this browser');
  }
  
  document.getElementById('files').addEventListener('change', handleFileSelect, false);
  
  document.onkeydown = onkeydown;
  
  globalintv = setInterval(reflesh, 100);
  
  prepareMIDI();
}

function updateti(tr)
{
	var inttr = Math.floor(tr);
	var subsec = tr - inttr;
	var h = Math.floor(inttr / 3600);
	inttr -= h * 3600;
	var m = Math.floor(inttr / 60);
	inttr -= m * 60;
	var s = inttr;
	var s2 = Math.floor(subsec*10);
	ti.innerHTML = (h<10?'0'+h:h)+":"+(m<10?'0'+m:m)+":"+(s<10?'0'+s:s)+"."+s2;
}

function reflesh()
{
	var ti = document.getElementById("ti");
	if(context !== null && prevstarttime !==null & curstate == true){
		curbuftime = context.currentTime - prevstarttime + prevstartbuftime;
		if(curbuftime >= dogBarkingBuffer.duration){
			curbuftime = dogBarkingBuffer.duration;
			stopSound();
		}
		updateti(curbuftime);
	}
}

function pause()
{
	if(cursource){
		if(curstate){
			stopSound();
		}else{
			playSound(dogBarkingBuffer, context.currentTime + 0, curbuftime);
		}
	}
}

function rewind()
{
	if(cursource){
		if(curstate){
			stopSound();
			curbuftime = Math.max(0, curbuftime - rewindv);
			playSound(dogBarkingBuffer, context.currentTime + 0, curbuftime);
		}else{
			curbuftime = Math.max(0, curbuftime - rewindv);
		}
		updateti(curbuftime);
	}
}

function forward()
{
	if(curstate){
		stopSound();
		curbuftime = Math.min(curbuftime + forwardv, dogBarkingBuffer.duration);
		playSound(dogBarkingBuffer, context.currentTime + 0, curbuftime);
	}else{
		curbuftime = Math.min(curbuftime + forwardv, dogBarkingBuffer.duration);
	}
	updateti(curbuftime);
}

function onkeydown(evt)
{
	console.log("key = " + evt.keyCode);
	if(evt.keyCode == 37 ){ // Left
		rewind();
	}else if(evt.keyCode == 39){ // Right
		forward();
	}else if(evt.keyCode == 40){ // Down 
		pause();
	}
}

function loadDogSound(url) {
  var request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.responseType = 'arraybuffer';

  // Decode asynchronously
  request.onload = function() {
    context.decodeAudioData(request.response, function(buffer) {
      dogBarkingBuffer = buffer;
    }, onError);
  }
  request.send();
}
function stopSound(){
	cursource.stop();
	curstate = false;
	curbuftime = Math.min(context.currentTime - prevstarttime + prevstartbuftime, dogBarkingBuffer.duration);
}

function playSound(buffer, t, st) {
	console.log("Start playing ... ");
	var source = context.createBufferSource(); // creates a sound source
	source.buffer = buffer;                    // tell the source which sound to play
	source.connect(context.destination);       // connect the source to the context's destination (the speakers)
	source.onended = function() {
		console.log("On ended called");
	};
	source.start(t, st);                           // play the source now
											 // note: on older systems, may have to use deprecated noteOn(time);
	prevstarttime = t;
	prevstartbuftime = st;
	curbuftime = prevstartbuftime;
	curstate = true;
	
	cursource = source;
}

function onError(evt)
{
	alert("Error");
}

function handleFileSelect(evt) {
	var files = evt.target.files; // FileList object

	// Loop through the FileList and render image files as thumbnails.
	for (var i = 0, f; f = files[i]; i++) {
	
	  var reader = new FileReader();

	  // Closure to capture the file information.
	  reader.onload = (function(theFile) {
		return function(e) {
			context.decodeAudioData(reader.result, function(buffer) {
				dogBarkingBuffer = buffer;
				playSound(dogBarkingBuffer, context.currentTime + 0, 0);
			}, onError);
		};
	  })(f);

	  // Read in the image file as a data URL.
	  reader.readAsArrayBuffer(f);
	}
}

function prepareMIDI(){
    navigator.requestMIDIAccess({
        sysex: false
    }).then(function (access) {
		// MIDI Inputデバイスの配列を作成
		midi = {inputs: [], outputs:[]};
		var select = document.getElementById('midiin');
		
		var inputIterator = access.inputs.values();
		var i = 0;
		for (var o = inputIterator.next(); !o.done; o = inputIterator.next()) {
			midi.inputs.push(o.value);
			console.log(o.value);
			
			var option = document.createElement('option');
 
			option.setAttribute('value', i+1);
			option.innerHTML = o.value.name;
 
			select.appendChild(option);
			
			++i;
		}
		
		select.addEventListener("change", function(event){
			if(inputSelIdx!=null && inputSelIdx > 0)
				midi.inputs[inputSelIdx-1].onmidimessage=null;                                                                                        
			
			if(event.target.value > 0){
				midi.inputs[event.target.value-1].onmidimessage=OnMidiMessage;
			}
			
			inputSelIdx = event.target.value;
		});
 
		// MIDI Outputデバイスの配列を作成
		var outputIterator = access.outputs.values();
		for (var o = outputIterator.next(); !o.done; o = outputIterator.next()) {
			midi.outputs.push(o.value);
			console.log(o.value);
		}
		
    }, function (err) {
 	   alert("MIDI ERROR");
        console.dir(err);
    });
}

function MatchUint8Array(a,b){
	// b shall be Uint8Array
	// a can be array of number or function
	if(a.length != b.length) return false;
	
	for(var i = 0; i < a.length; ++i){
		if(typeof(a[i]) == 'function'){
			var ret = a[i](b[i]);
			if(!ret) return false;
		}else if(a[i] != b[i])
			return false;
	}
	
	return true;
}

function MidiMsgMathcher(evt)
{
	if( midishortcut.pause && MatchUint8Array(midishortcut.pause,evt.data) )
		pause();
	else if( midishortcut.rewind && MatchUint8Array(midishortcut.rewind,evt.data))
		rewind();
	else if( midishortcut.forward && MatchUint8Array(midishortcut.forward,evt.data))
		forward();
}

function OnMidiMessage(evt)
{
	//console.log(evt);
	var msgstr = "";
	// Ingore
	if (evt.data.length == 1 && evt.data[0] == 0xf8)
		return;
	if (evt.data.length == 1 && evt.data[0] == 0xfe)
		return;
	for(var i = 0; i < evt.data.length; ++i){
		msgstr += evt.data[i].toString(16) + " ";
	}
	console.log(msgstr);
	
	MidiMsgMathcher(evt);
}

function rewindvchange()
{
	var v = document.getElementById("rewindv").value;
	if(!isNaN(v))
		rewindv = v * 1;
}

function forwardvchange()
{
	var v = document.getElementById("forwardv").value;
	if(!isNaN(v))
		forwardv = v * 1;
	console.log("fw = " + forwardv);
}
