var net = require('net');
var http = require('http');
var io = require('socket.io');
var fs = require('fs');
var EventEmitter = require('events').EventEmitter
var path = require('path');
var util = require('util');

var cwd = process.cwd();
util.log('starting in ' + cwd);
var jspack = require(cwd + '/jspack.js').jspack;

var joose = require('task-joose-nodejs');
var Class = joose.Class;
var Role = joose.Role;
var Module = joose.Module;
require('JSON2');

var config = null;
try {
    config = JSON.parse(fs.readFileSync(cwd + '/config.json'));

    fs.watchFile(cwd + '/config.json', function(cur, prev) {
	if(cur.mtime.getTime() != prev.mtime.getTime()) {
	    fs.readFile(cwd + '/config.json', function(err, data) {
		if(err) throw err;
		config = JSON.parse(data);
		util.log('reloaded config');
	    });
	}
    });
} catch(err) {
    util.log('error reading config.json, using defaults');
    util.log('Error: ' + err.message);
    util.log('Stack: ' + err.stack);
    // default
    config = {
	'server':{
	    'ip':'127.0.0.1',
	    'port':25566
	},
	'mc_listen':{
	    'ip':'0.0.0.0',
	    'port':25565,
	    'allow_cidr':['0.0.0.0/0'],
	    'deny_cidr':[]
	},
	'web_listen':{
	    'ip':'0.0.0.0',
	    'port':8080,
	    'allow_cidr':['0.0.0.0/0'],
	    'deny_cidr':[]
	}
    };
}

//util.log("running with config:\n" + util.inspect(config, false, null));

//util functions for ip's
var ip2long = function(ip) {
    var ips = ip.split('.');
    var iplong = 0;
    with (Math) {
	iplong = ips[0] * pow(256,3) + ips[1] * pow(256,2) + ips[2] * 256 + ips[3] * 1;
    }
    return iplong;
};

var lastcidr = function(iplong, mask) {
    return iplong + Math.pow(2, (32 - mask)) - 1;
};

var inRange = function(ip, ranges) {
    var iplong = ip2long(ip);
    for(var i = 0; i < ranges.length; ++i) {
	//util.debug('ranges['+i+'][0]: ' + ranges[i][0] + '; ranges['+i+'][1]: ' + ranges[i][1] + '; iplong: ' + iplong);
	if(ranges[i][0] <= iplong && iplong <= ranges[i][1]) return true;
    }
    return false;
};

// calculate CIDR ranges
config.mc_listen.allow_range = new Array();
for(var cidr in config.mc_listen.allow_cidr) {
    cidr = config.mc_listen.allow_cidr[cidr].split('/');
    var firstip = ip2long(cidr[0]);
    var lastip = lastcidr(firstip, cidr[1]);
    config.mc_listen.allow_range.push([firstip, lastip]);
}
config.mc_listen.deny_range = new Array();
for(var cidr in config.mc_listen.deny_cidr) {
    cidr = config.mc_listen.deny_cidr[cidr].split('/');
    var firstip = ip2long(cidr[0]);
    var lastip = lastcidr(firstip, cidr[1]);
    config.mc_listen.deny_range.push([firstip, lastip]);
}
config.web_listen.allow_range = new Array();
for(var cidr in config.web_listen.allow_cidr) {
    cidr = config.web_listen.allow_cidr[cidr].split('/');
    var firstip = ip2long(cidr[0]);
    var lastip = lastcidr(firstip, cidr[1]);
    config.web_listen.allow_range.push([firstip, lastip]);
}
config.web_listen.deny_range = new Array();
for(var cidr in config.web_listen.deny_cidr) {
    cidr = config.web_listen.deny_cidr[cidr].split('/');
    var firstip = ip2long(cidr[0]);
    var lastip = lastcidr(firstip, cidr[1]);
    config.web_listen.deny_range.push([firstip, lastip]);
}

// sends a file in response to an HTTP request
var sendFile = (function() {
    var index = {};
    var send = function(filename, res) {
	if(index[filename] == null) {
	    fs.readFile(filename, 'utf8', function(err, data) {
		if(err) throw err;
		index[filename] = data;
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.end(index[filename]);
		util.log('cached ' + filename);
	    });
	    fs.watchFile(filename, function(cur, prev) {
		if(cur.mtime.getTime() != prev.mtime.getTime()) {
		    util.log(filename + ': ' + cur.mtime + ' != ' + prev.mtime);
		    fs.readFile(filename, 'utf8', function(err, data) {
			if(err) throw err;
			index[filename] = data;
			util.log('updated cache of ' + filename);
		    });
		}
	    });
	} else {
	    res.writeHead(200, {'Content-Type': 'text/html'});
	    res.end(index[filename]);
	}
    };

    return send;
})();

// configure web server
var web_server = http.createServer(function(req, res) {
    if(!inRange(req.socket.remoteAddress, config.web_listen.allow_range) ||
       inRange(req.socket.remoteAddress, config.web_listen.deny_range)) {
	res.writeHeader(405);
	res.end();
	util.log('denied web connection from ' + req.socket.remoteAddress);
	return;
    }
    util.log('got request for: ' + req.url + '; from: ' + req.socket.remoteAddress);
    if(req.url == '/') req.url = '/index.html';
    util.log('translated to: ' + cwd + req.url);
    path.exists(cwd + req.url, function(exists) {
	if(exists) {
	    sendFile(cwd + req.url, res);
	} else {
	    util.log('request for unknown file ' + req.url);
	    res.writeHead(404);
	    res.end();
	}
    });
});

// start web server
web_server.listen(config.web_listen.port, config.web_listen.ip);

// hook socket.io up to the web server
var socket = io.listen(web_server);

// utility function to convert bytes into two-digit hex
var hex_dump = function(data) {
    var hex = "";
    for(var i=0; i<data.length; ++i) {
	var h = (new Number(data[i])).toString(16);
	if(h.length < 2) {
	    h = "0" + h;
	}
	hex += h;
    }
    hex = hex.substr(0, hex.length);
    return hex;
};

// protocol parser
var parser = (function() {
    var Parser = function() {
	this.buffs = {};
    };
    
    var ParseError = function(requested, had) {
	util.log("parse error thrown");
	this.requested = requested;
	this.had = had;
    };
    // ParseError.prototype = Error.prototype;
    ParseError.prototype.toString = function() {
	return "Tried to read " + this.requested + " additional bytes, but had only " + this.had;
    };

    var parse_byte = function(buffer) {

	if(buffer[0] <= 127) {
	    return buffer[0];
	}
	var b = buffer[0] - 1;
	b ^= 0xFF;
	return -1 * b;
    };

    var parse_short = function(buffer) {
	var unsigned = (buffer[0] << 8) | buffer[1];
	if(unsigned <= 32767) {
	    return unsigned;
	}
	var s = unsigned - 1;
	s ^= 0xFFFF;
	return -1 * s;
    };

    var parse_int = function(buffer) {
	var unsigned = (buffer[0] << 24) | (buffer[1] << 16) | (buffer[2] << 8) | buffer[3];
	if(unsigned <= 2147483647) {
	    return unsigned;
	}
	var i = unsigned - 1;
	i ^= 0xFFFFFFFF;
	return -1 * i;
    };

    var parse_long = function(buffer) {
	var unsigned = (buffer[0] << 56) | (buffer[1] << 48) | (buffer[2] << 40) | (buffer[3] << 32) | (buffer[4] << 24) | (buffer[5] << 16) | (buffer[6] << 8) | buffer[7];
	if(unsigned <= 9223372036854775807) {
	    return unsigned;
	}
	var l = unsigned - 1;
	l ^= 0xFFFFFFFFFFFFFFFF;
	return -1 * l;
    };

    var parse_float = function(buffer) {
	return jspack.Unpack('f', buffer, 0);
    };

    var parse_double = function(buffer) {
	return jspack.Unpack('d', buffer, 0);
    };

    var parse_packet = function(buffer, msg, format, fields) {
	var pos = 1;		// skip the packet id
	for(var j=0; j<format.length; ++j) {
	    switch(format[j]) {
	    case 'b':
		if(pos >= buffer.length) return -1;
		var b = parse_byte(buffer.slice(pos));
		pos += 1;
		msg[fields[j]] = b;
		break;
	    case 's':
		if((pos+1) >= buffer.length) return -1;
		var s = parse_short(buffer.slice(pos));
		pos += 2;
		msg[fields[j]] = s;
		break;
	    case 'i':
		if((pos+3) >= buffer.length) return -1;
		var i = parse_int(buffer.slice(pos));
		pos += 4;
		msg[fields[j]] = i;
		break;
	    case 'l':
		if((pos+7) >= buffer.length) return -1;
		var l = parse_long(buffer.slice(pos));
		pos += 8;
		msg[fields[j]] = l;
		break;
	    case 'f':
		if((pos+3) >= buffer.length) return -1;
		var f = parse_float(buffer.slice(pos));
		pos += 4;
		msg[fields[j]] = f;
		break;
	    case 'd':
		if((pos+7) >= buffer.length) return -1;
		var d = parse_double(buffer.slice(pos));
		pos += 8;
		msg[fields[j]] = d;
		break;
	    case 'S':
		//util.log('parsing string, current pos: ' + pos + '; buffer.length: ' + buffer.length);
		if((pos+1) >= buffer.length) return -1;
		var len = parse_short(buffer.slice(pos));
		pos += 2;
		//util.log('...pos: ' + pos + '; len: ' + len);
		if((pos+len-1) >= buffer.length) return -1;
		var S = buffer.toString('utf8', pos, pos + len);
		pos += len;
		//util.log('...pos: ' + pos + '; S: ' + S);
		msg[fields[j]] = S;
		break;
	    case 'B':
		if((pos+0) >= buffer.length) return -1;
		var B = parse_byte(buffer.slice(pos));
		pos += 1;
		msg[fields[j]] = (B == 1);
		break;
	    case 'm':
		var m = new Buffer(0);
		if((pos+0) >= buffer.length) return -1;
		var x = parse_byte(buffer.slice(pos));
		pos += 1;
		while(x != 127) {
		    switch(x >> 5) {
		    case 0:
			if((pos+0) >= buffer.length) return -1;
			var n = new Buffer(m.length + 1);
			m.copy(n, 0, 0);
			buffer.copy(n, m.length, pos, pos + 1)
			pos += 1;
			m = n;
			break;
		    case 1:
			if((pos+1) >= buffer.length) return -1;
			var n = new Buffer(m.length + 2);
			m.copy(n, 0, 0);
			buffer.copy(n, m.length, pos, pos + 2);
			pos += 2;
			m = n;
			break;
		    case 2:
		    case 3:
			if((pos+3) >= buffer.length) return -1;
			var n = new Buffer(m.length + 4);
			m.copy(n, 0, 0);
			buffer.copy(n, m.length, pos, pos + 4);
			pos += 4;
			m = n;
			break;
		    case 4:
			if((pos+1) >= buffer.length) return -1;
			var len = parse_short(buffer.slice(pos));
			if((pos+len-1) >= buffer.length) return -1;
			var n = new Buffer(m.length + 2 + len);
			m.copy(n, 0, 0);
			buffer.copy(n, m.length, pos, pos + 2 + len);
			pos += 2 + len;
			m = n;
			break;
		    case 5:
			if((pos+4) >= buffer.length) return -1;
			var n = new Buffer(m.length + 5);
			m.copy(n, 0, 0);
			buffer.copy(n, m.length, pos, pos + 5);
			pos += 5;
			m = n;
			break;
		    }
		    if((pos+0) >= buffer.length) return -1;
		    x = parse_byte(buffer.slice(pos));
		    pos += 1;
		}
		msg[fields[j]] = hex_dump(m);
		break;
		// The following are not basic types, but custom types for specific packets
	    case 'c':
		// Compressed data
		if((pos+3) >= buffer.length) return -1;
		var len = parse_int(buffer.slice(pos));
		pos += 4;
		if((pos+len-1) >= buffer.length) return -1;
		msg[fields[j]] = hex_dump(buffer.slice(pos, pos + len));
		pos += len;
		break;
	    case 'a':
		// three arrays, the first is shorts and the others are bytes
		if((pos+1) >= buffer.length) return -1;
		var len = parse_short(buffer.slice(pos));
		pos += 2;
		if((pos+(2*len)-1) >= buffer.length) return -1;
		var s_arr = [];
		for(var k=0; k < len; ++k) {
		    s_arr.push(parse_short(buffer.slice(pos)));
		    pos += 2;
		}
		if((pos+len-1) >= buffer.length) return -1;
		var b1_arr = [];
		for(var k=0; k < len; ++k) {
		    b1_arr.push(parse_byte(buffer.slice(pos)));
		    pos += 1;
		}
		if((pos+len-1) >= buffer.length) return -1;
		var b2_arr = [];
		for(var k=0; k < len; ++k) {
		    b2_arr.push(parse_byte(buffer.slice(pos)));
		    pos += 1;
		}
		msg[fields[j][0]] = hex_dump(s_arr);
		msg[fields[j][1]] = hex_dump(b1_arr);
		msg[fields[j][2]] = hex_dump(b2_arr);
		break;
	    case 'r':
		// an array of tripple bytes
		if((pos+3) >= buffer.length) return -1;
		var len = parse_int(buffer.slice(pos));
		pos += 4;
		if((pos+(3*len)-1) >= buffer.length) return -1;
		var r_arr = [];
		for(var k=0; k < len; ++k) {
		    var x = parse_byte(buffer.slice(pos++));
		    var y = parse_byte(buffer.slice(pos++));
		    var z = parse_byte(buffer.slice(pos++));
		    r.push('(' + x + ',' + y + ',' + z + ')');
		}
		msg[fields[j]] = r_arr.join(' ');
		break;
	    case 'w':
		// window slot data
		if((pos+1) >= buffer.length) return -1;
		var len = parse_short(buffer.slice(pos));
		pos += 2;
		var s_arr = [];
		for(var k=0; k < len; ++k) {
		    if((pos+1) >= buffer.length) return -1;
		    var itemid = parse_short(buffer.slice(pos));
		    pos += 2;
		    if(itemid == -1) {
			s_arr.push('' + itemid);
		    } else {
			if((pos+0) >= buffer.length) return -1;
			var count = parse_byte(buffer.slice(pos));
			pos += 1;
			if((pos+1) >= buffer.length) return -1;
			var uses = parse_short(buffer.slice(pos));
			pos += 2;
			s_arr.push('' + itemid + ' (' + count + ',' + uses + ')');
		    }
		}
		msg[fields[j]] = s_arr.join(', ');
		break;
	    }
	}
	//util.log('packet: ' + msg['packet'] + '; pos: ' + pos);
	msg['raw'] = hex_dump(buffer.slice(0, pos));
	socket.broadcast(msg);
	return pos;
    };

    Parser.prototype.Read = function(data, msg) {
	//util.log('read called, length: ' + data.length);
	//util.log('buff: ' + hex_dump(data));
	var format = '';
	var fields = [];
	switch(data[0]) {
	default:
	    // unknown packet
	    return -1;
	case 0x00:
	    msg['packet'] = 'Keep Alive';
	    break;
	case 0x01:
	    msg['packet'] = 'Login Request';
	    format = 'iSSlb';
	    if(msg['from'] == 'server') {
		fields = ['Protocol Version', 'Username', 'Password', 'Map Seed', 'Dimension'];
	    } else {
		fields = ['Protocol Version', 'Username', 'Password', 'not used', 'not used'];
	    }
	    break;
	case 0x02:
	    msg['packet'] = 'Handshake';
	    format = 'S';
	    if(msg['from'] == 'server') {
		fields = ['Connection Hash'];
	    } else {
		fields = ['Username'];
	    }
	    break;
	case 0x03:
	    msg['packet'] = 'Chat Message';
	    format = 'S';
	    fields['Message'];
	    break;
	case 0x04:
	    msg['packet'] = 'Time Update';
	    format = 'l';
	    fields['Time'];
	    break;
	case 0x05:
	    msg['packet'] = 'Entity Equipment';
	    format = 'isss';
	    fields = ['EntityID', 'Slot', 'ItemID', 'Damage?'];
	    break;
	case 0x06:
	    msg['packet'] = 'Spawn Position';
	    format = 'iii';
	    fields = ['X', 'Y', 'Z'];
	    break;
	case 0x07:
	    msg['packet'] = 'Use Entity';
	    format = 'iiB';
	    fields = ['User EID', 'Target EID', 'Left-Click?'];
	    break;
	case 0x08:
	    msg['packet'] = 'Update Health';
	    format = 's';
	    fields = ['Health'];
	    break;
	case 0x09:
	    msg['packet'] = 'Respawn';
	    break;
	case 0x0A:
	    msg['packet'] = 'Player';
	    format = 'B';
	    fields = ['On Ground'];
	    break;
	case 0x0B:
	    msg['packet'] = 'Player Position';
	    format = 'ddddB';
	    fields = ['X', 'Y', 'Stance', 'Z', 'On Ground'];
	    break;
	case 0x0C:
	    msg['packet'] = 'Player Look';
	    format = 'ffB';
	    fields = ['Yaw', 'Pitch', 'On Ground'];
	    break;
	case 0x0D:
	    msg['packet'] = 'Player Position & Look';
	    format = 'ddddffB';
	    if(msg['from'] == 'server') {
		fields = ['X', 'Y', 'Stance', 'Z', 'Yaw', 'Pitch', 'On Ground'];
	    } else {
		fields = ['X', 'Stance', 'Y', 'Z', 'Yaw', 'Pitch', 'On Ground'];
	    }
	    break;
	case 0x0E:
	    msg['packet'] = 'Player Digging';
	    format = 'bibib';
	    fields = ['Status', 'X', 'Y', 'Z', 'Face'];
	    break;
	case 0x0F:
	    msg['packet'] = 'Player Block Placement';
	    // need to read the block id to see if it's -1
	    var blockid = parse_short(data.slice(10));
	    if(blockid < 0) {
		format = 'ibibs';
		fields = ['X', 'Y', 'Z', 'Face/Direction', 'Block or Item ID'];
	    } else {
		format = 'ibibsbs';
		fields = ['X', 'Y', 'Z', 'Face/Direction', 'Block or Item ID', 'Amount', 'Damage'];
	    }
	    break;
	case 0x10:
	    msg['packet'] = 'Holding Change';
	    format = 's';
	    fields = ['Slot'];
	    break;
	case 0x12:
	    msg[packet] = 'Animation';
	    format = 'ib';
	    fields = ['Player EntityID', 'Animate'];
	    break;
	case 0x13:
	    msg['packet'] = 'Entity Action?';
	    format = 'ib';
	    fields = ['Player EntityID', 'Action'];
	    break;
	case 0x14:
	    msg['packet'] = 'Named Entity Spawn';
	    format = 'iSiiibbs';
	    fields = ['Player EntityID', 'Player Name', 'X', 'Y', 'Z', 'Rotation', 'Pitch', 'Current Item'];
	    break;
	case 0x15:
	    msg['packet'] = 'Pickup Spawn';
	    format = 'isbsiiibbb';
	    fields = ['Item EntityID', 'ItemID', 'Count', 'Damage/Data', 'X', 'Y', 'Z', 'Rotation', 'Pitch', 'Roll'];
	    break;
	case 0x16:
	    msg['packet'] = 'Collect Item';
	    format = 'ii';
	    fields = ['Item EntityID', 'Player EntityID'];
	    break;
	case 0x17:
	    msg['packet'] = 'Add Object/Vehicle';
	    format = 'ibiii';
	    fields = ['Object EntityID', 'Type', 'X', 'Y', 'Z'];
	    break;
	case 0x18:
	    msg['packet'] = 'Mob Spawn';
	    format = 'ibiiibbm';
	    fields = ['Mob EntityID', 'Type', 'X', 'Y', 'Z', 'Yaw', 'Pitch', 'Metadata'];
	    break;
	case 0x19:
	    msg['packet'] = 'Entity Painting';
	    format = 'iSiiii';
	    fields = ['EntityID', 'Title', 'X', 'Y', 'Z', 'Type?'];
	    break;
	case 0x1C:
	    msg['packet'] = 'Entity Velocity?';
	    format = 'isss';
	    fields = ['EntityID', 'Velocity X', 'Velocity Y', 'Velocity Z'];
	    break;
	case 0x1D:
	    msg['packet'] = 'Destroy Entity';
	    format = 'i';
	    fields = ['EntityID'];
	    break;
	case 0x1E:
	    msg['packet'] = 'Entity';
	    format = 'i';
	    fields = ['EntityID'];
	    break;
	case 0x1F:
	    msg['packet'] = 'Entity Relative Move';
	    format = 'ibbb';
	    fields = ['EntityID', 'dX', 'dY', 'dZ'];
	    break;
	case 0x20:
	    msg['packet'] = 'Entity Look';
	    format = 'ibb';
	    fields = ['EntityID', 'Yaw', 'Pitch'];
	    break;
	case 0x22:
	    msg['packet'] = 'Entity Teleport';
	    format = 'iiiibb';
	    fields = ['EntityID', 'X', 'Y', 'Z', 'Yaw', 'Pitch'];
	    break;
	case 0x26:
	    msg['packet'] = 'Entity Status?';
	    format = 'ib';
	    fields = ['EntityID', 'Status'];
	    break;
	case 0x27:
	    msg['packet'] = 'Attach Entity';
	    format = 'ii';
	    fields = ['Player EntityID', 'Vehicle EntityID'];
	    break;
	case 0x28:
	    msg['packet'] = 'Entity Metadata';
	    format = 'im';
	    fields = ['Mob EntityID', 'Metadata'];
	    break;
	case 0x32:
	    msg['packet'] = 'Pre-Chunk';
	    format = 'iiB';
	    fields = ['X', 'Z', 'Mode'];
	    break;
	case 0x33:
	    msg['packet'] = 'Map Chunk';
	    format = 'isibbbc';
	    fields = ['X', 'Y', 'Z', 'Size X', 'Size Y', 'Size Z', 'Compressed Data'];
	    break;
	case 0x34:
	    msg['packet'] = 'Multi Block Change';
	    format = 'iia';
	    fields = ['Chunk X', 'Chunk Z', ['Coordinates', 'Type', 'Metadata']];
	    break;
	case 0x35:
	    msg['packet'] = 'Block Change';
	    format = 'ibibb';
	    fields = ['X', 'Y', 'Z', 'Block Type', 'Block Metadata'];
	    break;
	case 0x36:
	    msg['packet'] = 'Play Note Block';
	    format = 'isibb';
	    fields = ['X', 'Y', 'Z', 'Instrument', 'Pitch'];
	    break;
	case 0x3C:
	    msg['packet'] = 'Explosion';
	    format = 'dddfr';
	    fields = ['X', 'Y', 'Z', 'Radius?', 'Records'];
	    break;
	case 0x65:
	    msg['packet'] = 'Close Window';
	    format = 'b';
	    fields = ['WindowID'];
	    break;
	case 0x66:
	    msg['packet'] = 'Window Click';
	    format = 'bsbssbs';
	    fields = ['WindowID', 'Slot', 'Right-click', 'Action #', 'ItemID', 'Item Count', 'Item Uses'];
	    break;
	case 0x67:
	    msg['packet'] = 'Set Slot';
	    format = 'bssbs';
	    fields = ['WindowID', 'Slot', 'ItemID', 'Item Count', 'Item Uses'];
	    break;
	case 0x68:
	    msg['packet'] = 'Window Items';
	    format = 'bw';
	    fields = ['WindowID', 'Slot Data'];
	    break;
	case 0x69:
	    msg['packet'] = 'Update Progress Bar';
	    format = 'bss';
	    fields = ['WindowID', 'Progress Bar', 'Value'];
	    break;
	case 0x6A:
	    msg['packet'] = 'Transaction';
	    format = 'bsB';
	    fields = ['WindowID', 'Action #', 'Accepted'];
	    break;
	case 0x82:
	    msg['packet'] = 'Update Sign';
	    format = 'isiSSSS';
	    fields = ['X', 'Y', 'Z', 'Text1', 'Text2', 'Text3', 'Text4'];
	    break;
	case 0xFF:
	    msg['packet'] = 'Disconnect/Kick';
	    format = 'S';
	    fields = ['Reason'];
	    break;

	    // below here are unknown packets
	case 0x11:
	    msg['packet'] = 'Unknown1';
	    format = 'ibibi';
	    fields = ['int1', 'byte1', 'int2', 'byte2', 'int3'];
	    break;
	case 0x1B:
	    msg['packet'] = 'Unknown2';
	    format = 'ffffBB';
	    fields = ['float1', 'float2', 'float3', 'float4', 'bool1', 'bool2'];
	    break;
	}

	msg['packet'] += ' (0x' + Number(data[0]).toString(16) + ')';
	var pos = parse_packet(data, msg, format, fields);
	// if(pos < 0) {
	//     util.log('packet not big enough');
	// } else {
	//     util.log('successfully parsed packet "' + msg['packet'] + '", pos: ' + pos);
	// }
	return pos;
    };

    return new Parser();
})();

// start listening for minecraft clients
var mc_server = net.createServer(function(c) {
    //util.log('config: ' + util.inspect(config, false, null));
    if(!inRange(c.remoteAddress, config.mc_listen.allow_range) ||
       inRange(c.remoteAddress, config.mc_listen.deny_range)) {
	c.end();
	util.log('denied connection from ' + c.remoteAddress);
	return;
    }
    util.log('new client connection: ' + c.remoteAddress);

    // create a new connection to the server
    var mc = new net.Socket();
    mc.on('connect', function() {
	util.log('connected to minecraft server');
	c.pipe(mc);
	mc.pipe(c);
    });
    mc.on('data', function(data) {
	if(mc.mc_buffer) {
	    var b = new Buffer(mc.mc_buffer.length + data.length);
	    mc.mc_buffer.copy(b, 0, 0);
	    data.copy(b, mc.mc_buffer.length, 0);
	    mc.mc_buffer = new Buffer(b);
	} else {
	    mc.mc_buffer = new Buffer(data);
	}
	var pos = parser.Read(mc.mc_buffer, {'from':'server', 'to':c.remoteAddress});
	if(pos > 0) {
	    if(pos == mc.mc_buffer.length) {
		mc.mc_buffer = null;
	    } else {
		mc.mc_buffer = new Buffer(mc.mc_buffer.slice(pos));
	    }
	}
    });
    c.on('data', function(data) {
	if(c.mc_buffer) {
	    var b = new Buffer(c.mc_buffer.length + data.length);
	    c.mc_buffer.copy(b, 0, 0);
	    data.copy(b, c.mc_buffer.length, 0);
	    c.mc_buffer = new Buffer(b);
	} else {
	    c.mc_buffer = new Buffer(data);
	}
	var pos = parser.Read(c.mc_buffer, {'to':'server', 'from':c.remoteAddress});
	if(pos > 0) {
	    if(pos == c.mc_buffer.length) {
		c.mc_buffer = null;
	    } else {
		c.mc_buffer = new Buffer(c.mc_buffer.slice(pos));
	    }
	}
    });
    mc.on('end', function() {
	util.debug('server connection got "end"');
	c.end();
    });
    mc.on('error', function(exception) {
	util.debug('server connection got "error"');
	c.end();
    });
    mc.on('close', function(had_error) {
	util.debug('server connection got "close"');
	c.end();
    });
    c.on('end', function() {
	util.debug('client connection got "end"');
	mc.end();
    });
    c.on('error', function(exception) {
	util.debug('client connection got "error"');
	mc.end();
    });
    c.on('close', function(had_error) {
	util.debug('client connection got "close"');
	mc.end();
    });
    mc.connect(config.server.port, config.server.ip, function() {
	util.log('connected to minecraft server ' + config.server.ip + ':' + config.server.port);
    });
});

// start the server
mc_server.listen(config.mc_listen.port, config.mc_listen.ip, function(){
    util.log('listening for minecraft clients');
});
