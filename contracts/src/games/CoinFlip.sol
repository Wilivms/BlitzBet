// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {GameBase} from "../GameBase.sol";

/// @title CoinFlip
/// @notice Double or nothing. One transaction, one result, settled against the hub bankroll.
contract CoinFlip is GameBase {
    uint256 public constant MIN_WAGER = 0.001 ether;
    uint256 public flips;

    event Flipped(
        uint256 indexed flipId,
        bytes32 indexed playerId,
        uint256 wager,
        uint8 choice,
        uint8 result,
        bool won,
        uint256 payout
    );

    error BadChoice();
    error WagerTooSmall();

    constructor(address hub_) GameBase(hub_) {}

    /// @param choice 0 = heads, 1 = tails.
    function flip(bytes32 playerId, uint256 wager, uint8 choice)
        external
        onlyOperator
        returns (uint8 result, bool won, uint256 payout)
    {
        if (choice > 1) revert BadChoice();
        if (wager < MIN_WAGER) revert WagerTooSmall();

        hub.settle(playerId, wager, 0);

        result = uint8(hub.draw(playerId) & 1);
        won = result == choice;
        payout = won ? wager * 2 : 0;
        if (payout > 0) hub.settle(playerId, 0, payout);

        unchecked {
            flips++;
        }
        emit Flipped(flips, playerId, wager, choice, result, won, payout);
    }
}
