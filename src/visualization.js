// visualization.js

const svg = d3.select("svg");

// Create a group to contain all nodes and clients
const g = svg.append("g");

class Visualization {
    constructor(animationSpeed) {
        this.animationSpeed = animationSpeed;
        this.nodes = [];
        this.clients = [];
        this.currentRound = 0;
        this.initialize();
    }

    initialize() {
        const speedSlider = document.getElementById("speedSlider");
        const speedValue = document.getElementById("speedValue");

        speedSlider.addEventListener("input", () => {
            this.animationSpeed = speedSlider.value;
            speedValue.textContent = speedSlider.value;
        });

        this.nodes = [
            { id: 1, x: 200, y: 400, rounds: []},
            { id: 2, x: 500, y: 200, rounds: []},
            { id: 3, x: 800, y: 400, rounds: []}
        ];

        this.clients = [
            { id: 1, x: 100, y: 250 },
            { id: 2, x: 500, y: 50 },
            { id: 3, x: 900, y: 250 }
        ];

        this.createNodeElements();
        this.createClientElements();
        this.makeDraggable();
    }

    createNodeElements() {
        g.append("g")
            .selectAll("circle")
            .data(this.nodes)
            .enter().append("circle")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", 60)
            .attr("fill", "lightblue");

        g.append("g")
            .selectAll("text")
            .data(this.nodes)
            .enter().append("text")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .attr("dy", 6)
            .attr("text-anchor", "middle")
            .text(d => 'Node ' + d.id);
    }

    createClientElements() {
        g.append("g")
            .selectAll("circle")
            .data(this.clients)
            .enter().append("circle")
            .attr("cx", d => d.x)
            .attr("cy", d => d.y)
            .attr("r", 20)
            .attr("fill", "orange");

        g.append("g")
            .selectAll("text")
            .data(this.clients)
            .enter().append("text")
            .attr("x", d => d.x)
            .attr("y", d => d.y)
            .attr("dy", 6)
            .attr("text-anchor", "middle")
            .text(d => 'C' + d.id);
    }

    makeDraggable() {
        const drag = d3.drag()
            .on("start", (event) => {
                // Store the initial position
                const transform = g.attr("transform");
                if (transform) {
                    const translate = transform.match(/translate\(([^)]+)\)/)[1].split(",");
                    this.initialX = parseFloat(translate[0]);
                    this.initialY = parseFloat(translate[1]);
                } else {
                    this.initialX = 0;
                    this.initialY = 0;
                }
                this.startX = event.x;
                this.startY = event.y;
            })
            .on("drag", (event) => {
                // Calculate the new position
                const dx = event.x - this.startX;
                const dy = event.y - this.startY;
                g.attr("transform", `translate(${this.initialX + dx},${this.initialY + dy})`);
            });

        g.call(drag);
    }

    sendMessage(source, target, message, round, pickRound = true, curveDirection = 'none') {
        const color = getColor(message);
        if (source.rounds && source.rounds.find(r => r.id === round) && pickRound && !message.startsWith("transaction_")) {
            source = source.rounds.find(r => r.id === round);
        }

        if (target.rounds && target.rounds.find(r => r.id === round) && pickRound && !message.startsWith("transaction_")) {
            target = target.rounds.find(r => r.id === round);
        }

        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const curveHeight = curveDirection === "none" ? 0 : 30;
        const controlPointY = curveDirection === "up" ? midY - curveHeight : midY + curveHeight;
        const textOffset = curveDirection === "up" ? -10 : 10;

        const pathD = curveDirection === "none" ?
            `M ${source.x} ${source.y} L ${target.x} ${target.y}` :
            `M ${source.x} ${source.y} C ${midX} ${controlPointY}, ${midX} ${controlPointY}, ${target.x} ${target.y}`;

        const path = g.append("path")
            .attr("d", pathD)
            .attr("stroke", color)
            .attr("stroke-width", 2)
            .attr("fill", "none");

        const totalLength = path.node().getTotalLength();

        path.attr("stroke-dasharray", totalLength + " " + totalLength)
            .attr("stroke-dashoffset", totalLength)
            .transition()
            .duration(this.animationSpeed)
            .attr("stroke-dashoffset", 0)
            .on("end", () => path.remove());

        g.append("text")
            .attr("x", midX)
            .attr("y", curveDirection !== "none" ? midY + textOffset : midY)
            .attr("dy", -5)
            .attr("text-anchor", "middle")
            .text(message)
            .transition()
            .duration(this.animationSpeed)
            .remove();
    }

    createRound(node, round) {
        const roundY = node.y + 150 + node.rounds.length * 30;
        node.rounds.push({ id: round, x: node.x, y: roundY, accepts: 0 });

        g.append("circle")
            .attr("cx", node.x)
            .attr("cy", roundY)
            .attr("r", 20)
            .attr("fill", "lightgreen");

        g.append("text")
            .attr("x", node.x)
            .attr("y", roundY)
            .attr("dy", 3)
            .attr("text-anchor", "middle")
            .text(`R` + round);
    }

    resetVisualization() {
        this.removeAllRounds();
        this.nodes.forEach(node => { node.rounds = []; node.pendingAccepts = 0; });
    }

    removeAllRounds() {
        g.selectAll("circle").filter((d, i, nodes) => d3.select(nodes[i]).attr("fill") === "lightgreen").remove();
        g.selectAll("text").filter((d, i, nodes) => nodes[i].textContent.startsWith("R")).remove();
    }

    findRound(rounds, roundId) {
        return rounds.find(r => r.id === roundId);
    }
}

function getColor(message) {
    switch(message) {
        case "PROPOSE":
            return "blue";
        case "FORWARD":
            return "purple";
        case "COMMIT":
            return "red";
        case "ACCEPT":
            return "green";
        default:
            return "black"
    }
}

module.exports = Visualization;
