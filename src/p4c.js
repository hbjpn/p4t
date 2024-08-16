var context;

var originalBuffer = null;
var playBuffer = null;

// Create a gain node.
var gainNode = null;
var scriptNode = null;

// Fix up prefixing

var globalintv = null;

var cursource = null;
var curstate = false;
var prevstarttime = null;
var prevstartbuftime = null;
var curbuftime = 0;
var inputSelIdx = null;
var exactSpeed = 1.0;

var pos_slider_dragging = false;

window.addEventListener('load', init, false);
var midishortcut = {
	pause: [0x90, 0x1a, function(v){ return v>0; }],
	rewind: [0x90, 0x18, function(v){ return v>0; }],
	forward: [0x90, 0x1c, function(v){ return v>0; }]
}
var mrec = null;

var rewindv = 3;
var forwardv = 3;

function midi_fromhex(key)
{
	var A0 = 0x3C - 12*3 - 3;
	var offset = key - A0; // offset from A0
	var octave = Math.floor(offset / 12.0);
	var oto = offset % 12;
	var ol = ["A","A#","B","C","C#","D","D#","E","F","F#","G","G#"];
	return ol[oto]+octave;
}

function midi_tohex(onmei)
{
	var A0 = 0x3C - 12*3 - 3;
	var octave = parseInt(onmei[onmei.length-1]);
	var ols = onmei.substr(0,onmei.length-1);
	var ol = ["A","A#","B","C","C#","D","D#","E","F","F#","G","G#"];
	var oto = ol.indexOf(ols);
	return A0 + 12*octave + oto;
}

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

	$('#slider-volume').slider({
		range: "min",
		min: 0,
		max: 1,
		step: 0.01,
		value: 1,
		slide: function(evt,ui){ if (gainNode){ gainNode.gain.value = ui.value; } },
		stop: function(evt, ui){ document.activeElement.blur(); } // We intentionally blur the focus as slider changes with keyboard arrow which is intended for position slider control
	});

	$('#slider-position').slider({
		range: "min",
		min: 0,
		max: 1,
		step: 0.001,
		value: 0,
		change: function(evt,ui){ /*console.log("change");*/ /*moveto(ui.value); */ },
		start: function(evt,ui){ /*console.log("start");*/ pos_slider_dragging = true; },
		stop: function(evt,ui){
			/*console.log("stop");*/ moveto(ui.value); pos_slider_dragging = false; 
			document.activeElement.blur(); // We intentionally blur the focus as positioning with keyboard arrow does not work correctly if slider tick is gaining focus
		} // This is more suitable for manual changing of the slider
		});
	
	setmidikey();
	
	$("#midi_pause").change(function(){ midishortcut.pause[1] = midi_tohex( $( this ).val() ); });
	$("#midi_rewind").change(function(){ midishortcut.rewind[1] = midi_tohex( $( this ).val() ); });
	$("#midi_forward").change(function(){ midishortcut.forward[1] = midi_tohex( $( this ).val() ); });
	
	$(".mrec").mousedown(function(e){
		mrec = $(e.target).attr("op");
	});
	$(".mrec").mouseup(function(e){
		mrec = null;
	});
}

function setmidikey()
{
	$("#midi_pause").val(midi_fromhex(midishortcut.pause[1]));
	$("#midi_rewind").val(midi_fromhex(midishortcut.rewind[1]));
	$("#midi_forward").val(midi_fromhex(midishortcut.forward[1]));
}

function updateti(tr_real)
{
	// tr_real is time in buffer
	tr = tr_real * exactSpeed;
	var inttr = Math.floor(tr);
	var subsec = tr - inttr;
	var h = Math.floor(inttr / 3600);
	inttr -= h * 3600;
	var m = Math.floor(inttr / 60);
	inttr -= m * 60;
	var s = inttr;
	var s2 = Math.floor(subsec*10);
	ti.innerHTML = (h<10?'0'+h:h)+":"+(m<10?'0'+m:m)+":"+(s<10?'0'+s:s)+"."+s2;
	
	if(!pos_slider_dragging)
		$('#slider-position').slider('value',tr_real/playBuffer.duration);
}

function reflesh()
{
	var ti = document.getElementById("ti");
	if(context !== null && prevstarttime !==null & curstate == true){
		curbuftime = context.currentTime - prevstarttime + prevstartbuftime;
		if(curbuftime >= playBuffer.duration){
			curbuftime = playBuffer.duration;
			stopSound();
		}
		updateti(curbuftime);
	}
}

function moveto(pos)
{
	// pos is 0...1
	if(cursource){
		if(curstate){
			stopSound();
			curbuftime = playBuffer.duration * pos;
			playSound(playBuffer, context.currentTime + 0, curbuftime);
		}else{
			curbuftime = playBuffer.duration * pos;
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
			playSound(playBuffer, context.currentTime + 0, curbuftime);
		}
	}
}

function rewind()
{
	if(cursource){
		if(curstate){
			stopSound();
			curbuftime = Math.max(0, curbuftime - rewindv);
			playSound(playBuffer, context.currentTime + 0, curbuftime);
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
		curbuftime = Math.min(curbuftime + forwardv, playBuffer.duration);
		playSound(playBuffer, context.currentTime + 0, curbuftime);
	}else{
		curbuftime = Math.min(curbuftime + forwardv, playBuffer.duration);
	}
	updateti(curbuftime);
}

function onkeydown(evt)
{
	console.log("key = " + evt.keyCode);
	if(evt.keyCode == 37 ){ // Left
		rewind();
		evt.preventDefault();
	}else if(evt.keyCode == 39){ // Right
		forward();
		evt.preventDefault();
	}else if(evt.keyCode == 40){ // Down 
		pause();
		evt.preventDefault();
	}
}

function loadDogSound(url) {
  var request = new XMLHttpRequest();
  request.open('GET', url, true);
  request.responseType = 'arraybuffer';

  // Decode asynchronously
  request.onload = function() {
    context.decodeAudioData(request.response, function(buffer) {
      originalBuffer = buffer;
    }, onError);
  }
  request.send();
}
function stopSound(){
	if (cursource)
		cursource.stop();
	curstate = false;
	if (context && playBuffer)
		curbuftime = Math.min(context.currentTime - prevstarttime + prevstartbuftime, playBuffer.duration);
	if(gainNode)
		gainNode.disconnect();
	if(scriptNode)
		scriptNode.disconnect();
}


function copyto(dst, src, dst_start, src_start, len)
{
	//console.log("Copy dst=" + dst_start + ", src=" + src_start + "/" + len);
	var v_dst = dst.subarray(dst_start);
	var v_src = src.subarray(src_start, src_start+len);
	v_dst.set(v_src, 0);
}

function addto(dst, src, dst_start, src_start, len, wnd_head, wnd_tail)
{
	//console.log("Copy dst=" + dst_start + ", src=" + src_start + "/" + len);
	var v_dst = dst.subarray(dst_start);
	var v_src = src.slice(src_start, src_start+len);
	windowing(v_src, wnd_head, wnd_tail);
	for(var i = 0; i < len; ++i){
		//v_dst.set(v_src, 0);
		v_dst[i] += v_src[i];
	}
}

function windowing(f32array, head, tail)
{
	if(head > 0){
		for(var i = 0; i < head; ++i){
			f32array[i] *= Math.sin(Math.PI/2/head*i);
		}
	}
	if(tail > 0){
		for(var i = f32array.length - tail; i < f32array.length; ++i){
			var j = i - f32array.length + tail;
			f32array[i] *= Math.cos(Math.PI/2/tail*(j+1));
		}
	}
}

function time_pitch_streach(buffer, time_streah_rate)
{
	// Support only slow down 
	if(time_streah_rate >= 1.0){
		exactSpeed = time_streah_rate;
		return buffer;
	}
	
	console.log("Time pitch strech start ... ");
	// The input buffer is the song we loaded earlier
	var buflen = buffer.length;
	// The output buffer contains the samples that will be modified and played
	//var outputBuffer = audioProcessingEvent.outputBuffer;
	
	var blocksize = 4410;
	var window_size = 100;
	var bs_size = Math.floor( (blocksize - window_size) * time_streah_rate, 1 );
	exactSpeed = bs_size / ( blocksize - window_size );
	
	var num_copy = Math.ceil((buflen - blocksize) / bs_size, 1);
	var new_buf_size = (num_copy-1) * (blocksize - window_size) + (buflen - (num_copy-1) * bs_size - window_size);
	console.log("Org buf size = " + buflen + ", New buf size = " + new_buf_size + ", num_copy = " + num_copy);
	console.log("bs_size = " + bs_size);
	var retbuf = context.createBuffer(buffer.numberOfChannels, new_buf_size, context.sampleRate);
	
	// Loop through the output channels (in this case there is only one)
	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var inputData = buffer.getChannelData(channel); // Float 32 Array
		var fb = retbuf.getChannelData(channel);
		// Time stretch
		for(var block_idx = 0; block_idx < num_copy; ++block_idx){
			var remain = buflen - bs_size * block_idx;
			copysize = Math.min( blocksize, remain );
			//copyto(fb, inputData, (blocksize - window_size) * block_idx, bs_size * block_idx, copysize);
			addto(fb, inputData, (blocksize - window_size) * block_idx, bs_size * block_idx, copysize, window_size, window_size);
		}
	}
	
	return retbuf;
}

function time_pitch_streach_ex(buffer, time_streah_rate)
{
	// Support only slow down 
	/*if(time_streah_rate >= 1.0){
		exactSpeed = time_streah_rate;
		return buffer;
	}*/
	
	console.log("Time pitch strech start ... ");
	// The input buffer is the song we loaded earlier
	var buflen = buffer.length;
	// The output buffer contains the samples that will be modified and played
	//var outputBuffer = audioProcessingEvent.outputBuffer;
	
	var blocksize = 4410;
	var window_size = 100;
	var bs_size = Math.floor( (blocksize - window_size) * time_streah_rate, 1 );
	exactSpeed = bs_size / ( blocksize - window_size );
	
	var num_copy = Math.ceil((buflen - blocksize) / bs_size, 1);
	var new_buf_size = (num_copy-1) * (blocksize - window_size) + (buflen - (num_copy-1) * bs_size - window_size);
	console.log("Org buf size = " + buflen + ", New buf size = " + new_buf_size + ", num_copy = " + num_copy);
	console.log("bs_size = " + bs_size);
	var retbuf = context.createBuffer(buffer.numberOfChannels, new_buf_size, context.sampleRate);
	
	// Loop through the output channels (in this case there is only one)
	for (var channel = 0; channel < buffer.numberOfChannels; channel++) {
		var inputData = buffer.getChannelData(channel); // Float 32 Array
		var fb = retbuf.getChannelData(channel);
		zero_crosses = [];
		prev_zero_cross = 0;
		for(var i = 0; i < inputData.length; ++i){
			if(i == 0 ) continue;
			if ( (inputData[i-1] > 0 && inputData[i] <= 0) || ( inputData[i-1] < 0 && inputData[i] >= 0 ) ){
				if(i - prev_zero_cross >= blocksize){
					console.log("ZeroCross = " + i  + " / " + (i - prev_zero_cross));
					prev_zero_cross = i;
				}
			}
		}
	}
	
	return retbuf;
}

function playSound(buffer, t, st) {
	console.log("Start playing ... ");
	var source = context.createBufferSource(); // creates a sound source
	source.buffer = buffer;                    // tell the source which sound to play
	source.detune.value = 0;
	source.playbackRate.value = 1;
	
	if(!scriptNode){
		scriptNode = context.createScriptProcessor(4096, 1, 1);
		scriptNode.onaudioprocess = onAudioProcess;
	}else{
		scriptNode.disconnect();
	}
	
	var curgain = gainNode ? gainNode.gain.value : 1;
	
	//source.connect(scriptNode);
	
	if(!gainNode){
		gainNode = context.createGain();
	}else{
		gainNode.disconnect();
	}
	//scriptNode.connect(gainNode);
	source.connect(gainNode);
	gainNode.gain.value = curgain;
	gainNode.connect(context.destination);
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


function onAudioProcess(audioProcessingEvent){
  // The input buffer is the song we loaded earlier
  var inputBuffer = audioProcessingEvent.inputBuffer;
  var buflen = inputBuffer.length;
  
  // The output buffer contains the samples that will be modified and played
  var outputBuffer = audioProcessingEvent.outputBuffer;

  // Loop through the output channels (in this case there is only one)
  for (var channel = 0; channel < outputBuffer.numberOfChannels; channel++) {
    var inputData = inputBuffer.getChannelData(channel); // Float 32 Array
    var outputData = outputBuffer.getChannelData(channel);
    
    // Loop through the 4096 samples
    for (var sample = 0; sample < inputBuffer.length; sample++) {
      // make output equal to the same as the input
      outputData[sample] = inputData[sample];

      // add noise to each output sample
      outputData[sample] += ((Math.random() * 2) - 1) * 0.01;         
    }
  }
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
				originalBuffer = buffer;
				var value = $("#speedselect").val(); // 値
				playBuffer = time_pitch_streach(originalBuffer, value);
				// time_pitch_streach_ex(originalBuffer, value); TODO : Under deplopment
				playSound(playBuffer, context.currentTime + 0, 0);
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
	
	if(mrec){
		if(evt.data[0]==0x90){
			midishortcut[mrec][1] = evt.data[1];
			setmidikey();
		}
	}
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

function speedchange(obj)
{
	if(!originalBuffer)
		return;
	
	stopSound();
    var value = $("#speedselect").val();
    var prevExactSpeed = exactSpeed;
	playBuffer = time_pitch_streach(originalBuffer, value);
	var nextExactSpeed = exactSpeed;
	console.log("Prev Speed : " + prevExactSpeed + ", Next speed : " + nextExactSpeed);
	console.log("Prev buf time : " + curbuftime);
	curbuftime = curbuftime * prevExactSpeed / nextExactSpeed;
	console.log("Next buf time : " + curbuftime);
	playSound(playBuffer, context.currentTime + 0, curbuftime);
}