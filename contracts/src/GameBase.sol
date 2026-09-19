// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {CasinoHub} from "./CasinoHub.sol";

/// @notice Shared plumbing for every BlitzBet table game.
abstract contract GameBase {
    CasinoHub public immutable hub;

    error NotOperator();

    modifier onlyOperator() {
        if (!hub.isOperator(msg.sender)) revert NotOperator();
        _;
    }

    constructor(address hub_) {
        hub = CasinoHub(payable(hub_));
    }
}
