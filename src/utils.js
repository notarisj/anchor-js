// utils.js

class Utils {

    static updateRoundId(id, value) {
        document.getElementById('roundId' + id).innerText = 'Current round ID: ' + value;
    }

    static updateActiveRounds(id, value) {
        document.getElementById('activeRounds' + id).innerText = 'Active Rounds: ' + value;
    }

    static updateCommitedRounds(id, value) {
        document.getElementById('committedRounds' + id).innerText = 'Committed Rounds: ' + value;
    }

    static updateCommittedTransactions(id, value) {
        document.getElementById('committedTransactions' + id).innerText = 'Committed Transactions: ' + value;
    }

    static displayCommittedRounds(id, committedRounds) {
        let content = '<ul>';
        committedRounds.forEach((transactions, roundId) => {
            content += `<li>Round ${roundId}: ${transactions.join(', ')}</li>`;
        });
        content += '</ul>';

        const popoverButton = document.getElementById('popoverButton' + id);

        // Check if the popover instance exists and is shown
        let popoverInstance = bootstrap.Popover.getInstance(popoverButton);

        if (popoverInstance) {
            popoverInstance.dispose();
            return;
        }

        // Initialize and show the popover
        popoverInstance = new bootstrap.Popover(popoverButton, {
            content: content,
            html: true,
            placement: 'bottom'
        });

        // Manually show the popover
        popoverInstance.show();
    }
}

module.exports = Utils;