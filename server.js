const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, {
  cors: {
    origin: ["http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.static("public"));

const players = {};
const bullets = {};
const MAX_HEALTH = 100;
const MAX_SCORE = 3;

const SPAWN_POSITIONS = [
  { x: -10, y: 2, z: 0 },
  { x: 10, y: 2, z: 0 },
];

const gameState = {
  scores: {},
  playerCount: 0,
};

io.on("connection", (socket) => {
  const playerId = socket.id;
  gameState.playerCount++;

  const spawnIndex = Object.keys(players).length % SPAWN_POSITIONS.length;
  const spawnPosition = SPAWN_POSITIONS[spawnIndex];

  players[playerId] = {
    id: playerId,
    position: spawnPosition,
    rotation: { x: 0, y: 0, z: 0 },
    health: MAX_HEALTH,
    score: 0,
    spawnIndex: spawnIndex,
  };

  gameState.scores[playerId] = 0;

  socket.emit("initialize", {
    id: playerId,
    players: players,
    position: spawnPosition,
    health: MAX_HEALTH,
    score: 0,
    playerCount: gameState.playerCount,
  });

  socket.broadcast.emit("playerJoined", players[playerId]);
  io.emit("playerCountUpdate", gameState.playerCount);

  socket.on("updatePosition", (data) => {
    if (players[playerId]) {
      // Log position updates occasionally to avoid console spam
      if (Math.random() < 0.05) {
        console.log(`SERVER: Player ${playerId} moved to:`, {
          x: data.position.x.toFixed(2),
          y: data.position.y.toFixed(2),
          z: data.position.z.toFixed(2),
        });
      }

      players[playerId].position = data.position;
      players[playerId].rotation = data.rotation;

      socket.broadcast.emit("playerMoved", {
        id: playerId,
        position: data.position,
        rotation: data.rotation,
      });

      // Add a simple debug flag to the data
      const broadcastData = {
        id: playerId,
        position: data.position,
        rotation: data.rotation,
        timestamp: Date.now(),
      };

      socket.broadcast.emit("playerMoved", broadcastData);
    }
  });

  socket.on("createBullet", (data) => {
    const bulletId = `${playerId}-${Date.now()}`;
    bullets[bulletId] = {
      id: bulletId,
      position: data.position,
      velocity: data.velocity,
      owner: playerId,
    };
    io.emit("bulletCreated", bullets[bulletId]);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (bullets[bulletId]) {
        delete bullets[bulletId];
        io.emit("bulletRemoved", bulletId);
      }
    }, 3000);
  });

  socket.on("bulletHit", (data) => {
    const { bulletId, hitPlayerId } = data;
    const bullet = bullets[bulletId];

    if (bullet && players[hitPlayerId] && bullet.owner !== hitPlayerId) {
      delete bullets[bulletId];
      io.emit("bulletRemoved", bulletId);

      players[hitPlayerId].health -= 25;

      if (players[hitPlayerId].health <= 0) {
        const shooterId = bullet.owner;
        players[shooterId].score += 1;
        gameState.scores[shooterId] = players[shooterId].score;

        if (players[shooterId].score >= MAX_SCORE) {
          io.emit("gameOver", { winner: shooterId });
          Object.keys(players).forEach((id) => {
            players[id].score = 0;
            gameState.scores[id] = 0;
          });
          io.emit("newRound", {
            message: "New round starting!",
            scores: gameState.scores,
          });
        }

        players[hitPlayerId].health = MAX_HEALTH;
        const index = players[hitPlayerId].spawnIndex;
        players[hitPlayerId].position = SPAWN_POSITIONS[index];

        io.emit("playerRespawned", {
          id: hitPlayerId,
          position: players[hitPlayerId].position,
          health: MAX_HEALTH,
        });
      }

      io.emit("playerHealthUpdate", {
        id: hitPlayerId,
        health: players[hitPlayerId].health,
      });

      io.emit("scoreUpdate", gameState.scores);
    }
  });

  socket.on("disconnect", () => {
    delete players[playerId];
    delete gameState.scores[playerId];
    gameState.playerCount--;
    socket.broadcast.emit("playerLeft", playerId);
    io.emit("playerCountUpdate", gameState.playerCount);
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
