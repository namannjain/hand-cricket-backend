import express from 'express';
const app = express();
import { createServer } from 'http';
import { Server } from 'socket.io';
import { customAlphabet } from 'nanoid';

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*'
    }
});

const activeRooms = {};
let prevPlayerTotalScore = 0;
let selectedMode = 'multiplayer';

io.on("connection", (socket) => {
    socket.on('create room', (userName) => {
        const roomId = generateRoomId();
        activeRooms[roomId] = {
            totalScore: 0,
            isBothPlayed: false,
            users: [{ userName: userName, score: 0, id: socket.id, makeMove: false }]
        }
        socket.join(roomId);
        socket.emit('room created', roomId);
    });

    socket.on('join room', (userName, roomId) => {
        roomId = roomId.toLowerCase();
        if (!activeRooms[roomId]) {
            socket.emit('room not found');
            return;
        }
        activeRooms[roomId]?.users?.push(
            {
                userName: userName,
                score: 0,
                makeMove: false,
                id: socket.id
            }
        );
        const room = activeRooms[roomId].users;
        if (room) {
            if (room.length <= 2) {
                socket.join(roomId);
                socket.emit('join room', roomId);
                if (room.length === 2) {
                    io.to(roomId).emit('can play now', roomId, activeRooms);
                }
            }
            else {
                socket.emit('room full');
            }
        } else {
            socket.emit('room not found');
        }
    });
    
    socket.on('play with cpu', (userName) => {
        const roomId = generateRoomId();
        socket.join(roomId);
        activeRooms[roomId] = {
            totalScore: 0,
            isBothPlayed: false,
            users: [{ userName: userName, score: 0, id: socket.id, makeMove: false }, { userName: 'CPU', score: 0, id: 'CPU', makeMove: false }]
        }
        selectedMode = 'singleplayer';
        io.to(roomId).emit('can play now', roomId, activeRooms);
    });
    
    socket.on('play again', (roomId) => {
        console.log(activeRooms[roomId])
        activeRooms[roomId].totalScore = 0;
        activeRooms[roomId].users[0].score = 0;
        activeRooms[roomId].users[1].score = 0;
        activeRooms[roomId].users[0].makeMove = false;
        activeRooms[roomId].users[1].makeMove = false;
        activeRooms[roomId].isBothPlayed = false;
        io.to(roomId).emit('restartMatch', activeRooms);
    })

    socket.on('player move', (roomId, move) => {
        const index = activeRooms[roomId].users.findIndex(user => user.id === socket.id);
        activeRooms[roomId].users[index].makeMove = true;
        activeRooms[roomId].users[index].score = move;
        if (selectedMode === 'singleplayer') {
            const cpuMove = generateRandomNumber();
            console.log('cpuMove', cpuMove)
            const cpuIndex = activeRooms[roomId].users.findIndex(user => user.userName === 'CPU');
            activeRooms[roomId].users[cpuIndex].score = cpuMove;
            activeRooms[roomId].users[cpuIndex].makeMove = true;
        }
        if (!activeRooms[roomId].users[0]?.makeMove || !activeRooms[roomId].users[1]?.makeMove) {
            return;
        }
        else {
            if (activeRooms[roomId].users[0].score === activeRooms[roomId].users[1].score && activeRooms[roomId].users[0].score) {
                activeRooms[roomId].users[0].score = 0;
                activeRooms[roomId].users[1].score = 0;
                activeRooms[roomId].users[0].makeMove = false;
                activeRooms[roomId].users[1].makeMove = false;
                if (!activeRooms[roomId].isBothPlayed) {
                    [activeRooms[roomId].users[0], activeRooms[roomId].users[1]] = [activeRooms[roomId].users[1], activeRooms[roomId].users[0]];
                    activeRooms[roomId].isBothPlayed = true;
                    prevPlayerTotalScore = activeRooms[roomId].totalScore;
                    let batterScore = activeRooms[roomId].totalScore;
                    activeRooms[roomId].totalScore = 0;
                    io.to(roomId).emit('bowled out', activeRooms[roomId].users[1].userName, activeRooms[roomId].users[0].userName, activeRooms, batterScore);
                }
                else {
                    const winner = +(prevPlayerTotalScore) > +(activeRooms[roomId].totalScore) ? activeRooms[roomId].users[1].userName : activeRooms[roomId].users[0].userName;
                    const draw = prevPlayerTotalScore === activeRooms[roomId].totalScore;
                    activeRooms[roomId].totalScore = 0;
                    console.log(activeRooms[roomId]);
                    io.to(roomId).emit('out', winner, draw, activeRooms, roomId);
                }
            }
            else if (activeRooms[roomId].isBothPlayed && prevPlayerTotalScore < activeRooms[roomId].totalScore + +(activeRooms[roomId].users[0].score)) {
                io.to(roomId).emit('user2 won match', activeRooms[roomId].users[0].userName, roomId);
                    console.log(activeRooms[roomId]);
            }
            else {
                console.log(activeRooms[roomId]);
                activeRooms[roomId].totalScore = activeRooms[roomId].totalScore + +(activeRooms[roomId].users[0].score);
                activeRooms[roomId].users[0].makeMove = false;
                activeRooms[roomId].users[1].makeMove = false;
                io.to(roomId).emit('score updated', activeRooms);
            }
        }
    });

    socket.on('disconnect', () => {
        Object.keys(activeRooms).forEach((roomId) => {
            const index = activeRooms[roomId].users.findIndex(user => user.id === socket.id);
            if (index !== -1) {
                activeRooms[roomId].users.splice(index, 1);
                if (activeRooms[roomId].users.length === 0) {
                    delete activeRooms[roomId];
                }
            }
        });
    });
});


function generateRandomNumber() {
    const alphabet = '123456';
    const generateAlphabeticId = customAlphabet(alphabet, 1);
    return generateAlphabeticId();
}

function generateRoomId() {
    const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const generateAlphabeticId = customAlphabet(alphabet, 4);
    return generateAlphabeticId().toLocaleLowerCase();
}

const port = process.env.PORT || 5000;
httpServer.listen(port, () => console.log('app is running'));
