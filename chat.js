var fs = require("fs");
var tele = require("telehash");
var argv = require("optimist")
  .usage("Usage: $0 room@memberhash --id id.json --seeds seeds.json")
  .default("id", "./id.json")
  .default("seeds", "./seeds.json")
  .demand(1).argv;

// set up our readline interface
rl = require("readline").createInterface(process.stdin, process.stdout, null);
function log(line){
  // hacks!
  rl.output.write("\x1b[2K\r");
  console.log(line);
  rl._refreshLine()
}

// load or generate our crypto id
var id;
if(fs.existsSync(argv.id))
{
  id = require(argv.id);
  init();
}else{
  tele.genkey(function(err, key){
    if(err) return cmds.quit(err);
    id = key;
    rl.question('nickname? ', function(nick) {
      id.nick = nick;
      fs.writeFileSync(argv.id, JSON.stringify(id, null, 4));
      init();
    });    
  });
}

var parts = argv._[0].split("@");
if(!parts[1])
{
  log("invalid room@memberhash argument");
  process.exit(1);
}
var room = parts[0];
var memberhash = parts[1];

var chat;
var members = {};
function init()
{
  rl.setPrompt(id.nick+"> ");
  rl.prompt();

  var seeds = require(argv.seeds);
  chat = tele.hashname("chat.telehash.org", id);
  seeds.forEach(chat.addSeed);

  chat.online(function(err){
    log((err?err:"online as "+chat.hashname));
    if(err) process.exit(0);
  });  

  chat.listen("_chat", handshake);
  chat.listen("_members", function(chat, packet, callback){
    // send members in chunks
  });
}

var streams = {};
var nicks = {};
function incoming(chat, packet, callback)
{
  callback();
  if(packet.js.message || packet.js.nick) packet.stream.send({}); // receipt ack, maybe have flag for stream to auto-ack?

  if(packet.js.message) log("["+(packet.stream.nick||packet.from.hashname)+"] "+packet.js.message);
  if(packet.js.nick) nickel(packet.from.hashname, packet.js.nick);
}
function handshake(chat, packet, callback)
{
  if(callback) callback();
  log("connected "+packet.js.nick+" ("+packet.from.hashname+")");
  streams[packet.from.hashname] = packet.stream;
  packet.stream.handler = incoming;
  nickel(packet.from.hashname, packet.js.nick);
  if(packet.js.seq == 0) packet.stream.send({nick:id.nick});
  else packet.stream.send({});
}

// update nick and refresh prompt
function nickel(hashname, nick)
{
  streams[hashname].nick = nick;
  nicks[nick] = hashname;
  if(!to || to == hashname) cmds.to(hashname);
}

// our chat handler
var to;
rl.on('line', function(line) {
  if(line.indexOf("/") == 0) {
    var parts = line.split(" ");
    var cmd = parts.shift().substr(1);
    if(cmds[cmd]) cmds[cmd](parts.join(" "));
    else log("I don't know how to "+cmd);
  }else{
    if(!to) log("who are you talking to? /to hashname|nickname");
    else streams[to].send({message:line});
  }
  rl.prompt();
});

var cmds = {};
cmds.quit = function(err){
  log(err||"poof");
  process.exit();
}
cmds.whoami = function(){
  log("my hashname is "+ chat.hashname);  
}
cmds.who = function(){
  if(!to) return log("talking to nobody");
  log("talking to "+streams[to].nick+" ("+to+")");
}
cmds.to = function(targ){
  to = nicks[targ] || targ;
  if(!streams[to]) streams[to] = chat.stream(to, handshake).send({type:"_im", nick:id.nick});
  rl.setPrompt(id.nick+"->"+(streams[to].nick||to)+"> ");
  rl.prompt();
}
cmds["42"] = function(){
  log("I hash, therefore I am.");
}
