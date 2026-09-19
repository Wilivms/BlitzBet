// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {GameBase} from "../GameBase.sol";

/// @title Blackjack
/// @notice Each seat plays its own hand against the contract. Hit, stand, double down and
///         one split. Dealer stands on all 17s. Naturals pay 3:2.
/// @dev Cards are drawn from an infinite shoe (1 = ace ... 13 = king), so there is no deck
///      state to track and no card counting to exploit. The dealer's second card is dealt
///      only once the player is done, rather than face down: a "hidden" hole card would sit
///      in public storage anyway, so dealing it late is the honest version of the same rule.
contract Blackjack is GameBase {
    uint256 public constant MIN_WAGER = 0.001 ether;
    uint8 public constant DEALER_STANDS_ON = 17;

    enum HandState {
        Active,
        Stood,
        Bust,
        Settled
    }

    struct Hand {
        uint8[] cards;
        uint128 wager;
        bool doubled;
        HandState state;
        uint128 payout;
    }

    struct Game {
        bytes32 playerId;
        uint8[] dealer;
        Hand[] hands;
        uint8 activeHand;
        bool finished;
        bool wasSplit;
    }

    uint256 public gameCount;
    mapping(uint256 => Game) private _games;
    /// @notice 0 when the seat has no hand in progress.
    mapping(bytes32 => uint256) public activeGameOf;

    event Dealt(uint256 indexed gameId, bytes32 indexed playerId, uint256 wager, uint8[] player, uint8 dealerUp);
    event Card(uint256 indexed gameId, bytes32 indexed playerId, uint8 handIndex, uint8 card, uint8 total);
    event HandClosed(uint256 indexed gameId, uint8 handIndex, HandState state, uint8 total);
    event DealerPlayed(uint256 indexed gameId, uint8[] dealer, uint8 total, bool bust);
    event Resolved(uint256 indexed gameId, bytes32 indexed playerId, uint8 handIndex, uint256 wager, uint256 payout);

    error NoHand();
    error HandInProgress();
    error WagerTooSmall();
    error NotSplittable();
    error CannotDouble();

    constructor(address hub_) GameBase(hub_) {}

    // ------------------------------------------------------------------ views --

    function handsOf(uint256 gameId) external view returns (Hand[] memory) {
        return _games[gameId].hands;
    }

    function dealerCards(uint256 gameId) external view returns (uint8[] memory) {
        return _games[gameId].dealer;
    }

    function gameOf(uint256 gameId)
        external
        view
        returns (bytes32 playerId, uint8 activeHand, bool finished, bool wasSplit)
    {
        Game storage g = _games[gameId];
        return (g.playerId, g.activeHand, g.finished, g.wasSplit);
    }

    /// @notice Best total for a set of cards, plus whether an ace is still counted as 11.
    function value(uint8[] memory cards) public pure returns (uint8 total, bool soft) {
        uint8 aces;
        for (uint256 i; i < cards.length; ++i) {
            uint8 c = cards[i];
            if (c == 1) {
                aces++;
                total += 11;
            } else {
                total += c > 10 ? 10 : c;
            }
        }
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        soft = aces > 0;
    }

    // ------------------------------------------------------------------ table --

    function deal(bytes32 playerId, uint256 wager) external onlyOperator returns (uint256 gameId) {
        if (activeGameOf[playerId] != 0) revert HandInProgress();
        if (wager < MIN_WAGER) revert WagerTooSmall();
        if (wager > type(uint128).max) revert WagerTooSmall();

        hub.settle(playerId, wager, 0);

        unchecked {
            gameId = ++gameCount;
        }
        Game storage g = _games[gameId];
        g.playerId = playerId;

        Hand storage h = g.hands.push();
        h.wager = uint128(wager);
        h.state = HandState.Active;
        h.cards.push(_card(playerId));
        h.cards.push(_card(playerId));

        g.dealer.push(_card(playerId)); // upcard; the hole card comes at showdown
        activeGameOf[playerId] = gameId;

        emit Dealt(gameId, playerId, wager, h.cards, g.dealer[0]);

        (uint8 total,) = value(h.cards);
        if (total == 21) {
            // Natural: nothing left for the player to decide.
            h.state = HandState.Stood;
            emit HandClosed(gameId, 0, HandState.Stood, total);
            _showdown(gameId);
        }
    }

    function hit(bytes32 playerId) external onlyOperator {
        (uint256 gameId, Game storage g, Hand storage h) = _current(playerId);
        uint8 c = _card(playerId);
        h.cards.push(c);
        (uint8 total,) = value(h.cards);
        emit Card(gameId, playerId, g.activeHand, c, total);
        if (total > 21) {
            h.state = HandState.Bust;
            emit HandClosed(gameId, g.activeHand, HandState.Bust, total);
            _advance(gameId);
        }
    }

    function stand(bytes32 playerId) external onlyOperator {
        (uint256 gameId, Game storage g, Hand storage h) = _current(playerId);
        h.state = HandState.Stood;
        (uint8 total,) = value(h.cards);
        emit HandClosed(gameId, g.activeHand, HandState.Stood, total);
        _advance(gameId);
    }

    function doubleDown(bytes32 playerId) external onlyOperator {
        (uint256 gameId, Game storage g, Hand storage h) = _current(playerId);
        if (h.cards.length != 2 || h.doubled) revert CannotDouble();

        hub.settle(playerId, h.wager, 0);
        h.wager *= 2;
        h.doubled = true;

        uint8 c = _card(playerId);
        h.cards.push(c);
        (uint8 total,) = value(h.cards);
        emit Card(gameId, playerId, g.activeHand, c, total);

        h.state = total > 21 ? HandState.Bust : HandState.Stood;
        emit HandClosed(gameId, g.activeHand, h.state, total);
        _advance(gameId);
    }

    function split(bytes32 playerId) external onlyOperator {
        (uint256 gameId, Game storage g, Hand storage h) = _current(playerId);
        if (g.wasSplit || g.hands.length != 1 || h.cards.length != 2) revert NotSplittable();
        uint8 a = h.cards[0] > 10 ? 10 : h.cards[0];
        uint8 b = h.cards[1] > 10 ? 10 : h.cards[1];
        if (a != b) revert NotSplittable();

        hub.settle(playerId, h.wager, 0);
        g.wasSplit = true;

        uint8 moved = h.cards[1];
        h.cards.pop();

        Hand storage h2 = g.hands.push();
        h2.wager = h.wager;
        h2.state = HandState.Active;
        h2.cards.push(moved);

        h.cards.push(_card(playerId));
        h2.cards.push(_card(playerId));

        (uint8 t0,) = value(h.cards);
        (uint8 t1,) = value(h2.cards);
        emit Card(gameId, playerId, 0, h.cards[1], t0);
        emit Card(gameId, playerId, 1, h2.cards[1], t1);
    }

    // -------------------------------------------------------------- internals --

    function _current(bytes32 playerId) private view returns (uint256 gameId, Game storage g, Hand storage h) {
        gameId = activeGameOf[playerId];
        if (gameId == 0) revert NoHand();
        g = _games[gameId];
        h = g.hands[g.activeHand];
        if (h.state != HandState.Active) revert NoHand();
    }

    function _advance(uint256 gameId) private {
        Game storage g = _games[gameId];
        uint8 next = g.activeHand + 1;
        if (next < g.hands.length) {
            g.activeHand = next;
            return;
        }
        _showdown(gameId);
    }

    /// @dev Dealer only bothers drawing if at least one hand is still standing.
    function _showdown(uint256 gameId) private {
        Game storage g = _games[gameId];
        bool anyLive;
        for (uint256 i; i < g.hands.length; ++i) {
            if (g.hands[i].state == HandState.Stood) {
                anyLive = true;
                break;
            }
        }

        uint8 dealerTotal;
        bool dealerBust;
        bool dealerNatural;
        if (anyLive) {
            g.dealer.push(_card(g.playerId));
            (dealerTotal,) = value(g.dealer);
            dealerNatural = dealerTotal == 21;
            while (dealerTotal < DEALER_STANDS_ON) {
                g.dealer.push(_card(g.playerId));
                (dealerTotal,) = value(g.dealer);
            }
            dealerBust = dealerTotal > 21;
            emit DealerPlayed(gameId, g.dealer, dealerTotal, dealerBust);
        }

        for (uint256 i; i < g.hands.length; ++i) {
            Hand storage h = g.hands[i];
            uint256 payout = _payout(h, g, dealerTotal, dealerBust, dealerNatural);
            h.payout = uint128(payout);
            h.state = HandState.Settled;
            if (payout > 0) hub.settle(g.playerId, 0, payout);
            emit Resolved(gameId, g.playerId, uint8(i), h.wager, payout);
        }

        g.finished = true;
        activeGameOf[g.playerId] = 0;
    }

    function _payout(Hand storage h, Game storage g, uint8 dealerTotal, bool dealerBust, bool dealerNatural)
        private
        view
        returns (uint256)
    {
        if (h.state == HandState.Bust) return 0;
        (uint8 total,) = value(h.cards);
        uint256 w = h.wager;

        // A natural only counts on the original two-card hand, never after a split.
        bool natural = !g.wasSplit && h.cards.length == 2 && total == 21;
        if (natural) {
            if (dealerNatural) return w; // push
            return (w * 5) / 2; // 3:2
        }
        if (dealerNatural) return 0;
        if (dealerBust) return w * 2;
        if (total > dealerTotal) return w * 2;
        if (total == dealerTotal) return w; // push
        return 0;
    }

    function _card(bytes32 salt) private returns (uint8) {
        return uint8(hub.draw(salt) % 13) + 1;
    }
}
