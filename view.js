var log = function(msg) {
    if(console && console.log) {
	console.log(msg);
    }
};

var players = {};
var player_entities = {};

var Player = (function() {
    var player = function(entityid, player_name, health, map_seed, dimension) {
	this.entityid = entityid;
	this.player_name = player_name;
	this.health = health;
	this.map_seed = map_seed;
	this.dimension = dimension;
	this.X = '';
	this.Y = '';
	this.Z = '';
	this.yaw = '';
	this.pitch = '';
	this.update();
    };

    var update = function() {
	var row = document.getElementById('entity_' + this.entityid);
	if(row) {
	    row.parentNode.removeChild(row);
	}
	row = document.createElement('tr');
	row.id = 'entity_' + this.entityid;
	var td = document.createElement('td');
	td.innerText = this.entityid;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.player_name;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.health;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.map_seed;
	row.appendChild(td);
	td = document.createElement('td');
	if(this.dimension == -1) {
	    td.innerText = 'In Hell';
	} else {
	    td.innerText = 'Normal';
	}
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.X;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.Y;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.Z;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.yaw;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.pitch;
	row.appendChild(td);
	document.getElementById('players_table').appendChild(row);
    };

    var set_position = function(X, Y, Z) {
	this.X = X;
	this.Y = Y;
	this.Z = Z;
	this.update();
    };

    var set_look = function(yaw, pitch) {
	this.yaw = yaw;
	this.pitch = pitch;
	this.update();
    };

    var set_health = function(health) {
	this.health = health;
	this.update();
    };

    player.prototype.setPosition = set_position;
    player.prototype.setLook = set_look;
    player.prototype.setHealth = set_health;
    player.prototype.update = update;

    return player;
})();

var findPlayer = function(ip) {
    return player_entities['eid_' + players[ip][1]];
};

var entities = {};

var Entity = (function (){
    var entity = function(entityid, type, x, y, z, yaw, pitch, metadata) {
	this.entityid = entityid;
	this.type = type;
	this.X = x;
	this.Y = y;
	this.Z = z;
	this.yaw = yaw;
	this.pitch = pitch;
	this.metadata = metadata;
	this.update();
    };

    var set_position = function(x, y, z) {
	this.x = x;
	this.y = y;
	this.z = z;
	this.update();
    };

    var set_look = function(yaw, pitch) {
	this.yaw = yaw;
	this.pitch = pitch;
	this.update();
    };

    var update = function() {
	var row = document.getElementById('entity_' + this.entityid);
	if(row) {
	    row.parentNode.removeChild(row);
	}
	row = document.createElement('tr');
	row.id = 'entity_' + this.entityid;
	var td = document.createElement('td');
	td.innerText = this.entityid;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.type;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.X;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.Y;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.Z;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.yaw;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.pitch;
	row.appendChild(td);
	td = document.createElement('td');
	td.innerText = this.metadata;
	row.appendChild(td);
	document.getElementById('entities_table').appendChild(row);
    };

    entity.prototype.setPosition = set_position;
    entity.prototype.setLook = set_look;
    entity.prototype.update = update;

    return entity;
})();

var findEntity = function(entityid) {
    return entities['eid_' + entityid];
};

var dispatch = function(msg) {
    switch(msg.packetid) {
    case 0x01:			// Login Req
	if(msg.from == 'server') {
	    var p = new Player(msg['Player EntityID'], players[msg.to][0], "unknown", msg['Map Seed'], msg['Dimension']);
	    player_entities['eid_' + msg['Player EntityID']] = p;
	    players[msg.to][1] = msg['Player EntityID'];
	} else {
	    players[msg.from] = [msg['Username'],null];
	}
	break;
    case 0x06:			// Spawn Position
	for(var ent in player_entities) {
	    if(player_entities[ent].X == '') {
		player_entities[ent].setPosition(msg.X, msg.Y, msg.Z);
	    }
	}
	break;
    case 0x08:			// Update Health
	var p = findPlayer(msg.to);
	if(p != null) {
	    p.setHealth(msg['Health']);
	}
	break;
    case 0x0B:			// Player Position
	var p = findPlayer(msg.from);
	if(p != null) {
	    p.setPosition(msg.X, msg.Y, msg.Z);
	}
	break;
    case 0x0C:			// Player Look
	var p = findPlayer(msg.from);
	if(p != null) {
	    p.setLook(msg.Yaw, msg.Pitch);
	}
	break;
    case 0x0D:			// Player Position & Look
	var p = null;
	if(msg.from == 'server') {
	    p = findPlayer(msg.to);
	} else {
	    p = findPlayer(msg.from);
	}
	if(p != null) {
	    p.setPosition(msg.X, msg.Y, msg.Z);
	    p.setLook(msg.Yaw, msg.Pitch);
	}
	break;
    case 0x14:			// Named Enity Spawn
	var p = findPlayer(msg['Player EntityID']);
	if(!p) {
	    p = new Player(msg['Player EntityID'], msg['Player Name'], 'health', 'map_seed', 'dimension');
	}
	p.setPosition(msg.X, msg.Y, msg.Z);
	p.setLook(msg.Yaw, msg.Pitch);
	break;
    case 0x18:			// Mob Spawn
	var type = "Unknown";
	switch(msg.Type) {
	case 50:
	    type = "Creeper";
	    break;
	case 51:
	    type = "Skeleton";
	    break;
	case 52:
	    type = "Spider";
	    break;
	case 53:
	    type = "Giant Zombie";
	    break;
	case 54:
	    type = "Zombie";
	    break;
	case 55:
	    type = "Slime";
	    break;
	case 56:
	    type = "Ghast";
	    break;
	case 57:
	    type = "Zombie Pigman";
	    break;
	case 90:
	    type = "Pig";
	    break;
	case 91:
	    type = "Sheep";
	    break;
	case 92:
	    type = "Cow";
	    break;
	case 93:
	    type = "Hen";
	    break;
	case 94:
	    type = "Squid";
	    break;
	}
	var e = findEntity(msg['Mob EntityID']);
	var metadata = "";
	var md_flag = Number('0x' + msg.Metadata.substr(0,2));
	if(md_flag & 0x01) metadata += " on fire";
	if(md_flag & 0x02) metadata += " crouched";
	if(md_flag & 0x04) metadata += " riding";

	if(msg.Metadata.length > 2) {
	    md_flag = Number('0x' + msg.Metadata.substr(2,2));
	    if(msg.Type == 91) { // sheep
		if(md_flag & 0x10) {
		    metadata += " sheared";
		}
		switch(md_flag & 0x0F) {
		case 0: metadata += " white wool"; break;
		case 1: metadata += " orange wool"; break;
		case 2: metadata += " magenta wool"; break;
		case 3: metadata += " light blue wool"; break;
		case 4: metadata += " yellow wool"; break;
		case 5: metadata += " lime wool"; break;
		case 6: metadata += " pink wool"; break;
		case 7: metadata += " gray wool"; break;
		case 8: metadata += " silver wool"; break;
		case 9: metadata += " cyan wool"; break;
		case 10: metadata += " purple wool"; break;
		case 11: metadata += " blue wool"; break;
		case 12: metadata += " brown wool"; break;
		case 13: metadata += " green wool"; break;
		case 14: metadata += " red wool"; break;
		case 15: metadata += " black wool"; break;
		}
	    }
	}

	if(!e) {
	    e = new Entity(msg['Mob EntityID'], type, msg.X, msg.Y, msg.Z, msg.Yaw, msg.Pitch, msg.Metadata + metadata);
	} else {
	    e.setPosition(msg.X, msg.Y, msg.Z);
	    e.setPosition(msg.Yaw, msg.Pitch);
	}
	break;
    case 0x1d:			// Destroy Entity
	var e = findEntity(msg.EntityID);
	if(e) {
	    delete entities['eid_' + msg.EntityID];
	}
	break;
    case 0x1f:			// Entity Relative Move
	e = findEntity(msg.EntityID);
	if(e) {
	    e.setPosition(e.X + msg.dX, e.Y + msg.dY, e.Z + msg.dZ);
	}
	break;
    case 0x20:			// Entity Look
	e = findEntity(msg.EntityID);
	if(e) {
	    e.setLook(msg.Yaw, msg.Pitch);
	}
	break;
    case 0x21:			// Entity Look and Relative Move
	e = findEntity(msg.EntityID);
	if(e) {
	    e.setPosition(e.X + msg.dX, e.Y + msg.dY, e.Z + msg.dZ);
	    e.setLook(msg.Yaw, msg.Pitch);
	}
	break;
    case 0x22:			// Entity Teleport
	e = findEntity(msg.EntityID);
	if(e) {
	    e.setPosition(msg.X, msg.Y, msg.Z);
	    e.setLook(msg.Yaw, msg.Pitch);
	}
	break;
    }
};