McNode
======

This is a minecraft protocol analyzer written to run in <a href="http://nodejs.org/">nodeJS</a>. It works by proxying the minecraft client <---> server traffic. When data arrives from either a client or the server, it decodes the packet and broadcasts the message to all the connected browsers.

To Run
======

Config
------

Edit the `config.json` file to match your environment, here is the default:

	{
		"server":{
			"ip":"127.0.0.1",
			"port":25566
		},
		"mc_listen":{
			"ip":"0.0.0.0",
			"port":25565,
			"allow_cidr":["0.0.0.0/0"],
			"deny_cidr":[]
		},
		"web_listen":{
			"ip":"0.0.0.0",
			"port":80,
			"allow_cidr":["0.0.0.0/0"],
			"deny_cidr":[]
		}
	}

The `server` section refers to the notchian minecraft server that clients will be proxied to. The `server.port` in the default config is one higher then the default notchian server.

The `mc_listen` section refers to where node will accept notchian clients. The `mc_listen.port` is the same as the default notchian server, so clients connecting shouldn't have to do anything special. The `mc_listen.allow_cidr` and `mc_listen.deny_cidr` give you control of ranges of IP's that can connect. The default is to deny everyone unless they are listed `mc_listen.allow_cidr`. If the IP is listed in both `mc_listen.allow_cidr` and `mc_listen.deny_cidr` then the IP is denied.

The `web_listen` section refers to where node will accept web requests. Depending on your host ports under 1024 require elevated access. The `web_listen.port` in the default config is 80, the standard http port. The `web_listen.allow_cidr` and `web_listen.deny_cidr` work exactly the same as their `mc_listen` counter-parts.

Required Modules
----------------

mcnode requires:
* json2
* socket.io
* task-joose-nodejs
And all their dependancies.


Execution
---------

Just do the equivilent of `node minecraft_server.js`. Elevate your status to run the `web_listen`er on port 80, `sudo node minecraft_server.js`. Once it's running, connect with a web browser to `/`, eg `http://127.0.0.1/` to view the packet dumps of data of all clients connected through the node proxy. Connect to `http://127.0.0.1/view.html` to view interpreted data. Once you have a web page up, you can connect with a notchian client.
