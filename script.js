const { EventEmitter } = require('events');
const uuid = require('uuid');
const { setTimeout } = require('timers/promises');
const TimeUtils = require('./timeUtils');

class Message {
    constructor({ requestServerId, roundId, toServer, command, content }) {
        this.requestServerId = requestServerId;
        this.roundId = roundId;
        this.toServer = toServer;
        this.command = command;
        this.content = content;
    }
}

class Consensus extends EventEmitter {
    constructor(nodeId, peerIds, otherConsensuses) {
        super();
        this.nodeId = nodeId;
        this.peers = new Map();
        this.activeRounds = new Map();
        this.commitedRounds = new Map();
        this.proposeAccepted = new Set();
        this.nonce = 0;
        this.connections = otherConsensuses;
        this.on('message', this.handleMessage.bind(this));
    }

    getPeer(id) {
        return this.peers.get(id);
    }

    submitRound(transaction, roundId = null) {
        if (!roundId) {
            this.nonce++
            roundId = this.nonce;
        }
        const round = new Round(this, roundId);
        round.transactions.push(transaction);
        this.activeRounds.set(roundId, round);
        round.run();
    }

    roundIsRunning(roundId) {
        return this.activeRounds.has(roundId) && !this.commitedRounds.has(roundId);
    }

    roundExists(roundId) {
        return this.activeRounds.has(roundId) || this.activeRounds.has(roundId);
    }

    commitTransactions(roundId, transactions) {
        this.commitedRounds.set(roundId, transactions);
    }

    isProposeAccepted(roundId) {
        return this.proposeAccepted.has(roundId);
    }

    sendMessage(message, toNode) {
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} sending message:`, message);
        // this.connections[toNode].emit('message', message);
        this.connections.find(connection => connection.nodeId === toNode).emit('message', message);
    }

    handleMessage(message) {
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} received message:`, message);
        const { command, roundId } = message;
        switch (command) {
            case 'PROPOSE':
                this.handlePropose(message);
                break;
            case 'ACCEPT':
                this.handleAccept(message);
                break;
            case 'COMMIT':
                this.handleCommit(message);
                break;
            case 'FORWARD':
                this.handleForward(message);
                break;
            default:
                console.warn(`Invalid command: ${command}`);
        }
    }

    async handlePropose(message) {
        await setTimeout(10);
        const response = new Message({
            requestServerId: this.nodeId,
            roundId: message.roundId,
            toServer: message.requestServerId,
            command: 'ACCEPT'
        });
        this.proposeAccepted.add(message.roundId);
        this.sendMessage(response, response.toServer)
    }

    handleAccept(message) {
        const round = this.activeRounds.get(message.roundId);
        if (round) {
            round.countDownLatch();
        }
    }

    handleCommit(message) {
        const response = new Message({
            requestServerId: this.nodeId,
            roundId: message.roundId,
            toServer: message.requestServerId,
            command: 'ACCEPT'
        });
        this.sendMessage(response, response.toServer)
        const round = this.activeRounds.get(message.roundId);
        if (round) {
            round.setTransactions(message.content);
            round.signalReceivedCommit();
        }
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} Round ${message.roundId} committed with transactions:`, message.content[0]);
        this.commitTransactions(message.roundId, message.content[0]);
    }

    handleForward(message) {
        if (this.roundIsRunning(message.roundId)) {
            this.activeRounds.get(message.roundId).addTransaction(message.content)
        } else if (this.roundExists(message.roundId)) {
            this.submitRound(message.content, message.roundId);
        }
    }

    broadcast(message) {
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} broadcasting message:`, message);
        this.connections.forEach(consensus => {
            consensus.emit('message', message);
        });
    }
}

class Round {
    constructor(consensus, roundId) {
        this.consensus = consensus;
        this.roundId = roundId;
        this.transactions = [];
        this.responseLatch = this.consensus.connections.length;
    }

    setTransactions(transactions) {
        this.transactions = transactions;
    }

    addTransaction(transaction) {
        this.transactions.push(transaction);
    }

    run() {
        if (this.consensus.nodeId === this.getCoordinator()) {
            const proposeMessage = new Message({
                requestServerId: this.consensus.nodeId,
                roundId: this.roundId,
                command: 'PROPOSE'
            });
            this.consensus.broadcast(proposeMessage);
            this.awaitReceivedAllResponse().then(() => {
                const commitMessage = new Message({
                    requestServerId: this.consensus.nodeId,
                    roundId: this.roundId,
                    command: 'COMMIT',
                    content: [this.transactions]
                });
                this.responseLatch = this.consensus.connections.length;
                this.consensus.broadcast(commitMessage);
                this.awaitReceivedAllResponse().then(() => {
                    this.consensus.commitTransactions(this.roundId, this.transactions)
                    this.consensus.activeRounds.delete(this.roundId);
                    console.log(`${TimeUtils.getCurrentTime()} C${this.consensus.nodeId} Round ${this.roundId} committed with transactions:`, this.transactions);
                });
            });

        } else {
            if (this.consensus.isProposeAccepted(this.roundId)) {
                console.log(`${TimeUtils.getCurrentTime()} C${this.consensus.nodeId} Round ${this.roundId} Already accepted propose command or round is commited. Submitting new round...`);
                this.consensus.submitRound(this.transactions.pop());
            } else {
                const forwardMessage = new Message({
                    requestServerId: this.consensus.nodeId,
                    roundId: this.roundId,
                    toServer: this.getCoordinator(),
                    command: 'FORWARD',
                    content: this.transactions.pop()
                });
                this.consensus.sendMessage(forwardMessage, this.getCoordinator());
            }
        }
    }

    getCoordinator() {
        return this.roundId % (this.consensus.connections.length + 1) + 1;
    }

    async awaitReceivedAllResponse() {
        while (this.responseLatch > 0) {
            await setTimeout(10);
        }
    }

    countDownLatch() {
        this.responseLatch -= 1;
    }

    signalReceivedCommit() {
        console.log(`${TimeUtils.getCurrentTime()} Round ${this.roundId} received commit.`);
    }
}

// Simulation of starting nodes and submitting rounds
const nodeIds = [1, 2, 3];

// Initialize consensusNodes as an empty array initially
const consensusNodes = [];

// Create consensus instances and populate the array
nodeIds.forEach(id => {
    consensusNodes.push(new Consensus(id, nodeIds, [])); // Temporarily use an empty array for otherConsensuses
});

// Now that consensusNodes is populated, establish connections
consensusNodes.forEach(consensus => {
    // Filter out the current consensus instance to get the other consensuses
    consensus.connections = consensusNodes.filter(c => c !== consensus);
});

// Simulate submitting a round

consensusNodes[1].submitRound('transaction_1');
consensusNodes[2].submitRound('transaction_3');
consensusNodes[0].submitRound('transaction_2');