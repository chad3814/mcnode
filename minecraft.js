var hexdump = document.getElementById('hexdump').contentDocument;
var css = hexdump.createElement('link');
css.href = window.location.origin + '/hexdump.css';
css.rel = 'stylesheet';
css.type = 'text/css';
hexdump.head.appendChild(css);
hexdump = hexdump.body;

var packetlog = document.getElementById('packetlog').contentDocument;
css = packetlog.createElement('link');
css.href = window.location.origin + '/packetlog.css';
css.rel = 'stylesheet';
css.type = 'text/css';
packetlog.head.appendChild(css);
packetlog = packetlog.body;

var log = (function() {
    var msgs = [];

    var add_to_dump = (function() {
	var current_index = 0;
	
	var _add_to_dump = function(msgid) {
	    var line = msgs[msgid]['raw'];
	    
	    child = document.createElement('div');
	    if(msgs[msgid]['from'] == 'server') {
		child.className = 'server';
	    } else {
		child.className = 'client';
	    }
	    child.title = 'message id ' + msgid;

	    while(line.length > 0) {
		if(child.innerHTML != '') {
		    child.innerHTML += '<br/>';
		}
		var pos = Number(current_index).toString(16);
		var pad = "";
		switch(pos.length) {
		case 1: pad += '0';
		case 2: pad += '0';
		case 3: pad += '0';
		case 4: pad += '0';
		case 5: pad += '0';
		case 6: pad += '0';
		case 7: pad += '0';
		}
		pos = pad + pos;
		var text = pos.substr(0,4) + ' ' + pos.substr(4) + ' | ';
		var text2 = '';
		for(var j=0; j<8; ++j) {
		    if(line.length > 0) {
			text += line.substr(0, 2) + ' ';
			var n = Number('0x' + line.substr(0, 2)).valueOf();
			if(n < 33 || n > 126) {
			    text2 += '.';
			} else {
			    text2 += String.fromCharCode(n);
			}
			line = line.substr(2);
			current_index++;
		    } else {
			text += '&nbsp;&nbsp;&nbsp;';
		    }
		}
		text += '&nbsp;&nbsp;';
		text2 += '&nbsp;';
		for(; j<16; ++j) {
		    if(line.length > 0) {
			text += line.substr(0, 2) + '&nbsp;';
			var n = Number('0x' + line.substr(0, 2)).valueOf();
			if(n < 33 || n > 126) {
			    text2 += '.';
			} else {
			    text2 += String.fromCharCode(n);
			}
			line = line.substr(2);
			current_index++;
		    } else {
			text += '&nbsp;&nbsp;&nbsp;';
		    }
		}
		text += '&nbsp;&nbsp;&nbsp;' + text2;
		// console.log(text);
		child.innerHTML += text;
	    }
	    hexdump.appendChild(child);
	};

	return _add_to_dump;
    })();

    var _log = function(msg) {
	var child;
	if(!(msg instanceof Object)) {
	    msg = {'packet':msg, 'from':'info'};
	}

	var msgid = msgs.length;
	msgs.push(msg);

	if(hexdump && msg['raw']) {
	    add_to_dump(msgid);
	}

	child = document.createElement('div');
	child.className = 'entry';
	child.title = 'message id ' + msgid;

	if(msg['from'] == 'server' || msg['from'] == 'info') {
	    child.className += ' ' + msg['from'];
	} else {
	    child.className += ' client';
	}
	child.id = 'msg' + msgid;

	var legend = document.createElement('div');
	legend.className = 'title';
	legend.innerText = msg['packet'] + ' :: ' + msg['from'] + (msg['to']?' => ' + msg['to']:'');
	child.appendChild(legend);
	var tab = document.createElement('div');
	var first = true;
	for(var k in msg) {
	    if(k != 'packet' && k != 'from' && k != 'to') {
		if(k != 'raw') {
		    if(!first) {
			first = false;
			var comma = document.createElement('span');
			comma.innerText = ', ';
			tab.appendChild(comma);
		    }
		    var th = document.createElement('span');
		    th.className = 'key';
		    th.innerText = k;
		    tab.appendChild(th);
		    var td = document.createElement('span');
		    td.innerText = ' => ' + msg[k];
		    tab.appendChild(td);
		}
	    }
	}
	child.appendChild(tab);
	//document.body.appendChild(child);
	packetlog.appendChild(child);
	//if(!hexdump) window.scrollTo(0, document.body.scrollHeight);
    };

    return _log;
})();
