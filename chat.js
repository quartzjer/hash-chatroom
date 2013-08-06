var fs = require("fs");
var tele = require("telehash");
var argv = require("optimist")
  .usage("Usage: $0 room@memberhash --id id.json --seeds seeds.json")
  .default("id", "./id.json")
  .default("seeds", "./seeds.json")
  .demand(1).argv;

if(argv.v) tele.debug(console.log);

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

var parts = argv._[0].toString().split("@");
if(!parts[0])
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
    if(memberhash) members[memberhash] = chat.stream(memberhash, handshake)
      .send({type:"_chat", nick:id.nick, room:room})
      .send({type:"_members", room:room});
    else log("hosting room, others can use '"+room+"@"+chat.hashname+"' to join");
  });

  chat.listen("_chat", handshake);
  chat.listen("_members", function(chat, packet, callback){
    if(callback) callback();
    // send members in chunks
    var mlist = Object.keys(members);
    while(mlist.length > 0)
    {
      var chunk = mlist.slice(0, 10);
      mlist = mlist.slice(10);
      var end = mlist.length > 0 ? true : false;
      packet.stream.send({members:mlist, end:end});
    }
  });
}

var nicks = {};
function incoming(chat, packet, callback)
{
  callback();
  if(packet.js.message || packet.js.nick) packet.stream.send({}); // receipt ack, maybe have flag for stream to auto-ack?

  if(packet.js.nick) nickel(packet.from.hashname, packet.js.nick);
  if(packet.js.message) log("["+(packet.stream.nick||packet.from.hashname)+"] "+packet.js.message);
}
function handshake(chat, packet, callback)
{
  if(callback) callback();
  if(packet.js.room != room)
  {
    console.log(packet.js);
    packet.stream.send({err:"unknown room"});
    return;
  }
  log("connected "+packet.js.nick+" ("+packet.from.hashname+")");
  members[packet.from.hashname] = packet.stream;
  packet.stream.handler = incoming;
  nickel(packet.from.hashname, packet.js.nick);
  if(packet.js.seq == 0) packet.stream.send({nick:id.nick});
  else packet.stream.send({});
}

// update nick
var nicks = {};
function nickel(hashname, nick)
{
  nicks[nick] = hashname;
  members[hashname].nick = nick;
}

// our chat handler
rl.on('line', function(line) {
  if(line.indexOf("/") == 0) {
    var parts = line.split(" ");
    var cmd = parts.shift().substr(1);
    if(cmds[cmd]) cmds[cmd](parts.join(" "));
    else log("I don't know how to "+cmd);
  }else{
    Object.keys(members).forEach(function(member){
      members[member].send({message:line, nick:nick});
    })
  }
  rl.prompt();
});

var cmds = {};
cmds.quit = function(err){
  log(err||"poof");
  process.exit();
}
cmds.whoami = function(){
  log(room+"@"+chat.hashname);
}
cmds.who = cmds.whois = function(arg){
  if(!arg) return Object.keys(members).forEach(cmds.who);
  if(nicks[arg]) log(arg+" is "+nicks[arg]);
  if(members[arg]) log(arg+" is "+members[arg].nick);
}
cmds["42"] = function(){
  log("I hash, therefore I am.");
}
