McNode
======

This is a minecraft protocol analyzer written to run in <a href="http://nodejs.org/">nodeJS</a>. It works by proxying the minecraft client <---> server traffic. When data arrives from either a client or the server, it decodes the packet and broadcasts the message to all the connected browsers.
