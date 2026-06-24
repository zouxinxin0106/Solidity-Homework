// SPDX-License-Identifier: MIT 
pragma solidity 0.8.28;

contract Voting {
    mapping(address => bool) public hasVoted;
    mapping(string => uint) public votesReceived;
    string[] public candidateList;

    constructor(string[] memory candidateNames) {
        candidateList = candidateNames;
    }

    function vote(string memory candidate) public {
        require(!hasVoted[msg.sender], "You have already voted.");
        require(validCandidate(candidate), "Invalid candidate.");

        hasVoted[msg.sender] = true;
        votesReceived[candidate]++;
    }

    function validCandidate(
        string memory candidate
    ) internal view returns (bool) {
        for (uint i = 0; i < candidateList.length; i++) {
            if (
                keccak256(abi.encodePacked(candidateList[i])) ==
                keccak256(abi.encodePacked(candidate))
            ) {
                return true;
            }
        }
        return false;
    }

    function getVotes(string memory candidate) public view returns (uint) {
        require(validCandidate(candidate), "Invalid candidate.");
        return votesReceived[candidate];
    }

    function resetVotes() public {
        for (uint i = 0; i < candidateList.length; i++) {
            votesReceived[candidateList[i]] = 0;
        }
    }
}
