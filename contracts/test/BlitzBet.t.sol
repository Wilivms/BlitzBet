// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test, console} from "forge-std/Test.sol";
import {CasinoHub} from "../src/CasinoHub.sol";
import {GameBase} from "../src/GameBase.sol";
import {CoinFlip} from "../src/games/CoinFlip.sol";
import {Roulette} from "../src/games/Roulette.sol";

/// @dev Minimal registered game used to poke hub internals from tests.
contract MockGame {
    CasinoHub public hub;

    constructor(address hub_) {
        hub = CasinoHub(payable(hub_));
    }

    function settle(bytes32 p, uint256 w, uint256 pay) external {
        hub.settle(p, w, pay);
    }

    function draw(bytes32 salt) external returns (uint256) {
        return hub.draw(salt);
    }
}

contract BlitzBetTest is Test {
    CasinoHub hub;
    CoinFlip coinflip;
    Roulette roulette;
    MockGame mock;

    bytes32 constant ALICE = keccak256("alice");
    bytes32 constant BOB = keccak256("bob");

    address constant STRANGER = address(0xBEEF);

    function setUp() public {
        hub = new CasinoHub{value: 100 ether}();
        coinflip = new CoinFlip(address(hub));
        roulette = new Roulette(address(hub));
        mock = new MockGame(address(hub));
        hub.setGame(address(coinflip), true);
        hub.setGame(address(roulette), true);
        hub.setGame(address(mock), true);
        hub.join(ALICE, "Alice", 10 ether);
        hub.join(BOB, "Bob", 10 ether);
    }

    receive() external payable {}

    // ------------------------------------------------------------ invariant --

    /// @dev The contract never owes more than it holds.
    function _assertSolvent() internal view {
        uint256 total = hub.bankroll();
        uint256 n = hub.playerCount();
        for (uint256 i; i < n; ++i) {
            total += hub.chips(hub.players(i));
        }
        assertEq(total, address(hub).balance, "hub ledger diverged from its balance");
    }

    function test_setup_isSolvent() public view {
        _assertSolvent();
        assertEq(hub.bankroll(), 80 ether);
        assertEq(hub.chips(ALICE), 10 ether);
    }

    function test_fundingIncreasesBankroll() public {
        hub.fund{value: 5 ether}();
        assertEq(hub.bankroll(), 85 ether);
        _assertSolvent();
    }

    function test_withdrawOnlyOwner() public {
        vm.prank(STRANGER);
        vm.expectRevert(CasinoHub.NotOwner.selector);
        hub.withdraw(1 ether);
    }

    function test_cannotWithdrawPlayerChips() public {
        vm.expectRevert(CasinoHub.InsufficientBankroll.selector);
        hub.withdraw(81 ether); // bankroll is 80; the other 20 belongs to seats
    }

    // -------------------------------------------------------- access control --

    function test_onlyGameCanSettle() public {
        vm.prank(STRANGER);
        vm.expectRevert(CasinoHub.NotGame.selector);
        hub.settle(ALICE, 1 ether, 0);
    }

    function test_onlyGameCanDraw() public {
        vm.prank(STRANGER);
        vm.expectRevert(CasinoHub.NotGame.selector);
        hub.draw(ALICE);
    }

    function test_onlyOperatorCanFlip() public {
        vm.prank(STRANGER);
        vm.expectRevert(GameBase.NotOperator.selector);
        coinflip.flip(ALICE, 1 ether, 0);
    }

    function test_unknownPlayerCannotBet() public {
        vm.expectRevert(CasinoHub.UnknownPlayer.selector);
        coinflip.flip(keccak256("nobody"), 1 ether, 0);
    }

    function test_cannotBetMoreChipsThanHeld() public {
        vm.expectRevert(CasinoHub.InsufficientChips.selector);
        coinflip.flip(ALICE, 11 ether, 0);
    }

    // ------------------------------------------------------------ randomness --

    /// @dev The whole point of the per-salt + global nonce: replaying the same call in the
    ///      same block cannot produce the same outcome, so a player cannot grind a win.
    function test_drawsDifferWithinOneBlock() public {
        uint256 a = mock.draw(ALICE);
        uint256 b = mock.draw(ALICE);
        uint256 c = mock.draw(ALICE);
        assertTrue(a != b && b != c && a != c, "draws repeated inside a block");
    }

    function test_drawsDifferAcrossPlayers() public {
        assertTrue(mock.draw(ALICE) != mock.draw(BOB));
    }

    // -------------------------------------------------------------- coinflip --

    function test_coinflipSettlesBothWays() public {
        uint256 wins;
        for (uint256 i; i < 40; ++i) {
            vm.roll(block.number + 1);
            (, bool won,) = coinflip.flip(ALICE, 0.01 ether, uint8(i % 2));
            if (won) wins++;
            hub.join(ALICE, "", 1 ether); // keep the seat funded
        }
        assertGt(wins, 0, "never won in 40 flips");
        assertLt(wins, 40, "never lost in 40 flips");
        _assertSolvent();
    }

    function test_coinflipWinDoublesStake() public {
        uint256 before = hub.chips(ALICE);
        (uint8 result,, uint256 payout) = coinflip.flip(ALICE, 1 ether, 0);
        if (result == 0) {
            assertEq(payout, 2 ether);
            assertEq(hub.chips(ALICE), before + 1 ether);
            assertEq(hub.netPnl(ALICE), 1 ether);
        } else {
            assertEq(payout, 0);
            assertEq(hub.chips(ALICE), before - 1 ether);
            assertEq(hub.netPnl(ALICE), -1 ether);
        }
        _assertSolvent();
    }

    function test_coinflipRejectsBadChoice() public {
        vm.expectRevert(CoinFlip.BadChoice.selector);
        coinflip.flip(ALICE, 1 ether, 2);
    }

    function test_coinflipRejectsDustWager() public {
        vm.expectRevert(CoinFlip.WagerTooSmall.selector);
        coinflip.flip(ALICE, 1, 0);
    }

    // -------------------------------------------------------------- roulette --

    function test_rouletteRedTable() public view {
        uint8[18] memory reds = [uint8(1), 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
        uint256 mask;
        for (uint256 i; i < 18; ++i) {
            assertTrue(roulette.isRed(reds[i]), "expected red");
            mask |= 1 << reds[i];
        }
        assertFalse(roulette.isRed(0), "zero is neither colour");
        for (uint8 n = 1; n <= 36; ++n) {
            if ((mask >> n) & 1 == 0) assertFalse(roulette.isRed(n), "expected black");
        }
    }

    function test_rouletteRoundLifecycle() public {
        vm.expectRevert(Roulette.RoundNotOpen.selector);
        roulette.placeBet(ALICE, 1 ether, uint8(Roulette.BetType.Red), 0);

        roulette.openRound();
        assertEq(roulette.roundId(), 1);
        assertTrue(roulette.isOpen());

        vm.expectRevert(Roulette.RoundAlreadyOpen.selector);
        roulette.openRound();

        roulette.placeBet(ALICE, 1 ether, uint8(Roulette.BetType.Red), 0);
        roulette.placeBet(BOB, 1 ether, uint8(Roulette.BetType.Black), 0);
        assertEq(roulette.betsInRound(), 2);
        assertEq(hub.chips(ALICE), 9 ether, "stake not taken at bet time");

        roulette.spin();
        assertFalse(roulette.isOpen());
        _assertSolvent();

        // Red and Black cover each other: exactly one seat is paid unless zero hits.
        uint8 r = roulette.lastResult();
        if (r == 0) {
            assertEq(hub.chips(ALICE), 9 ether);
            assertEq(hub.chips(BOB), 9 ether);
        } else {
            assertEq(hub.chips(ALICE) + hub.chips(BOB), 20 ether, "zero-sum red/black broken");
        }
    }

    function test_rouletteMultipleSeatsSameWheel() public {
        roulette.openRound();
        roulette.placeBet(ALICE, 1 ether, uint8(Roulette.BetType.Number), 17);
        roulette.placeBet(ALICE, 1 ether, uint8(Roulette.BetType.Even), 0);
        roulette.placeBet(BOB, 2 ether, uint8(Roulette.BetType.Dozen), 1);
        roulette.placeBet(BOB, 1 ether, uint8(Roulette.BetType.High), 0);
        assertEq(roulette.betsInRound(), 4);
        (uint8 result,) = roulette.spin();
        assertLe(result, 36);
        _assertSolvent();
    }

    function test_rouletteRejectsBadBets() public {
        roulette.openRound();
        vm.expectRevert(Roulette.BadBet.selector);
        roulette.placeBet(ALICE, 1 ether, uint8(Roulette.BetType.Number), 37);
        vm.expectRevert(Roulette.BadBet.selector);
        roulette.placeBet(ALICE, 1 ether, uint8(Roulette.BetType.Dozen), 3);
        vm.expectRevert(Roulette.BadBet.selector);
        roulette.placeBet(ALICE, 1 ether, 99, 0);
        vm.expectRevert(Roulette.WagerTooSmall.selector);
        roulette.placeBet(ALICE, 1, uint8(Roulette.BetType.Red), 0);
    }

    function test_rouletteTableFull() public {
        hub.join(ALICE, "", 60 ether);
        roulette.openRound();
        for (uint256 i; i < 40; ++i) {
            roulette.placeBet(ALICE, 0.001 ether, uint8(Roulette.BetType.Red), 0);
        }
        vm.expectRevert(Roulette.TableFull.selector);
        roulette.placeBet(ALICE, 0.001 ether, uint8(Roulette.BetType.Red), 0);
    }

    /// @dev Walk every pocket through every bet type and check the payout table by hand.
    function test_roulettePayoutTable() public view {
        for (uint8 r = 0; r <= 36; ++r) {
            bool red = roulette.isRed(r);
            // Number
            assertEq(_expected(Roulette.BetType.Number, r, r), 36 ether, "number should pay 35:1");
            if (r < 36) {
                assertEq(_expected(Roulette.BetType.Number, r + 1, r), 0, "wrong number paid");
            }
            if (r == 0) {
                assertEq(_expected(Roulette.BetType.Red, 0, 0), 0, "zero paid an outside bet");
                assertEq(_expected(Roulette.BetType.Even, 0, 0), 0, "zero paid an outside bet");
                assertEq(_expected(Roulette.BetType.Low, 0, 0), 0, "zero paid an outside bet");
                assertEq(_expected(Roulette.BetType.Dozen, 0, 0), 0, "zero paid an outside bet");
                continue;
            }
            assertEq(_expected(Roulette.BetType.Red, 0, r), red ? 2 ether : 0, "red payout");
            assertEq(_expected(Roulette.BetType.Black, 0, r), red ? 0 : 2 ether, "black payout");
            assertEq(_expected(Roulette.BetType.Even, 0, r), r % 2 == 0 ? 2 ether : 0, "even payout");
            assertEq(_expected(Roulette.BetType.Odd, 0, r), r % 2 == 1 ? 2 ether : 0, "odd payout");
            assertEq(_expected(Roulette.BetType.Low, 0, r), r <= 18 ? 2 ether : 0, "low payout");
            assertEq(_expected(Roulette.BetType.High, 0, r), r >= 19 ? 2 ether : 0, "high payout");
            uint8 dozen = (r - 1) / 12;
            assertEq(_expected(Roulette.BetType.Dozen, dozen, r), 3 ether, "dozen should pay 2:1");
        }
    }

    function _expected(Roulette.BetType t, uint8 value, uint8 result) internal view returns (uint256) {
        return roulette.quote(1 ether, uint8(t), value, result);
    }
}
