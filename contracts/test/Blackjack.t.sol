// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CasinoHub} from "../src/CasinoHub.sol";
import {Blackjack} from "../src/games/Blackjack.sol";

contract BlackjackTest is Test {
    CasinoHub hub;
    Blackjack bj;

    bytes32 constant SEAT = keccak256("seat");

    function setUp() public {
        hub = new CasinoHub{value: 500 ether}();
        bj = new Blackjack(address(hub));
        hub.setGame(address(bj), true);
        hub.join(SEAT, "Tim", 100 ether);
    }

    receive() external payable {}

    function _assertSolvent() internal view {
        uint256 total = hub.bankroll();
        uint256 n = hub.playerCount();
        for (uint256 i; i < n; ++i) {
            total += hub.chips(hub.players(i));
        }
        assertEq(total, address(hub).balance, "ledger diverged from balance");
    }

    // ---------------------------------------------------------- hand values --

    function test_valueCountsFaceCardsAsTen() public view {
        uint8[] memory c = new uint8[](2);
        (c[0], c[1]) = (13, 12); // king + queen
        (uint8 t, bool soft) = bj.value(c);
        assertEq(t, 20);
        assertFalse(soft);
    }

    function test_valueSoftAce() public view {
        uint8[] memory c = new uint8[](2);
        (c[0], c[1]) = (1, 6); // ace + six = soft 17
        (uint8 t, bool soft) = bj.value(c);
        assertEq(t, 17);
        assertTrue(soft);
    }

    function test_valueAceDemotesToAvoidBust() public view {
        uint8[] memory c = new uint8[](3);
        (c[0], c[1], c[2]) = (1, 9, 5); // 11+9+5 = 25 -> ace becomes 1 -> 15
        (uint8 t, bool soft) = bj.value(c);
        assertEq(t, 15);
        assertFalse(soft);
    }

    function test_valueTwoAces() public view {
        uint8[] memory c = new uint8[](2);
        (c[0], c[1]) = (1, 1); // 11 + 1 = 12
        (uint8 t, bool soft) = bj.value(c);
        assertEq(t, 12);
        assertTrue(soft);
    }

    function test_valueBlackjack() public view {
        uint8[] memory c = new uint8[](2);
        (c[0], c[1]) = (1, 11); // ace + jack
        (uint8 t,) = bj.value(c);
        assertEq(t, 21);
    }

    // --------------------------------------------------------------- dealing --

    function test_dealTakesWagerAndOpensHand() public {
        uint256 before = hub.chips(SEAT);
        uint256 gameId = bj.deal(SEAT, 1 ether);
        assertEq(gameId, 1);
        assertEq(hub.chips(SEAT), before - 1 ether + _payoutOf(gameId), "stake not taken");
        Blackjack.Hand[] memory hands = bj.handsOf(gameId);
        assertEq(hands.length, 1);
        assertEq(hands[0].cards.length, 2, "player gets two cards");
        assertEq(bj.dealerCards(gameId).length >= 1, true, "dealer shows an upcard");
        _assertSolvent();
    }

    function _payoutOf(uint256 gameId) internal view returns (uint256 p) {
        Blackjack.Hand[] memory hands = bj.handsOf(gameId);
        for (uint256 i; i < hands.length; ++i) {
            p += hands[i].payout;
        }
    }

    function test_cannotDealTwiceForOneSeat() public {
        uint256 id = bj.deal(SEAT, 1 ether);
        (,, bool finished,) = bj.gameOf(id);
        if (finished) return; // natural resolved instantly, nothing to collide with
        vm.expectRevert(Blackjack.HandInProgress.selector);
        bj.deal(SEAT, 1 ether);
    }

    function test_cannotActWithoutHand() public {
        vm.expectRevert(Blackjack.NoHand.selector);
        bj.hit(SEAT);
        vm.expectRevert(Blackjack.NoHand.selector);
        bj.stand(SEAT);
    }

    function test_rejectsDustWager() public {
        vm.expectRevert(Blackjack.WagerTooSmall.selector);
        bj.deal(SEAT, 1);
    }

    function test_onlyOperator() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        bj.deal(SEAT, 1 ether);
    }

    // -------------------------------------------------------------- outcomes --

    /// @dev Play a lot of hands with a simple basic-strategy-ish policy and assert that the
    ///      table never goes insolvent, every hand terminates, and the seat is always freed.
    function test_manyHandsAlwaysTerminateAndStaySolvent() public {
        uint256 naturals;
        uint256 busts;
        uint256 pushes;
        uint256 wins;

        for (uint256 round; round < 120; ++round) {
            vm.roll(block.number + 1);
            hub.join(SEAT, "", 2 ether); // keep the seat topped up from the bankroll

            uint256 gameId = bj.deal(SEAT, 0.5 ether);

            uint256 guard;
            while (bj.activeGameOf(SEAT) != 0) {
                require(++guard < 25, "hand never terminated");
                Blackjack.Hand[] memory hands = bj.handsOf(gameId);
                (,, uint8 active,) = _state(gameId);
                (uint8 total,) = bj.value(hands[active].cards);
                if (total < 17) bj.hit(SEAT);
                else bj.stand(SEAT);
            }

            (,, bool finished,) = bj.gameOf(gameId);
            assertTrue(finished, "game not marked finished");
            assertEq(bj.activeGameOf(SEAT), 0, "seat not released");

            Blackjack.Hand[] memory done = bj.handsOf(gameId);
            for (uint256 i; i < done.length; ++i) {
                assertTrue(uint8(done[i].state) == uint8(Blackjack.HandState.Settled), "hand unsettled");
                uint256 w = done[i].wager;
                uint256 p = done[i].payout;
                assertTrue(p == 0 || p == w || p == w * 2 || p == (w * 5) / 2, "payout outside the rule table");
                if (p == 0) busts++;
                else if (p == w) pushes++;
                else if (p == w * 2) wins++;
                else naturals++;
            }
            _assertSolvent();
        }

        assertGt(wins, 0, "never won in 120 hands");
        assertGt(busts, 0, "never lost in 120 hands");
        assertGt(pushes + naturals, 0, "no push or natural in 120 hands");
    }

    function _state(uint256 gameId) internal view returns (bytes32, bool, uint8, bool) {
        (bytes32 p, uint8 active, bool finished, bool wasSplit) = bj.gameOf(gameId);
        return (p, finished, active, wasSplit);
    }

    /// @dev Drive enough hands that a splittable pair and a double both come up, and check
    ///      the extra stake is actually taken each time.
    function test_splitAndDoubleTakeExtraStake() public {
        uint256 splits;
        uint256 doubles;

        for (uint256 round; round < 200 && (splits == 0 || doubles == 0); ++round) {
            vm.roll(block.number + 1);
            hub.join(SEAT, "", 3 ether);
            uint256 gameId = bj.deal(SEAT, 0.5 ether);
            if (bj.activeGameOf(SEAT) == 0) continue; // natural

            Blackjack.Hand[] memory hands = bj.handsOf(gameId);
            uint8 c0 = hands[0].cards[0] > 10 ? 10 : hands[0].cards[0];
            uint8 c1 = hands[0].cards[1] > 10 ? 10 : hands[0].cards[1];

            uint256 chipsBefore = hub.chips(SEAT);
            if (c0 == c1 && splits == 0) {
                bj.split(SEAT);
                assertEq(hub.chips(SEAT), chipsBefore - 0.5 ether, "split stake not taken");
                assertEq(bj.handsOf(gameId).length, 2, "split did not create a second hand");
                splits++;
            } else if (doubles == 0) {
                bj.doubleDown(SEAT);
                assertEq(hub.chips(SEAT), chipsBefore - 0.5 ether + _payoutOf(gameId), "double stake not taken");
                assertEq(bj.handsOf(gameId)[0].wager, 1 ether, "wager not doubled");
                doubles++;
            }

            uint256 guard;
            while (bj.activeGameOf(SEAT) != 0) {
                require(++guard < 25, "hand never terminated");
                (,, uint8 active,) = _state(gameId);
                (uint8 total,) = bj.value(bj.handsOf(gameId)[active].cards);
                if (total < 17) bj.hit(SEAT);
                else bj.stand(SEAT);
            }
            _assertSolvent();
        }

        assertGt(splits, 0, "no splittable pair in 200 hands");
        assertGt(doubles, 0, "never doubled in 200 hands");
    }

    function test_cannotSplitUnequalCards() public {
        for (uint256 round; round < 60; ++round) {
            vm.roll(block.number + 1);
            hub.join(SEAT, "", 2 ether);
            uint256 gameId = bj.deal(SEAT, 0.5 ether);
            if (bj.activeGameOf(SEAT) == 0) continue;
            Blackjack.Hand[] memory hands = bj.handsOf(gameId);
            uint8 c0 = hands[0].cards[0] > 10 ? 10 : hands[0].cards[0];
            uint8 c1 = hands[0].cards[1] > 10 ? 10 : hands[0].cards[1];
            if (c0 != c1) {
                vm.expectRevert(Blackjack.NotSplittable.selector);
                bj.split(SEAT);
                return;
            }
            bj.stand(SEAT);
            while (bj.activeGameOf(SEAT) != 0) bj.stand(SEAT);
        }
        revert("never drew an unequal pair");
    }

    function test_cannotDoubleAfterHitting() public {
        for (uint256 round; round < 60; ++round) {
            vm.roll(block.number + 1);
            hub.join(SEAT, "", 2 ether);
            bj.deal(SEAT, 0.5 ether);
            if (bj.activeGameOf(SEAT) == 0) continue;
            bj.hit(SEAT);
            if (bj.activeGameOf(SEAT) == 0) continue; // busted on the hit
            vm.expectRevert(Blackjack.CannotDouble.selector);
            bj.doubleDown(SEAT);
            return;
        }
        revert("never got a live hand after hitting");
    }
}
