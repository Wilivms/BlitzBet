// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {CasinoHub} from "../src/CasinoHub.sol";
import {Aviator} from "../src/games/Aviator.sol";

contract AviatorTest is Test {
    CasinoHub hub;
    Aviator av;

    bytes32 constant A = keccak256("alice");
    bytes32 constant B = keccak256("bob");
    bytes32 constant C = keccak256("carol");

    function setUp() public {
        hub = new CasinoHub{value: 2000 ether}();
        av = new Aviator(address(hub));
        hub.setGame(address(av), true);
        hub.join(A, "Alice", 100 ether);
        hub.join(B, "Bob", 100 ether);
        hub.join(C, "Carol", 100 ether);
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

    function _commit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(seed));
    }

    // -------------------------------------------------------------- the curve --

    function test_multiplierStartsAtOne() public view {
        assertEq(av.multiplierAt(0), 10_000);
    }

    function test_multiplierGrowsMonotonically() public view {
        uint256 prev = av.multiplierAt(0);
        for (uint256 t = 1; t <= 120; ++t) {
            uint256 m = av.multiplierAt(t);
            assertGt(m, prev, "multiplier must strictly increase");
            prev = m;
        }
    }

    /// @dev 1.02 per block at 300ms blocks: ~2x in 35 ticks (~10s), ~5x in 82 (~25s).
    function test_multiplierPace() public view {
        assertApproxEqRel(av.multiplierAt(35), 20_000, 0.05e18);
        assertApproxEqRel(av.multiplierAt(82), 50_000, 0.05e18);
    }

    function test_multiplierIsCapped() public view {
        assertEq(av.multiplierAt(5000), 1_000_000);
    }

    function test_crashTickMatchesTheCurve() public view {
        for (uint256 i = 1; i < 40; ++i) {
            bytes32 seed = keccak256(abi.encodePacked("seed", i));
            uint256 bp = av.crashPointBp(seed);
            uint32 tick = av.crashTickOf(bp);
            // The plane is still flying the tick before the crash, and gone at the crash tick.
            assertGe(av.multiplierAt(tick), bp, "crash tick lands below the crash point");
            if (tick > 0) assertLt(av.multiplierAt(tick - 1), bp, "crash tick is one too late");
        }
    }

    function test_crashPointIsNeverBelowOne() public view {
        for (uint256 i; i < 200; ++i) {
            assertGe(av.crashPointBp(keccak256(abi.encodePacked("s", i))), 10_000);
        }
    }

    /// @dev The house edge has to actually show up, or the bankroll bleeds all night.
    function test_instantBustsHappenAboutThreePercent() public view {
        uint256 busts;
        for (uint256 i; i < 1000; ++i) {
            if (av.crashPointBp(keccak256(abi.encodePacked("edge", i))) == 10_000) busts++;
        }
        assertGt(busts, 5, "no instant busts at all");
        assertLt(busts, 100, "far too many instant busts");
    }

    // -------------------------------------------------------------- the round --

    function test_phaseGuards() public {
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.placeBet(A, 1 ether);
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.launch();
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.cashOut(A);

        av.openRound(_commit("s1"));
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.cashOut(A);
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.reveal("s1");
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.openRound(_commit("s2"));

        av.placeBet(A, 1 ether);
        av.launch();
        vm.expectRevert(Aviator.WrongPhase.selector);
        av.placeBet(B, 1 ether);
    }

    function test_stakeTakenAtBetTime() public {
        av.openRound(_commit("s"));
        av.placeBet(A, 2 ether);
        assertEq(hub.chips(A), 98 ether, "stake not taken when the bet was placed");
        _assertSolvent();
    }

    function test_oneSeatPerPlayerPerRound() public {
        av.openRound(_commit("s"));
        av.placeBet(A, 1 ether);
        vm.expectRevert(Aviator.AlreadySeated.selector);
        av.placeBet(A, 1 ether);
    }

    function test_cannotCashOutTwice() public {
        av.openRound(_commit("s"));
        av.placeBet(A, 1 ether);
        av.launch();
        vm.roll(block.number + 5);
        av.cashOut(A);
        vm.expectRevert(Aviator.AlreadyCashedOut.selector);
        av.cashOut(A);
    }

    function test_cannotCashOutWithoutASeat() public {
        av.openRound(_commit("s"));
        av.placeBet(A, 1 ether);
        av.launch();
        vm.expectRevert(Aviator.NotSeated.selector);
        av.cashOut(B);
    }

    function test_revealMustMatchCommitment() public {
        av.openRound(_commit("the-real-seed"));
        av.placeBet(A, 1 ether);
        av.launch();
        vm.expectRevert(Aviator.BadReveal.selector);
        av.reveal("a-different-seed");
    }

    // ------------------------------------------------------------ settlement --

    /// @dev The core rule: cashing out before the crash tick pays, at or after it does not.
    function test_earlyCashOutPaysLateCashOutDoesNot() public {
        bytes32 seed = _findSeedWithCrashTickAbove(20);
        av.openRound(_commit(seed));
        av.placeBet(A, 1 ether); // cashes out early -> survives
        av.placeBet(B, 1 ether); // never cashes out -> loses
        av.launch();

        uint32 crashTick = av.crashTickOf(av.crashPointBp(seed));

        vm.roll(block.number + 5);
        uint256 mult = av.cashOut(A);
        assertEq(mult, av.multiplierAt(5), "multiplier is not the block-height curve");

        vm.roll(block.number + uint256(crashTick));
        av.reveal(seed);

        Aviator.Seat[] memory s = av.seats();
        assertGt(s[0].payout, 1 ether, "early cash-out was not paid the multiplier");
        assertEq(s[0].payout, (1 ether * av.multiplierAt(5)) / 10_000, "payout is off the curve");
        assertEq(s[1].payout, 0, "a seat that never cashed out was paid");
        assertEq(hub.netPnl(B), -1 ether, "loser's P&L wrong");
        _assertSolvent();
    }

    function test_cashOutAtOrAfterCrashTickLoses() public {
        bytes32 seed = _findSeedWithCrashTickAbove(10);
        uint32 crashTick = av.crashTickOf(av.crashPointBp(seed));

        av.openRound(_commit(seed));
        av.placeBet(A, 1 ether);
        av.launch();

        // Cash out exactly on the crash tick: too late by one block.
        vm.roll(block.number + uint256(crashTick));
        av.cashOut(A);
        av.reveal(seed);

        Aviator.Seat[] memory s = av.seats();
        assertEq(s[0].payout, 0, "cash-out on the crash tick should lose");
        _assertSolvent();
    }

    function test_wholeTableFliesOneRound() public {
        bytes32 seed = _findSeedWithCrashTickAbove(30);
        uint32 crashTick = av.crashTickOf(av.crashPointBp(seed));

        av.openRound(_commit(seed));
        av.placeBet(A, 1 ether);
        av.placeBet(B, 2 ether);
        av.placeBet(C, 3 ether);
        assertEq(av.seatCount(), 3);
        av.launch();

        vm.roll(block.number + 3);
        av.cashOut(A);
        vm.roll(block.number + 9);
        av.cashOut(B);
        // Carol holds on past the crash.
        vm.roll(block.number + uint256(crashTick));
        av.reveal(seed);

        Aviator.Seat[] memory s = av.seats();
        assertGt(s[0].payout, 1 ether, "Alice should have been paid");
        assertGt(s[1].payout, 2 ether, "Bob should have been paid");
        assertGt(s[1].payout, s[0].payout, "later cash-out should pay more");
        assertEq(s[2].payout, 0, "Carol rode it into the ground");
        _assertSolvent();
    }

    function test_instantBustPaysNobody() public {
        bytes32 seed;
        for (uint256 i; i < 5000; ++i) {
            bytes32 s = keccak256(abi.encodePacked("bust", i));
            if (av.crashPointBp(s) == 10_000) {
                seed = s;
                break;
            }
        }
        require(seed != bytes32(0), "no instant-bust seed found");

        av.openRound(_commit(seed));
        av.placeBet(A, 1 ether);
        av.launch();
        av.cashOut(A); // tick 0, but the crash tick is also 0
        av.reveal(seed);

        assertEq(av.seats()[0].payout, 0, "instant bust paid out");
        _assertSolvent();
    }

    function test_abortRefundsEveryStake() public {
        av.openRound(_commit("s"));
        av.placeBet(A, 1 ether);
        av.placeBet(B, 4 ether);
        av.launch();
        uint256 refunded = av.abortRound();
        assertEq(refunded, 5 ether);
        assertEq(hub.chips(A), 100 ether, "Alice not made whole");
        assertEq(hub.chips(B), 100 ether, "Bob not made whole");
        assertEq(hub.netPnl(A), 0, "abort should leave P&L flat");
        _assertSolvent();
    }

    function test_manyRoundsStaySolvent() public {
        for (uint256 r; r < 40; ++r) {
            bytes32 seed = keccak256(abi.encodePacked("round", r));
            av.openRound(_commit(seed));
            av.placeBet(A, 0.5 ether);
            av.placeBet(B, 0.5 ether);
            av.launch();
            vm.roll(block.number + (r % 12));
            if (r % 3 != 0) av.cashOut(A);
            if (r % 2 == 0) av.cashOut(B);
            vm.roll(block.number + 200);
            av.reveal(seed);
            _assertSolvent();
            hub.join(A, "", 1 ether);
            hub.join(B, "", 1 ether);
        }
    }

    /// @dev Find a seed whose crash comes late enough that the test can cash out before it.
    function _findSeedWithCrashTickAbove(uint32 minTick) internal view returns (bytes32) {
        for (uint256 i; i < 5000; ++i) {
            bytes32 s = keccak256(abi.encodePacked("late", i));
            if (av.crashTickOf(av.crashPointBp(s)) > minTick) return s;
        }
        revert("no late seed found");
    }
}
