// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract BeggingContract {
    mapping(address => uint256) public donations;
    address public owner;
    uint256 public donateDeadline;

    // Fixed-size Top 3 leaderboard
    address[3] public topDonors;
    uint256[3] public topDonations;

    constructor() {
        owner = msg.sender;
        donateDeadline = block.timestamp + 30 days; // Set the donation deadline to 30 days from contract deployment
    }

    event Donate(
        address indexed donor, // The address of the donor
        uint256 amount, // The amount donated
        uint256 timestamp // The timestamp of the donation
    );

    function donate() public payable {
        require(msg.value > 0, "Donation must be greater than 0.");
        require(block.timestamp < donateDeadline, "Donation period has ended.");
        donations[msg.sender] += msg.value;
        _updateTopDonors(msg.sender, donations[msg.sender]);
        emit Donate(msg.sender, msg.value, block.timestamp);
    }

    function getDonation(address donor) public view returns (uint256) {
        return donations[donor];
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only the owner can call this function.");
        _;
    }

    function withdraw() public onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw.");
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdraw failed.");
    }

    receive() external payable {
        donate();
    }

    function _updateTopDonors(address donor, uint256 amount) internal {
        // 1) Check if already in Top 3
        for (uint256 i = 0; i < 3; i++) {
            if (topDonors[i] == donor) {
                topDonations[i] = amount;
                // Bubble up — if the new amount exceeds a higher-ranked donor
                for (; i > 0 && topDonations[i] > topDonations[i - 1]; i--) {
                    (topDonors[i], topDonors[i - 1]) = (
                        topDonors[i - 1],
                        topDonors[i]
                    );
                    (topDonations[i], topDonations[i - 1]) = (
                        topDonations[i - 1],
                        topDonations[i]
                    );
                }
                return;
            }
        }
        // 2) Not in Top 3 — check if eligible to enter
        for (uint256 i = 0; i < 3; i++) {
            if (amount > topDonations[i]) {
                // Shift lower-ranked entries down
                for (uint256 j = 2; j > i; j--) {
                    topDonors[j] = topDonors[j - 1];
                    topDonations[j] = topDonations[j - 1];
                }
                topDonors[i] = donor;
                topDonations[i] = amount;
                break;
            }
        }
    }

    function getTop3Donors() public view returns (address[] memory) {
        address[] memory result = new address[](3);
        for (uint256 i = 0; i < 3; i++) {
            result[i] = topDonors[i];
        }
        return result;
    }
}
