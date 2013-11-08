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
  seeds.forEach(chat.addSeed);

  chat.online(function(err){
    log((err?err:"online as "+chat.hashname));
    if(err) process.exit(0);
    if(memberhash) {
      members[memberhash] = chat.stream(memberhash, "chat", handshake).send({nick:id.nick, room:room})
      chat.stream(memberhash, "members", memberMesh).send({room:room});
    } else log("hosting room, others can use '"+room+"@"+chat.hashname+"' to join");
  });

  chat.listen("chat", handshake);
  chat.listen("members", function(err, stream, js){
    // send members in chunks
    var mlist = Object.keys(members);
    while(mlist.length > 0)
    {
      var chunk = mlist.slice(0, 10);
      mlist = mlist.slice(10);
      var end = mlist.length == 0 ? true : false;
      stream.send({members:mlist, end:end});
    }
  });
}

function memberMesh(err, stream, js)
{
  if(err) return;
  if(Array.isArray(js.members)) js.members.forEach(function(member){
    if(members[member]) return;
    if(member == chat.hashname) return;
    members[member] = chat.stream(member, "chat", handshake).send({nick:id.nick, room:room});
  });
}

var nicks = {};
function incoming(err, stream, js)
{
  if(err)
  {
    var msg = " ("+((js&&js.message)||err)+")";
    log("bye "+stream.nick+msg);
    delete members[stream.hashname];
    return;
  }

  if(js.nick) nickel(stream.hashname, js.nick);
  if(js.message) log("["+stream.nick+"] "+js.message);
}

// intitial incoming or answer to outgoing chats
function handshake(err, stream, js)
{
  if(err)
  {
    // bootstrapping failure
    if(stream.hashname == memberhash)
    {
      console.log("couldn't connect to",memberhash,err);
      process.exit(1);
    }
    log("failed to connect to member "+stream.hashname);
    return;
  }
  if(js.room && js.room != room)
  {
    console.log("barf, wrong room?",js,stream.hashname);
    stream.send({err:"unknown room"});
    return;
  }
  log("connected "+js.nick+" ("+stream.hashname+")");
  // if this is a new stream, make sure they have our nick
  if(members[stream.hashname] !== stream) stream.send({nick:id.nick});
  members[stream.hashname] = stream;
  stream.handler = incoming;
  nickel(stream.hashname, js.nick);
}

// update nick
var nicks = {};
function nickel(hashname, nick)
{
  if(!nick) nick = hashname.substr(0,8);
  nicks[nick] = hashname;
  if(members[hashname].nick && members[hashname].nick != nick) log(members[hashname].nick+" is now known as "+nick);
  members[hashname].nick = nick;
}

function blast(msg, nick)
{
  Object.keys(members).forEach(function(member){
    var js = {};
    if(msg) js.message = msg;
    if(nick) js.nick = nick;
    members[member].send(js);
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
