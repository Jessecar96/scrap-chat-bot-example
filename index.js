var io = require('socket.io-client');
var fs = require('fs');
var colors = require('colors');
var request = require('request');
var moment = require('moment');
var config = require('./config.json');
var socket;
var myUserID;
var users;
var usersInRooms;
var rooms = {};
var inRooms = [];

// Look for key in the config file
if (!config.key) {
  throw new Error('Key not found, set it config.json from scrap.tf/devices');
}

// Look for client ID in the config file
if (!config.client_id) {
  throw new Error('Client ID not found, set it config.json');
}

// See if we already logged in the first time with the key
if (!config.token) {
  getToken();
} else {
  connect();
}

// This is used to change the short key from scrap.tf/devices into a token to connect to the socket
// We are responsible for saving the token this sends back
function getToken() {
  request.post('https://chat.scrap.tf/auth', {
    form: {
      key: config.key,
      id: config.client_id, 
      client: config.client_name
    }, 
    json: true
  }, function(err, response, body) {

    if (body.success) {
      console.log('Login Success'.green);
      config.token = body.token;
      saveConfig();
    } else {
      console.log('Login Failed'.red);
      console.error(body.message);
    }

  });
}

// This is how we connect to the chat server
function connect() {
  socket = io('wss://chat.scrap.tf', {
    query: 'token='+config.token+'&id='+config.client_id+'&mobile='+false,
    reconnection: true,
    timeout: 60000,
    transports: ['websocket']
  });
  bindSocketHandlers();
}

// This binds all the events the server sends back
function bindSocketHandlers() {
  
  // When we are connected to the chat server
  socket.on('connect', function(msg){
    console.log('Connected to chat'.green);
  });

  socket.on('disconnect', function(){
    console.log('Disconnected'.red);
  });

  socket.on('disconnect reason', function(reason){
    console.log('Disconnect Reason: '.red + reason);
  });

  // Once the user's profile is loaded and you can do things
  socket.on('user loaded', function() {
    console.log('User loaded, ready to join rooms'.green);
    joinRoom('home');
  });

  // Sent by the server to indicate who you are
  socket.on('user id', function(userid){
    myUserID = userid;
    console.log(('User ID is '+userid).green);
  });

  // This is data (username, avatar, color, etc) of every user sent whenever it's changed
  socket.on('users', function(data){
    users = data;
  });

  // This is when a user has left and their data is no longer needed
  socket.on('users remove', function(data){
    for (var id in users) {
      if (id == data) {
        delete users[id];
      }
    }
  });

  // This is mostly when a user updates their profile or joins in more places
  socket.on('users update', function(data){
    var old = users[data.id];
    if (old) {
      if (old.username != data.user.username || old.color != data.user.color || old.group != data.user.group) {
        // User has changed their username
      }
      if (old.avatar != data.user.avatar) {
        // User has changed their avatar
      }
    }
    users[data.id] = data.user;
  });

  // This is data on which user is in which rooms, this is sent separate from 'users' to reduce data usage
  socket.on('rooms', function(data){
    usersInRooms = data;
  });

  // When we have joined a room
  socket.on('joined room', function(data){
    console.log(('Joined Room: '+data.room).green);
    var room = data.room;
    currentRoom = room;
    inRooms.push(room);
    rooms[room] = {
      display: data.display,
      message: data.message,
      nsfw: data.nsfw,
      panties: data.panties,
      owner: data.owner
    };
  });

  // Sent when a room changes
  socket.on('room update', function(data) {
    var room = data.room;
    rooms[room] = {
      display: data.display,
      message: data.message,
      nsfw: data.nsfw,
      panties: data.panties,
      owner: data.owner
    };
  });

  // When we left a room
  socket.on('left room', function(room){
    delete inRooms[inRooms.indexOf(room)];
  });

  socket.on('user joined', function(userid){
    console.log((users[userid].username + ' Joined Chat').yellow);
  });

  socket.on('user left', function(userid){
    console.log((users[userid].username + ' Left Chat').yellow);
  });

  socket.on('user timeout', function(userid){
    console.log((users[userid].username + ' Timed Out').yellow);
  });

  socket.on('user joined room', function(data){
    console.log((users[data.userid].username + ' Joined "'+data.room+'"').yellow);
  });

  socket.on('user left room', function(data){
    console.log((users[data.userid].username + ' Left "'+data.room+'"').yellow);
  });

  // When a message is received
  socket.on('message', function(data){
    var user = users[data.userid];
    var room = data.room;
    var message = data.message;
    var isAction = data.action;
    var time = moment().format('LTS');
    
    if (isAction) {
      console.log('['+time+']'.grey + (' ['+room+'] ').yellow + user.username.cyan + ' ' + message);
    } else {
      console.log('['+time+']'.grey + (' ['+room+'] ').yellow + user.username.cyan + ': ' + message);
    }
    

    // This is where you react to user messages
    if (room == 'home') {

      if (message == '!bot') {
        sendMessage('Hello I am a bot!', room);
      } else if (isAction && message.match(/^hugs bot$/)) {
        sendAction('hugs '+user.username, room);
      }

    }

  });

  socket.on('server', function(msg){
    console.log('Server: '.red + msg);
  });

}

// Other chat functions, etc

// Send normal messages
function sendMessage(message, room) {
  socket.emit('message', {
    message: message, 
    room: room
  });
}

// This is to send /me messages
function sendAction(message, room) {
  socket.emit('action', {
    message: message, 
    room: room
  });
}

// Join a room
function joinRoom(room) {
  socket.emit('join room', room);
}


// Utils

function saveConfig() {
  fs.writeFile('config.json', JSON.stringify(config, null, 2), function(err) {
    if(err) {
      return console.log(err);
    }
    console.log('Saved config.json');
  }); 
}

function guidGenerator() {
  var S4 = function() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
  };
  return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}