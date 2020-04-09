var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var moment = require('moment');
const users = new Set();
let userIndex = 0;
let gameIndex = 0;
let freeRooms = [];
let games = [];
let gameQueue = new Set();

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});
app.get('/styles.css', function (req, res) {
  res.sendFile(__dirname + '/styles.css');
});
app.get('/gamestyles.css', function (req, res) {
  res.sendFile(__dirname + '/gamestyles.css');
});
app.get('/game.html', function (req, res) {
  res.sendFile(__dirname + '/game.html')
});

// dealing with a new connection
io.on('connection', function (socket) {
  // ask the client to check cookies to see if the user already exists
  socket.emit('checkIfNewUser');
  socket.on('confirmIfNewUser', function (isNewUser) {
    // if they had no cookies, assign them a default username and add them to the set of users
    if (isNewUser) {
      users.add('User' + userIndex);
      socket.nickname = ('User' + userIndex);
      socket.theme = 'light';
      socket.code = makeCode(5);
      socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
      userIndex = userIndex + 1;
      let msgUsers = Array.from(users);
      io.emit('update user list', msgUsers);
    } else {
      socket.emit('getCookies')
      socket.on('returnCookies', function (user, theme, code) {
        // give the user their old nickname if it hasn't been taken
        // otherwise, assign a new nickname as if they were new
        if (!(users.has(user))) {
          users.add(user);
          socket.nickname = user;
          socket.theme = theme;
          socket.code = code;
          socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
          let msgUsers = Array.from(users);
          io.emit('update user list', msgUsers);
          socket.emit('update user header', socket.nickname, socket.theme, socket.code);
        } else {
          users.add('User' + userIndex);
          socket.nickname = ('User' + userIndex);
          socket.theme = 'light';
          socket.code = makeCode(5);
          socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
          userIndex = userIndex + 1;
        }
      });
    }
  });
});

io.on('connection', function (socket) {
  socket.on('change username', function (newNick) {
    if (newNick.length > 15) {
      io.emit('admin message', 'Sorry ' + socket.nickname + ', nickname must be 15 characters or less!');
      return;
    }
    // check if the user list already contains identical nickname
    // if not, update the user list, and client side UI/cookies
    if (!(users.has(newNick))) {
      users.delete(socket.nickname);
      socket.nickname = newNick;
      users.add(socket.nickname);
      socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
    } else {
      // if the user list contained the nickname already
      return;
    }
    socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
  });
  socket.on('join game', function (gameCode) {
    let socks = io.sockets.sockets;
    for (let sockID in socks) {
      let sock = socks[sockID]
      if (sock.code === gameCode) {
        if (sock.inGame || socket.inGame) return;
        socket.emit('redirect');
        sock.emit('redirect');
        gameQueue.add([socket.nickname,sock.nickname]);
      }
    }
  });
  socket.on('initialize game',function() {
    let otherSocketName = null;
    gameQueue.forEach(game => {
      for(i=0;i<2;i++) {
        if (game[i] === socket.nickname) {
          if (i===0) otherSocketName = game[1]
          else otherSocketName = game[0];
          console.log('Socket ' + socket.nickname + ' is trying to connect with ' + otherSocketName);
          if(users.has(otherSocketName)) gameQueue.delete(game);
          break;
        }
        
      }
    })
    console.log(users);
    if (users.has(otherSocketName)) {
      var sockets = io.sockets.sockets;
      for (var socketId in sockets) {
        let sock = sockets[socketId];
        if (sock.nickname === otherSocketName) {
          console.log('we managed to connect');
          socket.join(gameIndex);
          sock.join(gameIndex);
          let newGame = [[0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0],
          [0, 0, 0, 0, 0, 0, 0]];
          games[gameIndex] = [newGame, 1];
          socket.game = gameIndex;
          sock.game = gameIndex;
          socket.emit('game initialized',1);
          socket.playerIndex = 1;
          sock.emit('game initialized',2);
          sock.playerIndex = 2;
          io.in(gameIndex).emit('update gamestate',newGame,1);
          socket.emit('join room', gameIndex);
          sock.emit('join room', gameIndex);
          sock.inGame = true;
          socket.inGame = true;
          gameIndex++;
        }
      }
    }
    
  });
  socket.on('send move',function(columnNumber){
    const c = columnNumber;
    const i = socket.game;
    if (games[i]===null) return;
    let winner = null;
    let gamestate = games[i][0];
    let playerTurn = games[i][1];
    let player = socket.playerIndex;
    if (playerTurn != player) return;
    if (!canDrop(gamestate,columnNumber)) return;
    let r=0;
    while(r<6) {
      console.log('row ' + r + " colum " + c);
      if (gamestate[r][c] != 0) {
        r--;
        gamestate[r][c] = player;
        break;
      } else if (r===5) {
        gamestate[r][c] = player;
      }
      r++;
    }
    if (winner = chkWinner(gamestate) != 0) {
      console.log('winner ' + winner);
      io.in(i).emit('update gamestate',gamestate,playerTurn);
      io.in(i).emit('winner', winner);
      games[i] = null;
      return;
    }
    if (playerTurn === 1) playerTurn = 2
    else playerTurn = 1;
    games[i][1] = playerTurn;
    io.in(i).emit('update gamestate',gamestate,playerTurn);
  });
  // if there's a socket disconnect, delete that user from the active user list
  // update client UIs
  socket.on('disconnect', function () {
    users.delete(socket.nickname);
    console.log('disconnect');
  });
  socket.on('connect-error', function () {
    users.delete(socket.nickname);
    console.log('connect error');
  });
  socket.on('connect-timeout', function () {
    users.delete(socket.nickname);
    console.log('connect timeout');
  });
});

http.listen(3000, function () {
  console.log('listening on *:3000');
});

//https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
function makeCode(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}



function canDrop(bd,c) {
  if(bd[0][c] === 0) return true
  else return false;
}

function chkLine(a, b, c, d) {
  // Check first cell non-zero and all cells match
  return ((a != 0) && (a == b) && (a == c) && (a == d));
}

function chkWinner(bd) {
  // Check down
  for (r = 0; r < 3; r++)
    for (c = 0; c < 7; c++)
      if (chkLine(bd[r][c], bd[r + 1][c], bd[r + 2][c], bd[r + 3][c]))
        return bd[r][c];

  // Check right
  for (r = 0; r < 6; r++)
    for (c = 0; c < 4; c++)
      if (chkLine(bd[r][c], bd[r][c + 1], bd[r][c + 2], bd[r][c + 3]))
        return bd[r][c];

  // Check down-right
  for (r = 0; r < 3; r++)
    for (c = 0; c < 4; c++)
      if (chkLine(bd[r][c], bd[r + 1][c + 1], bd[r + 2][c + 2], bd[r + 3][c + 3]))
        return bd[r][c];

  // Check down-left
  for (r = 3; r < 6; r++)
    for (c = 0; c < 4; c++)
      if (chkLine(bd[r][c], bd[r - 1][c + 1], bd[r - 2][c + 2], bd[r - 3][c + 3]))
        return bd[r][c];
  return 0;
}
