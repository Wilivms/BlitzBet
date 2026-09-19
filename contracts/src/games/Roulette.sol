// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {GameBase} from "../GameBase.sol";

/// @title Roulette
/// @notice European single-zero roulette. Several seats bet on the same wheel, then the
///         croupier spins once and every bet in the round is settled in that transaction.
/// @dev Payout tables follow standard European rules: zero loses every outside bet
///      (no en prison, no la partage).
contract Roulette is GameBase {
    enum BetType {
        Number, // 35:1, value = 0..36
        Red, // 1:1
        Black, // 1:1
        Even, // 1:1  (zero is not even here)
        Odd, // 1:1
        Low, // 1:1  1-18
        High, // 1:1  19-36
        Dozen // 2:1  value = 0,1,2
    }

    struct Bet {
        bytes32 playerId;
        uint128 wager;
        uint8 betType;
        uint8 value;
    }

    /// @dev Bitmask of the 18 red pockets on a European wheel.
    uint64 internal constant RED_MASK = (uint64(1) << 1) | (uint64(1) << 3) | (uint64(1) << 5) | (uint64(1) << 7)
        | (uint64(1) << 9) | (uint64(1) << 12) | (uint64(1) << 14) | (uint64(1) << 16) | (uint64(1) << 18)
        | (uint64(1) << 19) | (uint64(1) << 21) | (uint64(1) << 23) | (uint64(1) << 25) | (uint64(1) << 27)
        | (uint64(1) << 30) | (uint64(1) << 32) | (uint64(1) << 34) | (uint64(1) << 36);

    uint256 public constant MIN_WAGER = 0.001 ether;
    uint256 public constant MAX_BETS_PER_ROUND = 40;

    uint256 public roundId;
    bool public isOpen;
    uint8 public lastResult;
    Bet[] private _bets;

    event RoundOpened(uint256 indexed roundId);
    event BetPlaced(
        uint256 indexed roundId, bytes32 indexed playerId, uint256 betIndex, uint8 betType, uint8 value, uint256 wager
    );
    event Spun(uint256 indexed roundId, uint8 result, uint256 betsSettled, uint256 totalPaid);
    event BetSettled(uint256 indexed roundId, bytes32 indexed playerId, uint256 betIndex, bool won, uint256 payout);

    error RoundNotOpen();
    error RoundAlreadyOpen();
    error TableFull();
    error WagerTooSmall();
    error BadBet();

    constructor(address hub_) GameBase(hub_) {}

    function openRound() external onlyOperator returns (uint256) {
        if (isOpen) revert RoundAlreadyOpen();
        delete _bets;
        unchecked {
            roundId++;
        }
        isOpen = true;
        emit RoundOpened(roundId);
        return roundId;
    }

    function placeBet(bytes32 playerId, uint256 wager, uint8 betType, uint8 value)
        external
        onlyOperator
        returns (uint256 betIndex)
    {
        if (!isOpen) revert RoundNotOpen();
        if (_bets.length >= MAX_BETS_PER_ROUND) revert TableFull();
        if (wager < MIN_WAGER) revert WagerTooSmall();
        if (wager > type(uint128).max) revert BadBet();
        if (betType > uint8(BetType.Dozen)) revert BadBet();
        if (betType == uint8(BetType.Number) && value > 36) revert BadBet();
        if (betType == uint8(BetType.Dozen) && value > 2) revert BadBet();

        hub.settle(playerId, wager, 0);

        betIndex = _bets.length;
        _bets.push(Bet({playerId: playerId, wager: uint128(wager), betType: betType, value: value}));
        emit BetPlaced(roundId, playerId, betIndex, betType, value, wager);
    }

    function spin() external onlyOperator returns (uint8 result, uint256 totalPaid) {
        if (!isOpen) revert RoundNotOpen();
        isOpen = false;

        result = uint8(hub.draw(bytes32(roundId)) % 37);
        lastResult = result;

        uint256 n = _bets.length;
        for (uint256 i; i < n; ++i) {
            Bet memory b = _bets[i];
            uint256 payout = _payout(b, result);
            if (payout > 0) {
                hub.settle(b.playerId, 0, payout);
                totalPaid += payout;
            }
            emit BetSettled(roundId, b.playerId, i, payout > 0, payout);
        }
        emit Spun(roundId, result, n, totalPaid);
    }

    /// @dev Total returned to the player on a win, stake included (0 on a loss).
    function _payout(Bet memory b, uint8 result) internal pure returns (uint256) {
        uint256 w = b.wager;
        if (b.betType == uint8(BetType.Number)) {
            return b.value == result ? w * 36 : 0;
        }
        if (result == 0) return 0; // zero sweeps every outside bet
        if (b.betType == uint8(BetType.Red)) return _isRed(result) ? w * 2 : 0;
        if (b.betType == uint8(BetType.Black)) return _isRed(result) ? 0 : w * 2;
        if (b.betType == uint8(BetType.Even)) return result % 2 == 0 ? w * 2 : 0;
        if (b.betType == uint8(BetType.Odd)) return result % 2 == 1 ? w * 2 : 0;
        if (b.betType == uint8(BetType.Low)) return result <= 18 ? w * 2 : 0;
        if (b.betType == uint8(BetType.High)) return result >= 19 ? w * 2 : 0;
        // Dozen: 0 -> 1-12, 1 -> 13-24, 2 -> 25-36
        uint8 dozen = (result - 1) / 12;
        return b.value == dozen ? w * 3 : 0;
    }

    /// @notice Payout (stake included) a bet would return for a given pocket. View helper
    ///         used by the front end to show odds and by the tests to pin the payout table.
    function quote(uint256 wager, uint8 betType, uint8 value, uint8 result) external pure returns (uint256) {
        return _payout(Bet({playerId: bytes32(0), wager: uint128(wager), betType: betType, value: value}), result);
    }

    function _isRed(uint8 n) internal pure returns (bool) {
        return (RED_MASK >> n) & 1 == 1;
    }

    function isRed(uint8 n) external pure returns (bool) {
        return n != 0 && _isRed(n);
    }

    function betsInRound() external view returns (uint256) {
        return _bets.length;
    }

    function betAt(uint256 i) external view returns (Bet memory) {
        return _bets[i];
    }

    function allBets() external view returns (Bet[] memory) {
        return _bets;
    }
}
