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
  chat = tele.hashname(id);
  seeds.forEach(chat.addSeed, chat);

  chat.online(function(err){
    log((err?err:"online as "+chat.hashname));
    if(err) process.exit(0);
    if(memberhash) {
      var host = chat.whois(memberhash);
      if(!host) return log("invalid id to join");
      host.start("members", {js:{room:room}}, memberMesh);
    } else log("hosting room, others can use '"+room+"@"+chat.hashname+"' to join");
  });

  chat.start("chat", function(arg, chan){
    if(room != arg.js.room) return chan.end("unknown room");
    handshake(false, arg, chan);
    chan.message({js:{nick:id.nick}});
  });
  chat.start("members", function(arg, chan){
    // send members in chunks
    chan.setup("message");
    // send members in chunks
    var mlist = Object.keys(members);
    mlist.push(chat.hashname);
    while(mlist.length > 0)
    {
      var chunk = mlist.slice(0, 10);
      mlist = mlist.slice(10);
      chan.message({js:{members:chunk}});
      if(mlist.length == 0) chan.end();
    }
  });
}

function memberMesh(err, arg)
{
  if(err && err !== true) return log("error fetching members: "+err);
  if(arg && Array.isArray(arg.js.members)) arg.js.members.forEach(function(member){
    if(members[member]) return;
    if(member == chat.hashname) return;
    var hn = chat.whois(member);
    if(hn) hn.start("chat", {js:{nick:id.nick, room:room}}, handshake);
  });
}

// intitial incoming or answer to outgoing chats
var nicks = {};
function handshake(err, arg, chan)
{
  if(err) return console.log("handshake err",err);
  chan.nick = (arg.js.nick) ? arg.js.nick : chan.hashname.substr(0,6);
  nicks[chan.nick] = chan.hashname;
  if(!members[chan.hashname]) log(chan.nick+" joined");
  members[chan.hashname] = chan;
  chan.setup("message");
  chan.onMessage = function(err, arg, cb){
    if(arg && arg.js.message) log("["+chan.nick+"] "+arg.js.message);
    if(err)
    {
      var msg = (err !== true)?" ("+err+")":"";
      log(chan.nick+" left"+msg);
      delete members[chan.hashname];
    }
    cb();
  };
}

function blast(msg)
{
  Object.keys(members).forEach(function(member){
    members[member].message({js:{"message":msg}});
  });
}

// our chat handler
rl.on('line', function(line) {
  if(line.indexOf("/") == 0) {
    var parts = line.split(" ");
    var cmd = parts.shift().substr(1);
    if(cmds[cmd]) cmds[cmd](parts.join(" "));
    else log("I don't know how to "+cmd);
  }else if(line != "") blast(line);
  rl.prompt();
});

var cmds = {};
cmds.nick = function(nick){
  id.nick = nick;
  blast(false, nick);
  rl.setPrompt(id.nick+"> ");
  rl.prompt();
}
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
