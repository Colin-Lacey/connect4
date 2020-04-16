var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
const users = new Set();
let gameIndex = 0;
let games = [];
for (i=0;i<1000;i++) games[i] = null;
let gameQueue = new Set();
let waitingForGame = new Set();


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
app.get('/images/doge.jpg', function (req, res) {
  res.sendFile(__dirname + '/images/doge.jpg');
});

// dealing with a new connection
io.on('connection', function (socket) {
  // ask the client to check cookies to see if the user already exists
  socket.emit('checkIfNewUser');
  socket.on('confirmIfNewUser', function (isNewUser) {
    // if they had no cookies, assign them a default username and add them to the set of users
    if (isNewUser) {
      let newUser = randomUsername();
      users.add(newUser);
      console.log(users);
      socket.nickname = newUser;
      socket.theme = 'light';
      socket.code = makeCode(5);
      socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
    } else {
      socket.emit('getCookies')
      socket.on('returnCookies', function (user, theme, code) {
        // give the user their old nickname if it hasn't been taken
        // otherwise, assign a new nickname as if they were new
        if (!(users.has(user))) {
          users.add(user);
          console.log(users);
          socket.nickname = user;
          socket.theme = theme;
          socket.code = makeCode(5);
          socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
        } else {
          socket.nickname = randomUsername();
          users.add(socket.nickname);
          console.log(users);
          socket.theme = theme;
          socket.code = makeCode(5);
          socket.emit('setCookies', socket.nickname, socket.theme, socket.code);
        }
      });
    }
  });
});

io.on('connection', function (socket) {
  socket.on('change username', function (newNick) {
    // don't accept nicks with too many or no characters
    if (newNick.length > 30 || newNick.length < 1) {
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
    console.log(users);
  });
  socket.on('join game', function (gameCode) {
    // iterate through sockets and try to match the supplied gamecode to one
    let socks = io.sockets.sockets;
    for (let sockID in socks) {
      let sock = socks[sockID]
      if (sock === socket) continue;
      if (sock.code === gameCode) {
        if (sock.inGame || socket.inGame) return;
        socket.emit('redirect');
        sock.emit('redirect');
        gameQueue.add([socket.nickname,sock.nickname]);
      }
    }
  });
  socket.on('initialize game',function() {
    console.log(socket.nickname + " is trying to initialize a game")
    console.log(gameQueue);
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
          socket.emit('game initialized',1,sock.nickname);
          socket.playerIndex = 1;
          sock.emit('game initialized',2,socket.nickname);
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
  // event to deal with a move sent by the client
  socket.on('send move',function(columnNumber){
    const c = columnNumber;
    const i = socket.game;
    if (games[i]===null) return;
    let gamestate = games[i][0];
    let playerTurn = games[i][1];
    let player = socket.playerIndex;
    if (playerTurn != player) return;
    // check if this column is droppable
    if (!canDrop(gamestate,columnNumber)) return;
    let r=0;
    while(r<6) {
      // if any of the rows are occupied, go back a row
      // make the move there and break
      if (gamestate[r][c] != 0) {
        r--;
        gamestate[r][c] = player;
        break;
        // if we reach the bottom row, make the move there
      } else if (r===5) {
        gamestate[r][c] = player;
      }
      r++;
    }
    let winner = chkWinner(gamestate); 
    // 0 => no winner, 1,2 => player win, 3 => draw
    if (winner != 0) {
      // check for draw
      if (winner === 3) {
        io.in(i).emit('update gamestate',gamestate,playerTurn);
        io.in(i).emit('draw');
        games[i] = null;
        return;
      }
      io.in(i).emit('update gamestate',gamestate,playerTurn);
      io.in(i).emit('winner', winner);
      games[i] = null;
      return;
    }
    // switch up turn
    if (playerTurn === 1) playerTurn = 2
    else playerTurn = 1;
    games[i][1] = playerTurn;
    io.in(i).emit('update gamestate',gamestate,playerTurn);
  });
  socket.on('join random',function(){
    if (waitingForGame.size > 0){
      waitingForGame.forEach(player => {
        if (socket === player || socket.nickname === player.nickname) return;
        gameQueue.add([socket.nickname,player.nickname]);
        socket.emit('redirect');
        player.emit('redirect');
      })
    } else waitingForGame.add(socket);
  });
  // if there's a socket disconnect, delete that user from the active user list
  socket.on('disconnect', function () {
    users.delete(socket.nickname);
    if (waitingForGame.has(socket)) waitingForGame.delete(socket);
    console.log('disconnect');
  });
  socket.on('connect-error', function () {
    users.delete(socket.nickname);
    if (waitingForGame.has(socket)) waitingForGame.delete(socket);
    console.log('connect error');
  });
  socket.on('connect-timeout', function () {
    users.delete(socket.nickname);
    if (waitingForGame.has(socket)) waitingForGame.delete(socket);
    console.log('connect timeout');
  });
});

http.listen(3000, function () {
  console.log('listening on *:3000');
});

// random code generator from https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
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

// game logic copied from https://stackoverflow.com/questions/33181356/connect-four-game-checking-for-wins-js
function chkLine(a, b, c, d) {
  // Check first cell non-zero and all cells match
  return ((a != 0) && (a == b) && (a == c) && (a == d));
}
//https://stackoverflow.com/questions/33181356/connect-four-game-checking-for-wins-js
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
  // check for draw
  for (c=0;c<7;c++){
    // if we find a droppable column, no winner + no draw
    if (canDrop(bd,c)) {
      return 0;
    }
  }
  // if we get through all loops then the gameboard is full
  // declare a draw
  return 3;
}

// copied and modified from the example provided in the assignment specification
function randomUsername() {
	let parts = [];
  parts.push( ["Small", "Smol", "Big", "Giant", "Medium", "Miniscule", "Lovely", "Ugly",
               "Strong", "Stronk", "Scary", "Terrifying", "Mesmerizing", "Stupefying",
               "Curious", "Tasty", "Delicious", "Happy", "Juicy", "Thicc"] );
  parts.push( ["Red", "Blue", "Orange", "Pink", "Yellow", "Violet",
               "Bad", "Good", "Round", "Square", "Rectangular", "Evil",
               "Bodacious", "Tubular", "Extraordinary", "English", "French",
               "Dutch", "Spanish", "Chinese", "Japanese", "Kenyan", "Russian", 
               "Nigerian", "Peruvian", "Bolivian", "Terran", "Martian"] );
  parts.push( ["Bear", "Dog", "Potato", "Orangutan", "Klingon", "Romulan",
               "Cat", "Ferret", "Opossum", "Banana", "Cherry", "Cuttlefish",
               "Snail", "Crab", "Monkey", "Vampire", "Snake", "Shark", "Human"] );

	username = "";
  for( part of parts) {
  	username += part[Math.floor(Math.random()*part.length)];
  }
  if (!users.has(username)) return username
  else return randomUsername();
}

