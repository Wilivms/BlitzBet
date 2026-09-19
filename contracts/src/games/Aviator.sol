// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {GameBase} from "../GameBase.sol";

/// @title Aviator
/// @notice A crash game whose multiplier is a function of block height, not of a server
///         clock. Everyone at the table flies the same round; each seat decides on its own
///         when to cash out, and the plane crashes at a point committed before the first
///         bet was placed.
///
/// @dev Why this game is the reason the project is on Monad.
///
///      Every crash game in production animates the multiplier in the browser and keeps the
///      crash point on a company server, because on a chain with 2-12 second blocks a
///      block-indexed multiplier would tick a handful of times before the round ended --
///      unplayable. Monad produces a block every 300ms, so `block.number - startBlock` is a
///      usable clock: the multiplier advances ~3.3 times a second, and a player's cash-out
///      is a real transaction that lands in a specific block. The block it lands in *is* the
///      multiplier they got. Nothing about the timing is taken on trust.
///
///      Fairness is commit-reveal. The house commits to keccak256(seed) before betting
///      opens and reveals the seed at the end; the crash point is derived from that seed
///      with the bustabit formula, so the house cannot move the crash once a bet exists,
///      and anyone can recompute the round afterwards from the committed hash.
///
///      Cash-outs are recorded, not paid, until the reveal. That ordering is what stops the
///      house paying out a cash-out it already knows came after the crash.
contract Aviator is GameBase {
    uint256 public constant MIN_WAGER = 0.001 ether;
    uint256 public constant MAX_BETS_PER_ROUND = 40;
    /// @dev 1.02x per block. At 300ms blocks that is 2x in ~10s, 5x in ~24s.
    uint256 internal constant GROWTH_NUM = 10_200;
    uint256 internal constant GROWTH_DEN = 10_000;
    uint256 public constant MAX_MULTIPLIER_BP = 1_000_000; // 100x, hard ceiling
    uint256 internal constant E = 2 ** 52;
    /// @dev 1 round in 33 busts instantly at 1.00x. That is the entire house edge (~3%).
    uint256 internal constant INSTANT_BUST_ODDS = 33;

    enum Phase {
        Idle,
        Betting,
        Flying,
        Settled
    }

    struct Seat {
        bytes32 playerId;
        uint128 wager;
        uint32 cashOutTick;
        bool cashedOut;
        uint128 payout;
    }

    uint256 public roundId;
    Phase public phase;
    bytes32 public commitment;
    uint256 public startBlock;
    uint256 public lastCrashBp;
    bytes32 public lastSeed;
    Seat[] private _seats;
    mapping(bytes32 => uint256) private _seatIndexPlusOne;

    event RoundOpened(uint256 indexed roundId, bytes32 commitment);
    event BetPlaced(uint256 indexed roundId, bytes32 indexed playerId, uint256 wager, uint256 seatIndex);
    event Launched(uint256 indexed roundId, uint256 startBlock);
    event CashedOut(uint256 indexed roundId, bytes32 indexed playerId, uint32 tick, uint256 multiplierBp);
    event Crashed(uint256 indexed roundId, bytes32 seed, uint256 crashBp, uint32 crashTick);
    event SeatSettled(uint256 indexed roundId, bytes32 indexed playerId, bool survived, uint256 payout);
    event RoundAborted(uint256 indexed roundId, uint256 refunded);

    error WrongPhase();
    error TableFull();
    error WagerTooSmall();
    error AlreadySeated();
    error NotSeated();
    error AlreadyCashedOut();
    error BadReveal();

    constructor(address hub_) GameBase(hub_) {}

    // ------------------------------------------------------------- multiplier --

    /// @notice Multiplier in basis points after `ticks` blocks of flight. 10000 = 1.00x.
    function multiplierAt(uint256 ticks) public pure returns (uint256 bp) {
        bp = 10_000;
        for (uint256 i; i < ticks; ++i) {
            bp = (bp * GROWTH_NUM) / GROWTH_DEN;
            if (bp >= MAX_MULTIPLIER_BP) return MAX_MULTIPLIER_BP;
        }
    }

    /// @notice Live multiplier for the round in flight. Pure function of block height.
    function currentMultiplierBp() public view returns (uint256) {
        if (phase != Phase.Flying) return 10_000;
        return multiplierAt(block.number - startBlock);
    }

    function currentTick() public view returns (uint256) {
        if (phase != Phase.Flying) return 0;
        return block.number - startBlock;
    }

    /// @notice Crash point derived from the revealed seed (bustabit's formula).
    /// @dev Anyone can call this with the revealed seed and check it against the commitment
    ///      that was published before betting opened.
    function crashPointBp(bytes32 seed) public pure returns (uint256) {
        uint256 h = uint256(keccak256(abi.encodePacked(seed)));
        if (h % INSTANT_BUST_ODDS == 0) return 10_000; // instant bust, the house edge
        uint256 hh = h % E;
        uint256 pct = (100 * E - hh) / (E - hh);
        uint256 bp = pct * 100;
        return bp > MAX_MULTIPLIER_BP ? MAX_MULTIPLIER_BP : bp;
    }

    /// @notice First tick at which the plane is already gone.
    function crashTickOf(uint256 crashBp) public pure returns (uint32) {
        uint256 bp = 10_000;
        uint32 t;
        while (bp < crashBp) {
            bp = (bp * GROWTH_NUM) / GROWTH_DEN;
            unchecked {
                ++t;
            }
            if (bp >= MAX_MULTIPLIER_BP) break;
        }
        return t;
    }

    // ------------------------------------------------------------------ round --

    function openRound(bytes32 commitment_) external onlyOperator returns (uint256) {
        if (phase == Phase.Betting || phase == Phase.Flying) revert WrongPhase();
        for (uint256 i; i < _seats.length; ++i) {
            delete _seatIndexPlusOne[_seats[i].playerId];
        }
        delete _seats;
        unchecked {
            roundId++;
        }
        commitment = commitment_;
        phase = Phase.Betting;
        startBlock = 0;
        emit RoundOpened(roundId, commitment_);
        return roundId;
    }

    function placeBet(bytes32 playerId, uint256 wager) external onlyOperator returns (uint256 seatIndex) {
        if (phase != Phase.Betting) revert WrongPhase();
        if (_seats.length >= MAX_BETS_PER_ROUND) revert TableFull();
        if (wager < MIN_WAGER || wager > type(uint128).max) revert WagerTooSmall();
        if (_seatIndexPlusOne[playerId] != 0) revert AlreadySeated();

        hub.settle(playerId, wager, 0);

        seatIndex = _seats.length;
        _seats.push(Seat({playerId: playerId, wager: uint128(wager), cashOutTick: 0, cashedOut: false, payout: 0}));
        _seatIndexPlusOne[playerId] = seatIndex + 1;
        emit BetPlaced(roundId, playerId, wager, seatIndex);
    }

    function launch() external onlyOperator {
        if (phase != Phase.Betting) revert WrongPhase();
        phase = Phase.Flying;
        startBlock = block.number;
        emit Launched(roundId, startBlock);
    }

    /// @notice Record a seat's cash-out. The block this lands in fixes the multiplier.
    /// @dev Deliberately does not pay. Whether this cash-out beat the crash is only known
    ///      at reveal, and paying first would let the house settle a losing cash-out.
    function cashOut(bytes32 playerId) external onlyOperator returns (uint256 multiplierBp) {
        if (phase != Phase.Flying) revert WrongPhase();
        uint256 idx = _seatIndexPlusOne[playerId];
        if (idx == 0) revert NotSeated();
        Seat storage s = _seats[idx - 1];
        if (s.cashedOut) revert AlreadyCashedOut();

        uint32 tick = uint32(block.number - startBlock);
        s.cashedOut = true;
        s.cashOutTick = tick;
        multiplierBp = multiplierAt(tick);
        emit CashedOut(roundId, playerId, tick, multiplierBp);
    }

    /// @notice Reveal the seed, fix the crash point, and settle every seat.
    function reveal(bytes32 seed) external onlyOperator returns (uint256 crashBp, uint32 crashTick) {
        if (phase != Phase.Flying) revert WrongPhase();
        if (keccak256(abi.encodePacked(seed)) != commitment) revert BadReveal();

        crashBp = crashPointBp(seed);
        crashTick = crashTickOf(crashBp);
        lastCrashBp = crashBp;
        lastSeed = seed;
        phase = Phase.Settled;
        emit Crashed(roundId, seed, crashBp, crashTick);

        for (uint256 i; i < _seats.length; ++i) {
            Seat storage s = _seats[i];
            bool survived = s.cashedOut && s.cashOutTick < crashTick;
            uint256 payout = survived ? (uint256(s.wager) * multiplierAt(s.cashOutTick)) / 10_000 : 0;
            s.payout = uint128(payout);
            if (payout > 0) hub.settle(s.playerId, 0, payout);
            emit SeatSettled(roundId, s.playerId, survived, payout);
        }
    }

    /// @notice Escape hatch: refund every stake without playing the round out.
    /// @dev For the demo. If a round wedges, the table gets its chips back rather than the
    ///      house quietly keeping them.
    function abortRound() external onlyOperator returns (uint256 refunded) {
        if (phase != Phase.Betting && phase != Phase.Flying) revert WrongPhase();
        for (uint256 i; i < _seats.length; ++i) {
            Seat storage s = _seats[i];
            hub.settle(s.playerId, 0, s.wager);
            s.payout = s.wager;
            refunded += s.wager;
        }
        phase = Phase.Settled;
        emit RoundAborted(roundId, refunded);
    }

    // ------------------------------------------------------------------ views --

    function seats() external view returns (Seat[] memory) {
        return _seats;
    }

    function seatCount() external view returns (uint256) {
        return _seats.length;
    }

    function seatOf(bytes32 playerId) external view returns (bool seated, Seat memory seat) {
        uint256 idx = _seatIndexPlusOne[playerId];
        if (idx == 0) return (false, seat);
        return (true, _seats[idx - 1]);
    }
}
