const { EventEmitter } = require('events');
const TimeUtils = require('./time-utils');
const Visualization = require('./visualization');
const Utils = require('./utils');

const sendMessageButton = document.getElementById("sendMessageButton");
const resetButton = document.getElementById("resetButton");
const clientSelect = document.getElementById("clientSelect");

const popover1 = document.getElementById("popoverButton1");
const popover2 = document.getElementById("popoverButton2");
const popover3 = document.getElementById("popoverButton3");

const speedSlider = document.getElementById("speedSlider");
let awaitTime = speedSlider.value;

let transactionCounter = 0;

function setTimeoutPromise(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    constructor(nodeId, otherConsensuses) {
        super();
        this.nodeId = nodeId;
        this.activeRounds = new Map();
        this.commitedRounds = new Map();
        this.proposeAccepted = new Set();
        this.nonce = 0;
        this.connections = otherConsensuses;
        this.on('message', this.handleMessage.bind(this));
    }

    async submitRound(transaction, roundId = null, displayTransaction = false) {
        if (displayTransaction) {
            visualization.sendMessage(visualization.clients[this.nodeId - 1], visualization.nodes[this.nodeId - 1], `${transaction}`, this.nonce);
            await setTimeoutPromise(awaitTime);
        }

        if (roundId == null) {
            this.nonce++;
            roundId = this.nonce;
        }
        Utils.updateRoundId(this.nodeId, roundId);
        const round = new Round(this, roundId);
        round.transactions.push(transaction);
        this.activeRounds.set(roundId, round);
        Utils.updateActiveRounds(this.nodeId, this.activeRounds.size);
        visualization.createRound(visualization.nodes[this.nodeId - 1], roundId)
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
        Utils.updateCommitedRounds(this.nodeId, this.commitedRounds.size);
    }

    isProposeAccepted(roundId) {
        return this.proposeAccepted.has(roundId);
    }

    async sendMessage(message, toNode) {
        // await setTimeoutPromise(awaitTime);
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} sending message:`, message);
        // this.connections[toNode].emit('message', message);
        visualization.sendMessage(visualization.nodes[message.requestServerId - 1], visualization.nodes[toNode - 1], message.command, message.roundId);
        this.connections.find(connection => connection.nodeId === toNode).emit('message', message);
    }

    async handleMessage(message) {
        await setTimeoutPromise(awaitTime);
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} received message:`, message);
        const command= message.command;
        switch (command) {
            case 'PROPOSE':
                this.handlePropose(message).then(_ => {});
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
        // await setTimeoutPromise(10);
        const response = new Message({
            requestServerId: this.nodeId,
            roundId: message.roundId,
            toServer: message.requestServerId,
            command: 'ACCEPT'
        });
        this.proposeAccepted.add(message.roundId);
        this.nonce = Math.max(this.nonce, message.roundId);
        Utils.updateRoundId(this.nodeId, this.nonce);
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
        const rounds = visualization.nodes[this.nodeId - 1].rounds;
        if (rounds && visualization.findRound(rounds, message.roundId)) {
            visualization.sendMessage(visualization.findRound(rounds, message.roundId), visualization.nodes[this.nodeId - 1], message.command, message.roundId, false);
        }
        this.sendMessage(response, response.toServer)
        const round = this.activeRounds.get(message.roundId);
        if (round) {
            round.setTransactions(message.content);
            round.signalReceivedCommit();
        }
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} Round ${message.roundId} committed with transactions:`, message.content[0]);
        this.commitTransactions(message.roundId, message.content[0]);
        this.activeRounds.delete(message.roundId);
        Utils.updateActiveRounds(this.nodeId, this.activeRounds.size);
    }

    handleForward(message) {
        if (this.roundIsRunning(message.roundId)) {
            this.activeRounds.get(message.roundId).addTransaction(message.content)
        } else if (!this.roundExists(message.roundId)) {
            this.submitRound(message.content, message.roundId);
        }
    }

    broadcast(message) {
        console.log(`${TimeUtils.getCurrentTime()} C${this.nodeId} broadcasting message:`, message);
        this.connections.forEach(consensus => {
            visualization.sendMessage(visualization.nodes[message.requestServerId - 1], visualization.nodes[consensus.nodeId - 1], message.command, message.roundId);
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
                    const rounds = visualization.nodes[this.consensus.nodeId - 1].rounds;
                    if (rounds && visualization.findRound(rounds, this.roundId)) {
                        visualization.sendMessage(visualization.findRound(rounds, this.roundId), visualization.nodes[this.consensus.nodeId - 1], "COMMIT", this.roundId, false);
                    }
                    this.consensus.commitTransactions(this.roundId, this.transactions)
                    this.consensus.activeRounds.delete(this.roundId);
                    Utils.updateActiveRounds(this.consensus.nodeId, this.consensus.activeRounds.size);
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
        // const coordinator = this.roundId % (this.consensus.connections.length + 1) + 1;
        // console.log(`${TimeUtils.getCurrentTime()} C${this.consensus.nodeId} roundId is ${this.roundId}`)
        // console.log(`${TimeUtils.getCurrentTime()} C${this.consensus.nodeId} coordinator is ${coordinator}`)
        return this.roundId % (this.consensus.connections.length + 1) + 1;
    }

    async awaitReceivedAllResponse() {
        while (this.responseLatch > 0) {
            await setTimeoutPromise(10);
        }
    }

    countDownLatch() {
        this.responseLatch -= 1;
    }

    signalReceivedCommit() {
        console.log(`${TimeUtils.getCurrentTime()} Round ${this.roundId} received commit.`);
    }
}

const visualization = new Visualization(awaitTime);
visualization.initialize();

sendMessageButton.addEventListener("click", () => {
    const selectedClients = Array.from(clientSelect.selectedOptions).map(option => visualization.clients[option.value]);
    if (selectedClients.length !== 0) {
        selectedClients.forEach(client => {
            transactionCounter++;
            consensusNodes[client.id - 1].submitRound(`transaction_${transactionCounter}`, null, true)
        })
    } else {
        alert("Please select at least one client!");
    }

});

speedSlider.addEventListener("input", function () {
    awaitTime = this.value;
});

popover1.addEventListener("click", () => {
    Utils.displayCommittedRounds(1, consensusNodes[0].commitedRounds);
});

popover2.addEventListener("click", () => {
    Utils.displayCommittedRounds(2, consensusNodes[1].commitedRounds);
});

popover3.addEventListener("click", () => {
    Utils.displayCommittedRounds(3, consensusNodes[2].commitedRounds);
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        sendMessageButton.click();
    }
});

resetButton.addEventListener("click", visualization.resetVisualization);

// Simulation of starting nodes and submitting rounds
const nodeIds = [1, 2, 3];

// Initialize consensusNodes as an empty array initially
const consensusNodes = [];

// Create consensus instances and populate the array
nodeIds.forEach(id => {
    consensusNodes.push(new Consensus(id, [])); // Temporarily use an empty array for otherConsensuses
});

// Now that consensusNodes is populated, establish connections
consensusNodes.forEach(consensus => {
    // Filter out the current consensus instance to get the other consensuses
    consensus.connections = consensusNodes.filter(c => c !== consensus);
});
